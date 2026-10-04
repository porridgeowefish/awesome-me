export type PreviewKind = 'site' | 'profile';
export interface PreviewTarget { kind: PreviewKind; path: string }
export interface PreviewReadyMessage { type: 'site:preview-ready' }
export interface PreviewValueMessage extends PreviewTarget { type: 'site:edit-value'; value: string }
export interface PreviewDraftMessage { type: 'site:preview-draft'; site: unknown; profile: unknown }

const forbidden = new Set(['__proto__', 'constructor', 'prototype']);
function pathParts(path: string): string[] {
  if (typeof path !== 'string' || path.length > 500) throw new Error('Invalid preview path');
  if (!path) return [];
  const parts = path.split('.');
  if (parts.some(part => !part || forbidden.has(part) || !/^[a-zA-Z0-9_-]+$/.test(part))) throw new Error('Invalid preview path');
  return (parts[0] === 'copy' || parts[0] === 'icons') && parts.length > 1 ? [parts[0], parts.slice(1).join('.')] : parts;
}
export function parseEditRegion(region: unknown): PreviewTarget | null {
  if (typeof region !== 'string') return null;
  const colon = region.indexOf(':');
  const kind = region.slice(0, colon), path = region.slice(colon + 1);
  if (colon < 0 || (kind !== 'site' && kind !== 'profile')) return null;
  try { pathParts(path); return { kind, path }; } catch { return null; }
}
function plainObject(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === 'object' && !Array.isArray(value) && (Object.getPrototypeOf(value) === Object.prototype || Object.getPrototypeOf(value) === null);
}
function safeValue(value: unknown): boolean {
  if (Array.isArray(value)) return value.every(safeValue);
  if (value !== null && typeof value === 'object') return plainObject(value) && Object.entries(value).every(([key, entry]) => !key.split('.').some(part => forbidden.has(part)) && safeValue(entry));
  return true;
}
function ownEntry(value: unknown, part: string): unknown {
  if (Array.isArray(value)) {
    if (!/^(0|[1-9]\d*)$/.test(part)) throw new Error('Invalid array index');
    return Number(part) < value.length ? value[Number(part)] : undefined;
  }
  return plainObject(value) && Object.hasOwn(value, part) ? value[part] : undefined;
}
export function getPreviewField(data: Record<string, unknown>, path: string): unknown {
  return pathParts(path).reduce<unknown>((value, part) => ownEntry(value, part), data);
}
export function setPreviewField(data: Record<string, unknown>, path: string, value: unknown): Record<string, unknown> {
  const parts = pathParts(path);
  if (!safeValue(value)) throw new Error('Unsafe preview value');
  if (!parts.length) {
    if (!plainObject(value)) throw new Error('Preview root must be an object');
    return { ...value };
  }
  function update(node: unknown, depth: number): unknown {
    const part = parts[depth];
    if (!plainObject(node) && !Array.isArray(node)) throw new Error('Preview path does not exist');
    if (Array.isArray(node) && (!/^(0|[1-9]\d*)$/.test(part) || Number(part) >= node.length)) throw new Error('Invalid array index');
    const next = depth === parts.length - 1 ? value : update(ownEntry(node, part), depth + 1);
    if (Array.isArray(node)) { const copy = [...node]; copy[Number(part)] = next; return copy; }
    return { ...node, [part]: next };
  }
  return update(data, 0) as Record<string, unknown>;
}
