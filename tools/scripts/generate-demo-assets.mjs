import fs from 'node:fs/promises';
import path from 'node:path';
import sharp from 'sharp';

// All bundled media is original procedural artwork. No external downloads or private sources.
const svg = (w, h, body) => `<svg xmlns="http://www.w3.org/2000/svg" width="${w}" height="${h}" viewBox="0 0 ${w} ${h}">${body}</svg>`;
async function write(file, body, format = 'webp', width) {
  await fs.mkdir(path.dirname(file), { recursive: true });
  let image = sharp(Buffer.from(body));
  if (width) image = image.resize({ width });
  await image.toFormat(format).toFile(file);
}
const mark = svg(128, 128, '<rect width="128" height="128" rx="28" fill="#226d68"/><path d="M26 92V36h16l22 30 22-30h16v56H86V62L64 90 42 62v30Z" fill="#f4efe2"/>');
const hero = svg(128, 176, '<path d="M32 64h64v64H32Z" fill="#226d68"/><path d="M44 20h40v40H44Z" fill="#e6bc93"/><path d="M40 16h48v20H40Z" fill="#2d3a44"/><path d="M48 128h16v40H48ZM72 128h16v40H72Z" fill="#2d3a44"/><path d="M48 42h6v6h-6ZM74 42h6v6h-6Z" fill="#2d3a44"/>');
await write('public/images/me/avatar.webp', mark);
await write('public/images/me/pixel-head.png', mark, 'png');
await write('public/favicon.png', mark, 'png');
await write('public/images/me/pixel-me.webp', hero);
await fs.mkdir('public/images/logos', { recursive: true });
await fs.writeFile('public/images/logos/example.svg', mark);
const landscapes = {
  mountains: '<rect width="1200" height="720" fill="#e8c7a0"/><circle cx="880" cy="180" r="70" fill="#fff2bf"/><path d="M0 610 300 200 570 560 830 300 1200 630v90H0" fill="#7b9290"/><path d="m170 720 420-390 470 390" fill="#226d68"/>',
  lake: '<rect width="1200" height="720" fill="#d5e8e5"/><path d="M0 410 260 190 540 430 880 160 1200 410" fill="#648d7f"/><path d="M0 410h1200v310H0Z" fill="#74aeb0"/><path d="m0 550 400-40 500 80 300-20v150H0Z" fill="#4e8d94"/><circle cx="220" cy="110" r="50" fill="#f6e9b3"/>',
  city: '<rect width="1200" height="720" fill="#e4d2bc"/><circle cx="840" cy="160" r="65" fill="#f5e7b7"/><path d="M80 720V330h180v390h40V250h160v470h40V390h200v330h40V210h170v510h40V410h170v310" fill="#476f70"/><path d="M160 380h40v60h-40Zm180-70h40v60h-40Zm430-50h40v60h-40Z" fill="#e5bc76"/>',
};
for (const [name, body] of Object.entries(landscapes)) {
  const source = svg(1200, 720, body);
  await write(`public/content/gallery/${name}.webp`, source);
  await write(`public/content/gallery/thumbs/${name}.webp`, source, 'webp', 480);
}
await write('public/images/me/scene-bg.webp', svg(1200, 720, landscapes.mountains));
await write('public/content/essays/使用指南/writing/assets/mountains.webp', svg(1200, 720, landscapes.mountains));
await write('public/content/essays/使用指南/gallery-and-map/assets/lake.webp', svg(1200, 720, landscapes.lake));

const workflow = svg(1200, 520, '<rect width="1200" height="520" rx="24" fill="#f4efe2"/><text x="64" y="84" font-family="sans-serif" font-size="42" fill="#173b3b">awesome-me / content workflow</text><g fill="#226d68"><rect x="64" y="166" width="280" height="190" rx="20"/><rect x="460" y="166" width="280" height="190" rx="20"/><rect x="856" y="166" width="280" height="190" rx="20"/></g><g fill="#f4efe2" font-family="sans-serif" font-size="30"><text x="100" y="236">01 / Create</text><text x="100" y="292" font-size="22">Dashboard / Markdown</text><text x="496" y="236">02 / Publish</text><text x="496" y="292" font-size="22">Draft / Preview / Save</text><text x="892" y="236">03 / Share</text><text x="892" y="292" font-size="22">Articles / Gallery / Map</text></g><path d="M365 260h70m-15-12 15 12-15 12m330-12h70m-15-12 15 12-15 12" stroke="#226d68" stroke-width="5" fill="none"/><text x="64" y="449" font-family="sans-serif" font-size="22" fill="#476f70">Private storage stays on your server. Only published content is public.</text>');
await fs.mkdir('docs/images', { recursive: true });
await fs.writeFile('docs/images/workflow.svg', workflow);
await write('public/content/essays/使用指南/getting-started/assets/workflow.webp', workflow);

// A quiet, three-second original two-note chime demonstrates the player.
const rate = 22050, samples = rate * 3, audio = Buffer.alloc(44 + samples * 2);
audio.write('RIFF'); audio.writeUInt32LE(audio.length - 8, 4); audio.write('WAVEfmt ', 8);
audio.writeUInt32LE(16, 16); audio.writeUInt16LE(1, 20); audio.writeUInt16LE(1, 22);
audio.writeUInt32LE(rate, 24); audio.writeUInt32LE(rate * 2, 28); audio.writeUInt16LE(2, 32); audio.writeUInt16LE(16, 34);
audio.write('data', 36); audio.writeUInt32LE(samples * 2, 40);
for (let i = 0; i < samples; i++) {
  const t = i / rate, local = t % 1.5, frequency = t < 1.5 ? 523.25 : 659.25;
  const envelope = Math.min(local * 25, 1) * Math.exp(-local * 4);
  audio.writeInt16LE(Math.round(Math.sin(2 * Math.PI * frequency * t) * envelope * 2400), 44 + i * 2);
}
await fs.mkdir('public/content/music', { recursive: true });
await fs.writeFile('public/content/music/demo-chime.wav', audio);
await fs.writeFile('public/content/music/demo-chime.json', JSON.stringify({ title: '示例提示音', artist: 'awesome-me', album: '原创演示素材', note: '由脚本合成的两音提示音，可自由替换。' }, null, 2));
console.log('Generated original demo illustrations, workflow diagram and chime.');
