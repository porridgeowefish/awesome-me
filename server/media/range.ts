import fs from 'node:fs';
import type { FastifyReply, FastifyRequest } from 'fastify';

export function streamFile(file: string, contentType: string, request: FastifyRequest, reply: FastifyReply) {
  const size = fs.statSync(file).size;
  reply.type(contentType).header('Accept-Ranges', 'bytes');
  const range = request.headers.range;
  if (!range) { reply.header('Content-Length', size); return reply.send(fs.createReadStream(file)); }
  const match = /^bytes=(\d*)-(\d*)$/.exec(range);
  if (!match || (!match[1] && !match[2])) return reply.code(416).header('Content-Range', `bytes */${size}`).send();
  let start: number, end: number;
  if (!match[1]) { const suffix = Number(match[2]); start = Math.max(0, size - suffix); end = size - 1; if (suffix <= 0) start = size; }
  else { start = Number(match[1]); end = match[2] ? Math.min(Number(match[2]), size - 1) : size - 1; }
  if (!Number.isSafeInteger(start) || !Number.isSafeInteger(end) || start < 0 || start >= size || end < start) return reply.code(416).header('Content-Range', `bytes */${size}`).send();
  reply.code(206).header('Content-Range', `bytes ${start}-${end}/${size}`).header('Content-Length', end - start + 1);
  return reply.send(fs.createReadStream(file, { start, end }));
}
