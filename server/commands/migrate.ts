import { existsSync } from 'node:fs';
import { loadConfig } from '../config.ts';
import { openDatabase, type SiteDatabase } from '../db/database.ts';
import { ContentService } from '../content/service.ts';
import { importLegacyContent } from '../migration/import.ts';
import { acquireRuntimeLock } from '../runtime-lock.ts';
if (existsSync('.env.server')) process.loadEnvFile('.env.server');
const config = loadConfig();
const lock = acquireRuntimeLock(config.dataDir,'migration');
let db:SiteDatabase|undefined;
try {
  db = openDatabase(config.databasePath);
  console.log(JSON.stringify(await importLegacyContent({ db, content: new ContentService(db), sourceRoot: process.cwd(), dataDir: config.dataDir }), null, 2));
} catch (error) {
  console.error(error instanceof Error ? error.message : 'Migration failed'); process.exitCode = 1;
} finally { db?.close(); lock.release(); }
