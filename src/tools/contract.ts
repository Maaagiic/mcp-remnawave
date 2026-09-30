import { z } from 'zod';
import type { HttpMethod, RemnawaveClient } from '../client.js';

/**
 * Tools are derived from `@remnawave/backend-contract` — the same package the
 * panel validates requests with. Route, HTTP method and request schemas all
 * come from the command, so a tool cannot drift from the API: bumping the
 * contract version is what updates the tools.
 */

/** read: no change on the panel · write: changes state · destructive: deletes data or hits every user/node at once. */
export type ToolKind = 'read' | 'write' | 'destructive';

export type JsonSchema = Record<string, any>;
export type Args = Record<string, unknown>;

/** The part of a contract command namespace this server relies on. */
export interface ContractCommand {
    TSQ_url: string;
    endpointDetails: { REQUEST_METHOD: string; METHOD_DESCRIPTION?: string; METHOD_LONG_DESCRIPTION?: string };
    RequestParamSchema?: z.ZodType;
    RequestParamsSchema?: z.ZodType;
    RequestQuerySchema?: z.ZodType;
    RequestBodySchema?: z.ZodType;
}

export interface ToolOptions {
    /** Default: GET → read, DELETE → destructive, anything else → write. */
    kind?: ToolKind;
    /** Default: the contract's own description of the endpoint. */
    description?: string;
    /** Tool-only arguments (JSON Schema properties) that never reach the panel; `transform` consumes them. */
    extraInput?: Record<string, JsonSchema>;
    transform?: (result: unknown, args: Args) => unknown;
}

export interface Tool {
    name: string;
    kind: ToolKind;
    description: string;
    inputSchema: JsonSchema;
    /** Set for contract-backed tools; used to check that every command is covered. */
    command?: ContractCommand;
    run(args: Args, client: RemnawaveClient): Promise<unknown>;
}

interface Part {
    schema: z.ZodType;
    json: JsonSchema;
    keys: string[];
}

const LOOSE_OBJECT: JsonSchema = { type: 'object', additionalProperties: true };

const isPlainObject = (value: unknown): value is JsonSchema => typeof value === 'object' && value !== null && !Array.isArray(value);

/** A schema that says nothing about the type (`z.unknown()` in the contract). */
const isUntyped = (schema: JsonSchema) => Object.keys(schema).every((key) => key === 'description');

/** Keywords whose value is a map of names to schemas — the names must not be mistaken for keywords. */
const SCHEMA_MAPS = new Set(['properties', 'patternProperties', '$defs']);
/** Keywords whose value is data, not a schema. */
const DATA_KEYWORDS = new Set(['default', 'const', 'enum', 'examples', 'required']);
/** zod renders ISO datetimes with offsets as a ~340-character regex (leap years and all) instead of a format. */
const ISO_DATETIME_PATTERN = /^\^\(\?:\(\?:\\d\\d\[2468\]\[048\].*T\(\?:/;

/**
 * Shrink a JSON Schema for LLM context without losing meaning, and namespace
 * `$defs` with `prefix` so path, query and body schemas can be merged.
 */
function slim(schema: unknown, prefix: string): unknown {
    if (Array.isArray(schema)) return schema.map((item) => slim(item, prefix));
    if (!isPlainObject(schema)) return schema;
    const out: JsonSchema = {};
    for (const [key, value] of Object.entries(schema)) {
        // UI-only keywords (editor titles and long markdown help) are not worth the context they cost.
        if (key === '$schema' || key === 'title' || key === 'markdownDescription') continue;
        // zod emits a regex next to every `format`; the format alone is enough.
        if (key === 'pattern' && schema.format) continue;
        if (key === 'pattern' && typeof value === 'string' && ISO_DATETIME_PATTERN.test(value)) {
            out.format = 'date-time';
        } else if (key === '$ref' && typeof value === 'string') {
            out[key] = value.replace('#/$defs/', `#/$defs/${prefix}`);
        } else if (SCHEMA_MAPS.has(key) && isPlainObject(value)) {
            out[key] = Object.fromEntries(
                Object.entries(value).map(([name, sub]) => [key === '$defs' ? `${prefix}${name}` : name, slim(sub, prefix)]),
            );
        } else {
            out[key] = DATA_KEYWORDS.has(key) ? value : slim(value, prefix);
        }
    }
    return out;
}

function describePart(schema: z.ZodType | undefined, prefix: string): Part | undefined {
    if (!schema) return undefined;
    const json = slim(z.toJSONSchema(schema, { io: 'input', unrepresentable: 'any' }), prefix) as JsonSchema;
    return { schema, json, keys: Object.keys(json.properties ?? {}) };
}

/**
 * Untyped fields (host `xhttpExtraParams`, plugin configs, …) are always JSON
 * objects in this API. Without a `type` MCP clients marshal them as strings
 * and the panel answers `expected object, received string`.
 */
function typeLooseProperty(schema: JsonSchema): JsonSchema {
    if (isUntyped(schema)) return { ...schema, ...LOOSE_OBJECT };
    if (Array.isArray(schema.anyOf) && schema.anyOf.some(isUntyped)) {
        return { ...schema, anyOf: schema.anyOf.map((variant: JsonSchema) => (isUntyped(variant) ? LOOSE_OBJECT : variant)) };
    }
    return schema;
}

const expectsStructure = (schema: JsonSchema): boolean =>
    schema.type === 'object' || schema.type === 'array' || [...(schema.anyOf ?? []), ...(schema.oneOf ?? [])].some(expectsStructure);

const acceptsString = (schema: JsonSchema): boolean =>
    schema.type === 'string' || [...(schema.anyOf ?? []), ...(schema.oneOf ?? [])].some(acceptsString);

/** Some clients send nested objects as JSON text; decode it where the schema wants an object or array. */
function reviveJson(args: Args, properties: Record<string, JsonSchema>): Args {
    const out: Args = { ...args };
    for (const [key, value] of Object.entries(args)) {
        const schema = properties[key];
        if (typeof value !== 'string' || !schema || !expectsStructure(schema) || acceptsString(schema)) continue;
        try {
            const parsed = JSON.parse(value);
            if (typeof parsed === 'object' && parsed !== null) out[key] = parsed;
        } catch {
            // leave as is — validation reports it
        }
    }
    return out;
}

function pick(args: Args, keys: string[]): Args {
    const out: Args = {};
    for (const key of keys) if (args[key] !== undefined) out[key] = args[key];
    return out;
}

function defaultKind(method: HttpMethod): ToolKind {
    if (method === 'GET') return 'read';
    return method === 'DELETE' ? 'destructive' : 'write';
}

export function contractTool(name: string, command: ContractCommand, options: ToolOptions = {}): Tool {
    const method = command.endpointDetails.REQUEST_METHOD.toUpperCase() as HttpMethod;
    const template = command.TSQ_url;
    const params = describePart(command.RequestParamSchema ?? command.RequestParamsSchema, 'path_');
    const query = describePart(command.RequestQuerySchema, 'query_');
    const body = describePart(command.RequestBodySchema, 'body_');
    const parts = [params, query, body].filter((part): part is Part => !!part);

    const templateParams = [...template.matchAll(/:([A-Za-z]+)/g)].map((match) => match[1]);
    if (templateParams.slice().sort().join() !== (params?.keys ?? []).slice().sort().join()) {
        throw new Error(`${name}: path ${template} does not match its parameter schema [${params?.keys ?? ''}]`);
    }
    if (method === 'GET' && body) throw new Error(`${name}: GET ${template} declares a request body`);

    const properties: Record<string, JsonSchema> = {};
    const required: string[] = [];
    const defs: JsonSchema = {};
    for (const part of parts) {
        for (const key of part.keys) {
            if (Object.hasOwn(properties, key)) throw new Error(`${name}: argument "${key}" is declared twice (path/query/body)`);
            properties[key] = part === body ? typeLooseProperty(part.json.properties[key]) : part.json.properties[key];
        }
        required.push(...(part.json.required ?? []));
        Object.assign(defs, part.json.$defs);
    }
    const extraKeys = Object.keys(options.extraInput ?? {});
    Object.assign(properties, options.extraInput);

    const inputSchema: JsonSchema = { type: 'object', properties };
    if (required.length) inputSchema.required = required;
    if (Object.keys(defs).length) inputSchema.$defs = defs;

    const details = command.endpointDetails;
    const description =
        options.description ?? ([details.METHOD_DESCRIPTION, details.METHOD_LONG_DESCRIPTION].filter(Boolean).join('. ') || name);

    return {
        name,
        kind: options.kind ?? defaultKind(method),
        description,
        inputSchema,
        command,
        async run(args, client) {
            // Unknown arguments are an error, never silently dropped: a dropped field
            // looks like a successful update that did nothing.
            const unknown = Object.keys(args).filter((key) => !Object.hasOwn(properties, key));
            if (unknown.length) {
                const accepted = Object.keys(properties).join(', ') || 'no arguments';
                throw new Error(`Unknown argument(s): ${unknown.join(', ')}. ${name} accepts: ${accepted}.`);
            }

            const input = reviveJson(args, properties);
            const issues: string[] = [];
            for (const part of parts) {
                const parsed = part.schema.safeParse(pick(input, part.keys));
                if (parsed.success) continue;
                issues.push(...parsed.error.issues.map((issue) => `${issue.path.join('.') || '(arguments)'}: ${issue.message}`));
            }
            if (issues.length) throw new Error(`Invalid arguments: ${issues.join('; ')}`);

            // The panel gets the caller's values as given (validated, not transformed):
            // no injected defaults, no re-serialized dates.
            const path = template.replace(/:([A-Za-z]+)/g, (_, key: string) => encodeURIComponent(String(input[key])));
            const result = await client.request(method, path, {
                query: query && pick(input, query.keys),
                body: body && pick(input, body.keys),
            });
            return options.transform ? options.transform(result, pick(input, extraKeys)) : result;
        },
    };
}
