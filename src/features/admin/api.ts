import type { UploadResult } from '../../contracts/media';
export type { UploadResult } from '../../contracts/media';

export class ApiError extends Error { constructor(message: string, public readonly status: number, public readonly fields?: {path:string;message:string}[]) { super(message); } }
let csrf = '';
export function setCsrf(value: string) { csrf = value; }
export async function api<T>(url: string, options: { method?: string; body?: unknown; signal?: AbortSignal } = {}): Promise<T> {
  const multipart = options.body instanceof FormData;
  const response = await fetch(url, { method:options.method??'GET', signal:options.signal, credentials:'same-origin', cache:'no-store', headers:{ ...(!multipart && options.body !== undefined ? {'Content-Type':'application/json'} : {}), ...(csrf ? {'X-CSRF-Token':csrf} : {}) }, body:options.body === undefined ? undefined : multipart ? options.body as FormData : JSON.stringify(options.body) });
  const json = await response.json().catch(() => ({}));
  if(!response.ok) { if(response.status===401)window.dispatchEvent(new Event('site:session-expired')); throw new ApiError(json.error?.message??`请求失败（${response.status}）`,response.status,json.error?.fields); }
  return json as T;
}
export async function uploadFile(file: File, purpose: string): Promise<UploadResult> {
  const body=new FormData();body.append('file',file);
  return api(`/api/v1/admin/media/upload?purpose=${encodeURIComponent(purpose)}`,{method:'POST',body});
}
