import { useEffect, useRef, useState } from 'react';
import { publicUrl } from '@/shared/lib/url';
import { api, type UploadResult } from './api';

interface Asset extends UploadResult {purpose:string;size:number;contentType:string}
interface Props {purpose:string;onSelect:(asset:UploadResult)=>void;onClose:()=>void}
export function AssetPicker({purpose,onSelect,onClose}:Props) {
  const [items,setItems]=useState<Asset[]>([]),[query,setQuery]=useState(''),[filter,setFilter]=useState(purpose),[view,setView]=useState<'grid'|'list'>('grid');
  const [loading,setLoading]=useState(true),[message,setMessage]=useState('');
  const dialog=useRef<HTMLDivElement>(null);
  useEffect(()=>{let alive=true;void api<{items:Asset[]}>('/api/v1/admin/media').then(result=>{if(alive)setItems(result.items);}).catch(e=>alive&&setMessage((e as Error).message)).finally(()=>alive&&setLoading(false));const previous=document.activeElement as HTMLElement|null;dialog.current?.focus();return()=>{alive=false;previous?.focus();};},[]);
  const compatible=items.filter(asset=>purpose==='music'?asset.purpose==='music':purpose==='resume'?asset.purpose==='resume':!!asset.variants.thumb);
  const shown=compatible.filter(asset=>(filter==='all'||asset.purpose===filter)&&asset.filename.toLowerCase().includes(query.toLowerCase()));
  function keyboard(event:React.KeyboardEvent) {
    if(event.key==='Escape'){event.preventDefault();event.stopPropagation();onClose();}
    if(event.key==='Tab'){
      const controls=dialog.current?.querySelectorAll<HTMLElement>('button:not(:disabled),input,select,a[href]');
      if(!controls?.length)return;
      const first=controls[0],last=controls[controls.length-1];
      if(event.shiftKey&&(document.activeElement===first||document.activeElement===dialog.current)){event.preventDefault();last.focus();}
      else if(!event.shiftKey&&document.activeElement===last){event.preventDefault();first.focus();}
    }
  }
  return <div className="admin-drawer-backdrop admin-asset-picker"><div ref={dialog} tabIndex={-1} className="admin-asset-picker-panel" role="dialog" aria-modal="true" aria-label="选择已有素材" onKeyDown={keyboard}>
    <header className="admin-panel-header"><div><span className="eyebrow">ASSET PICKER</span><h2>选择已有素材</h2></div><button type="button" className="btn" onClick={onClose}>关闭</button></header>
    <div className="admin-management-toolbar"><label>Search<input autoFocus type="search" value={query} onChange={e=>setQuery(e.target.value)} placeholder="搜索文件名"/></label><label>Purpose<select value={filter} onChange={e=>setFilter(e.target.value)}><option value="all">All compatible assets</option>{[...new Set([purpose,...compatible.map(asset=>asset.purpose)])].map(value=><option key={value} value={value}>{value}</option>)}</select></label><div className="admin-view-switch" aria-label="素材显示方式"><button type="button" aria-pressed={view==='grid'} onClick={()=>setView('grid')}>小视图</button><button type="button" aria-pressed={view==='list'} onClick={()=>setView('list')}>列表</button></div></div>
    {message&&<p role="alert" className="admin-errors">{message}</p>}{loading?<p role="status">正在加载素材…</p>:<><div className={view==='grid'?'admin-picker-grid':'admin-picker-list'}>{shown.slice(0,200).map(asset=><button key={asset.id} type="button" className="admin-picker-item" onClick={()=>onSelect(asset)}>{asset.variants.thumb?<img loading="lazy" src={publicUrl(asset.variants.thumb)} alt=""/>:<span className="admin-picker-file">{asset.purpose==='music'?'♫':'PDF'}</span>}<span><strong>{asset.filename}</strong><small>{asset.purpose} · {(asset.size/1024/1024).toFixed(2)} MB</small></span></button>)}</div>{!shown.length&&<p className="admin-empty-state">没有匹配素材；可以切换 Purpose 为 All，或先上传文件。</p>}{shown.length>200&&<p className="muted">显示前 200 项，请通过搜索缩小范围。</p>}</>}
  </div></div>;
}
