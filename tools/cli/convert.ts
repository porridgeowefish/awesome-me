import fs from 'node:fs';
import path from 'node:path';
import { createHash } from 'node:crypto';
import matter from 'gray-matter';
import TurndownService from 'turndown';
import { gfm } from 'turndown-plugin-gfm';
import mammoth from 'mammoth';
import JSZip from 'jszip';
import { unified } from 'unified';
import remarkParse from 'remark-parse';
import remarkMath from 'remark-math';
import sharp from 'sharp';
import { essaySchema, type ResourceData } from '../../src/contracts/content.ts';
import { convertObsidian, stripObsidianComments, summarize, safeFileName } from '../scripts/lib/obsidian.mjs';
import { validateSvg } from '../../server/media/formats.ts';
import { CliError } from './client.ts';

export interface PreparedAsset {filename:string;bytes:Buffer;targetUrl:string;checksum:string}
export interface PreparedArticle {data:ResourceData<'essays'>;assets:PreparedAsset[];warnings:string[];reviewRequired:boolean}
export interface ConvertOptions {publicPath?:string;assetRoot?:string;title?:string;date?:string;status?:'draft'|'published'}
interface AstNode {type:string;depth?:number;url?:string;value?:string;identifier?:string;label?:string;alt?:string;title?:string;position?:{start:{offset?:number};end:{offset?:number}};children?:AstNode[]}
function protectedSyntax(source:string):{start:number;end:number}[] {
  const tree=unified().use(remarkParse).use(remarkMath).parse(source) as AstNode,ranges:{start:number;end:number}[]=[];
  const walk=(node:AstNode)=>{const start=node.position?.start.offset,end=node.position?.end.offset;if(['code','inlineCode','math','inlineMath'].includes(node.type)&&start!==undefined&&end!==undefined)ranges.push({start,end});else node.children?.forEach(walk);};walk(tree);return ranges;
}
function extractProseTitle(source:string):{title:string|null;body:string} {
  const tree=unified().use(remarkParse).use(remarkMath).parse(source) as AstNode;
  const heading=tree.children?.find(node=>node.type==='heading'&&node.depth===1&&(node.position?.start.offset??Infinity)<=200);
  const start=heading?.position?.start.offset,end=heading?.position?.end.offset;
  if(!heading||start===undefined||end===undefined)return {title:null,body:source};
  const plain=(node:AstNode):string=>node.value??node.alt??node.children?.map(plain).join('')??'';
  return {title:plain(heading).trim(),body:(source.slice(0,start)+source.slice(end)).replace(/^\n+/,'')};
}
export async function convertArticle(filename:string,options:ConvertOptions={}):Promise<PreparedArticle> {
  const file=fs.realpathSync(filename),root=fs.realpathSync(options.assetRoot??path.dirname(file));
  if(!file.startsWith(root+path.sep))throw new CliError('文章需要位于准备好的素材目录内');
  if(fs.statSync(file).size>40*1024*1024)throw new CliError('源文档超过 40 MB');
  const extension=path.extname(file).toLowerCase(),assets:PreparedAsset[]=[],warnings:string[]=[];
  let source='',metadata:Record<string,unknown>={},reviewRequired=false;
  const embedded=new Map<string,{bytes:Buffer;filename:string}>();
  if(['.md','.markdown'].includes(extension)){const parsed=matter(fs.readFileSync(file,'utf8'));source=parsed.content;metadata=parsed.data;}
  else if(['.html','.htm'].includes(extension))source=htmlToMarkdown(fs.readFileSync(file,'utf8'));
  else if(extension==='.docx'){
    const buffer=fs.readFileSync(file),zip=await JSZip.loadAsync(buffer);
    const expanded=Object.values(zip.files).reduce((sum,entry)=>sum+Number((entry as unknown as {_data?:{uncompressedSize?:number}})._data?.uncompressedSize??0),0);
    if(expanded>80*1024*1024)throw new CliError('DOCX 解压后的内容过大');
    const xml=await zip.file('word/document.xml')?.async('string');
    if(!xml)throw new CliError('DOCX 缺少正文');
    if(/<(?:\w+:)?oMath\b/.test(xml)){reviewRequired=true;warnings.push('Word 原生公式需要转写为 LaTeX；请检查转换结果，补齐公式后再发布 Markdown。');}
    let imageIndex=0;
    const converted=await mammoth.convertToHtml({buffer},{externalFileAccess:false,convertImage:mammoth.images.imgElement(async image=>{
      const mime=image.contentType;const ext:Record<string,string>={'image/png':'.png','image/jpeg':'.jpg','image/gif':'.gif','image/svg+xml':'.svg','image/webp':'.webp'};
      if(!ext[mime])throw new CliError(`DOCX 图片格式暂不支持：${mime}`);
      const id=`embedded-image-${++imageIndex}${ext[mime]}`;embedded.set(id,{bytes:await image.readAsBuffer(),filename:id});return{src:id};
    })});warnings.push(...converted.messages.map(m=>m.message));source=htmlToMarkdown(converted.value);
  }else throw new CliError('支持 Markdown、Obsidian、HTML 和 DOCX；其他格式请先转为 Markdown');

  const addAsset=async(url:string):Promise<string>=>{
    if(/^(https?:\/\/|\/api\/|\/images\/)/i.test(url))return url;
    if(url.startsWith('data:')){
      const match=/^data:image\/(png|jpeg|webp|gif);base64,([a-zA-Z0-9+/=]+)$/.exec(url);
      if(!match)throw new CliError('内嵌图片仅支持 PNG/JPEG/WebP/GIF base64');
      const id=`embedded-data-${createHash('sha256').update(url).digest('hex').slice(0,16)}.${match[1]==='jpeg'?'jpg':match[1]}`;
      embedded.set(id,{bytes:Buffer.from(match[2],'base64'),filename:id});url=id;
    }
    let bytes:Buffer,name:string;
    const inline=embedded.get(url);
    if(inline){bytes=inline.bytes;name=inline.filename;}
    else{
      let decoded:string;try{decoded=decodeURIComponent(url);}catch{throw new CliError(`图片地址无法解码：${url}`);}
      if(/[?#]/.test(url)||/[\u0000-\u001f]/.test(decoded)||path.isAbsolute(decoded)||/^[a-z]+:/i.test(decoded))throw new CliError('图片必须来自准备好的素材目录');
      const candidate=path.resolve(path.dirname(file),decoded);
      if(!candidate.startsWith(root+path.sep))throw new CliError('图片路径超出了准备好的素材目录');
      if(!fs.existsSync(candidate))throw new CliError(`找不到图片：${decoded}；请保留相对目录，或调整 --assets-root`);
      const real=fs.realpathSync(candidate);if(!real.startsWith(root+path.sep)||!fs.statSync(real).isFile())throw new CliError('图片路径超出了准备好的素材目录');
      if(fs.statSync(real).size>40*1024*1024)throw new CliError('图片超过 40 MB');
      bytes=fs.readFileSync(real);name=path.basename(real);
    }
    if(path.extname(name).toLowerCase()==='.svg'){validateSvg(bytes);bytes=await sharp(bytes,{limitInputPixels:60_000_000}).png().toBuffer();name=path.basename(name,'.svg')+'.png';warnings.push(`SVG ${name} 已转换为静态 PNG。`);}
    const checksum=createHash('sha256').update(bytes).digest('hex'),existing=assets.find(a=>a.checksum===checksum);
    if(existing)return existing.targetUrl;
    const targetUrl=`./assets/${encodeURIComponent(`${checksum.slice(0,12)}-${safeFileName(name)}`)}`;
    assets.push({filename:name,bytes,targetUrl,checksum});return targetUrl;
  };
  // Wiki syntax rewrites only prose; fenced examples and LaTeX remain byte-for-byte intact.
  source=source.replace(/\r\n/g,'\n');
  source=stripObsidianComments(source,protectedSyntax(source));
  source=convertObsidian(source,{preserveImagePaths:true,protectedRanges:protectedSyntax(source)}).markdown;
  const tree=unified().use(remarkParse).use(remarkMath).parse(source) as AstNode;
  const nodes:AstNode[]=[];const references=new Set<string>();
  const walk=(node:AstNode)=>{if(node.type==='imageReference'&&node.identifier)references.add(node.identifier);nodes.push(node);node.children?.forEach(walk);};walk(tree);
  const changes:{start:number;end:number;text:string}[]=[];
  for(const node of nodes){const start=node.position?.start.offset,end=node.position?.end.offset;if(start===undefined||end===undefined)continue;
    if(node.type==='image'&&node.url){const target=await addAsset(node.url);changes.push({start,end,text:`![${(node.alt??'').replace(/[\[\]]/g,'')}](${target}${node.title?` ${JSON.stringify(node.title)}`:''})`});}
    if(node.type==='definition'&&node.url&&references.has(node.identifier??'')){const target=await addAsset(node.url);changes.push({start,end,text:`[${node.label??node.identifier}]: ${target}${node.title?` ${JSON.stringify(node.title)}`:''}`});}
    if(node.type==='html'&&node.value){let html=node.value;for(const match of [...html.matchAll(/<img\b[^>]*\bsrc\s*=\s*(["'])(.*?)\1/gi)]){const target=await addAsset(match[2].replace(/&amp;/g,'&'));html=html.replace(match[0],match[0].replace(match[2],target));}if(html!==node.value)changes.push({start,end,text:html});}
  }
  for(const change of changes.sort((a,b)=>b.start-a.start))source=source.slice(0,change.start)+change.text+source.slice(change.end);
  const extracted=extractProseTitle(source),publicPath=options.publicPath??(typeof metadata.publicPath==='string'?metadata.publicPath:safeFileName(path.basename(file,extension)));
  let cover=typeof metadata.cover==='string'?metadata.cover:undefined;if(cover)cover=await addAsset(cover);
  const data=essaySchema.parse({publicPath,folder:publicPath.split('/').slice(0,-1),title:options.title??metadata.title??extracted.title??path.basename(file,extension),date:options.date??(metadata.date instanceof Date?metadata.date.toISOString().slice(0,10):metadata.date)??new Date().toISOString().slice(0,10),subtitle:metadata.subtitle??'',summary:metadata.summary??summarize(extracted.body),tags:Array.isArray(metadata.tags)?metadata.tags:[],cover,featured:metadata.featured===true,body:extracted.body,status:options.status??(metadata.status==='published'?'published':'draft')});
  return {data,assets,warnings,reviewRequired};
}
function htmlToMarkdown(html:string):string {
  const service=new TurndownService({headingStyle:'atx',codeBlockStyle:'fenced',bulletListMarker:'-'});service.use(gfm);service.remove(['script','style','iframe','object','embed']);
  service.addRule('math',{filter:node=>node.nodeType===1&&/\bmath\b/.test(node.getAttribute('class')??''),replacement:(_content,node)=>node.textContent??''});
  return service.turndown(html);
}
