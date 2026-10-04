import { resourceSchemas, type ContentRecord } from '../../contracts/content';
import { FRIENDLY_FIELD_LABELS, emptyResource } from '../../contracts/editor';
import { siteDefaults } from '@/data/siteDefaults';

export type VisualKind = 'site' | 'profile';
export type VisualDrafts = Record<VisualKind, Record<string, unknown>>;
export type VisualRecords = Record<VisualKind, ContentRecord | null>;
export interface VisualSelection { kind: VisualKind; path: string; label?: string }
export const VISUAL_SHORTCUTS: VisualSelection[] = [
  {kind:'profile',path:'',label:'个人名片与资料'},
  {kind:'profile',path:'interests',label:'爱好 · 添加与管理'},
  {kind:'profile',path:'experience',label:'实习 / 工作经历'},
  {kind:'profile',path:'projects',label:'项目经历'},
  {kind:'profile',path:'education',label:'教育背景'},
  {kind:'profile',path:'skills',label:'技能'},
  {kind:'profile',path:'honors',label:'认证 / 荣誉'},
  {kind:'site',path:'navigation',label:'导航菜单'},
  {kind:'site',path:'sections',label:'模块显示与顺序'},
  {kind:'site',path:'theme',label:'页面外观'},
  {kind:'site',path:'player',label:'音乐播放器'},
  {kind:'site',path:'play',label:'小游戏与像素人 · 显示开关'},
  {kind:'site',path:'cursor',label:'个性鼠标 · 星星 / 兔子 / 鹦鹉'},
];
const COPY_LABELS: Record<string,string> = {
  'me.eyebrow':'开场英文小标题', 'me.greeting':'姓名前的问候语', 'me.subtitle':'页面副标题',
  'profile.experience':'经历模块标题','profile.projects':'项目模块标题','profile.education':'教育模块标题',
  'profile.skills':'技能模块标题','profile.honors':'认证模块标题','profile.interests':'爱好标题','profile.resume':'简历按钮文字',
};
export function visualSelectionLabel(selection: VisualSelection): string {
  if(selection.label)return selection.label;
  if(!selection.path)return selection.kind==='site'?'全部网站设置':'个人名片与资料';
  if(selection.kind==='site'&&selection.path==='name')return '网站名称';
  if(selection.kind==='site'&&selection.path==='nameEn')return '网站英文名称';
  if(selection.path.startsWith('copy.'))return COPY_LABELS[selection.path.slice(5)]??'页面文字';
  if(selection.path.startsWith('icons.'))return '界面图标';
  return FRIENDLY_FIELD_LABELS[selection.path.split('.').at(-1)!]??selection.path.split('.').at(-1)!;
}
export function initialVisualDrafts(records: VisualRecords): VisualDrafts {
  const site={...siteDefaults,...records.site?.data} as Record<string,unknown>;
  site.copy={...siteDefaults.copy,...site.copy as object};
  site.icons={...siteDefaults.icons,...site.icons as object};
  return {site,profile:{...emptyResource('profile'),...records.profile?.data}};
}
export function changedVisualKinds(drafts: VisualDrafts, baseline: VisualDrafts): VisualKind[] {
  return (['site','profile'] as const).filter(kind=>JSON.stringify(drafts[kind])!==JSON.stringify(baseline[kind]));
}
export class VisualValidationError extends Error {
  constructor(public kind:VisualKind,public fields:{path:string;message:string}[]){super('请检查当前修改，填写完整后再保存。');}
}
/** Validate every draft before writing; acknowledge each successful revision even if the next write fails. */
export async function persistVisualChanges(
  input:{drafts:VisualDrafts;baseline:VisualDrafts;records:VisualRecords},
  persist:(kind:VisualKind,data:Record<string,unknown>,record:ContentRecord|null)=>Promise<ContentRecord>,
  acknowledge:(kind:VisualKind,row:ContentRecord)=>void,
):Promise<number> {
  const kinds=changedVisualKinds(input.drafts,input.baseline);
  const parsed=new Map<VisualKind,Record<string,unknown>>();
  for(const kind of kinds){
    const result=resourceSchemas[kind].safeParse(input.drafts[kind]);
    if(!result.success)throw new VisualValidationError(kind,result.error.issues.map(issue=>({path:issue.path.join('.'),message:issue.message})));
    parsed.set(kind,result.data as Record<string,unknown>);
  }
  for(const kind of kinds){const row=await persist(kind,parsed.get(kind)!,input.records[kind]);acknowledge(kind,row);}
  return kinds.length;
}
