import 'server-only';
import Database from 'better-sqlite3';
import { drizzle, type BetterSQLite3Database } from 'drizzle-orm/better-sqlite3';
import path from 'node:path';
import fs from 'node:fs';
import * as schema from './schema';

export type AppDb = BetterSQLite3Database<typeof schema>;

let _sqlite: Database.Database | null = null;
let _db: AppDb | null = null;

function resolveDbPath(): string {
    const raw = process.env.SQLITE_DB_PATH ?? './data/c2c.db';
    const abs = path.isAbsolute(raw)
        ? raw
        : path.resolve(process.cwd(), raw);
    fs.mkdirSync(path.dirname(abs), { recursive: true });
    return abs;
}

export function getDb(): AppDb {
    if (_db) return _db;
    const dbPath = resolveDbPath();
    _sqlite = new Database(dbPath);
    _sqlite.pragma('journal_mode = WAL');
    _sqlite.pragma('foreign_keys = ON');
    _db = drizzle(_sqlite, { schema });
    return _db;
}

export function closeDb(): void {
    if (_sqlite) {
        _sqlite.close();
        _sqlite = null;
        _db = null;
    }
}
