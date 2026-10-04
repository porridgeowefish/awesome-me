import type { ContentRecord, ResourceData, ResourceKind } from '../../src/contracts/content.ts';
import type { SiteDatabase } from '../db/database.ts';

interface Row { kind: ResourceKind; id: string; data: string; revision: number; sort_order: number; created_at: number; updated_at: number }
function record<K extends ResourceKind>(row: Row): ContentRecord<K> {
  return { kind: row.kind as K, id: row.id, data: JSON.parse(row.data) as ResourceData<K>, revision: row.revision, order: row.sort_order,
    createdAt: new Date(row.created_at).toISOString(), updatedAt: new Date(row.updated_at).toISOString() };
}

export class ContentRepository {
  constructor(private readonly db: SiteDatabase) {}
  get<K extends ResourceKind>(kind: K, id: string): ContentRecord<K> | null {
    const row = this.db.connection.prepare('SELECT kind, id, data, revision, sort_order, created_at, updated_at FROM content_records WHERE kind = ? AND id = ?').get(kind, id) as unknown as Row | undefined;
    return row ? record<K>(row) : null;
  }
  list<K extends ResourceKind>(kind: K): ContentRecord<K>[] {
    const rows = this.db.connection.prepare('SELECT kind, id, data, revision, sort_order, created_at, updated_at FROM content_records WHERE kind = ? ORDER BY sort_order, created_at, id LIMIT 10000').all(kind) as unknown as Row[];
    return rows.map(row => record<K>(row));
  }
  insert<K extends ResourceKind>(kind: K, id: string, data: ResourceData<K>): ContentRecord<K> {
    const now = Date.now();
    const order = Number(this.db.connection.prepare('SELECT COALESCE(MAX(sort_order), -1) + 1 AS next FROM content_records WHERE kind = ?').get(kind)?.next ?? 0);
    this.db.connection.prepare('INSERT INTO content_records (kind, id, data, revision, sort_order, created_at, updated_at) VALUES (?, ?, ?, 1, ?, ?, ?)').run(kind, id, JSON.stringify(data), order, now, now);
    return this.get(kind, id)!;
  }
  update<K extends ResourceKind>(kind: K, id: string, data: ResourceData<K>): ContentRecord<K> {
    this.db.connection.prepare('UPDATE content_records SET data = ?, revision = revision + 1, updated_at = ? WHERE kind = ? AND id = ?').run(JSON.stringify(data), Date.now(), kind, id);
    return this.get(kind, id)!;
  }
  bump(kind: ResourceKind, id: string): void {
    this.db.connection.prepare('UPDATE content_records SET revision = revision + 1, updated_at = ? WHERE kind = ? AND id = ?').run(Date.now(), kind, id);
  }
  delete(kind: ResourceKind, id: string): void { this.db.connection.prepare('DELETE FROM content_records WHERE kind = ? AND id = ?').run(kind, id); }
}
