import { useCallback,useEffect,useRef,useState } from 'react';
import { useBlocker,useSearchParams } from 'react-router-dom';
import type { ContentRecord } from '../../contracts/content';
import { FRIENDLY_FIELD_LABELS } from '../../contracts/editor';
import { getPreviewField,parseEditRegion,setPreviewField } from '../../contracts/edit-preview';
import { api,ApiError } from './api';
import { AdminReferences } from './References';
import { Fields } from './Fields';
import { MediaControls } from './MediaAndMaps';
import { refreshAfterSave } from './saveRefresh';
import { refreshSiteContent } from '@/shared/content/runtime';
import { changedVisualKinds,initialVisualDrafts,persistVisualChanges,visualSelectionLabel,VisualValidationError,VISUAL_SHORTCUTS,type VisualDrafts,type VisualKind,type VisualRecords,type VisualSelection } from './visual-editor-model';

const PREVIEW_PAGES=[{path:'/',label:'我'},{path:'/gallery',label:'图库'},{path:'/footprints',label:'足迹'},{path:'/essays',label:'文章'}];
export function VisualPageEditor({legacyKind}:{legacyKind?:VisualKind}) {
  const [records,setRecords]=useState<VisualRecords>({site:null,profile:null});
  const [drafts,setDrafts]=useState<VisualDrafts|null>(null),[baseline,setBaseline]=useState<VisualDrafts|null>(null);
  const [loading,setLoading]=useState(true),[loadError,setLoadError]=useState(''),[attempt,setAttempt]=useState(0);
  const [selection,setSelection]=useState<VisualSelection|null>(null),[page,setPage]=useState('/'),[device,setDevice]=useState('desktop');
  const [saving,setSaving]=useState(false),[mediaBusy,setMediaBusy]=useState(false),[inlineEditing,setInlineEditing]=useState(false);
  const [message,setMessage]=useState(''),[errors,setErrors]=useState<string[]>([]),[discard,setDiscard]=useState(false),[advanced,setAdvanced]=useState(false);
  const [params]=useSearchParams();
  const frame=useRef<HTMLIFrameElement>(null),state=useRef({drafts,saving,mediaBusy});state.current={drafts,saving,mediaBusy};
  const busy=saving||mediaBusy;
  const changed=drafts&&baseline?changedVisualKinds(drafts,baseline):[],dirty=changed.length>0;
  const guarded=dirty||busy||inlineEditing,blocker=useBlocker(guarded);
  useEffect(()=>{
    let alive=true;setLoading(true);setLoadError('');
    void Promise.all((['site','profile'] as const).map(kind=>api<{items:ContentRecord[]}>(`/api/v1/admin/${kind}?limit=1`))).then(([site,profile])=>{
      if(!alive)return;const next={site:site.items[0]??null,profile:profile.items[0]??null};const initial=initialVisualDrafts(next);
      setRecords(next);setDrafts(initial);setBaseline(structuredClone(initial));
    }).catch(error=>{if(alive)setLoadError((error as Error).message);}).finally(()=>{if(alive)setLoading(false);});
    return()=>{alive=false;};
  },[attempt]);
  useEffect(()=>{const path=params.get('field');if(legacyKind&&path)setSelection({kind:legacyKind,path});},[legacyKind,params]);
  const sendDraft=useCallback(()=>{const current=state.current.drafts;if(current)frame.current?.contentWindow?.postMessage({type:'site:preview-draft',...current},window.location.origin);},[]);
  useEffect(()=>{sendDraft();},[drafts,sendDraft]);
  useEffect(()=>{
    const listen=(event:MessageEvent)=>{
      if(event.origin!==window.location.origin||event.source!==frame.current?.contentWindow)return;
      if(event.data?.type==='site:preview-ready'){setInlineEditing(false);sendDraft();return;}
      if(event.data?.type==='site:preview-editing'){if(typeof event.data.active==='boolean')setInlineEditing(event.data.active);return;}
      if(state.current.saving||state.current.mediaBusy)return;
      if(event.data?.type==='site:edit-region'){
        const target=parseEditRegion(event.data.region);if(target)setSelection(target);return;
      }
      if(event.data?.type==='site:edit-value'){
        const target=parseEditRegion(`${event.data.kind}:${event.data.path}`);
        if(!target||typeof event.data.value!=='string'||event.data.value.length>20000)return;
        setDrafts(previous=>{
          if(!previous||typeof getPreviewField(previous[target.kind],target.path)!=='string')return previous;
          try{return {...previous,[target.kind]:setPreviewField(previous[target.kind],target.path,event.data.value)};}catch{return previous;}
        });setMessage('');setErrors([]);
      }
    };
    window.addEventListener('message',listen);return()=>window.removeEventListener('message',listen);
  },[sendDraft]);
  useEffect(()=>{const leave=(event:BeforeUnloadEvent)=>{if(guarded){event.preventDefault();event.returnValue='';}};window.addEventListener('beforeunload',leave);return()=>window.removeEventListener('beforeunload',leave);},[guarded]);
  function select(target:VisualSelection){setSelection(target);setErrors([]);frame.current?.contentWindow?.postMessage({type:'site:preview-select',region:`${target.kind}:${target.path}`},window.location.origin);}
  function changeData(kind:VisualKind,value:Record<string,unknown>|((previous:Record<string,unknown>)=>Record<string,unknown>)){
    setDrafts(previous=>previous?{...previous,[kind]:typeof value==='function'?value(previous[kind]):value}:previous);setMessage('');setErrors([]);
  }
  async function save(){
    if(!drafts||!baseline||busy||inlineEditing)return;
    setSaving(true);setMessage('');setErrors([]);let savedCount=0;
    try{
      await persistVisualChanges({drafts,baseline,records},(kind,data,record)=>api<ContentRecord>(`/api/v1/admin/${kind}${record?`/${encodeURIComponent(record.id)}`:''}`,{method:record?'PUT':'POST',body:{data,...(record?{revision:record.revision}:{})}}),(kind,row)=>{
        savedCount++;setRecords(previous=>({...previous,[kind]:row}));
        setDrafts(previous=>previous?{...previous,[kind]:row.data as Record<string,unknown>}:previous);
        setBaseline(previous=>previous?{...previous,[kind]:structuredClone(row.data) as Record<string,unknown>}:previous);
      });
      const warning=await refreshAfterSave(refreshSiteContent);setMessage(warning??'已保存到网站。现在访客也能看到这些修改。');
    }catch(error){
      if(error instanceof VisualValidationError){setSelection({kind:error.kind,path:''});setErrors(error.fields.map(field=>`${field.path.split('.').map(key=>FRIENDLY_FIELD_LABELS[key]??key).join(' / ')}：${field.message}`));}
      else if(error instanceof ApiError)setErrors((error.fields??[]).map(field=>`${field.path}：${field.message}`));
      setMessage(`${savedCount?'部分修改已保存；未成功的部分仍保留在编辑器中。\n':''}${(error as Error).message}`);
      if(savedCount)void refreshSiteContent().catch(()=>{});
    }finally{setSaving(false);}
  }
  function reset(){if(!baseline)return;setDrafts(structuredClone(baseline));setDiscard(false);setMessage('已恢复到上次保存的内容。');setErrors([]);}
  let selectedValue:unknown;
  try{selectedValue=drafts&&selection?getPreviewField(drafts[selection.kind],selection.path):undefined;}catch{selectedValue=undefined;}
  const targetLabel=selection?visualSelectionLabel(selection):'';
  const rootKey=selection?.path.split('.')[0];
  const mediaFields=selection?.kind==='site'?(rootKey==='logo'?['logo']:[]):rootKey==='avatar'?['avatar']:rootKey==='resume'?['resume']:selection&&!selection.path?['avatar','resume']:[];
  return <AdminReferences><section className="admin-visual-editor">
    <header className="admin-heading"><div><span className="eyebrow">EDIT YOUR PAGE</span><h1>我 · 可视化编辑</h1><p>像浏览网站一样编辑个人资料和界面，无需寻找字段。</p></div><div className="admin-actions"><span className={`admin-visual-save-state${dirty?' is-dirty':''}`} role="status">{busy?'正在处理…':inlineEditing?'正在编辑网页文字':dirty?'有未保存的修改':'与已保存版本一致'}</span><button className="btn" disabled={!dirty||busy||inlineEditing} onClick={()=>setDiscard(true)}>撤销未保存修改</button><button className="btn btn-primary" disabled={loading||!dirty||busy||inlineEditing} onClick={()=>void save()}>{saving?'保存中…':'保存到网站'}</button></div></header>
    {message&&<p className="admin-notice" role="status">{message}</p>}{errors.length>0&&<ul className="admin-errors" role="alert">{errors.map((error,index)=><li key={index}>{error}</li>)}</ul>}
    {loading?<p role="status">正在加载网页和个人资料…</p>:loadError?<div className="admin-errors" role="alert">{loadError}<button className="btn" onClick={()=>setAttempt(value=>value+1)}>重新加载</button></div>:drafts&&<>
      <div className="admin-visual-guide"><strong>① 点击想改的地方</strong><span>② 双击文字直接输入，或在右侧编辑</span><span>③ 点击「保存到网站」发布修改</span></div>
      <div className="admin-visual-workspace">
        <section className="admin-visual-canvas" aria-label="真实网页预览"><div className="admin-visual-canvas-toolbar"><label>预览页面<select value={page} disabled={busy||inlineEditing} onChange={event=>{setPage(event.target.value);setSelection(null);}}>{PREVIEW_PAGES.map(item=><option key={item.path} value={item.path}>{item.label}</option>)}</select></label><div className="admin-view-switch" aria-label="预览尺寸"><button type="button" disabled={busy||inlineEditing} aria-pressed={device==='desktop'} onClick={()=>setDevice('desktop')}>电脑</button><button type="button" disabled={busy||inlineEditing} aria-pressed={device==='mobile'} onClick={()=>setDevice('mobile')}>手机</button></div><span className="muted">未保存的预览，仅你可见</span></div><div className={`admin-visual-frame-stage${device==='mobile'?' is-mobile':''}${busy?' is-busy':''}`}><iframe ref={frame} key={page} title="可直接编辑的真实网页" src={`/?preview=1#${page}`} onLoad={()=>{setInlineEditing(false);sendDraft();}}/></div><p className="admin-visual-canvas-note">{inlineEditing?'正在直接编辑文字：单行按 Enter、多行按 Ctrl+Enter 完成，Esc 取消；也可以点击空白处结束。':'文字、照片和资料模块都可以点击。小游戏与像素人的显示可在快捷设置中控制。'}</p></section>
        <aside className="admin-visual-inspector" aria-label="选中内容设置">
          <div className="admin-visual-inspector-title"><span className="eyebrow">{selection?'SELECTED CONTENT':'START HERE'}</span><h2>{selection?targetLabel:'点击网页上的内容'}</h2>{selection&&<button className="btn" disabled={busy||inlineEditing} onClick={()=>setSelection(null)}>返回快捷设置</button>}</div>
          {!selection?<><p className="muted">选中后，这里只显示对应的设置。也可以从下面开始。</p><div className="admin-visual-shortcuts">{VISUAL_SHORTCUTS.map(target=><button className="admin-visual-shortcut" key={`${target.kind}:${target.path}`} disabled={busy||inlineEditing} onClick={()=>select(target)}><span>{target.label}</span><span aria-hidden="true">↗</span></button>)}</div></>:<><p className="admin-visual-field-help">{selection.kind==='profile'?'这里修改的是个人资料。':'这里修改的是网站界面设置，可能同时影响其他页面。'}修改会先显示在左侧预览，保存后才公开。</p><fieldset key={`${selection.kind}:${selection.path}`} className="admin-visual-selected-fields" disabled={busy||inlineEditing}>
            {!!mediaFields.length&&<MediaControls key={`${selection.kind}:${mediaFields.join(',')}`} kind={selection.kind} data={drafts[selection.kind]} onlyFields={mediaFields} onChange={value=>changeData(selection.kind,value)} onBusyChange={setMediaBusy}/>}
            {selectedValue===undefined?<p className="muted">这个选项当前未设置，请从快捷设置中打开所属模块添加。</p>:<Fields key={`${selection.kind}:${selection.path}`} friendly kind={selection.kind} value={selectedValue} path={selection.path} focusPath={selection.path||undefined} onChange={value=>changeData(selection.kind,setPreviewField(drafts[selection.kind],selection.path,value))}/>}
            {selection.kind==='site'&&rootKey==='player'&&<p className="muted">音量范围为 0 到 1，例如 0.8 表示 80%。音乐文件在「音乐」页面管理。</p>}
            {selection.kind==='site'&&rootKey==='sections'&&<p className="muted">关闭「显示在网站上」会隐藏模块，内容仍然保留。↑ / ↓ 调整显示顺序。</p>}
          </fieldset></>}
          <details className="admin-visual-advanced" open={advanced} onToggle={event=>setAdvanced(event.currentTarget.open)}><summary>更多设置</summary><p className="muted">找不到的文字或图标，可以在这里查看。它们包含其他页面的设置。</p><div className="admin-visual-shortcuts">{[{kind:'site',path:'copy',label:'全部页面文字'},{kind:'site',path:'icons',label:'全部界面图标'},{kind:'site',path:'',label:'全部网站设置'}].map(target=><button key={target.path} className="admin-visual-shortcut" disabled={busy||inlineEditing} onClick={()=>select(target as VisualSelection)}>{target.label}</button>)}</div></details>
        </aside>
      </div>
    </>}
    {discard&&<div className="admin-dialog" role="alertdialog" aria-label="撤销未保存修改"><div><h3>恢复到上次保存？</h3><p>本次未保存的修改会撤销，已保存的内容会保留。</p><div className="admin-actions"><button className="btn" onClick={()=>setDiscard(false)}>继续编辑</button><button className="btn" onClick={reset}>恢复已保存版本</button></div></div></div>}
    {blocker.state==='blocked'&&<div className="admin-dialog" role="alertdialog" aria-label="未保存修改"><div><h3>{busy?'正在处理，请稍候':'修改还没有保存'}</h3><p>{busy?'等待上传或保存完成后再离开。':'继续编辑并保存，或者放弃本次修改后离开。'}</p><div className="admin-actions"><button className="btn" onClick={()=>blocker.reset()}>继续编辑</button>{!busy&&<button className="btn" onClick={()=>blocker.proceed()}>放弃修改并离开</button>}</div></div></div>}
  </section></AdminReferences>;
}
