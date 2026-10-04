import { afterAll, afterEach, beforeAll, describe, expect, it } from 'vitest';
import { spawnSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { mkdtempSync, readFileSync, readdirSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import ffmpegPath from 'ffmpeg-static';
import type { FastifyInstance } from 'fastify';
import { createApp } from '../../../server/app';
import { createAudioConverter } from '../../../server/media/audio-converter';
import { MediaService } from '../../../server/media/service';
import { Readable } from 'node:stream';

const apps: FastifyInstance[] = [], directories: string[] = [];
let fixtures: string, videoWithAudio: Buffer, silentVideo: Buffer;
function ffmpeg(args: string[]) {
  if (!ffmpegPath) throw new Error('FFmpeg binary is unavailable');
  return spawnSync(ffmpegPath, ['-hide_banner', '-nostdin', ...args], { encoding: 'utf8', timeout: 10_000, windowsHide: true });
}
beforeAll(() => {
  fixtures = mkdtempSync(path.join(tmpdir(), 'site-mp4-fixtures-'));
  for (const audio of [false, true]) {
    const output = path.join(fixtures, audio ? 'audio.mp4' : 'silent.mp4');
    const result = ffmpeg(['-y', '-f', 'lavfi', '-i', 'color=c=red:s=16x16:r=10', ...(audio ? ['-f', 'lavfi', '-i', 'sine=frequency=440:sample_rate=44100'] : []), '-t', '1', '-c:v', 'mpeg4', ...(audio ? ['-c:a', 'aac'] : []), '-metadata', 'title=private-video-title', output]);
    if (result.status !== 0) throw new Error(`Fixture generation failed: ${result.stderr}`);
  }
  videoWithAudio = readFileSync(path.join(fixtures, 'audio.mp4'));
  silentVideo = readFileSync(path.join(fixtures, 'silent.mp4'));
});
afterEach(async () => { for (const app of apps.splice(0)) await app.close(); for (const directory of directories.splice(0)) rmSync(directory, { recursive: true, force: true }); });
afterAll(() => rmSync(fixtures, { recursive: true, force: true }));
async function setup() {
  const dataDir = mkdtempSync(path.join(tmpdir(), 'site-mp4-audio-')); directories.push(dataDir);
  const app = await createApp({ databasePath: ':memory:', dataDir, logger: false }); apps.push(app);
  await app.auth.createOwner('owner', 'long-owner-password');
  const token = app.auth.issueToken({ name: 'audio', scopes: ['media:write'], expiresAt: '2099-01-01T00:00:00Z' });
  const headers = { authorization: `Bearer ${token.token}`, 'content-type': 'multipart/form-data; boundary=mp4-audio' };
  return { app, dataDir, upload: (bytes: Buffer, filename: string) => app.inject({ method: 'POST', url: '/api/v1/admin/media/upload?purpose=music', headers, payload: Buffer.concat([Buffer.from(`--mp4-audio\r\nContent-Disposition: form-data; name="file"; filename="${filename}"\r\nContent-Type: video/mp4\r\n\r\n`), bytes, Buffer.from('\r\n--mp4-audio--\r\n')]) }) };
}
describe('MP4 music audio extraction', () => {
  it('extracts playable MP3 with no video or input metadata and deduplicates converted bytes', async () => {
    const { app, dataDir, upload } = await setup();
    const response = await upload(videoWithAudio, 'movie.mp4');
    expect(response.statusCode).toBe(201);
    const asset = response.json();
    expect(asset.filename).toBe('movie.mp3'); expect(asset.contentType).toBe('audio/mpeg');
    const original = app.media.variantPath(asset.id, 'original', true), bytes = readFileSync(original);
    expect(asset.size).toBe(bytes.length); expect(asset.checksum).toBe(createHash('sha256').update(bytes).digest('hex'));
    expect(bytes.includes(Buffer.from('private-video-title'))).toBe(false);
    expect(ffmpeg(['-v', 'error', '-i', original, '-map', '0:a:0', '-f', 'null', '-']).status).toBe(0);
    expect(ffmpeg(['-v', 'error', '-i', original, '-map', '0:v:0', '-f', 'null', '-']).status).not.toBe(0);
    const duplicate = await upload(videoWithAudio, 'duplicate.mp4'); expect(duplicate.statusCode).toBe(201); expect(duplicate.json().id).toBe(asset.id);
    const mp3 = await upload(bytes, 'song.mp3'); expect(mp3.statusCode).toBe(201); expect(mp3.json().id).toBe(asset.id);
    expect(readdirSync(path.join(dataDir, 'uploads'))).toEqual([asset.id]);
    expect(readdirSync(path.join(dataDir, 'uploads', asset.id))).toEqual(['original.mp3']);
    app.content.create('music', { title: 'movie', src: asset.variants.original, visible: true });
    const range = await app.inject({ url: asset.variants.original, headers: { range: 'bytes=0-7' } });
    expect(range.statusCode).toBe(206); expect(range.headers['content-type']).toBe('audio/mpeg'); expect(range.rawPayload).toEqual(bytes.subarray(0, 8));
  });
  it('rejects an MP4 without audio and retains no input video', async () => {
    const { app, dataDir, upload } = await setup();
    const response = await upload(silentVideo, 'silent.mp4');
    expect(response.statusCode).toBe(400); expect(response.json().error.code).toBe('AUDIO_MISSING');
    expect(app.media.list()).toEqual([]); expect(readdirSync(path.join(dataDir, 'uploads'))).toEqual([]);
  });
  it('rejects malformed MP4 even when it has an MP4 signature', async () => {
    const { app, dataDir, upload } = await setup();
    const fake = Buffer.alloc(44); fake.write('ftyp', 4);
    for (const input of [Buffer.from('MZ fake executable'), fake]) {
      const response = await upload(input, 'disguised.mp4'); expect(response.statusCode).toBe(400);
    }
    expect(app.media.list()).toEqual([]); expect(readdirSync(path.join(dataDir, 'uploads'))).toEqual([]);
  });
  it('cleans video and audio after the real converter exceeds its timeout or is cancelled', async () => {
    const { app, dataDir } = await setup();
    const timed = new MediaService(app.db, app.content, dataDir, { convertAudio: createAudioConverter({ timeoutMs: 1 }) });
    await expect(timed.upload(videoWithAudio, 'timed.mp4', 'music')).rejects.toMatchObject({ statusCode: 504, code: 'AUDIO_CONVERSION_TIMEOUT' });
    expect(readdirSync(path.join(dataDir, 'uploads'))).toEqual([]);
    const controller = new AbortController(), converter = createAudioConverter();
    const cancelled = new MediaService(app.db, app.content, dataDir, { convertAudio: (input, output, signal) => {
      const conversion = converter(input, output, signal); controller.abort(); return conversion;
    } });
    await expect(cancelled.uploadAudio(Readable.from([videoWithAudio]), 'cancelled.mp4', { signal: controller.signal })).rejects.toMatchObject({ statusCode: 400, code: 'UPLOAD_INCOMPLETE' });
    expect(app.media.list()).toEqual([]); expect(readdirSync(path.join(dataDir, 'uploads'))).toEqual([]);
  });
  it('limits simultaneous converters and releases capacity after a job completes', async () => {
    const { dataDir } = await setup(), converter = createAudioConverter({ maxConcurrent: 1 });
    const first = converter(path.join(fixtures, 'audio.mp4'), path.join(dataDir, 'first.mp3'));
    await expect(converter(path.join(fixtures, 'audio.mp4'), path.join(dataDir, 'busy.mp3'))).rejects.toMatchObject({ statusCode: 429, code: 'AUDIO_BUSY' });
    await first;
    await converter(path.join(fixtures, 'audio.mp4'), path.join(dataDir, 'second.mp3'));
    expect(readdirSync(dataDir)).toEqual(['first.mp3', 'second.mp3', 'uploads']);
  });
});
