import type { Profile } from './types';

/** Fictional demo profile. Edit the live profile in the owner dashboard after installation. */
export const profile: Profile = {
  name: '示例站主', nameEn: 'Alex Example',
  headline: '创作者 · 开发者', status: '正在搭建自己的数字花园',
  intro: '这是 awesome-me 的虚构示例资料。你可以用后台修改个人介绍，发布文章，整理图片和记录足迹。这里的学校、公司、经历与联系方式都用于演示。',
  avatar: 'images/me/avatar.webp',
  facts: [{ label: '身份', value: '示例创作者' }, { label: '城市', value: '示例城市' }],
  contacts: [{ kind: 'email', label: 'hello@example.com', href: 'mailto:hello@example.com' }],
  interests: ['写作', '摄影', '编程'],
  education: [{ org: '示例大学', role: '计算机科学 · 示例学位', period: '2020 – 2024', points: [{ text: '这是一条虚构的教育经历，可在后台替换。' }] }],
  experience: [{ org: '示例工作室', role: '开发者', period: '2024 – 至今', logo: 'example', points: [{ title: '内容创作', text: '用网站记录学习与生活，逐步形成可以检索的知识库。' }] }],
  projects: [{ org: '我的数字花园', role: '个人项目', period: '持续更新', points: [{ text: '从第一篇使用指南开始，整理文章、照片与足迹。' }] }],
  skills: [{ group: '开发', items: [{ name: 'TypeScript' }, { name: 'React' }, { name: 'Node.js' }] }, { group: '创作', items: [{ name: 'Markdown' }, { name: '摄影' }], note: '按你的实际情况编辑。' }],
  honors: [{ text: '示例成就：完成第一个个人网站' }], resume: '',
};
