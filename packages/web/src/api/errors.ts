/**
 * Thrown by `apiFetch` when the server responds with a non-2xx status.
 * `body` is the parsed JSON or text payload from the server (if any).
 */
export class ApiError extends Error {
    readonly status: number;
    readonly body:   unknown;

    constructor(status: number, body: unknown) {
        const message = extractMessage(body) ?? `Request failed with status ${status}`;
        super(message);
        this.name   = 'ApiError';
        this.status = status;
        this.body   = body;
    }
}

function extractMessage(body: unknown): string | null {
    if (typeof body === 'string' && body.length > 0) return body;
    if (body && typeof body === 'object' && 'error' in body && typeof (body as { error: unknown }).error === 'string') {
        return (body as { error: string }).error;
    }
    return null;
}
