import { spawn } from 'node:child_process';
import ffmpegPath from 'ffmpeg-static';
import { AppError } from '../errors.ts';

export const MAX_AUDIO_BYTES = 100 * 1024 * 1024;
export type AudioConverter = (input: string, output: string, signal?: AbortSignal) => Promise<void>;

export function createAudioConverter(options: { executable?: string | null; timeoutMs?: number; maxConcurrent?: number } = {}): AudioConverter {
  const executable = options.executable === undefined ? process.env.FFMPEG_BIN || ffmpegPath : options.executable;
  const timeoutMs = options.timeoutMs ?? 120_000, maxConcurrent = options.maxConcurrent ?? 2;
  let active = 0;
  return async (input, output, signal) => {
    if (signal?.aborted) throw new AppError(400, 'UPLOAD_INCOMPLETE', '文件上传未完成');
    if (!executable) throw new AppError(503, 'AUDIO_CONVERTER_UNAVAILABLE', '音频转换工具不可用');
    if (active >= maxConcurrent) throw new AppError(429, 'AUDIO_BUSY', '音频转换正忙，请稍后重试');
    active++;
    try {
      await new Promise<void>((resolve, reject) => {
        // Force the local MP4 demuxer; no user-controlled arguments, shell, or network protocols.
        const child = spawn(executable, [
          '-hide_banner', '-loglevel', 'error', '-nostdin', '-n',
          '-protocol_whitelist', 'file,pipe', '-f', 'mov', '-enable_drefs', '0', '-use_absolute_path', '0', '-threads', '2', '-i', input,
          '-map', '0:a:0', '-vn', '-sn', '-dn', '-map_metadata', '-1', '-map_chapters', '-1',
          '-c:a', 'libmp3lame', '-b:a', '192k', '-ar', '44100', '-ac', '2', '-threads', '2',
          '-write_xing', '0', '-id3v2_version', '0', '-fs', String(MAX_AUDIO_BYTES + 1), '-f', 'mp3', output,
        ], { shell: false, windowsHide: true, stdio: ['ignore', 'ignore', 'pipe'] });
        let error: AppError | undefined, diagnostics = '';
        const stop = (reason: AppError) => { error ??= reason; child.kill('SIGKILL'); };
        const abort = () => stop(new AppError(400, 'UPLOAD_INCOMPLETE', '文件上传未完成'));
        const timer = setTimeout(() => stop(new AppError(504, 'AUDIO_CONVERSION_TIMEOUT', '音频转换超时，请上传较短的文件')), timeoutMs);
        timer.unref();
        signal?.addEventListener('abort', abort, { once: true });
        if (signal?.aborted) abort();
        child.stderr.on('data', (chunk: Buffer) => { if (diagnostics.length < 16_384) diagnostics += chunk.toString('utf8').slice(0, 16_384 - diagnostics.length); });
        child.once('error', () => { error ??= new AppError(503, 'AUDIO_CONVERTER_UNAVAILABLE', '音频转换工具不可用'); });
        child.once('close', code => {
          clearTimeout(timer); signal?.removeEventListener('abort', abort);
          if (error) reject(error);
          else if (code === 0) resolve();
          else if (/matches no streams|does not contain any stream/i.test(diagnostics)) reject(new AppError(400, 'AUDIO_MISSING', 'MP4 文件中没有可用的音轨'));
          else reject(new AppError(400, 'INVALID_AUDIO', 'MP4 音轨无法读取或文件已损坏'));
        });
      });
    } finally { active--; }
  };
}

export const convertMp4Audio = createAudioConverter();
