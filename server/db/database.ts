import { DatabaseSync } from 'node:sqlite';
import { mkdirSync } from 'node:fs';
import path from 'node:path';

const migrations = [
  `CREATE TABLE app_meta (key TEXT PRIMARY KEY, value TEXT NOT NULL) STRICT;
   CREATE TABLE owner (
     id INTEGER PRIMARY KEY CHECK (id = 1), username TEXT NOT NULL UNIQUE,
     password_hash TEXT NOT NULL, created_at INTEGER NOT NULL
   ) STRICT;
   CREATE TABLE sessions (
     token_hash TEXT PRIMARY KEY, owner_id INTEGER NOT NULL REFERENCES owner(id),
     csrf_hash TEXT NOT NULL, expires_at INTEGER NOT NULL, created_at INTEGER NOT NULL
   ) STRICT;
   CREATE INDEX sessions_expiry ON sessions(expires_at);
   CREATE TABLE api_tokens (
     id TEXT PRIMARY KEY, owner_id INTEGER NOT NULL REFERENCES owner(id),
     name TEXT NOT NULL, token_hash TEXT NOT NULL UNIQUE, scopes TEXT NOT NULL,
     expires_at INTEGER NOT NULL, created_at INTEGER NOT NULL, last_used_at INTEGER,
     revoked_at INTEGER
   ) STRICT;
   CREATE INDEX api_tokens_expiry ON api_tokens(expires_at);
   CREATE TABLE audit_log (
     id INTEGER PRIMARY KEY, actor TEXT NOT NULL, action TEXT NOT NULL,
     resource TEXT NOT NULL, created_at INTEGER NOT NULL
   ) STRICT;
   CREATE INDEX audit_created ON audit_log(created_at);`,
  `CREATE TABLE content_records (
     kind TEXT NOT NULL, id TEXT NOT NULL, data TEXT NOT NULL CHECK(json_valid(data)),
     revision INTEGER NOT NULL DEFAULT 1, sort_order INTEGER NOT NULL DEFAULT 0,
     created_at INTEGER NOT NULL, updated_at INTEGER NOT NULL,
     PRIMARY KEY (kind, id)
   ) STRICT;
   CREATE INDEX content_order ON content_records(kind, sort_order, created_at);
   CREATE TABLE photo_footprints (
     photo_id TEXT PRIMARY KEY, footprint_id TEXT NOT NULL, sort_order INTEGER NOT NULL DEFAULT 0
   ) STRICT;
   CREATE INDEX footprint_photos ON photo_footprints(footprint_id, sort_order);
   CREATE TABLE media_assets (
     id TEXT PRIMARY KEY, filename TEXT NOT NULL, purpose TEXT NOT NULL,
     metadata TEXT NOT NULL CHECK(json_valid(metadata)), created_at INTEGER NOT NULL
   ) STRICT;
   INSERT INTO app_meta (key, value) VALUES ('content_revision', '0');`,
  `CREATE TABLE analytics_events (
     event_id TEXT PRIMARY KEY, day TEXT NOT NULL, path TEXT NOT NULL, visitor_hash TEXT NOT NULL,
     referrer_host TEXT NOT NULL, device TEXT NOT NULL, created_at INTEGER NOT NULL
   ) STRICT;
   CREATE INDEX analytics_day ON analytics_events(day,path);
   CREATE INDEX analytics_created ON analytics_events(created_at);`,
  `CREATE TABLE essay_working_drafts (
     essay_id TEXT PRIMARY KEY, data TEXT NOT NULL CHECK(json_valid(data)),
     base_revision INTEGER NOT NULL, revision INTEGER NOT NULL, updated_at INTEGER NOT NULL
   ) STRICT;`,
];

export class SiteDatabase {
  private closed = false;
  private transactionDepth = 0;
  constructor(public readonly connection: DatabaseSync) {}

  transaction<T>(operation: () => T): T {
    const depth = this.transactionDepth;
    const savepoint = `site_transaction_${depth}`;
    this.connection.exec(depth === 0 ? 'BEGIN IMMEDIATE' : `SAVEPOINT ${savepoint}`);
    this.transactionDepth = depth + 1;
    try {
      const result = operation();
      if (result instanceof Promise) throw new Error('数据库事务中的操作必须同步执行');
      this.connection.exec(depth === 0 ? 'COMMIT' : `RELEASE SAVEPOINT ${savepoint}`);
      return result;
    } catch (error) {
      try {
        this.connection.exec(depth === 0 ? 'ROLLBACK' : `ROLLBACK TO SAVEPOINT ${savepoint}; RELEASE SAVEPOINT ${savepoint}`);
      } catch {
        // Preserve the operation or commit error if SQLite has already ended the transaction.
      }
      throw error;
    } finally {
      this.transactionDepth = depth;
    }
  }

  close(): void {
    if (!this.closed) this.connection.close();
    this.closed = true;
  }
}

/** The only module that depends on the Node SQLite driver. */
export function openDatabase(filename: string): SiteDatabase {
  if (filename !== ':memory:') mkdirSync(path.dirname(path.resolve(filename)), { recursive: true });
  const connection = new DatabaseSync(filename, { timeout: 5000 });
  const db = new SiteDatabase(connection);
  try {
    connection.exec('PRAGMA foreign_keys = ON; PRAGMA journal_mode = WAL; PRAGMA synchronous = NORMAL;');
    const version = Number(connection.prepare('PRAGMA user_version').get()?.user_version ?? 0);
    if (version > migrations.length) throw new Error('数据库版本高于当前程序，请先升级程序');
    for (let index = version; index < migrations.length; index++) {
      db.transaction(() => {
        connection.exec(migrations[index]);
        connection.exec(`PRAGMA user_version = ${index + 1}`);
      });
    }
    return db;
  } catch (error) {
    db.close();
    throw error;
  }
}
