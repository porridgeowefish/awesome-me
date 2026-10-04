import fs from 'node:fs';
import path from 'node:path';
import { parseArgs } from 'node:util';
import { z } from 'zod';
import { resourceSchemas, RESOURCE_KINDS, type ResourceKind } from '../../src/contracts/content.ts';
import { toFrontmatter } from '../scripts/lib/obsidian.mjs';
import { SiteClient, CliError } from './client.ts';
import { convertArticle, type ConvertOptions } from './convert.ts';
import { publishArticle } from './publish.ts';

const HELP=`Personal site CLI — JSON output, scoped token API
Usage: npm run site -- <command> [resource] [id] [options]
  schema <resource>                    Shared field/schema reference (offline)
  list|get <resource> [id]             Read owner content
  create <resource> --data file.json   Create validated content
  update <resource> <id> --data file.json --revision N
  delete <resource> <id> --revision N  Delete with a checked revision
  reorder <resource> --data order.json Set order with {ids, revisions} from the latest list
  visit wishes <id> --data visit.json --revision N
  upload --file PATH --purpose gallery|music|essay|logo|avatar|cover|resume
  media                               List uploaded assets
  media-delete <asset-id>              Delete an unreferenced asset
  convert --file PATH --out DIRECTORY [--path category/slug] [--assets-root ROOT]
  publish --file PATH --path category/slug [--status draft|published] [--revision N] [--dry-run]
  map-search --query NAME [--city CITY]
  map-gps|map-reverse --lng N --lat N
  analytics [--from YYYY-MM-DD --to YYYY-MM-DD]
  health                              Read server health
Connection: SITE_URL=https://your-site, SITE_TOKEN=<scoped-token>
or --site URL --token-file private-token.txt. Remote connections require HTTPS.
JSON data must be UTF-8. Use files for Chinese payloads, especially from git-bash.`;
const options = {site:{type:'string'},'token-file':{type:'string'},file:{type:'string'},data:{type:'string'},purpose:{type:'string'},out:{type:'string'},path:{type:'string'},'assets-root':{type:'string'},title:{type:'string'},date:{type:'string'},status:{type:'string'},revision:{type:'string'},'dry-run':{type:'boolean'},query:{type:'string'},city:{type:'string'},lng:{type:'string'},lat:{type:'string'},from:{type:'string'},to:{type:'string'},help:{type:'boolean'}} as const;
export async function runCli(args=process.argv.slice(2),env=process.env):Promise<unknown> {
  const {values,positionals}=parseArgs({args,options,allowPositionals:true});
  const [command,resource,id]=positionals;
  if(!command||values.help||command==='help')return {help:HELP};
  const requireValue=(value:string|undefined,label:string)=>{if(!value)throw new CliError(`缺少 ${label}`);return value;};
  const kind=()=>{if(!RESOURCE_KINDS.includes(resource as ResourceKind))throw new CliError('内容类型无效');return resource as ResourceKind;};
  const revision=()=>z.coerce.number().int().positive().parse(requireValue(values.revision,'--revision'));
  const json=()=>JSON.parse(fs.readFileSync(requireValue(values.data,'--data'),'utf8').replace(/^\uFEFF/,'')) as unknown;
  const convertOptions:ConvertOptions={publicPath:values.path,assetRoot:values['assets-root'],title:values.title,date:values.date,status:values.status?z.enum(['draft','published']).parse(values.status):undefined};
  if(command==='schema')return {kind:kind(),schema:z.toJSONSchema(resourceSchemas[kind()],{unrepresentable:'any'}),notes:['文章 folder 必须等于 publicPath 的父目录分段','修改与删除需要记录的最新 revision','图片地址可使用 upload 返回的 variants.large/thumb；音频使用 variants.original']};
  if(command==='convert'){
    const prepared=await convertArticle(requireValue(values.file,'--file'),convertOptions),output=path.resolve(requireValue(values.out,'--out'));
    if(fs.existsSync(path.join(output,'index.md')))throw new CliError('输出目录已含 index.md，请选择新目录');
    fs.mkdirSync(output,{recursive:true});
    for(const asset of prepared.assets){const relative=decodeURIComponent(asset.targetUrl.replace(/^\.\//,'')),target=path.resolve(output,relative);if(!target.startsWith(output+path.sep))throw new CliError('输出路径无效');fs.mkdirSync(path.dirname(target),{recursive:true});fs.writeFileSync(target,asset.bytes,{flag:'wx'});}
    const {body,...meta}=prepared.data;
    fs.writeFileSync(path.join(output,'index.md'),toFrontmatter(meta)+body,{flag:'wx',encoding:'utf8'});
    fs.writeFileSync(path.join(output,'conversion-report.json'),JSON.stringify({warnings:prepared.warnings,reviewRequired:prepared.reviewRequired,assets:prepared.assets.map(a=>({filename:a.filename,targetUrl:a.targetUrl,checksum:a.checksum}))},null,2),{encoding:'utf8',flag:'wx'});
    return {output,index:path.join(output,'index.md'),warnings:prepared.warnings,reviewRequired:prepared.reviewRequired};
  }
  if(command==='publish'&&values['dry-run']){const prepared=await convertArticle(requireValue(values.file,'--file'),convertOptions);return {dryRun:true,data:prepared.data,assets:prepared.assets.map(a=>({filename:a.filename,size:a.bytes.length,checksum:a.checksum})),warnings:prepared.warnings,reviewRequired:prepared.reviewRequired};}
  const origin=values.site??env.SITE_URL??'http://localhost:3001';
  if(command==='health'){const url=new URL('/api/v1/health',origin);if(!['http:','https:'].includes(url.protocol)||url.username||url.password)throw new CliError('网站地址无效');const response=await fetch(url,{redirect:'error',signal:AbortSignal.timeout(15_000)});if(!response.ok)throw new CliError(`HTTP ${response.status}`);return response.json();}
  const token=values['token-file']?fs.readFileSync(values['token-file'],'utf8').trim():env.SITE_TOKEN??'';
  const client=new SiteClient(origin,token);
  if(command==='publish')return publishArticle(client,requireValue(values.file,'--file'),{...convertOptions,revision:values.revision?revision():undefined});
  if(command==='list')return {items:await client.list(kind())};
  if(command==='get')return client.request(`/api/v1/admin/${kind()}/${encodeURIComponent(requireValue(id,'id'))}`);
  if(command==='create'||command==='update'){const data=resourceSchemas[kind()].parse(json());return client.request(`/api/v1/admin/${kind()}${command==='update'?'/'+encodeURIComponent(requireValue(id,'id')):''}`,command==='create'?'POST':'PUT',{data,...(command==='update'?{revision:revision()}:{...(id?{id}:{})})});}
  if(command==='delete')return client.request(`/api/v1/admin/${kind()}/${encodeURIComponent(requireValue(id,'id'))}`,'DELETE',{revision:revision()});
  if(command==='reorder')return client.request(`/api/v1/admin/${kind()}/reorder`,'POST',z.strictObject({ids:z.array(z.string()).max(10000),revisions:z.record(z.string(),z.number().int().positive())}).parse(json()));
  if(command==='visit'){if(resource!=='wishes')throw new CliError('visit 仅用于未来足迹');return client.request(`/api/v1/admin/wishes/${encodeURIComponent(requireValue(id,'id'))}/visit`,'POST',{...z.strictObject({date:z.string(),note:z.string(),lnglat:z.tuple([z.number(),z.number()]).optional()}).parse(json()),revision:revision()});}
  if(command==='upload'){const file=requireValue(values.file,'--file');return client.upload(fs.readFileSync(file),path.basename(file),requireValue(values.purpose,'--purpose'));}
  if(command==='media')return client.request('/api/v1/admin/media');
  if(command==='media-delete')return client.request(`/api/v1/admin/media/${encodeURIComponent(requireValue(resource,'asset-id'))}`,'DELETE');
  if(command==='map-search')return client.request(`/api/v1/admin/maps/search?${new URLSearchParams({q:requireValue(values.query,'--query'),...(values.city?{city:values.city}:{})})}`);
  if(command==='map-gps'||command==='map-reverse')return client.request(`/api/v1/admin/maps/${command==='map-gps'?'gps':'reverse'}?${new URLSearchParams({lng:requireValue(values.lng,'--lng'),lat:requireValue(values.lat,'--lat')})}`);
  if(command==='analytics')return client.request(`/api/v1/admin/analytics?${new URLSearchParams({...values.from?{from:values.from}:{},...values.to?{to:values.to}:{}})}`);
  throw new CliError('未知命令；运行 help 查看可用命令');
}
