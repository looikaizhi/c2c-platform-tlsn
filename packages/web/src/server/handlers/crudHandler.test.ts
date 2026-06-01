import { describe, expect, it, vi } from 'vitest';
import { listHandler, insertHandler, patchByIdHandler } from './crudHandler';

const readJson = async (res: Response) => res.json() as Promise<unknown>;

describe('listHandler', () => {
    it('returns 200 with raw rows when no map is provided', async () => {
        const handler = listHandler({ fetch: () => [{ id: 1 }, { id: 2 }] });
        const res = await handler();
        expect(res.status).toBe(200);
        expect(await readJson(res)).toEqual([{ id: 1 }, { id: 2 }]);
    });

    it('applies map to each row', async () => {
        const handler = listHandler<{ id: number }, { i: number }>({
            fetch: () => [{ id: 1 }, { id: 2 }],
            map:   (r) => ({ i: r.id }),
        });
        const res = await handler();
        expect(await readJson(res)).toEqual([{ i: 1 }, { i: 2 }]);
    });

    it('returns 500 on fetch error and logs', async () => {
        const spy = vi.spyOn(console, 'error').mockImplementation(vi.fn());
        const handler = listHandler({
            fetch: () => { throw new Error('boom'); },
            tag:   'unit/list',
        });
        const res = await handler();
        expect(res.status).toBe(500);
        expect(await readJson(res)).toEqual({ error: 'Internal Server Error' });
        expect(spy).toHaveBeenCalledWith('[unit/list]', expect.any(Error));
        spy.mockRestore();
    });
});

describe('insertHandler', () => {
    const makeReq = (body: unknown): Request =>
        new Request('http://test/api/x', {
            method:  'POST',
            headers: { 'Content-Type': 'application/json' },
            body:    typeof body === 'string' ? body : JSON.stringify(body),
        });

    it('returns 201 and {ok:true} on success', async () => {
        const insert = vi.fn();
        const handler = insertHandler<{ name: string }>({
            validate: () => null,
            insert,
        });
        const res = await handler(makeReq({ name: 'alice' }));
        expect(res.status).toBe(201);
        expect(await readJson(res)).toEqual({ ok: true });
        expect(insert).toHaveBeenCalledWith({ name: 'alice' });
    });

    it('returns 400 on validation failure with the error string', async () => {
        const handler = insertHandler<{ name?: string }>({
            validate: (b) => b.name ? null : 'name required',
            insert:   () => { throw new Error('should not reach'); },
        });
        const res = await handler(makeReq({}));
        expect(res.status).toBe(400);
        expect(await readJson(res)).toEqual({ error: 'name required' });
    });

    it('returns 400 invalid_json on malformed body', async () => {
        const handler = insertHandler({ validate: () => null, insert: vi.fn() });
        const res = await handler(makeReq('not-json{'));
        expect(res.status).toBe(400);
        expect(await readJson(res)).toEqual({ error: 'invalid_json' });
    });

    it('returns 500 when insert throws', async () => {
        const spy = vi.spyOn(console, 'error').mockImplementation(vi.fn());
        const handler = insertHandler({
            validate: () => null,
            insert:   () => { throw new Error('db down'); },
            tag:      'unit/insert',
        });
        const res = await handler(makeReq({}));
        expect(res.status).toBe(500);
        spy.mockRestore();
    });
});

describe('patchByIdHandler', () => {
    const makeReq = (body: unknown): Request =>
        new Request('http://test/api/x/1', {
            method:  'PATCH',
            headers: { 'Content-Type': 'application/json' },
            body:    JSON.stringify(body),
        });
    const parseInt10 = (raw: string) => {
        const n = parseInt(raw, 10);
        return Number.isFinite(n) ? n : null;
    };

    it('returns 200 and {ok:true} when update affects rows', async () => {
        const update = vi.fn().mockReturnValue(1);
        const handler = patchByIdHandler<{ active: boolean }>({
            parseId:  parseInt10,
            validate: () => null,
            update,
        });
        const res = await handler(makeReq({ active: true }), { params: { id: '42' } });
        expect(res.status).toBe(200);
        expect(await readJson(res)).toEqual({ ok: true });
        expect(update).toHaveBeenCalledWith(42, { active: true });
    });

    it('returns 404 when update affects 0 rows', async () => {
        const handler = patchByIdHandler<{ active: boolean }>({
            parseId:  parseInt10,
            validate: () => null,
            update:   () => 0,
        });
        const res = await handler(makeReq({ active: true }), { params: { id: '42' } });
        expect(res.status).toBe(404);
        expect(await readJson(res)).toEqual({ error: 'Not found' });
    });

    it('returns 400 when parseId returns null', async () => {
        const handler = patchByIdHandler<{ active: boolean }>({
            parseId:  () => null,
            validate: () => null,
            update:   () => 1,
        });
        const res = await handler(makeReq({ active: true }), { params: { id: 'NaN' } });
        expect(res.status).toBe(400);
    });
});
