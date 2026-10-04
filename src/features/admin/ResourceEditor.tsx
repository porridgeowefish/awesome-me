import { lazy, Suspense, useEffect, useState } from 'react';
import { flushSync } from 'react-dom';
import { useBlocker } from 'react-router-dom';
import { resourceSchemas, type ContentRecord, type ResourceKind } from '../../contracts/content';
import { FIELD_LABELS, emptyResource } from '../../contracts/editor';
import { Fields } from './Fields';
import { api, ApiError } from './api';
import { MapControls, MediaControls, PhotoFootprintControls } from './MediaAndMaps';
import { refreshSiteContent } from '@/shared/content/runtime';
import { Loading } from '@/shared/ui/states';
import { siteDefaults } from '@/data/siteDefaults';
import { AdminReferences } from './References';
import { refreshAfterSave } from './saveRefresh';
const Preview=lazy(()=>import('@/shared/markdown/MarkdownRenderer').then(module=>({default:module.MarkdownRenderer})));

interface Props {kind:ResourceKind;record:ContentRecord|null;focusPath?:string;onSaved:(record:ContentRecord,warning?:string)=>void;onDirty:(dirty:boolean)=>void;onBusyChange?:(busy:boolean)=>void}
export function ResourceEditor({kind,record,focusPath,onSaved,onDirty,onBusyChange}:Props) {
  const initial={...(kind==='site'?siteDefaults:emptyResource(kind)),...record?.data} as Record<string,unknown>;
  if(kind==='site'){initial.copy={...siteDefaults.copy,...initial.copy as Record<string,string>};initial.icons={...siteDefaults.icons,...initial.icons as Record<string,string>};}
  const [data,setData]=useState(initial),[baseline,setBaseline]=useState(JSON.stringify(initial));
  const [message,setMessage]=useState(''),[errors,setErrors]=useState<{path:string;message:string}[]>([]),[busy,setBusy]=useState(false),[preview,setPreview]=useState(false);
  const [visitDate,setVisitDate]=useState(new Date().toISOString().slice(0,10)),[visitNote,setVisitNote]=useState('');
  const [mediaBusy,setMediaBusy]=useState(false);
  const dirty=JSON.stringify(data)!==baseline;
  const guarded=dirty||mediaBusy||busy;
  useEffect(()=>{onBusyChange?.(mediaBusy||busy);return()=>onBusyChange?.(false);},[mediaBusy,busy,onBusyChange]);
  const blocker=useBlocker(guarded);
  useEffect(()=>{if(focusPath)requestAnimationFrame(()=>document.querySelector<HTMLElement>(`[data-field-path="${CSS.escape(focusPath)}"]`)?.scrollIntoView({behavior:'smooth',block:'start'}));},[focusPath]);
  useEffect(()=>{onDirty(guarded);const leave=(event:BeforeUnloadEvent)=>{if(guarded){event.preventDefault();event.returnValue='';}};window.addEventListener('beforeunload',leave);return()=>{window.removeEventListener('beforeunload',leave);onDirty(false);};},[guarded,onDirty]);
  async function save() {
    const input={...data};
    if(kind==='essays')input.folder=String(input.publicPath).split('/').slice(0,-1);
    const parsed=resourceSchemas[kind].safeParse(input);
    if(!parsed.success){setErrors(parsed.error.issues.map(issue=>({path:issue.path.join('.'),message:issue.message})));setMessage('请检查标出的字段。');return;}
    setBusy(true);setMessage('');setErrors([]);
    try {
      const saved=await api<ContentRecord>(`/api/v1/admin/${kind}${record?`/${encodeURIComponent(record.id)}`:''}`,{method:record?'PUT':'POST',body:{data:parsed.data,...(record?{revision:record.revision}:{})}});
      setData(saved.data as Record<string,unknown>);setBaseline(JSON.stringify(saved.data));setMessage('已保存，公开内容已同步。');const warning=await refreshAfterSave(refreshSiteContent);flushSync(()=>setBusy(false));onSaved(saved,warning);
    }catch(e){setMessage((e as Error).message);if(e instanceof ApiError)setErrors(e.fields??[]);}finally{setBusy(false);}
  }
  async function visit() {
    if(!record)return;setBusy(true);
    try{const result=await api<ContentRecord>(`/api/v1/admin/wishes/${encodeURIComponent(record.id)}/visit`,{method:'POST',body:{revision:record.revision,date:visitDate,note:visitNote,lnglat:data.lnglat}});setMessage('已移入已去足迹。');setBaseline(JSON.stringify(data));const warning=await refreshAfterSave(refreshSiteContent);flushSync(()=>setBusy(false));onSaved(result,warning);}catch(e){setMessage((e as Error).message);}finally{setBusy(false);}
  }
  return <AdminReferences><div className="admin-editor"><div className="admin-editor-bar"><span className="muted">{record?`版本 ${record.revision} · ${record.updatedAt.slice(0,10)}`:'新内容'} {dirty?'· 有未保存修改':''}</span><div className="admin-actions">{kind==='essays'&&<button className="btn" disabled={busy||mediaBusy} onClick={()=>setPreview(v=>!v)}>{preview?'回到编辑':'预览文章'}</button>}<button className="btn btn-primary" disabled={busy||mediaBusy} onClick={()=>void save()}>{busy?'保存中…':'保存修改'}</button></div></div>{message&&<p className="admin-notice" role="status">{message}</p>}{errors.length>0&&<ul className="admin-errors" role="alert">{errors.map((error,i)=><li key={i}>{error.path.split('.').map(p=>FIELD_LABELS[p]??p).join(' / ')}：{error.message}</li>)}</ul>}
    {blocker.state==='blocked'&&<div className="admin-dialog" role="alertdialog" aria-label="未保存修改"><div><h3>{busy||mediaBusy?'正在处理，请稍候':'还有未保存的修改'}</h3><p>{busy||mediaBusy?'等待保存或上传完成后再离开。':'离开会丢失这次编辑。'}</p><button className="btn" onClick={()=>blocker.reset()}>继续编辑</button>{!busy&&!mediaBusy&&<button className="btn" onClick={()=>blocker.proceed()}>放弃修改并离开</button>}</div></div>}
    {preview?<article className="admin-article-preview card"><h1>{String(data.title)}</h1><Suspense fallback={<Loading/>}><Preview source={String(data.body??'')} basePath={`content/essays/${data.publicPath||'preview'}/index.md`} needsMath/></Suspense></article>:<fieldset className="admin-editor-fields" disabled={busy||mediaBusy}><MediaControls kind={kind} data={data} onChange={setData} onBusyChange={setMediaBusy}/>{kind==='gallery'&&<PhotoFootprintControls data={data} onChange={setData}/>}<MapControls kind={kind} data={data} onChange={setData}/><Fields kind={kind} value={data} path="" onChange={value=>setData(value as Record<string,unknown>)} focusPath={focusPath}/></fieldset>}
    {kind==='wishes'&&record&&<section className="admin-visit"><h3>这次真的去了</h3><p>填写出发日期和记录，即可将这条愿望移到已去足迹。</p><label>出行日期<input disabled={busy||mediaBusy} type="date" value={visitDate} onChange={e=>setVisitDate(e.target.value)}/></label><label>出行记录<textarea disabled={busy||mediaBusy} value={visitNote} onChange={e=>setVisitNote(e.target.value)}/></label><button className="btn" disabled={busy||mediaBusy||dirty||!data.lnglat} onClick={()=>void visit()}>移入已去足迹</button>{dirty&&<p className="muted">请先保存当前修改。</p>}</section>}
  </div></AdminReferences>;
}
