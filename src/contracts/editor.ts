import type { ResourceKind } from './content';

export const RESOURCE_LABELS: Record<ResourceKind, string> = { site:'界面与控件', profile:'个人资料', gallery:'图库', music:'音乐', essays:'文章', footprints:'已去足迹', wishes:'未来足迹', brands:'Logo 库', folders:'文章分类' };
export const FIELD_LABELS: Record<string, string> = {
  play:'趣味组件', game:'显示小游戏', cursor:'个性鼠标',
  name:'名称', nameEn:'英文名称', tagline:'网站简介', footer:'页脚文案', logo:'Logo', navigation:'导航', copy:'界面文案', sections:'资料模块', theme:'外观', player:'播放器', label:'显示文字', labelEn:'英文文字', icon:'图标', visible:'公开显示', id:'标识', accent:'强调色', radius:'圆角', pageWidth:'页面宽度', mode:'默认播放模式', volume:'默认音量', fallbackCover:'默认封面', headline:'职业方向', status:'状态', intro:'简介', avatar:'头像', facts:'基本信息', contacts:'联系方式', interests:'爱好', education:'教育', experience:'经历', projects:'项目', skills:'技能', honors:'认证', resume:'简历 PDF', value:'内容', kind:'类型', href:'链接', org:'组织', role:'角色', period:'时间段', place:'地点', badge:'文字徽标', points:'要点', text:'文字', color:'颜色', group:'分组', items:'项目', note:'备注', brand:'品牌 Logo', title:'标题', date:'日期', story:'照片文案', src:'文件地址', thumb:'缩略图', footprint:'关联足迹', location:'照片地点', lnglat:'高德坐标（经度、纬度）', source:'定位来源', address:'地址', region:'地区', photos:'关联照片', reason:'想去的原因', artist:'艺术家', album:'专辑', cover:'封面', publicPath:'文章路径', subtitle:'副标题', summary:'摘要', tags:'标签', folder:'分类路径', featured:'推荐', body:'Markdown 正文', file:'图片地址', mono:'跟随文字颜色', ratio:'宽高比', path:'分类路径', order:'排序权重',
};
// Technical controls use English labels; authored content keeps its Chinese labels.
Object.assign(FIELD_LABELS, {
  id:'ID', icon:'Icon', icons:'Icons', navigation:'Navigation', copy:'UI Copy', sections:'Sections', theme:'Theme', player:'Player',
  visible:'Visible', accent:'Accent', radius:'Radius', pageWidth:'Page Width', mode:'Play Mode', volume:'Volume',
  fallbackCover:'Fallback Cover', kind:'Type', href:'URL', color:'Color', src:'Source URL', thumb:'Thumbnail',
  lnglat:'Coordinates (GCJ-02)', source:'Location Source', status:'Status', publicPath:'Public Path',
  featured:'Featured', mono:'Monochrome', ratio:'Aspect Ratio', path:'Folder Path', order:'Order', file:'Asset URL',
});
export const FRIENDLY_FIELD_LABELS: Record<string,string> = {
  ...FIELD_LABELS, navigation:'导航菜单', copy:'页面文字', icons:'界面图标', sections:'个人资料模块', theme:'页面外观', player:'音乐播放器',
  id:'对应页面 / 模块', icon:'显示图标', visible:'显示在网站上', accent:'强调色 (Accent)', radius:'圆角大小 (Radius)',
  pageWidth:'页面最大宽度 (Page Width)', mode:'默认播放方式 (Play Mode)', volume:'默认音量 (Volume)',
  fallbackCover:'无封面时使用的图片', kind:'联系方式类型', href:'点击后打开的地址', color:'颜色', logo:'网站 Logo',
  name:'中文姓名', nameEn:'英文姓名', status:'当前状态', label:'显示文字', labelEn:'英文显示文字',
  file:'图片地址', brand:'关联的 Logo', mono:'图标跟随文字颜色', ratio:'图片宽高比', resume:'简历 PDF 地址',
  greeting:'姓名前的问候语',eyebrow:'英文小标题',subtitle:'页面副标题',
};
const date = () => new Date().toISOString().slice(0,10);
export function emptyResource(kind: ResourceKind): Record<string, unknown> {
  const records: Record<ResourceKind, Record<string,unknown>> = {
    site:{}, profile:{ name:'', nameEn:'', headline:'', status:'', intro:'', avatar:'', facts:[], contacts:[], interests:[], education:[], experience:[], projects:[], skills:[], honors:[], resume:'' },
    gallery:{title:'',place:'',date:date(),story:'',src:'',thumb:'',visible:true},
    music:{title:'',artist:'',album:'',note:'',src:'',cover:'',visible:true},
    essays:{publicPath:'',title:'',subtitle:'',summary:'',date:date(),tags:[],folder:[],cover:'',featured:false,body:'',status:'draft'},
    footprints:{name:'',region:'',lnglat:[0,0],date:date(),note:'',photos:[],visible:true},
    wishes:{name:'',region:'',reason:'',visible:true}, brands:{label:'',file:'',mono:false,ratio:1,visible:true}, folders:{path:'',title:'',order:0},
  }; return structuredClone(records[kind]);
}
export function arrayItem(path: string): unknown {
  const key = path.split('.').at(-1)!;
  const timeline = {org:'',role:'',period:'',place:'',logo:'',points:[]};
  const templates: Record<string,unknown> = { facts:{label:'',value:''}, contacts:{kind:'link',label:'',href:''}, education:timeline, experience:timeline, projects:timeline, points:{title:'',text:''}, skills:{group:'',items:[],note:''}, items:{name:'',brand:''}, honors:{text:'',brand:''}, navigation:{id:'me',label:'',labelEn:'',icon:'user',visible:true}, sections:{id:'experience',visible:true} };
  return structuredClone(templates[key] ?? '');
}
export function fieldOptions(path: string, kind: ResourceKind): string[] | undefined {
  const key=path.split('.').at(-1);
  if(key==='cursor')return ['default','star','rabbit','parrot'];
  if(key==='status'&&kind==='essays')return ['draft','published'];
  if(key==='mode')return ['loop','one','shuffle'];
  if(key==='kind')return ['email','github','phone','link'];
  if(key==='source')return ['exif','search','manual'];
  if(key==='icon')return ['user','image','map','pen','music','heart','flag','folder','school','sparkle'];
  if(key==='id'&&path.startsWith('navigation'))return ['me','gallery','footprints','essays'];
  if(key==='id'&&path.startsWith('sections'))return ['experience','projects','education','skills','honors'];
  return undefined;
}

/** Optional fields can be added explicitly without changing existing records on load. */
export function optionalFields(path:string,kind:ResourceKind):Record<string,unknown> {
  if(kind!=='profile')return {};
  if(/^(education|experience|projects)\.\d+$/.test(path))return {place:'',logo:'',badge:{text:'',color:'#2f80ed'}};
  if(/^(education|experience|projects)\.\d+\.points\.\d+$/.test(path))return {title:''};
  if(/^skills\.\d+$/.test(path))return {note:''};
  if(/^skills\.\d+\.items\.\d+$/.test(path)||/^honors\.\d+$/.test(path))return {brand:''};
  return {};
}
