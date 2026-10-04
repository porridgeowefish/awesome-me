import fs from 'node:fs';
import path from 'node:path';
import { execFileSync } from 'node:child_process';
import sharp from 'sharp';

const root = process.cwd();
const issues = [];
let files;
// Never scan an ancestor repository that happens to contain this checkout.
if (fs.existsSync(path.join(root, '.git'))) {
  files = execFileSync('git', ['ls-files', '--cached', '--others', '--exclude-standard', '-z'], { encoding: 'utf8', windowsHide: true }).split('\0').filter(Boolean);
} else {
  files = [];
  const skip = new Set(['node_modules', '.git', '.local', '.build']);
  function visit(dir) {
    for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
      const target = path.join(dir, entry.name);
      if (entry.isSymbolicLink()) { issues.push(`${path.relative(root, target)}: symbolic link requires review`); continue; }
      if (entry.isDirectory()) { if (!skip.has(entry.name) && !(dir === root && ['coverage', 'data', 'dist', 'artifacts', 'backups'].includes(entry.name))) visit(target); }
      else if (!/^\.env(?:\.|$)/.test(entry.name) || entry.name.endsWith('.example')) files.push(path.relative(root, target).replaceAll('\\', '/'));
    }
  }
  visit(root);
}
const folderCount = new Set(files.filter(file => file.includes('/')).map(file => file.split('/')[0])).size;
if (folderCount > 6) issues.push(`Source has ${folderCount} top-level folders; maximum is 6`);
const textExtensions = /\.(?:ts|tsx|mjs|js|json|md|html|css|svg|yaml|yml|example|txt)$/i;
let imageCount = 0;
for (const file of new Set(files)) {
  const target = path.join(root, file);
  if (!fs.existsSync(target)) continue;
  if (fs.lstatSync(target).isSymbolicLink()) { issues.push(`${file}: symbolic link requires review`); continue; }
  if (/^(?:node_modules|data|backups|artifacts)(?:\/|$)|(?:^|\/)(?:\.local|\.build)(?:\/|$)/.test(file) || /\.(?:sqlite(?:-wal|-shm)?|db|pem|key|docx?|pdf|zip|exe)$/i.test(file) || /(?:^|\/)project-path\.txt$/.test(file) || /(?:^|\/)\.env(?:\.|$)/.test(file) && !file.endsWith('.example')) {
    issues.push(`${file}: private or generated file in release`); continue;
  }
  if (/\.(?:png|jpe?g|webp|tiff?|heic)$/i.test(file)) {
    imageCount++;
    const metadata = await sharp(target).metadata();
    if (metadata.exif) issues.push(`${file}: image contains EXIF metadata`);
  }
  if (!textExtensions.test(file) && !['Dockerfile', 'LICENSE', '.gitignore', '.dockerignore'].includes(file)) continue;
  const source = fs.readFileSync(target, 'utf8');
  if (/(?:sk-[a-zA-Z0-9_-]{24,}|gh[pousr]_[a-zA-Z0-9]{30,}|-----BEGIN (?:RSA |OPENSSH |EC )?PRIVATE KEY-----)/.test(source)) issues.push(`${file}: credential-like string`);
  if (/^[ \t]*(?:AMAP_(?:WEB_KEY|SERVICE_KEY|SECURITY_CODE)|SITE_TOKEN)[ \t]*=[ \t]*[^\s#]+/m.test(source)) issues.push(`${file}: populated secret configuration`);
  if (/(?:[A-Z]:[\\/](?:Users|Documents and Settings)[\\/][^\s/\\]+|\/Users\/[^\s/]+|\/home\/[^\s/]+)/i.test(source)) issues.push(`${file}: local user home path`);
  const emails = source.match(/[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}/g) ?? [];
  if (emails.some(email => !/@(?:example\.(?:com|org|net|test)|[^@]+\.example|[^@]+\.test)$/i.test(email))) issues.push(`${file}: non-example email address requires review`);
}
if (issues.length) {
  for (const issue of issues) console.error(issue);
  process.exitCode = 1;
} else console.log(JSON.stringify({ sourceFilesChecked: new Set(files).size, sourceFolders: folderCount, imagesChecked: imageCount, privacyIssues: 0 }));
