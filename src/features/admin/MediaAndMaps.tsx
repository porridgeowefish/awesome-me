import { useState } from 'react';
import type { ResourceKind } from '../../contracts/content';
import { publicUrl } from '@/shared/lib/url';
import { api, uploadFile, type UploadResult } from './api';
import { AssetPicker } from './AssetPicker';
import { useAdminReferences } from './References';

export function PhotoFootprintControls({ data, onChange }: { data: Record<string, unknown>; onChange: (value: Record<string, unknown>) => void }) {
  const { footprints } = useAdminReferences();
  const selected = footprints.find(row => row.id === data.footprint);
  return <section className="admin-map-tools" data-field-path="footprint"><h3>照片所属地区</h3><label>所属地区<select value={data.footprint === undefined ? '__auto__' : String(data.footprint)} onChange={event => {
    const value = event.target.value;
    const footprint = footprints.find(row => row.id === value);
    onChange({ ...data, footprint: value === '__auto__' ? undefined : value, ...(footprint ? { place: footprint.data.name, location: { lnglat: footprint.data.lnglat, address: footprint.data.region, source: 'manual' } } : {}) });
  }}><option value="__auto__">根据照片地点自动关联</option><option value="">不关联足迹</option>{footprints.map(row => <option key={row.id} value={row.id}>{row.data.name} · {row.data.region}{row.data.visible ? '' : '（未公开）'}</option>)}</select></label><p className="muted">多张照片可以属于同一个地区。自动关联会复用同名地点或唯一匹配的地区；新地点有坐标时，保存照片会同时建立足迹。</p>{selected && <p><a href={`#/footprints?place=${encodeURIComponent(selected.id)}`}>查看这个地区的足迹 ↗</a>{!selected.data.visible && <span className="muted"> · 此足迹未公开，请在足迹管理中公开后展示。</span>}</p>}</section>;
}

interface Props { kind:ResourceKind;data:Record<string,unknown>;onChange:(value:Record<string,unknown>|((previous:Record<string,unknown>)=>Record<string,unknown>))=>void }
export function MediaControls({kind,data,onChange,onBusyChange,onlyFields}:Props & {onBusyChange:(busy:boolean)=>void;onlyFields?:string[]}) {
  const [busy,setBusy]=useState(false),[message,setMessage]=useState('');
  const [picker,setPicker]=useState<{label:string;purpose:string;field:string}|null>(null);
  const targets: {label:string;purpose:string;field:string}[] = kind==='gallery'?[{label:'上传照片',purpose:'gallery',field:'src'}]:kind==='music'?[{label:'上传音频',purpose:'music',field:'src'},{label:'上传封面',purpose:'cover',field:'cover'}]:kind==='essays'?[{label:'插入图片',purpose:'essay',field:'body'},{label:'上传封面',purpose:'cover',field:'cover'}]:kind==='brands'?[{label:'上传 Logo',purpose:'logo',field:'file'}]:kind==='profile'?[{label:'上传头像',purpose:'avatar',field:'avatar'},{label:'上传简历',purpose:'resume',field:'resume'}]:kind==='site'?[{label:'上传网站 Logo',purpose:'logo',field:'logo'}]:[];
  if(onlyFields) targets.splice(0,targets.length,...targets.filter(target=>onlyFields.includes(target.field)));
  if(!targets.length)return null;
  function applyAsset(asset:UploadResult,target:typeof targets[number]) {
    const src=asset.variants.large??asset.variants.original;
    onChange(previous=>{
      const next={...previous,[target.field]:target.field==='body'?`${previous.body??''}\n\n![${asset.filename.replace(/[\[\]]/g,'')}](${src})\n`:src};
      if(kind==='gallery'){next.thumb=asset.variants.thumb;if(asset.capturedAt)next.date=asset.capturedAt.slice(0,10);if(asset.suggestedLocation&&!previous.footprint){next.location={lnglat:asset.suggestedLocation.lnglat,address:asset.suggestedLocation.address,source:'exif'};next.place=asset.suggestedLocation.address;}}
      return next;
    });
  }
  async function upload(file:File,target:typeof targets[number]) {
    setBusy(true);onBusyChange(true);setMessage(`正在处理 ${file.name}…`);
    try {
      const asset=await uploadFile(file,target.purpose);
      applyAsset(asset,target);setMessage(`已处理 ${file.name}。${kind==='gallery'?(asset.gps?'读取到照片 GPS。':'未读取到 GPS，可手动选地点。'):''} ${asset.warnings.join('；')}`);
    }catch(e){setMessage((e as Error).message);}finally{setBusy(false);onBusyChange(false);}
  }
  return <section className="admin-media-tools"><div className="admin-actions">{targets.map(target=><span key={target.field} className="admin-media-target"><label className={`btn ${busy?'is-disabled':''}`}>{target.label}<input type="file" disabled={busy} accept={target.purpose==='music'?'audio/*,video/mp4,.mp3,.mp4,.flac,.m4a':target.purpose==='resume'?'.pdf':'image/*,.svg,.heic,.heif'} onChange={e=>{const file=e.target.files?.[0];if(file)void upload(file,target);e.target.value='';}}/></label><button type="button" className="btn" disabled={busy} onClick={()=>setPicker(target)} aria-label={`${target.label}：选择已有素材`}>选择素材</button></span>)}</div>{kind==='music'&&<p className="muted">支持 MP3 / MP4 和现有音频格式。MP4 仅保存音轨，上传的视频画面会清除。</p>}{message&&<p role="status">{message}</p>}{['src','cover','avatar','file','logo'].filter(key=>data[key]&&!(kind==='music'&&key==='src')).map(key=><img key={key} src={publicUrl(String(data[key]))} alt="当前图片预览" className="admin-asset-preview"/>)}{kind==='music'&&data.src?<audio controls preload="none" src={publicUrl(String(data.src))}/>:null}{picker&&<AssetPicker purpose={picker.purpose} onClose={()=>setPicker(null)} onSelect={asset=>{applyAsset(asset,picker);setMessage(`已选择素材：${asset.filename}`);setPicker(null);}}/>}</section>;
}
interface Candidate {id:string;name:string;address:string;lnglat:[number,number]}
export function MapControls({kind,data,onChange}:Props) {
  const [query,setQuery]=useState(''),[items,setItems]=useState<Candidate[]>([]),[message,setMessage]=useState(''),[busy,setBusy]=useState(false);
  if(!['gallery','footprints','wishes'].includes(kind))return null;
  async function search() {setBusy(true);try{const result=await api<{items:Candidate[]}>(`/api/v1/admin/maps/search?q=${encodeURIComponent(query)}`);setItems(result.items);setMessage(result.items.length?'选择地点后，可继续修改显示名称和文案。':'没有找到地点，请换个名称或手动填写坐标。');}catch(e){setMessage((e as Error).message);}finally{setBusy(false);}}
  const manual=()=>onChange(kind==='gallery'?{...data,footprint:undefined,location:{lnglat:[0,0],source:'manual',address:''}}:{...data,lnglat:[0,0]});
  return <section className="admin-map-tools"><h3>地点定位</h3><div className="admin-search-row"><label>地点名称<input value={query} onChange={e=>setQuery(e.target.value)} placeholder="例如：示例大学粤海校区" onKeyDown={e=>{if(e.key==='Enter'){e.preventDefault();void search();}}}/></label><button className="btn" type="button" disabled={busy||!query.trim()} onClick={()=>void search()}>搜索高德地点</button><button className="btn" type="button" onClick={manual}>手动填写坐标</button></div>{message&&<p role="status">{message}</p>}<div className="admin-map-results">{items.map(item=><button key={item.id} type="button" onClick={()=>{onChange(kind==='gallery'?{...data,footprint:undefined,place:item.name,location:{lnglat:item.lnglat,source:'search',address:item.address}}:{...data,name:data.name||item.name,region:data.region||item.address,lnglat:item.lnglat});setItems([]);setMessage(`已选择：${item.name}`);}}><strong>{item.name}</strong><span>{item.address}</span></button>)}</div>{kind!=='footprints'&&(data.location||data.lnglat)?<button type="button" className="btn" onClick={()=>{const next={...data};delete next[kind==='gallery'?'location':'lnglat'];onChange(next);}}>移除定位</button>:null}<p className="muted">坐标使用高德 GCJ-02。照片 GPS 仅用于转换定位；公开图片会移除原始 EXIF。</p></section>;
}
