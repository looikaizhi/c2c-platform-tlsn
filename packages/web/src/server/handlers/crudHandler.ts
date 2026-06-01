import 'server-only';

/**
 * Generic CRUD route factories for Next 14 App Router.
 *
 * Each factory handles:
 *   • JSON parsing (catches invalid_json)
 *   • body validation (single string error message or null)
 *   • status code semantics (200 / 201 / 400 / 404 / 500)
 *   • error logging with a `tag`
 *
 * The factory does NOT know about the DB. The caller supplies the actual data
 * operation as a lambda — typically a synchronous Drizzle better-sqlite3 call,
 * but any sync/async function is fine.
 *
 * Next 14 route handler signature: `{ params }` is a synchronous object on
 * dynamic segments; we keep that contract.
 */

interface RouteError {
    status: number;
    error:  string;
}
function err(status: number, message: string): Response {
    return Response.json({ error: message }, { status });
}

/** GET → list */
export interface ListHandlerOpts<TRow, TOut = TRow> {
    fetch: () => TRow[] | Promise<TRow[]>;
    /** Optional row mapper (e.g. case conversion, ISO timestamp formatting). */
    map?:  (r: TRow) => TOut;
    tag?:  string;
}
export function listHandler<TRow, TOut = TRow>(opts: ListHandlerOpts<TRow, TOut>) {
    return async () => {
        try {
            const rows = await opts.fetch();
            const out  = opts.map ? rows.map(opts.map) : (rows as unknown as TOut[]);
            return Response.json(out, { status: 200 });
        } catch (e) {
            console.error(`[${opts.tag ?? 'list'}]`, e);
            return err(500, 'Internal Server Error');
        }
    };
}

/** POST → insert (returns { ok: true } on 201) */
export interface InsertHandlerOpts<TBody> {
    /** Return string error message → 400; null → continue. */
    validate: (body: TBody) => string | null;
    insert:   (body: TBody) => void | Promise<void>;
    tag?:     string;
}
export function insertHandler<TBody>(opts: InsertHandlerOpts<TBody>) {
    return async (req: Request) => {
        let body: TBody;
        try { body = (await req.json()) as TBody; }
        catch { return err(400, 'invalid_json'); }
        const v = opts.validate(body);
        if (v) return err(400, v);
        try {
            await opts.insert(body);
            return Response.json({ ok: true }, { status: 201 });
        } catch (e) {
            console.error(`[${opts.tag ?? 'insert'}]`, e);
            return err(500, 'Internal Server Error');
        }
    };
}

/** PATCH /:id → update by single integer id, 404 if no row changed */
export interface PatchByIdHandlerOpts<TBody> {
    /** Return null for invalid id, else the parsed number. */
    parseId:  (raw: string) => number | null;
    validate: (body: TBody) => string | null;
    /** Return number of rows affected; 0 → 404. */
    update:   (id: number, body: TBody) => number | Promise<number>;
    tag?:     string;
}
export function patchByIdHandler<TBody>(opts: PatchByIdHandlerOpts<TBody>) {
    return async (req: Request, ctx: { params: { id: string } }) => {
        const id = opts.parseId(ctx.params.id);
        if (id === null) return err(400, 'Invalid id');
        let body: TBody;
        try { body = (await req.json()) as TBody; }
        catch { return err(400, 'invalid_json'); }
        const v = opts.validate(body);
        if (v) return err(400, v);
        try {
            const affected = await opts.update(id, body);
            if (affected === 0) return err(404, 'Not found');
            return Response.json({ ok: true }, { status: 200 });
        } catch (e) {
            console.error(`[${opts.tag ?? 'patch'}]`, e);
            return err(500, 'Internal Server Error');
        }
    };
}

export type { RouteError };
