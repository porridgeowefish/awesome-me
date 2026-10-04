import { afterEach, describe, expect, it } from 'vitest';
import { openDatabase, type SiteDatabase } from '../../../server/db/database';
import { AnalyticsService } from '../../../server/analytics/service';
import { createApp } from '../../../server/app';
import type { FastifyInstance } from 'fastify';
const dbs:SiteDatabase[]=[],apps:FastifyInstance[]=[];
afterEach(async()=>{for(const app of apps.splice(0))await app.close();dbs.splice(0).forEach(db=>db.close());});
describe('privacy-preserving analytics',()=>{
  it('deduplicates event ids and keeps only daily visitor hashes, page paths and referrer hosts',()=>{
    const db=openDatabase(':memory:');dbs.push(db);const service=new AnalyticsService(db,()=>Date.parse('2026-10-03T12:00:00Z'));
    const input={eventId:'5f4a1838-c38b-4bc5-a1ab-ab2b0efc3c10',path:'/gallery',referrer:'https://example.com/private?q=secret',device:'mobile' as const};
    expect(service.record(input,'visitor-cookie')).toBe(true);expect(service.record(input,'visitor-cookie')).toBe(false);
    service.record({...input,eventId:'5f4a1838-c38b-4bc5-a1ab-ab2b0efc3c11'},'visitor-cookie');
    const stored=JSON.stringify(db.connection.prepare('SELECT * FROM analytics_events').all());expect(stored).not.toContain('visitor-cookie');expect(stored).not.toContain('private');expect(stored).not.toContain('secret');
    const report=service.summary('2026-10-03','2026-10-03');expect(report).toMatchObject({pageviews:2,visitors:1});expect(report.pages[0]).toMatchObject({path:'/gallery',views:2});expect(report.referrers[0]).toMatchObject({host:'example.com',views:2});
  });
  it('rotates visitor hashes across dates and excludes administrative paths',()=>{
    const db=openDatabase(':memory:');dbs.push(db);let now=Date.parse('2026-10-03T12:00:00Z');const service=new AnalyticsService(db,()=>now);
    const input={eventId:'5f4a1838-c38b-4bc5-a1ab-ab2b0efc3c10',path:'/',device:'desktop' as const};service.record(input,'same');now+=86400000;service.record({...input,eventId:'5f4a1838-c38b-4bc5-a1ab-ab2b0efc3c11'},'same');
    const rows=db.connection.prepare('SELECT visitor_hash FROM analytics_events').all();expect(rows[0].visitor_hash).not.toBe(rows[1].visitor_hash);
    expect(service.record({...input,eventId:'5f4a1838-c38b-4bc5-a1ab-ab2b0efc3c12',path:'/admin?token=secret'},'same')).toBe(false);
    expect(()=>service.summary('2026-01-01','2026-10-03')).toThrow();
  });
  it('respects DNT/GPC, excludes owner sessions and protects the dashboard by scope',async()=>{
    const app=await createApp({databasePath:':memory:',publicOrigin:'http://localhost:5173'});apps.push(app);await app.auth.createOwner('owner','long-owner-password');
    const payload={eventId:'5f4a1838-c38b-4bc5-a1ab-ab2b0efc3c10',path:'/gallery',device:'desktop'};
    const base={method:'POST' as const,url:'/api/v1/public/events',payload};
    for(const headers of [{origin:'http://localhost:5173',dnt:'1'},{origin:'http://localhost:5173','sec-gpc':'1'}])expect((await app.inject({...base,headers})).json().accepted).toBe(false);
    const session=await app.auth.login('owner','long-owner-password');
    expect((await app.inject({...base,headers:{origin:'http://localhost:5173',cookie:`site_session=${session.token}`}})).json().accepted).toBe(false);
    const recorded=await app.inject({...base,headers:{origin:'http://localhost:5173'}});expect(recorded.json().accepted).toBe(true);expect(recorded.headers['set-cookie']).toBeDefined();
    expect((await app.inject('/api/v1/admin/analytics')).statusCode).toBe(401);
    const token=app.auth.issueToken({name:'report',scopes:['analytics:read'],expiresAt:'2099-01-01T00:00:00Z'});
    expect((await app.inject({url:'/api/v1/admin/analytics',headers:{authorization:`Bearer ${token.token}`}})).json().pageviews).toBe(1);
  });
});
