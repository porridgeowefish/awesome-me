import type { ContentRecord } from '../../src/contracts/content.ts';
import { essaySchema } from '../../src/contracts/content.ts';
import { convertArticle, type ConvertOptions } from './convert.ts';
import { SiteClient, CliError } from './client.ts';

export async function publishArticle(client:SiteClient,filename:string,options:ConvertOptions&{dryRun?:boolean;revision?:number}={}) {
  const prepared=await convertArticle(filename,options);
  const report={dryRun:!!options.dryRun,path:prepared.data.publicPath,title:prepared.data.title,status:prepared.data.status,assets:prepared.assets.map(asset=>({filename:asset.filename,size:asset.bytes.length,checksum:asset.checksum})),warnings:prepared.warnings,reviewRequired:prepared.reviewRequired};
  if(options.dryRun)return {...report,record:null,reused:false};
  if(prepared.reviewRequired)throw new CliError('源文档含未转换的 Word 公式。请先 convert、补齐 LaTeX，再发布转换后的 Markdown。','REVIEW_REQUIRED');
  const existing=(await client.list('essays')).find(row=>(row.data as {publicPath:string}).publicPath===prepared.data.publicPath) as ContentRecord<'essays'>|undefined;
  const data={...prepared.data};
  for(const asset of prepared.assets){const result=await client.upload(asset.bytes,asset.filename,'essay');data.body=data.body.replaceAll(asset.targetUrl,result.variants.large);if(data.cover===asset.targetUrl)data.cover=result.variants.large;}
  const parsed=essaySchema.parse(data);
  if(existing&&JSON.stringify(essaySchema.parse(existing.data))===JSON.stringify(parsed))return {...report,record:existing,reused:true};
  if(existing&&options.revision===undefined)throw new CliError(`文章路径已存在，当前版本为 ${existing.revision}。检查内容后使用 --revision 明确更新版本。`,'REVISION_REQUIRED',409);
  const record=await client.request<ContentRecord<'essays'>>(`/api/v1/admin/essays${existing?`/${encodeURIComponent(existing.id)}`:''}`,existing?'PUT':'POST',{data:parsed,...(existing?{revision:options.revision}:{})});
  return {...report,record,reused:false};
}
