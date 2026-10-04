import { afterEach, describe, expect, it, vi } from 'vitest';
import { getPreviewField, parseEditRegion, setPreviewField } from '../../src/contracts/edit-preview';
import { siteDefaults } from '../../src/data/siteDefaults';
import { profile } from '../../src/data/profile';

afterEach(() => { vi.unstubAllGlobals(); vi.resetModules(); });

describe('preview selection paths', () => {
  it('recognizes both resources, logical copy keys, and root selections', () => {
    expect(parseEditRegion('profile:experience.0.points.1.text')).toEqual({ kind: 'profile', path: 'experience.0.points.1.text' });
    expect(parseEditRegion('site:copy.me.greeting')).toEqual({ kind: 'site', path: 'copy.me.greeting' });
    expect(parseEditRegion('site:')).toEqual({ kind: 'site', path: '' });
    for (const region of [undefined, {}, 'profile', 'essays:title', 'profile:name:extra', 'site:copy..hello', 'profile:constructor', 'site:copy.me.__proto__']) expect(parseEditRegion(region)).toBeNull();
  });
  it('reads and updates dotted copy/icon keys literally, and array items without changing siblings or source', () => {
    const data = { copy: { 'me.greeting': 'Hello', 'me.subtitle': 'World' }, icons: { 'profile.skills': 'sparkle' }, facts: [{ label: 'School', value: 'A' }, { label: 'City', value: 'B' }] };
    expect(getPreviewField(data, 'copy.me.greeting')).toBe('Hello');
    expect(getPreviewField(data, 'icons.profile.skills')).toBe('sparkle');
    expect(getPreviewField(data, '')).toBe(data);
    const next = setPreviewField(data, 'facts.0.value', 'New');
    expect(getPreviewField(next, 'facts.0.value')).toBe('New');
    expect(getPreviewField(data, 'facts.0.value')).toBe('A');
    expect((next.facts as unknown[])[1]).toBe(data.facts[1]);
    expect(getPreviewField(setPreviewField(data, 'copy.me.greeting', 'Hi'), 'copy.me.greeting')).toBe('Hi');
    expect(getPreviewField(data, 'missing')).toBeUndefined();
  });
  it('rejects prototype paths, inherited fields, invalid array indices and unsafe root replacement', () => {
    const data = { facts: [{ value: 'A' }] };
    for (const path of ['__proto__.polluted', 'facts.0.constructor', 'facts.0.prototype', 'copy.a.__proto__.x', 'facts.-1.value', 'facts.01.value', 'facts.99.value', 'missing.value']) {
      expect(() => setPreviewField(data, path, 'bad'), path).toThrow();
    }
    expect(() => getPreviewField(data, 'facts.length')).toThrow();
    expect(() => setPreviewField(data, '', [])).toThrow();
    expect(() => setPreviewField(data, '', JSON.parse('{"nested":{"__proto__":{"polluted":true}}}'))).toThrow();
    expect(setPreviewField(data, '', { name: 'Replacement' })).toEqual({ name: 'Replacement' });
    expect(({} as Record<string, unknown>).polluted).toBeUndefined();
  });
});

async function loadRuntime(embedded: boolean, search: string) {
  const fakeWindow = { location: { search }, parent: {} as unknown };
  if (!embedded) fakeWindow.parent = fakeWindow;
  vi.stubGlobal('window', fakeWindow);
  const snapshot = { revision: 1, site: siteDefaults, profile, photos: [], footprints: [], wishes: [], brands: {}, essays: {}, music: {} };
  vi.stubGlobal('fetch', vi.fn(async () => ({ ok: true, json: async () => snapshot })));
  // The test compiler is configured for server .ts files; Vitest handles this React module.
  const runtimePath = '../../src/shared/content/runtime';
  const runtime = await import(runtimePath);
  await runtime.refreshSiteContent();
  return runtime;
}

describe('embedded local draft store', () => {
  it('shows valid drafts while retaining the last valid profile when the form temporarily becomes invalid', async () => {
    const runtime = await loadRuntime(true, '?preview=1');
    runtime.applyPreviewDraft({ ...siteDefaults, footer: 'Draft footer' }, { ...profile, name: 'Draft name' });
    expect(runtime.getSiteContent().profile?.name).toBe('Draft name');
    runtime.applyPreviewDraft({ ...siteDefaults, footer: 'Next footer' }, { ...profile, name: '' });
    expect(runtime.getSiteContent().profile?.name).toBe('Draft name');
    expect(runtime.getSiteContent().site?.footer).toBe('Next footer');
    expect(fetch).toHaveBeenCalledTimes(1);
  });
  it.each([[false, '?preview=1'], [true, '']])('never overrides public content outside the embedded preview (%s, %s)', async (embedded, search) => {
    const runtime = await loadRuntime(embedded, search);
    runtime.applyPreviewDraft({ ...siteDefaults, name: 'Changed site' }, { ...profile, name: 'Changed profile' });
    expect(runtime.getSiteContent().profile?.name).toBe(profile.name);
    expect(runtime.getSiteContent().site?.name).toBe(siteDefaults.name);
  });
});
