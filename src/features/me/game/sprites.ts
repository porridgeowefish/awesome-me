/**
 * Original pixel-art bitmaps for the runner game. One character per pixel; '.' is transparent,
 * other characters are looked up in a colour map at draw time (so day/night can recolour them).
 */
export type Bitmap = readonly string[];

export const ROCK: Bitmap = [
  '....hhhh....',
  '..hh####ss..',
  '.h######sss.',
  '.h#######ss.',
  'h########sss',
  'h#########ss',
  '#########sss',
  '##########ss',
  '.########ss.',
  '..ssssssss..',
];

export const PINE: Bitmap = [
  '.....l.....',
  '....lgl....',
  '....ggg....',
  '...lgggl...',
  '...ggggd...',
  '....ggg....',
  '...lggggd..',
  '..lggggggd.',
  '..gggggggd.',
  '...gggggd..',
  '..lggggggd.',
  '.lggggggggd',
  '.gggggggggd',
  '..gggggggd.',
  '.lgggggggdd',
  'lggggggggdd',
  'ggggggggggd',
  '.dggggggdd.',
  '....bbb....',
  '....bbb....',
  '....bbb....',
  '....bbb....',
  '...bbbbb...',
];

export const BIRD_UP: Bitmap = [
  '......##.........',
  '......###........',
  '.......###.......',
  '.......####......',
  '..##....####.....',
  '.####..######....',
  'oo###########w#..',
  '..############...',
  '....#########....',
  '.................',
  '.................',
];

export const BIRD_DOWN: Bitmap = [
  '.................',
  '.................',
  '.................',
  '..##.............',
  '.####............',
  'oo###########w#..',
  '..############...',
  '....##########...',
  '.......####......',
  '.......###.......',
  '......##.........',
];

export function drawBitmap(
  ctx: CanvasRenderingContext2D,
  bitmap: Bitmap,
  x: number,
  y: number,
  w: number,
  h: number,
  colors: Record<string, string>,
) {
  const cols = bitmap[0].length;
  const pw = w / cols;
  const ph = h / bitmap.length;
  for (let j = 0; j < bitmap.length; j++) {
    const row = bitmap[j];
    for (let i = 0; i < row.length; i++) {
      const c = colors[row[i]];
      if (!c) continue;
      ctx.fillStyle = c;
      ctx.fillRect(Math.floor(x + i * pw), Math.floor(y + j * ph), Math.ceil(pw), Math.ceil(ph));
    }
  }
}
