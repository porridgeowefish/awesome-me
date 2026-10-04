#!/usr/bin/env node
/**
 * 相机原图 → 网站图片（WebP 大图 + 缩略图）
 *
 *   npm run media -- --src "C:/photos"            # 处理目录下所有 jpg/png
 *   npm run media -- --src "D:/photos" --out public/content/gallery
 *
 * 输出：<out>/<name>.webp（长边 2400）和 <out>/thumbs/<name>.webp（长边 640），
 * 并自动按 EXIF 方向旋转。已存在且比源文件新的输出会被跳过（增量处理）。
 * 然后在 src/data/gallery.ts 里添加一条记录即可出现在「图库」。
 */
import fs from 'node:fs/promises';
import path from 'node:path';
import sharp from 'sharp';
import { safeFileName } from './lib/obsidian.mjs';

const args = process.argv.slice(2);
const arg = (n, d) => {
  const i = args.indexOf(`--${n}`);
  return i >= 0 ? args[i + 1] : d;
};
const src = arg('src');
const out = path.resolve(arg('out', 'public/content/gallery'));
const LARGE = Number(arg('large', 2400));
const THUMB = Number(arg('thumb', 640));

if (!src) {
  console.error('用法：npm run media -- --src <照片目录> [--out public/content/gallery]');
  process.exit(1);
}

await fs.mkdir(path.join(out, 'thumbs'), { recursive: true });

const isNewer = async (a, b) => {
  try {
    return (await fs.stat(a)).mtimeMs > (await fs.stat(b)).mtimeMs;
  } catch {
    return true;
  }
};

for (const file of await fs.readdir(src)) {
  if (!/\.(jpe?g|png|heic|webp|tiff?)$/i.test(file)) continue;
  const name = safeFileName(path.basename(file, path.extname(file))).replace(/^[-=]+/, '');
  const input = path.join(src, file);
  const large = path.join(out, `${name}.webp`);
  const thumb = path.join(out, 'thumbs', `${name}.webp`);
  if (!(await isNewer(input, large))) {
    console.log(`· ${name} 已是最新`);
    continue;
  }
  try {
    const base = sharp(input).rotate();
    await base.clone().resize({ width: LARGE, height: LARGE, fit: 'inside', withoutEnlargement: true }).webp({ quality: 80 }).toFile(large);
    await base.clone().resize({ width: THUMB, height: THUMB, fit: 'inside' }).webp({ quality: 72 }).toFile(thumb);
    const { width, height } = await sharp(large).metadata();
    console.log(`✓ ${name}.webp  ${width}×${height}`);
  } catch (err) {
    console.error(`✗ ${file}: ${err.message}`);
    process.exitCode = 1;
  }
}
