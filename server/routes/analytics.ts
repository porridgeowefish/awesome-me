import { randomBytes } from 'node:crypto';
import { z } from 'zod';
import type { FastifyInstance } from 'fastify';
import { checkOrigin, requireAccess } from '../auth/http.ts';
import { eventSchema } from '../analytics/service.ts';
export function analyticsRoutes(app:FastifyInstance) {
  app.post('/api/v1/public/events',{config:{rateLimit:{max:120,timeWindow:'1 minute'}}},async(request,reply)=>{
    checkOrigin(request,app.siteConfig.publicOrigin);
    if(request.headers.dnt==='1'||request.headers['sec-gpc']==='1'||app.auth.verifySession(request.cookies.site_session??''))return {accepted:false};
    const event=eventSchema.parse(request.body);
    if(/bot|crawler|spider|headless/i.test(request.headers['user-agent']??''))return {accepted:false};
    let visitor=request.cookies.site_visit;
    if(!visitor||!/^v_[A-Za-z0-9_-]{24,64}$/.test(visitor)){visitor=`v_${randomBytes(24).toString('base64url')}`;reply.setCookie('site_visit',visitor,{path:'/',httpOnly:true,sameSite:'strict',secure:app.siteConfig.secureCookies,maxAge:86400});}
    return {accepted:app.analytics.record(event,visitor)};
  });
  app.get('/api/v1/admin/analytics',{preHandler:requireAccess(app,'analytics:read')},async request=>{
    const query=z.strictObject({from:z.iso.date().optional(),to:z.iso.date().optional()}).parse(request.query);
    return app.analytics.summary(query.from,query.to);
  });
}
