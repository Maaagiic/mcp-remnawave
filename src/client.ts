import type { Config } from './config.js';

export type HttpMethod = 'GET' | 'POST' | 'PATCH' | 'PUT' | 'DELETE';

export interface RequestOptions {
    query?: Record<string, unknown>;
    body?: unknown;
}

export class RemnawaveApiError extends Error {
    constructor(
        message: string,
        readonly status?: number,
    ) {
        super(message);
    }
}

/** Query values: arrays/objects travel as JSON strings (that is how the panel reads filters and sorting). */
function toQueryString(query: Record<string, unknown> = {}): string {
    const params = new URLSearchParams();
    for (const [key, value] of Object.entries(query)) {
        if (value === undefined || value === null) continue;
        params.set(key, typeof value === 'object' ? JSON.stringify(value) : String(value));
    }
    const text = params.toString();
    return text ? `?${text}` : '';
}

export class RemnawaveClient {
    private readonly baseUrl: string;
    private readonly headers: Record<string, string>;
    private readonly timeoutMs: number;

    constructor(config: Pick<Config, 'baseUrl' | 'apiToken' | 'apiKey' | 'timeoutMs'>) {
        this.baseUrl = config.baseUrl;
        this.timeoutMs = config.timeoutMs;
        this.headers = { Authorization: `Bearer ${config.apiToken}` };
        if (config.apiKey) this.headers['X-Api-Key'] = config.apiKey;
    }

    async request(method: HttpMethod, path: string, { query, body }: RequestOptions = {}): Promise<unknown> {
        const url = `${this.baseUrl}${path}${toQueryString(query)}`;
        let res: Response;
        try {
            res = await fetch(url, {
                method,
                // A JSON content type on a request without a body is rejected by some servers.
                headers: body === undefined ? this.headers : { ...this.headers, 'Content-Type': 'application/json' },
                body: body === undefined ? undefined : JSON.stringify(body),
                signal: AbortSignal.timeout(this.timeoutMs),
            });
        } catch (e) {
            const error = e as Error & { cause?: { code?: string; message?: string } };
            if (error.name === 'TimeoutError') {
                throw new RemnawaveApiError(`Remnawave API error: no response from ${method} ${path} within ${this.timeoutMs} ms`);
            }
            const cause = error.cause?.code ?? error.cause?.message ?? error.message;
            throw new RemnawaveApiError(`Remnawave API error: ${method} ${path} failed: ${cause}`);
        }

        const text = await res.text();
        if (!res.ok) {
            // Keep the full body: Remnawave puts field-level validation details in
            // `errors`, which a bare `message` hides. Non-JSON bodies (a proxy's HTML
            // error page) are cut short.
            let detail = text.slice(0, 500);
            try {
                const parsed = JSON.parse(text) as { message?: string };
                detail = parsed.message && Object.keys(parsed).length > 1 ? `${parsed.message} | body=${text}` : text;
            } catch {
                // not JSON — keep the raw excerpt
            }
            throw new RemnawaveApiError(`Remnawave API error (HTTP ${res.status}): ${detail || res.statusText}`, res.status);
        }

        // Bulk operations answer 2xx with an empty body.
        if (!text) return { ok: true, status: res.status };
        try {
            return JSON.parse(text);
        } catch {
            return { ok: true, status: res.status, text };
        }
    }
}
