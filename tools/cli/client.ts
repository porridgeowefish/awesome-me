import type { ContentRecord, ResourceKind } from '../../src/contracts/content.ts';
export class CliError extends Error {constructor(message:string,public readonly code='CLI_ERROR',public readonly status?:number){super(message);}}
export interface UploadedAsset {id:string;filename:string;checksum:string;purpose:string;variants:Record<string,string>;warnings:string[];capturedAt?:string;suggestedLocation?:{lnglat:[number,number];address:string;source:'exif'}}
export class SiteClient {
  readonly origin:string;
  constructor(origin:string,private readonly token:string){
    const url=new URL(origin);
    if(!['https:','http:'].includes(url.protocol)||url.username||url.password||url.pathname!=='/'||url.search||url.hash)throw new CliError('网站地址必须是没有路径和凭据的 HTTP(S) 源地址');
    if(url.protocol==='http:'&&!['localhost','127.0.0.1','[::1]'].includes(url.hostname))throw new CliError('远程 Token 请求需要 HTTPS；本地可使用 localhost');
    if(!token.trim())throw new CliError('请通过 SITE_TOKEN 或 --token-file 提供 Token');
    this.origin=url.origin;
  }
  async request<T>(route:string,method='GET',body?:unknown):Promise<T>{
    if(!route.startsWith('/api/v1/'))throw new CliError('不支持的 API 路径');
    const form=body instanceof FormData;
    let response:Response;
    try{response=await fetch(this.origin+route,{method,headers:{Authorization:`Bearer ${this.token}`,...(body!==undefined&&!form?{'Content-Type':'application/json'}:{})},body:body===undefined?undefined:form?body as FormData:JSON.stringify(body),redirect:'error',signal:AbortSignal.timeout(form?300_000:60_000)});}catch{throw new CliError('无法连接网站，或请求超时。可检查健康状态后重试。','CONNECTION_FAILED');}
    const data=await response.json().catch(()=>null) as {error?:{message?:string;code?:string}}|null;
    if(!response.ok)throw new CliError(data?.error?.message??`网站返回 HTTP ${response.status}`,data?.error?.code??'API_ERROR',response.status);
    return data as T;
  }
  async list(kind:ResourceKind):Promise<ContentRecord[]>{const result:ContentRecord[]=[];for(let offset=0;offset<10000;offset+=1000){const page=await this.request<{items:ContentRecord[];total:number}>(`/api/v1/admin/${kind}?limit=1000&offset=${offset}`);result.push(...page.items);if(result.length>=page.total)break;}return result;}
  async upload(bytes:Buffer,filename:string,purpose:string):Promise<UploadedAsset>{const body=new FormData();body.append('file',new Blob([new Uint8Array(bytes)]),filename);return this.request(`/api/v1/admin/media/upload?purpose=${encodeURIComponent(purpose)}`,'POST',body);}
}
