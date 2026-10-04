import { createHmac, randomBytes } from 'node:crypto';
import { z } from 'zod';
import type { SiteDatabase } from '../db/database.ts';
import { AppError } from '../errors.ts';

export const eventSchema=z.strictObject({eventId:z.uuid(),path:z.string().max(600),referrer:z.string().max(2048).optional(),device:z.enum(['mobile','tablet','desktop'])});
type VisitEvent=z.infer<typeof eventSchema>;
export const analyticsDay=(now=Date.now())=>new Date(now+8*3600_000).toISOString().slice(0,10);
export class AnalyticsService {
  private readonly salt:string;
  constructor(private readonly db:SiteDatabase,private readonly now:()=>number=Date.now){
    db.connection.prepare("INSERT INTO app_meta(key,value) VALUES('analytics_salt',?) ON CONFLICT(key) DO NOTHING").run(randomBytes(32).toString('hex'));
    this.salt=String(db.connection.prepare("SELECT value FROM app_meta WHERE key='analytics_salt'").get()!.value);
  }
  record(value:VisitEvent,visitor:string):boolean {
    const event=eventSchema.parse(value),path=event.path.split(/[?#]/)[0];
    if(!/^\/(?:$|gallery\/?$|footprints\/?$|essays(?:\/[^\\\u0000-\u001f]*)?$)/.test(path))return false;
    let host='直接访问';
    if(event.referrer){try{const url=new URL(event.referrer);if(['https:','http:'].includes(url.protocol)&&!url.username&&!url.password)host=url.hostname;}catch{/* Invalid referrers contribute no private data. */}}
    const now=this.now(),day=analyticsDay(now),hash=createHmac('sha256',this.salt).update(`${day}:${visitor}`).digest('hex');
    const result=this.db.connection.prepare('INSERT OR IGNORE INTO analytics_events(event_id,day,path,visitor_hash,referrer_host,device,created_at) VALUES(?,?,?,?,?,?,?)').run(event.eventId,day,path,hash,host,event.device,now);
    this.db.connection.prepare('DELETE FROM analytics_events WHERE created_at < ?').run(now-90*86400_000);
    return !!result.changes;
  }
  summary(from=analyticsDay(this.now()-29*86400_000),to=analyticsDay(this.now())) {
    z.iso.date().parse(from);z.iso.date().parse(to);
    const span=(Date.parse(to)-Date.parse(from))/86400_000;
    if(span<0||span>=90)throw new AppError(400,'INVALID_DATE_RANGE','统计范围最多 90 天，开始日期不能晚于结束日期');
    const clause='WHERE day >= ? AND day <= ?';
    const totals=this.db.connection.prepare(`SELECT COUNT(*) AS pageviews,COUNT(DISTINCT visitor_hash) AS visitors FROM analytics_events ${clause}`).get(from,to)!;
    const dayRows=this.db.connection.prepare(`SELECT day,COUNT(*) AS views,COUNT(DISTINCT visitor_hash) AS visitors FROM analytics_events ${clause} GROUP BY day ORDER BY day`).all(from,to);
    const days=Array.from({length:span+1},(_,i)=>{const day=new Date(Date.parse(from)+i*86400_000).toISOString().slice(0,10);const row=dayRows.find(row=>row.day===day);return{day,views:Number(row?.views??0),visitors:Number(row?.visitors??0)};});
    const pages=this.db.connection.prepare(`SELECT path,COUNT(*) AS views FROM analytics_events ${clause} GROUP BY path ORDER BY views DESC LIMIT 30`).all(from,to).map(row=>({path:String(row.path),views:Number(row.views)}));
    const referrers=this.db.connection.prepare(`SELECT referrer_host AS host,COUNT(*) AS views FROM analytics_events ${clause} GROUP BY host ORDER BY views DESC LIMIT 20`).all(from,to).map(row=>({host:String(row.host),views:Number(row.views)}));
    const devices=this.db.connection.prepare(`SELECT device,COUNT(*) AS views FROM analytics_events ${clause} GROUP BY device ORDER BY views DESC`).all(from,to).map(row=>({device:String(row.device),views:Number(row.views)}));
    return {from,to,timezone:'Asia/Taipei',pageviews:Number(totals.pageviews),visitors:Number(totals.visitors),days,pages,referrers,devices};
  }
}
