import { useId } from 'react';
import { FIELD_LABELS, FRIENDLY_FIELD_LABELS, arrayItem, fieldOptions, optionalFields } from '../../contracts/editor';
import type { ResourceKind } from '../../contracts/content';
import { useAdminReferences } from './References';
import { INTERFACE_COPY_DEFAULTS, INTERFACE_ICON_LABELS, ICON_NAMES } from '../../contracts/interface';
import { InterestFields } from './InterestFields';

interface Props { value:unknown;path:string;kind:ResourceKind;onChange:(value:unknown)=>void;focusPath?:string;friendly?:boolean }
const OPTIONS_LABEL: Record<string,string> = {default:'系统鼠标',star:'黄色星星 · 流星拖尾',rabbit:'侏儒兔 · 胡萝卜拖尾',parrot:'鹦鹉 · 点击啄动', draft:'Draft',published:'Published',loop:'Loop',one:'Repeat One',shuffle:'Shuffle',exif:'Photo GPS',manual:'Manual',search:'Place Search' };
const FRIENDLY_OPTIONS: Record<string,string> = {default:'系统鼠标',star:'黄色星星 · 流星拖尾',rabbit:'侏儒兔 · 胡萝卜拖尾',parrot:'鹦鹉 · 点击啄动',loop:'列表循环 (Loop)',one:'单曲循环 (Repeat One)',shuffle:'随机播放 (Shuffle)',me:'我',gallery:'图库',footprints:'足迹',essays:'文章',experience:'经历',projects:'项目',education:'教育',skills:'技能',honors:'认证',email:'邮箱',github:'GitHub',phone:'电话',link:'链接'};
export function Fields({value,path,kind,onChange,focusPath,friendly=false}:Props) {
  const id=useId(), {footprints,photos,brands}=useAdminReferences();
  if(kind==='gallery'&&path==='footprint')return null;
  const key=path.split('.').at(-1)??'', labels=friendly?FRIENDLY_FIELD_LABELS:FIELD_LABELS, label=path === 'play.avatar' ? '显示像素人' : path.startsWith('copy.ui.')?INTERFACE_COPY_DEFAULTS[path.slice(5)]??key:path.startsWith('icons.')?INTERFACE_ICON_LABELS[path.slice(6)]??key:friendly&&kind==='site'&&key==='name'?'网站名称':friendly&&kind==='site'&&key==='nameEn'?'网站英文名称':labels[key]??(key==='icons'?'控件图标':key);
  if(Array.isArray(value)) {
    if(kind==='profile'&&path==='interests')return <InterestFields value={value as string[]} onChange={onChange}/>;
    if(key==='lnglat')return <fieldset className="admin-coordinates"><legend>{label}</legend>{value.map((v,i)=><label key={i}>{i===0?'Longitude':'Latitude'}<input type="number" step="any" value={Number(v)} onChange={e=>onChange(value.map((x,j)=>i===j?Number(e.target.value):x))}/></label>)}</fieldset>;
    return <details className="admin-group" data-field-path={path} open={focusPath?.startsWith(path)||undefined}><summary>{label}<span>{value.length}</span></summary><div className="admin-array">{value.map((v,i)=><div className="admin-array-row" key={i}><div className="admin-row-tools"><span>{label} {i+1}</span><button type="button" aria-label={`${label}第${i+1}项上移`} disabled={!i} onClick={()=>{const next=[...value];[next[i-1],next[i]]=[next[i],next[i-1]];onChange(next);}}>↑</button><button type="button" aria-label={`${label}第${i+1}项下移`} disabled={i===value.length-1} onClick={()=>{const next=[...value];[next[i+1],next[i]]=[next[i],next[i+1]];onChange(next);}}>↓</button><button type="button" onClick={()=>onChange(value.filter((_,j)=>j!==i))}>移除</button></div>{key==='photos'?<label>照片<select value={String(v)} onChange={e=>onChange(value.map((x,j)=>i===j?e.target.value:x))}><option value="">选择照片</option>{photos.map(photo=><option key={photo.id} value={photo.id}>{photo.data.title}{photo.data.visible?'': '（未公开）'}</option>)}</select></label>:<Fields value={v} path={`${path}.${i}`} kind={kind} friendly={friendly} focusPath={focusPath} onChange={next=>onChange(value.map((x,j)=>j===i?next:x))}/>}</div>)}<button className="btn" type="button" onClick={()=>onChange([...value,arrayItem(path)])}>＋ 添加{label}</button></div></details>;
  }
  if(value && typeof value==='object') {
    const object=value as Record<string,unknown>;
    const fields=<div className="admin-fields">{Object.entries(object).map(([key,v])=><div key={key} className="admin-field-container"><Fields value={v} path={path?`${path}.${key}`:key} kind={kind} friendly={friendly} focusPath={focusPath} onChange={next=>onChange({...object,[key]:next,...(kind==='gallery'&&path===''&&['place','location'].includes(key)?{footprint:undefined}:{})})}/>{Object.hasOwn(optionalFields(path,kind),key)&&<button type="button" className="admin-optional-remove" onClick={()=>{const next={...object};delete next[key];onChange(next);}}>移除{labels[key]??key}</button>}</div>)}{Object.entries(optionalFields(path,kind)).filter(([key])=>!Object.hasOwn(object,key)).map(([key,v])=><button key={key} type="button" className="btn" onClick={()=>onChange({...object,[key]:structuredClone(v)})}>添加{labels[key]??key}</button>)}</div>;
    return path?<details className="admin-group" data-field-path={path} open={focusPath?.startsWith(path)||undefined}><summary>{label}</summary>{fields}</details>:fields;
  }
  if(typeof value==='boolean')return <label className="admin-check"><input type="checkbox" checked={value} onChange={e=>onChange(e.target.checked)}/>{label}</label>;
  const options=path.startsWith('icons.')?[...ICON_NAMES]:fieldOptions(path,kind);
  let associations: {value:string;label:string}[]|undefined;
  if(key==='footprint')associations=footprints.map(f=>({value:f.id,label:f.data.name+(f.data.visible?'':'（未公开）')}));
  if(key==='brand'||(key==='logo'&&kind==='profile'))associations=brands.map(b=>({value:b.id,label:b.data.label+(b.data.visible?'':'（未公开）')}));
  return <label data-field-path={path} className={`admin-field ${key==='body'?'admin-body-field':''}`} htmlFor={id}><span>{label}</span>{options||associations?<select id={id} value={String(value??'')} onChange={e=>onChange(e.target.value)}>{associations&&<option value="">不关联</option>}{(associations??options!.map(value=>({value,label:(friendly ? FRIENDLY_OPTIONS[value] : OPTIONS_LABEL[value])??value}))).map(o=><option key={o.value} value={o.value}>{o.label}</option>)}</select>:typeof value==='number'?<input id={id} type="number" step="any" value={value} onChange={e=>onChange(Number(e.target.value))}/>:['story','body','intro','reason','note','summary','text'].includes(key)||String(value??'').length>180?<textarea id={id} rows={key==='body'?18:4} value={String(value??'')} onChange={e=>onChange(e.target.value)}/>:<input id={id} type={key==='date'&&kind==='essays'?'date':key==='accent'||key==='color'?'color':'text'} value={String(value??'')} onChange={e=>onChange(e.target.value)}/>}</label>;
}

