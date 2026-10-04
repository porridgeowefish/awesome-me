import path from 'node:path';
import { z } from 'zod';

export interface ServerConfig {
  databasePath: string;
  dataDir: string;
  publicOrigin: string;
  secureCookies: boolean;
  host: string;
  port: number;
  logger: boolean;
  amapWebKey: string;
  amapServiceKey: string;
  amapSecurityCode: string;
}

export function loadConfig(env: NodeJS.ProcessEnv = process.env): ServerConfig {
  const production = env.NODE_ENV === 'production';
  const origin = z.url().parse(env.SITE_ORIGIN ?? (production ? 'http://localhost:3001' : 'http://localhost:5173'));
  const url = new URL(origin);
  if (url.pathname !== '/' || url.search || url.hash || url.username || url.password || !['http:', 'https:'].includes(url.protocol)) {
    throw new Error('SITE_ORIGIN 必须是完整的 HTTP(S) 源地址，不包含路径、查询或凭据');
  }
  const dataDir = path.resolve(env.SITE_DATA_DIR ?? 'server/.local/data');
  return {
    databasePath: path.join(dataDir, 'site.sqlite'), dataDir,
    publicOrigin: url.origin, secureCookies: url.protocol === 'https:',
    host: env.HOST ?? '127.0.0.1', port: z.coerce.number().int().min(1).max(65535).parse(env.PORT ?? '3001'),
    logger: production, amapWebKey: env.AMAP_WEB_KEY ?? '', amapServiceKey: env.AMAP_SERVICE_KEY ?? '', amapSecurityCode: env.AMAP_SECURITY_CODE ?? '',
  };
}
