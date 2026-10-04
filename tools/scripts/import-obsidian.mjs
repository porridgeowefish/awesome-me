#!/usr/bin/env node
/**
 * Obsidian 笔记 → 随笔导入器
 *
 * 用法：
 *   npm run import:notes                       # 按 tools/scripts/import.config.json 全量导入
 *   npm run import:notes -- --vault "D:/notes" # 临时指定笔记库位置
 *   npm run import:notes -- --only first-post      # 只导入某个 slug
 *
 * 每篇笔记会被转换成一个“文章包”：
 *   public/content/essays/<folder>/<slug>/index.md
 *   public/content/essays/<folder>/<slug>/assets/*.png
 */
import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { convertObsidian, extractDate, extractTitle, summarize, toFrontmatter } from './lib/obsidian.mjs';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const args = process.argv.slice(2);
const arg = (name) => {
  const i = args.indexOf(`--${name}`);
  return i >= 0 ? args[i + 1] : undefined;
};

const config = JSON.parse(await fs.readFile(path.join(root, 'tools/scripts/import.config.json'), 'utf8'));
const vault = path.resolve(arg('vault') ?? config.vault);
const outRoot = path.resolve(root, config.output);
const only = arg('only');

let sharp = null;
try {
  sharp = (await import('sharp')).default;
} catch {
  console.warn('[import] sharp 不可用，图片将原样复制');
}

/** basename → absolute path, for resolving Obsidian's "shortest path" image links. */
async function indexVault(dir, map = new Map()) {
  for (const entry of await fs.readdir(dir, { withFileTypes: true })) {
    if (entry.name.startsWith('.') || entry.name === 'node_modules') continue;
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) await indexVault(full, map);
    else if (!map.has(entry.name)) map.set(entry.name, full);
  }
  return map;
}

/**
 * Copy an image into the bundle. Oversized raster images are downscaled, and heavy
 * PNG screenshots are re-encoded as WebP. Returns the final file name (may change extension).
 */
async function copyImage(src, destDir, name) {
  const ext = path.extname(src).toLowerCase();
  const { size } = await fs.stat(src);
  if (sharp && ['.png', '.jpg', '.jpeg', '.webp'].includes(ext)) {
    const meta = await sharp(src).metadata();
    const tooWide = (meta.width ?? 0) > config.maxImageWidth;
    const tooHeavy = size > (config.maxImageBytes ?? 400_000);
    if (tooWide || tooHeavy) {
      const finalName = tooHeavy ? name.replace(/\.[^.]+$/, '.webp') : name;
      let pipeline = sharp(src);
      if (tooWide) pipeline = pipeline.resize({ width: config.maxImageWidth });
      if (tooHeavy) pipeline = pipeline.webp({ quality: 82 });
      await pipeline.toFile(path.join(destDir, finalName));
      return finalName;
    }
  }
  await fs.copyFile(src, path.join(destDir, name));
  return name;
}

const SAFE_SEGMENT = /^[^/\\:*?"<>|.][^/\\:*?"<>|]*$/;

/** Refuse anything that could make the importer delete or write outside its own bundle. */
function validate(note) {
  if (!note.source || !note.folder || !note.slug) throw new Error('source / folder / slug 均为必填');
  if (!SAFE_SEGMENT.test(note.slug)) throw new Error(`slug 不合法：${note.slug}`);
  if (!note.folder.split('/').every((seg) => SAFE_SEGMENT.test(seg))) throw new Error(`folder 不合法：${note.folder}`);
}

async function importNote(note, files) {
  validate(note);
  const srcPath = path.join(vault, note.source);
  const raw = await fs.readFile(srcPath, 'utf8');
  const stat = await fs.stat(srcPath);

  const { title: h1, body } = extractTitle(raw);
  const converted = convertObsidian(body, { stripLinePatterns: config.stripLinePatterns });
  const { images } = converted;
  let { markdown } = converted;

  const bundle = path.join(outRoot, ...note.folder.split('/'), note.slug);
  await fs.rm(bundle, { recursive: true, force: true }); // idempotent re-import
  await fs.mkdir(path.join(bundle, 'assets'), { recursive: true });

  const missing = [];
  for (const img of images) {
    const found = files.get(img.original) ?? files.get(decodeURIComponent(img.original));
    if (!found) {
      missing.push(img.original);
      continue;
    }
    const finalName = await copyImage(found, path.join(bundle, 'assets'), img.target);
    if (finalName !== img.target) {
      markdown = markdown.split(`./assets/${encodeURI(img.target)}`).join(`./assets/${encodeURI(finalName)}`);
      img.target = finalName;
    }
  }

  const frontmatter = toFrontmatter({
    title: note.title ?? h1 ?? path.basename(note.source, '.md'),
    subtitle: note.subtitle,
    date: note.date ?? extractDate(raw) ?? stat.mtime.toISOString().slice(0, 10),
    tags: note.tags ?? [],
    summary: note.summary ?? summarize(markdown),
    featured: note.featured ? true : undefined,
    cover: note.cover ?? (images[0] ? `./assets/${images[0].target}` : undefined),
    source: note.source,
  });
  await fs.writeFile(path.join(bundle, 'index.md'), frontmatter + markdown, 'utf8');
  if (!images.length) await fs.rm(path.join(bundle, 'assets'), { recursive: true, force: true });

  console.log(`✓ ${note.folder}/${note.slug}  (${images.length - missing.length} 张图片)`);
  if (missing.length) console.warn(`  ⚠ 找不到图片：${missing.join(', ')}`);
}

const files = await indexVault(vault);
let failed = 0;
for (const note of config.notes) {
  if (only && note.slug !== only) continue;
  try {
    await importNote(note, files);
  } catch (err) {
    failed++;
    console.error(`✗ ${note.source}: ${err.message}`);
  }
}
process.exitCode = failed ? 1 : 0;
