import { afterEach, describe, expect, it } from 'vitest';
import { mkdtempSync, mkdirSync, writeFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import sharp from 'sharp';
import JSZip from 'jszip';
import type { FastifyInstance } from 'fastify';
import { convertArticle } from '../cli/convert';
import { SiteClient } from '../cli/client';
import { publishArticle } from '../cli/publish';
import { createApp } from '../../server/app';
const dirs:string[]=[],apps:FastifyInstance[]=[];
afterEach(async()=>{for(const app of apps.splice(0))await app.close();dirs.splice(0).forEach(dir=>rmSync(dir,{recursive:true,force:true}));});
function directory(){const dir=mkdtempSync(path.join(tmpdir(),'site-cli-'));dirs.push(dir);return dir;}
async function note(){const dir=directory();mkdirSync(path.join(dir,'照片'));writeFileSync(path.join(dir,'照片','雪山.png'),await sharp({create:{width:10,height:10,channels:3,background:'blue'}}).png().toBuffer());const file=path.join(dir,'文章.md');writeFileSync(file,'---\ntitle: 山\ndate: 2026-10-03\ntags: [户外]\n---\n\n# 山\n\n%% PRIVATE-PLANNING $x$ `code` %%\n\n> [!note] 提醒\n> [[旅行|出发]] ==晴天==\n\n$$\\frac{x_1}{2}$$\n\n![[照片/雪山.png|300]]\n\n```md\n![[不要上传.png]]\n%% 示例注释 %%\n```','utf8');return {dir,file};}
describe('AI-native CLI preparation and publication',()=>{
  it('preserves LaTeX and code while packaging Unicode Obsidian images',async()=>{
    const {file}=await note();const result=await convertArticle(file,{publicPath:'户外/雪山'});
    expect(result.data.body).toContain('$$\\frac{x_1}{2}$$');expect(result.data.body).toContain('![[不要上传.png]]');expect(result.data.title).toBe('山');expect(result.assets).toHaveLength(1);expect(result.assets[0].filename).toContain('雪山');expect(result.data.body).toContain(result.assets[0].targetUrl);
  });
  it('refuses asset traversal outside the prepared root',async()=>{
    const dir=directory(),child=path.join(dir,'notes');mkdirSync(child);writeFileSync(path.join(dir,'private.png'),'private');const file=path.join(child,'a.md');writeFileSync(file,'![x](../private.png)');await expect(convertArticle(file,{publicPath:'a'})).rejects.toThrow(/目录/);
  });
  it('extracts prose titles without changing code examples',async()=>{
    const dir=directory(),file=path.join(dir,'example.md');
    writeFileSync(file,'```md\n# Example heading\n%% code comment %%\n```\n\n# Public title\n\nPublic prose');
    const result=await convertArticle(file);
    expect(result.data.title).toBe('Public title');
    expect(result.data.body).toContain('```md\n# Example heading\n%% code comment %%\n```');
    expect(result.data.body).not.toContain('# Public title');
  });
  it('preserves inline code, indented code, fenced spacing and LaTeX during Obsidian conversion',async()=>{
    const dir=directory(),file=path.join(dir,'syntax.md');
    const code='````md\n[[Literal|Example]]\n\n\n# Example\n````';
    const math='$$\n[[x]] + \\text{%% literal %%}\n$$';
    writeFileSync(file,'# Public\n\nLiteral: `[[Note|Alias]]`\n\n'+code+'\n\n'+math+'\n\n$[[y]]$\n\n    [[Indented|Code]]\n\n%% PRIVATE $x$ `code` %%\n\nVisible\n\n%% UNFINISHED private');
    const result=await convertArticle(file);
    expect(result.data.body).toContain('`[[Note|Alias]]`');expect(result.data.body).toContain(code);expect(result.data.body).toContain(math);expect(result.data.body).toContain('$[[y]]$');expect(result.data.body).toContain('    [[Indented|Code]]');expect(result.data.body).not.toContain('PRIVATE');expect(result.data.body).not.toContain('UNFINISHED');expect(result.data.body).toContain('Visible');
  });
  it('converts HTML tables and images without retaining executable content',async()=>{
    const {dir}=await note();const file=path.join(dir,'文章.html');writeFileSync(file,'<h1>山</h1><script>steal()</script><table><thead><tr><th>A</th></tr></thead><tbody><tr><td>1</td></tr></tbody></table><img src="照片/雪山.png"><span class="math">$x_1$</span>');
    const result=await convertArticle(file,{publicPath:'山'});expect(result.data.body).not.toContain('steal');expect(result.data.body).toContain('| A |');expect(result.data.body).toContain('$x_1$');expect(result.assets).toHaveLength(1);
  });
  it('converts a real DOCX and flags unsupported native Word equations',async()=>{
    const dir=directory(),file=path.join(dir,'a.docx');const zip=new JSZip();
    zip.file('[Content_Types].xml','<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"><Default Extension="xml" ContentType="application/xml"/><Override PartName="/word/document.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.document.main+xml"/></Types>');
    zip.file('_rels/.rels','<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="word/document.xml"/></Relationships>');
    zip.file('word/document.xml','<w:document xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main" xmlns:m="http://schemas.openxmlformats.org/officeDocument/2006/math"><w:body><w:p><w:r><w:t>Hello</w:t></w:r></w:p><m:oMath><m:r><m:t>x</m:t></m:r></m:oMath></w:body></w:document>');
    writeFileSync(file,await zip.generateAsync({type:'nodebuffer'}));const result=await convertArticle(file,{publicPath:'hello'});expect(result.data.body).toContain('Hello');expect(result.reviewRequired).toBe(true);expect(result.warnings.join(' ')).toMatch(/公式/);
  });
  it('publishes local assets and formulas through the actual scoped API, with safe retries and dry-run',async()=>{
    const {file}=await note(),dataDir=directory();const app=await createApp({databasePath:':memory:',dataDir});apps.push(app);await app.auth.createOwner('owner','long-owner-password');
    const token=app.auth.issueToken({name:'cli',scopes:['essays:write','media:write'],expiresAt:'2099-01-01T00:00:00Z'});
    const address=await app.listen({host:'127.0.0.1',port:0});const client=new SiteClient(address,token.token);
    const options={publicPath:'户外/雪山',status:'published' as const};
    const dry=await publishArticle(client,file,{...options,dryRun:true});expect(dry.dryRun).toBe(true);expect(app.content.list('essays')).toHaveLength(0);expect(app.media.list()).toHaveLength(0);
    const first=await publishArticle(client,file,options);expect(first.record?.data.body).toContain('/api/v1/media/');expect(app.content.publicSnapshot().essays.essays).toHaveLength(1);
    const publicBody=app.content.essayBody(options.publicPath);
    expect(publicBody).not.toContain('PRIVATE-PLANNING');expect(publicBody).toContain('%% 示例注释 %%');
    expect(publicBody).toContain('> **提醒**');expect(publicBody).toContain('<mark>晴天</mark>');expect(publicBody).not.toContain('[[旅行');
    const again=await publishArticle(client,file,options);expect(again.record?.id).toBe(first.record?.id);expect(again.reused).toBe(true);expect(app.media.list()).toHaveLength(1);
    writeFileSync(file,'# 修改\n\n新的正文');await expect(publishArticle(client,file,options)).rejects.toThrow(/版本/);
    const changed=await publishArticle(client,file,{...options,revision:first.record!.revision});expect(changed.record?.revision).toBe(2);
  });
  it('refuses plaintext token transport outside localhost',()=>{expect(()=>new SiteClient('http://public.example','secret')).toThrow();expect(()=>new SiteClient('https://user:password@example.com','secret')).toThrow();});
});
