import { afterEach, describe, expect, it, vi } from 'vitest';
import { mkdtempSync, rmSync, existsSync, readFileSync, readdirSync, statSync, writeFileSync, openSync, closeSync, ftruncateSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { request as httpRequest } from 'node:http';
import type { AddressInfo } from 'node:net';
import { Readable } from 'node:stream';
import path from 'node:path';
import { tmpdir } from 'node:os';
import sharp from 'sharp';
import { openDatabase, type SiteDatabase } from '../../../server/db/database';
import { ContentService } from '../../../server/content/service';
import { MediaService } from '../../../server/media/service';
import type { FastifyInstance } from 'fastify';
import { createApp } from '../../../server/app';
import type { AudioConverter } from '../../../server/media/audio-converter';

const dbs: SiteDatabase[] = [], dirs: string[] = [], apps: FastifyInstance[] = [];
afterEach(async () => { for(const app of apps.splice(0))await app.close(); dbs.splice(0).forEach(db=>db.close()); dirs.splice(0).forEach(dir=>rmSync(dir,{recursive:true,force:true})); });
function directory() { const dir=mkdtempSync(path.join(tmpdir(),'personal-site-media-'));dirs.push(dir);return dir; }
function setup(convertAudio?:AudioConverter) { const dataDir=directory(),db=openDatabase(':memory:');dbs.push(db);const content=new ContentService(db);return {dataDir,db,content,media:new MediaService(db,content,dataDir,{convertAudio})}; }
function wave() { const b=Buffer.alloc(48);b.write('RIFF',0);b.writeUInt32LE(40,4);b.write('WAVEfmt ',8);b.writeUInt32LE(16,16);b.writeUInt16LE(1,20);b.writeUInt16LE(1,22);b.writeUInt32LE(8000,24);b.writeUInt32LE(16000,28);b.writeUInt16LE(2,32);b.writeUInt16LE(16,34);b.write('data',36);b.writeUInt32LE(4,40);return b; }
async function uploadApp() {
  const dataDir=directory(), app=await createApp({databasePath:':memory:',dataDir,logger:false});apps.push(app);
  await app.auth.createOwner('owner','long-owner-password');
  const token=app.auth.issueToken({name:'upload',scopes:['media:write'],expiresAt:'2099-01-01T00:00:00Z'});
  return {app,dataDir,headers:{authorization:`Bearer ${token.token}`,'content-type':'multipart/form-data; boundary=media-test'}};
}
function multipart(filename:string, bytes:Buffer, complete=true) {
  return Buffer.concat([Buffer.from(`--media-test\r\nContent-Disposition: form-data; name="file"; filename="${filename}"\r\nContent-Type: application/octet-stream\r\n\r\n`),bytes,Buffer.from(complete?'\r\n--media-test--\r\n':'')]);
}
function storedFiles(dataDir:string) { return readdirSync(path.join(dataDir,'uploads'),{recursive:true}).map(String).filter(name=>statSync(path.join(dataDir,'uploads',name)).isFile()); }
describe('media processing and access',()=>{
  it('processes a Unicode image into stripped large and thumb variants and protects the original',async()=>{
    const {media}=setup();
    const input=await sharp({create:{width:3000,height:1500,channels:3,background:'#2f80ed'}}).jpeg().withExif({IFD0:{Artist:'Private Author'}}).toBuffer();
    const asset=await media.upload(input,'日照金山.JPG','gallery');
    expect(asset.filename).toBe('日照金山.JPG');expect(asset.variants.large).toBe(`/api/v1/media/${asset.id}/large`);
    const large=await sharp(readFileSync(media.variantPath(asset.id,'large',true))).metadata();
    const thumb=await sharp(readFileSync(media.variantPath(asset.id,'thumb',true))).metadata();
    expect(large.format).toBe('webp');expect(large.width).toBe(2400);expect(thumb.width).toBe(640);expect(large.exif).toBeUndefined();
    expect(()=>media.variantPath(asset.id,'original',false)).toThrowError(expect.objectContaining({statusCode:403}));
    expect(existsSync(media.variantPath(asset.id,'original',true))).toBe(true);
  });
  it('rejects disguised files, path filenames and active SVG documents',async()=>{
    const {media}=setup();
    for(const [filename,bytes,purpose] of [
      ['photo.jpg',Buffer.from('<script>x()</script>'),'gallery'],
      ['../../../escape.png',Buffer.from('x'),'gallery'],
      ['song.mp3',Buffer.from('MZ fake executable'),'music'],
      ['logo.svg',Buffer.from('<svg xmlns="http://www.w3.org/2000/svg"><script>alert(1)</script></svg>'),'logo'],
      ['logo.svg',Buffer.from('<svg xmlns="http://www.w3.org/2000/svg"><image href="https://evil.example/a"/></svg>'),'logo'],
    ] as const)await expect(media.upload(bytes,filename,purpose)).rejects.toThrow();
  });
  it('converts a simple safe SVG logo to an inert image',async()=>{
    const {media}=setup();const asset=await media.upload(Buffer.from('<svg xmlns="http://www.w3.org/2000/svg" width="30" height="30"><rect width="30" height="30" fill="blue"/></svg>'),'mark.svg','logo');
    expect((await sharp(readFileSync(media.variantPath(asset.id,'large',true))).metadata()).format).toBe('webp');
    expect(asset.warnings).toEqual([]);
  });
  it('keeps draft-only assets private and retains referenced files',async()=>{
    const {media,content}=setup();const asset=await media.upload(await sharp({create:{width:10,height:10,channels:3,background:'red'}}).png().toBuffer(),'图.png','essay');
    const row=content.create('essays',{publicPath:'A/post',folder:['A'],title:'Post',date:'2026-10-03',body:`![图](${asset.variants.large})`,status:'draft'});
    expect(()=>media.variantPath(asset.id,'large',false)).toThrow();
    expect(()=>media.remove(asset.id)).toThrowError(expect.objectContaining({statusCode:409}));
    const published=content.update('essays',row.id,{...row.data,status:'published'},row.revision);
    expect(existsSync(media.variantPath(asset.id,'large',false))).toBe(true);
    content.update('essays',row.id,{...published.data,status:'draft'},published.revision);
    expect(()=>media.variantPath(asset.id,'large',false)).toThrow();
    content.delete('essays',row.id,3);media.remove(asset.id);expect(media.get(asset.id)).toBeNull();
  });
  it('streams audio ranges only while the track is public',async()=>{
    const dataDir=directory();const app=await createApp({databasePath:':memory:',dataDir,logger:false});apps.push(app);
    const bytes=wave();const asset=await app.media.upload(bytes,'鸟鸣.wav','music');
    const row=app.content.create('music',{title:'鸟鸣',src:asset.variants.original,visible:true});
    const response=await app.inject({url:asset.variants.original,headers:{range:'bytes=4-11'}});
    expect(response.statusCode).toBe(206);expect(response.headers['content-range']).toBe('bytes 4-11/48');expect(response.rawPayload).toEqual(bytes.subarray(4,12));
    expect((await app.inject({url:asset.variants.original,headers:{range:'bytes=100-200'}})).statusCode).toBe(416);
    app.content.update('music',row.id,{...row.data,visible:false},1);expect((await app.inject(asset.variants.original)).statusCode).toBe(404);
    expect(readFileSync(app.media.variantPath(asset.id,'original',true))).toEqual(bytes);
  });
  it('stages multipart audio on disk before the request finishes and exposes only public metadata',async()=>{
    const {app,dataDir,headers}=await uploadApp();
    let release!:()=>void, started!:()=>void;
    const gate=new Promise<void>(resolve=>{release=resolve;}), firstChunk=new Promise<void>(resolve=>{started=resolve;});
    const bytes=Buffer.concat([wave(),Buffer.alloc(64*1024,17)]);
    const payload=Readable.from((async function*(){
      yield multipart('field.wav',bytes,false);started();await gate;yield Buffer.from('\r\n--media-test--\r\n');
    })());
    const responsePromise=app.inject({method:'POST',url:'/api/v1/admin/media/upload?purpose=music',headers,payload});
    await firstChunk;
    let stagingError:unknown;
    try { await vi.waitFor(()=>expect(storedFiles(dataDir).some(name=>name.endsWith('.part'))).toBe(true),{timeout:1000,interval:10}); }
    catch(error){stagingError=error;}
    finally {release();}
    const response=await responsePromise;
    expect(stagingError).toBeUndefined();expect(response.statusCode).toBe(201);
    const asset=response.json();expect(asset.size).toBe(bytes.length);expect(asset).not.toHaveProperty('files');
    expect(readFileSync(app.media.variantPath(asset.id,'original',true))).toEqual(bytes);
    expect(storedFiles(dataDir)).toEqual([path.join(asset.id,'original.wav')]);
  });
  it('deduplicates validated multipart audio and rejects a mismatched extension without leftovers',async()=>{
    const {app,dataDir,headers}=await uploadApp(),bytes=wave();
    const upload=(filename:string)=>app.inject({method:'POST',url:'/api/v1/admin/media/upload?purpose=music',headers,payload:multipart(filename,bytes)});
    const first=await upload('first.wav'),duplicate=await upload('second.wav'),invalid=await upload('disguised.mp3');
    expect(first.statusCode).toBe(201);expect(duplicate.statusCode).toBe(201);
    expect(duplicate.json().id).toBe(first.json().id);expect(invalid.statusCode).toBe(400);
    expect(invalid.json().error.code).toBe('INVALID_AUDIO');expect(app.media.list()).toHaveLength(1);
    expect(storedFiles(dataDir)).toEqual([path.join(first.json().id,'original.wav')]);
  });
  it('rejects incomplete multipart audio and removes staged files',async()=>{
    const {app,dataDir,headers}=await uploadApp();
    const response=await app.inject({method:'POST',url:'/api/v1/admin/media/upload?purpose=music',headers,payload:multipart('unfinished.wav',wave(),false)});
    expect(response.statusCode).toBe(400);expect(app.media.list()).toEqual([]);expect(readdirSync(path.join(dataDir,'uploads'))).toEqual([]);
  });
  it('rejects multipart audio over 100 MB and removes the truncated stage',async()=>{
    const {app,dataDir,headers}=await uploadApp(),chunk=Buffer.alloc(1024*1024);
    const payload=Readable.from((async function*(){
      yield multipart('large.wav',wave(),false);
      for(let i=0;i<101;i++)yield chunk;
      yield Buffer.from('\r\n--media-test--\r\n');
    })());
    const response=await app.inject({method:'POST',url:'/api/v1/admin/media/upload?purpose=music',headers,payload});
    expect(response.statusCode).toBe(413);expect(app.media.list()).toEqual([]);expect(readdirSync(path.join(dataDir,'uploads'))).toEqual([]);
  });
  it('cleans staged audio after stream cancellation and size truncation',async()=>{
    const {media,dataDir}=setup();
    const truncated=Object.assign(Readable.from([wave()]),{truncated:true});
    await expect(media.uploadAudio(truncated,'partial.wav')).rejects.toMatchObject({statusCode:413});
    const controller=new AbortController();
    const aborted=Readable.from((async function*(){yield wave();controller.abort();yield Buffer.alloc(8);})());
    await expect(media.uploadAudio(aborted,'cancelled.wav',{signal:controller.signal})).rejects.toMatchObject({statusCode:400});
    expect(media.list()).toEqual([]);expect(readdirSync(path.join(dataDir,'uploads'))).toEqual([]);
  });
  it('stores only converted MP3 bytes and deduplicates MP4 against those bytes',async()=>{
    const mp4=Buffer.alloc(44);mp4.write('ftyp',4);
    const mp3=Buffer.from([0xff,0xfb,0x90,0x64,0,0,0,0]);
    const {media,dataDir}=setup(async(_input,output)=>{writeFileSync(output,mp3);});
    const asset=await media.upload(mp4,'山间影片.MP4','music');
    expect(asset.filename).toBe('山间影片.mp3');expect(asset.contentType).toBe('audio/mpeg');
    expect(asset.size).toBe(mp3.length);expect(asset.checksum).toBe(createHash('sha256').update(mp3).digest('hex'));
    expect(readFileSync(media.variantPath(asset.id,'original',true))).toEqual(mp3);
    expect(storedFiles(dataDir)).toEqual([path.join(asset.id,'original.mp3')]);
    expect((await media.upload(mp4,'another.mp4','music')).id).toBe(asset.id);
    expect((await media.upload(mp3,'existing.mp3','music')).id).toBe(asset.id);
    expect(readdirSync(path.join(dataDir,'uploads'))).toEqual([asset.id]);
  });
  it('removes MP4 input and partial MP3 output after converter failure or cancellation',async()=>{
    const mp4=Buffer.alloc(44);mp4.write('ftyp',4);
    const failed=setup(async(_input,output)=>{writeFileSync(output,'partial');throw new Error('conversion failed');});
    await expect(failed.media.upload(mp4,'broken.mp4','music')).rejects.toThrow('conversion failed');
    expect(failed.media.list()).toEqual([]);expect(readdirSync(path.join(failed.dataDir,'uploads'))).toEqual([]);
    const controller=new AbortController();
    const cancelled=setup(async(_input,output)=>{writeFileSync(output,Buffer.from([0xff,0xfb,0x90,0x64]));controller.abort();});
    await expect(cancelled.media.uploadAudio(Readable.from([mp4]),'cancelled.mp4',{signal:controller.signal})).rejects.toMatchObject({statusCode:400});
    expect(cancelled.media.list()).toEqual([]);expect(readdirSync(path.join(cancelled.dataDir,'uploads'))).toEqual([]);
  });
  it('reports cancellation while hashing extracted MP3 and removes both staged files',async()=>{
    const mp4=Buffer.alloc(44);mp4.write('ftyp',4);
    const controller=new AbortController(),mp3=Buffer.alloc(256*1024);mp3[0]=0xff;mp3[1]=0xfb;
    const {media,dataDir}=setup(async(_input,output)=>{writeFileSync(output,mp3);setImmediate(()=>controller.abort());});
    await expect(media.uploadAudio(Readable.from([mp4]),'cancelled.mp4',{signal:controller.signal})).rejects.toMatchObject({statusCode:400,code:'UPLOAD_INCOMPLETE'});
    expect(media.list()).toEqual([]);expect(readdirSync(path.join(dataDir,'uploads'))).toEqual([]);
  });
  it('rejects extracted audio over 100 MB and cleans the original video',async()=>{
    const mp4=Buffer.alloc(44);mp4.write('ftyp',4);
    const {media,dataDir}=setup(async(_input,output)=>{
      const descriptor=openSync(output,'wx');try{ftruncateSync(descriptor,100*1024*1024+1);}finally{closeSync(descriptor);}
    });
    await expect(media.upload(mp4,'large.mp4','music')).rejects.toMatchObject({statusCode:413,code:'FILE_TOO_LARGE'});
    expect(media.list()).toEqual([]);expect(readdirSync(path.join(dataDir,'uploads'))).toEqual([]);
  });
  it('cancels conversion when the HTTP client disconnects after the complete body and saves no asset',async()=>{
    const {app,dataDir,headers}=await uploadApp();
    const mp4=Buffer.alloc(44);mp4.write('ftyp',4);
    let started!:()=>void, release!:()=>void, conversionSignal:AbortSignal|undefined;
    const ready=new Promise<void>(resolve=>{started=resolve;});
    app.media=new MediaService(app.db,app.content,dataDir,{convertAudio:async(_input,output,signal)=>{
      writeFileSync(output,Buffer.from([0xff,0xfb,0x90,0x64]));conversionSignal=signal;
      await new Promise<void>(resolve=>{
        release=resolve;signal?.addEventListener('abort',()=>resolve(),{once:true});started();
      });
    }});
    await app.listen({host:'127.0.0.1',port:0});
    const {port}=app.server.address() as AddressInfo,body=multipart('movie.mp4',mp4);
    const client=httpRequest({hostname:'127.0.0.1',port,path:'/api/v1/admin/media/upload?purpose=music',method:'POST',headers:{...headers,'content-length':body.length}},response=>response.resume());
    client.on('error',()=>{});client.end(body);
    try {
      await ready;expect(conversionSignal?.aborted).toBe(false);
      client.destroy();
      await vi.waitFor(()=>{
        expect(conversionSignal?.aborted).toBe(true);
        expect(app.media.list()).toEqual([]);expect(readdirSync(path.join(dataDir,'uploads'))).toEqual([]);
      },{timeout:1000,interval:10});
    } finally {client.destroy();release?.();}
  });
  it('keeps a completed HTTP upload when its normal response closes',async()=>{
    const {app,dataDir,headers}=await uploadApp();
    const mp4=Buffer.alloc(44);mp4.write('ftyp',4);
    let conversionSignal:AbortSignal|undefined;
    app.media=new MediaService(app.db,app.content,dataDir,{convertAudio:async(_input,output,signal)=>{
      conversionSignal=signal;writeFileSync(output,Buffer.from([0xff,0xfb,0x90,0x64]));
    }});
    await app.listen({host:'127.0.0.1',port:0});
    const {port}=app.server.address() as AddressInfo,body=multipart('movie.mp4',mp4);
    const status=await new Promise<number|undefined>((resolve,reject)=>{
      const client=httpRequest({hostname:'127.0.0.1',port,path:'/api/v1/admin/media/upload?purpose=music',method:'POST',headers:{...headers,'content-length':body.length,connection:'close'}},response=>{
        response.resume();response.once('end',()=>resolve(response.statusCode));response.once('error',reject);
      });client.once('error',reject);client.end(body);
    });
    await new Promise<void>(resolve=>setImmediate(resolve));
    expect(status).toBe(201);expect(conversionSignal?.aborted).toBe(false);expect(app.media.list()).toHaveLength(1);
    expect(readFileSync(app.media.variantPath(app.media.list()[0].id,'original',true))).toEqual(Buffer.from([0xff,0xfb,0x90,0x64]));
    expect(storedFiles(dataDir)).toHaveLength(1);
  });
});
