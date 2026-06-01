import { ApiError } from './errors';

export interface ApiInit extends Omit<RequestInit, 'body'> {
    /** Plain object → JSON.stringify + Content-Type. Strings / FormData / Blob etc. pass through. */
    body?: BodyInit | object | null;
}

function isObjectBodyInit(b: object): boolean {
    return (
        b instanceof FormData ||
        b instanceof Blob ||
        b instanceof URLSearchParams ||
        b instanceof ArrayBuffer ||
        ArrayBuffer.isView(b) ||
        (typeof ReadableStream !== 'undefined' && b instanceof ReadableStream)
    );
}

export async function apiFetch<T>(path: string, init: ApiInit = {}): Promise<T> {
    const { body, headers: rawHeaders, ...rest } = init;
    const headers = new Headers(rawHeaders);

    let serializedBody: BodyInit | null | undefined;
    if (body == null) {
        serializedBody = body as null | undefined;
    } else if (typeof body === 'string') {
        serializedBody = body;
    } else if (typeof body === 'object' && isObjectBodyInit(body)) {
        serializedBody = body as BodyInit;
    } else {
        if (!headers.has('Content-Type')) headers.set('Content-Type', 'application/json');
        serializedBody = JSON.stringify(body);
    }

    const res = await fetch(path, { ...rest, headers, body: serializedBody });
    if (!res.ok) {
        let parsed: unknown;
        try { parsed = await res.json(); } catch { parsed = await res.text().catch(() => null); }
        throw new ApiError(res.status, parsed);
    }
    if (res.status === 204) return undefined as T;
    return res.json() as Promise<T>;
}
