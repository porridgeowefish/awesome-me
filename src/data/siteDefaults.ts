import type { ResourceData } from '../contracts/content';
import { INTERFACE_COPY_DEFAULTS, INTERFACE_ICON_DEFAULTS } from '../contracts/interface';

export const siteDefaults: ResourceData<'site'> = {
  name: '示例站主', nameEn: 'Alex Example', tagline: '记录生活，分享创造', footer: '由 awesome-me 构建',
  logo: 'images/me/pixel-head.png',
  play: { game: false, avatar: false },
  cursor: 'star',
  navigation: [
    { id: 'me', label: '我', labelEn: 'Me', icon: 'user', visible: true },
    { id: 'gallery', label: '图库', labelEn: 'Gallery', icon: 'image', visible: true },
    { id: 'footprints', label: '足迹', labelEn: 'Footprints', icon: 'map', visible: true },
    { id: 'essays', label: '随笔', labelEn: 'Essays', icon: 'pen', visible: true },
  ],
  copy: {
    ...INTERFACE_COPY_DEFAULTS,
    'me.eyebrow': 'Hello, world', 'me.greeting': '你好，我是', 'me.subtitle': '一个属于自己的数字花园',
    'profile.experience': '工作经历', 'profile.projects': '项目经历', 'profile.education': '教育背景', 'profile.skills': '专业技能', 'profile.honors': '认证', 'profile.interests': '爱好', 'profile.resume': '下载简历',
    'gallery.title': '图库', 'gallery.eyebrow': 'Gallery', 'gallery.hint': '双击照片放大查看', 'gallery.note': 'Note', 'gallery.mapLink': '在地图上看 →',
    'footprints.title': '足迹', 'footprints.eyebrow': 'Footprints', 'footprints.wishes': '下一次想去', 'footprints.wishHint': '点卡片在地图上看看',
    'essays.title': '随笔', 'essays.eyebrow': 'Essays', 'essays.search': '搜索标题、摘要、标签…', 'essays.all': '全部文章', 'essays.clear': '清除筛选', 'essays.directory': '目录',
    'music.loop': '列表循环', 'music.one': '单曲循环', 'music.shuffle': '随机播放', 'music.unknownArtist': '未知艺术家',
  },
  icons: INTERFACE_ICON_DEFAULTS,
  sections: [{ id: 'experience', visible: true }, { id: 'projects', visible: true }, { id: 'education', visible: true }, { id: 'skills', visible: true }, { id: 'honors', visible: true }],
  theme: { accent: '#2f80ed', radius: 12, pageWidth: 1200 },
  player: { visible: true, mode: 'loop', volume: 0.8, fallbackCover: 'images/me/pixel-head.png' },
};
