import { afterEach, describe, expect, it } from 'vitest';
import type { FastifyInstance } from 'fastify';
import { createApp } from '../../../server/app';
import { RESOURCE_KINDS, SINGLETON_KINDS, type ResourceKind } from '../../../src/contracts/content';
import { emptyResource } from '../../../src/contracts/editor';
import { siteDefaults } from '../../../src/data/siteDefaults';
const apps:FastifyInstance[]=[];
afterEach(async()=>{for(const app of apps.splice(0))await app.close();});
const examples:Record<ResourceKind,unknown>={
  site:siteDefaults,profile:{...emptyResource('profile'),name:'验证站主',avatar:'/images/me/avatar.webp'},
  gallery:{...emptyResource('gallery'),title:'验证图片',src:'/images/me/avatar.webp',thumb:'/images/me/avatar.webp'},
  music:{...emptyResource('music'),title:'验证音乐',src:'content/music/sample.mp3'},
  essays:{...emptyResource('essays'),title:'验证文章',publicPath:'test-article',body:'$$x^2$$'},
  footprints:{...emptyResource('footprints'),name:'验证足迹'},wishes:{...emptyResource('wishes'),name:'验证愿望'},
  brands:{...emptyResource('brands'),label:'验证 Logo',file:'/images/me/avatar.webp'},folders:{path:'test-folder',title:'验证分类',order:0},
};
describe('complete managed resource API coverage',()=>{
  it.each(RESOURCE_KINDS)('%s uses the shared CRUD and scope boundary',async kind=>{
    const app=await createApp({databasePath:':memory:',logger:false});apps.push(app);
    await app.auth.createOwner('owner','long-owner-password');
    const write=app.auth.issueToken({name:'writer',scopes:[`${kind}:write`],expiresAt:'2099-01-01T00:00:00Z'});
    const read=app.auth.issueToken({name:'reader',scopes:[`${kind}:read`],expiresAt:'2099-01-01T00:00:00Z'});
    const headers={authorization:`Bearer ${write.token}`},readHeaders={authorization:`Bearer ${read.token}`};
    const url=`/api/v1/admin/${kind}`;
    expect((await app.inject({url})).statusCode).toBe(401);
    expect((await app.inject({method:'POST',url,headers:readHeaders,payload:{data:examples[kind]}})).statusCode).toBe(403);
    const created=await app.inject({method:'POST',url,headers,payload:{data:examples[kind]}});expect(created.statusCode).toBe(201);
    const row=created.json(),itemUrl=`${url}/${row.id}`;
    expect((await app.inject({url:itemUrl,headers:readHeaders})).json().data).toEqual(row.data);
    const field=kind==='site'?'footer':['profile','footprints','wishes'].includes(kind)?'name':kind==='brands'?'label':'title';
    const next={...row.data,[field]:'更新验证'};
    const updated=await app.inject({method:'PUT',url:itemUrl,headers,payload:{data:next,revision:row.revision}});expect(updated.statusCode).toBe(200);
    expect((await app.inject({url:itemUrl,headers})).json().data[field]).toBe('更新验证');
    expect((await app.inject({method:'PUT',url:itemUrl,headers,payload:{data:row.data,revision:row.revision}})).statusCode).toBe(409);
    const removed=await app.inject({method:'DELETE',url:itemUrl,headers,payload:{revision:updated.json().revision}});
    expect(removed.statusCode).toBe(SINGLETON_KINDS.has(kind)?400:200);
    if(!SINGLETON_KINDS.has(kind))expect((await app.inject({url:itemUrl,headers})).statusCode).toBe(404);
  });
});
