import { useEffect, useState } from 'react';
import { Link, NavLink, useParams } from 'react-router-dom';
import { RESOURCE_KINDS, type ResourceKind } from '../../contracts/content';
import { RESOURCE_LABELS } from '../../contracts/editor';
import { api, setCsrf } from './api';
import { requireOwnerInitialized } from './ownerSetup';
import { CollectionManager } from './Collections';
import { SecurityPanel } from './Security';
import { MediaLibrary } from './MediaLibrary';
import { AnalyticsPanel } from './Analytics';
import { VisualPageEditor } from './VisualPageEditor';
import { Loading } from '@/shared/ui/states';
import { useDocumentTitle } from '@/shared/hooks/useDocumentTitle';
import { useSiteContent } from '@/shared/content/runtime';
import './admin.css';
interface Session {username:string;type:string;csrfToken:string}
export default function AdminPage() {
  useDocumentTitle('内容管理');
  const [session,setSession]=useState<Session|null>(null),[loading,setLoading]=useState(true),[ownerInitialized,setOwnerInitialized]=useState(true),[message,setMessage]=useState('');
  const section=useParams().section??'';
  useEffect(()=>{let alive=true;api<Session>('/api/v1/auth/session').then(value=>{if(alive){setCsrf(value.csrfToken);setSession(value);}}).catch(()=>api<{ownerInitialized:boolean}>('/api/v1/health').then(health=>alive&&setOwnerInitialized(health.ownerInitialized)).catch(e=>alive&&setMessage((e as Error).message))).finally(()=>alive&&setLoading(false));const expired=()=>{setCsrf('');setSession(null);};window.addEventListener('site:session-expired',expired);return()=>{alive=false;window.removeEventListener('site:session-expired',expired);};},[]);
  const logout=async()=>{try{await api('/api/v1/auth/logout',{method:'POST'});setSession(null);setCsrf('');}catch(e){setMessage((e as Error).message);}};
  if(loading)return <div className="admin-login-wrap"><Loading label="正在验证管理会话"/></div>;
  if(!session)return <Login ownerInitialized={ownerInitialized} initialMessage={message} onInitialized={()=>setOwnerInitialized(true)} onLogin={value=>{setCsrf(value.csrfToken);setSession(value);}}/>;
  return <div className="admin-shell"><aside className="admin-sidebar"><Link to="/admin" className="admin-brand"><span className="pixel-mark"/><span>内容工作室<small>PERSONAL SITE</small></span></Link><nav aria-label="后台导航"><NavLink to="/admin" end>总览</NavLink><NavLink to="/admin/me" className={({isActive})=>isActive||section==='site'||section==='profile'?'active':' '}>我 · 可视化编辑</NavLink>{RESOURCE_KINDS.filter(kind=>kind!=='wishes'&&kind!=='site'&&kind!=='profile').map(kind=><NavLink key={kind} to={`/admin/${kind}`} className={({isActive})=>isActive||(kind==='footprints'&&section==='wishes')?'active':' '}>{kind==='footprints'?'足迹':RESOURCE_LABELS[kind]}</NavLink>)}<NavLink to="/admin/media">素材库</NavLink><NavLink to="/admin/analytics">访客数据</NavLink><NavLink to="/admin/security">Token 与账户</NavLink></nav><div className="admin-sidebar-bottom"><Link to="/">← 查看网站</Link><span>{session.username}</span><button onClick={()=>void logout()}>退出登录</button></div></aside><main className="admin-main">{message&&<p role="status" className="admin-notice">{message}</p>}{['me','site','profile'].includes(section)?<VisualPageEditor legacyKind={section==='site'||section==='profile'?section:undefined}/>:RESOURCE_KINDS.includes(section as ResourceKind)?<CollectionManager key={section} kind={section as ResourceKind}/>:section==='security'?<SecurityPanel onLogout={()=>{setSession(null);setCsrf('');}}/>:section==='media'?<MediaLibrary/>:section==='analytics'?<AnalyticsPanel/>:<Overview/>}</main></div>;
}
function Login({ownerInitialized,initialMessage,onInitialized,onLogin}:{ownerInitialized:boolean;initialMessage:string;onInitialized:()=>void;onLogin:(session:Session)=>void}) {
  const [username,setUsername]=useState(''),[password,setPassword]=useState(''),[message,setMessage]=useState(initialMessage),[busy,setBusy]=useState(false);
  async function submit(){setBusy(true);try{const value=await api<Session>('/api/v1/auth/login',{method:'POST',body:{username,password}});setPassword('');onLogin(value);}catch(e){setMessage((e as Error).message);}finally{setBusy(false);}}
  async function checkSetup(){setBusy(true);setMessage('');try{await requireOwnerInitialized(()=>api<{ownerInitialized:boolean}>('/api/v1/health'));onInitialized();}catch(e){setMessage((e as Error).message);}finally{setBusy(false);}}
  return <div className="admin-login-wrap"><section className="admin-login-card"><Link to="/" className="admin-back">← 回到网站</Link><span className="pixel-mark"/><span className="eyebrow">OWNER ONLY</span><h1>你的内容工作室</h1><p>整理照片、音乐、文章，记录下一次出发。</p>{ownerInitialized?<form onSubmit={e=>{e.preventDefault();void submit();}}><label>账户<input value={username} onChange={e=>setUsername(e.target.value)} autoComplete="username" required/></label><label>密码<input type="password" value={password} onChange={e=>setPassword(e.target.value)} autoComplete="current-password" required/></label><button className="btn btn-primary" disabled={busy}>{busy?'正在登录…':'进入管理台'}</button></form>:<div className="admin-setup"><h2>先设置你的专属账户</h2><p>在网站目录的本地终端运行以下命令，设置用户名和至少 12 位密码。</p><code>npm run owner:init</code><p>完成后刷新此页即可登录。</p><button className="btn" disabled={busy} onClick={()=>void checkSetup()}>{busy?'正在检查…':'我已设置，检查账户'}</button></div>}{message&&<p role="alert" className="admin-errors">{message}</p>}</section></div>;
}
function Overview() {
  const content=useSiteContent();
  return <><div className="admin-heading"><div><span className="eyebrow">YOUR CORNER OF THE WEB</span><h1>让生活持续更新</h1><p>编辑界面，也把新的照片、音乐和想法放进来。</p></div><Link className="btn" to="/">查看公开网站 ↗</Link></div><div className="admin-overview-grid">{[{kind:'gallery',count:content.photos.length,caption:'公开照片'},{kind:'essays',count:content.essays.essays.length,caption:'已发布文章'},{kind:'music',count:content.music.tracks.length,caption:'公开音乐'},{kind:'footprints',count:content.footprints.length,caption:'已经去过'},{kind:'wishes',count:content.wishes.length,caption:'下一次想去'}].map(item=><Link key={item.kind} to={`/admin/${item.kind}`}><span className="pixel-num">{String(item.count).padStart(2,'0')}</span><span>{item.caption}</span><small>打开{RESOURCE_LABELS[item.kind as ResourceKind]} →</small></Link>)}</div><section className="admin-settings-card"><h2>从这里开始</h2><div className="admin-start-links"><Link to="/admin/me">直接在网页里编辑个人资料、文字和 Logo →</Link><Link to="/admin/essays">写一篇带图片与公式的文章 →</Link><Link to="/admin/security">为本地 AI 创建发布 Token →</Link></div></section></>;
}

