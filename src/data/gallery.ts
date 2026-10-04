import type { Photo } from './types';

/** Original programmatic illustrations, not the author's personal photographs. */
export const photos: Photo[] = [
  { id: 'demo-mountains', src: 'content/gallery/mountains.webp', thumb: 'content/gallery/thumbs/mountains.webp', title: '山间晨光 · 示例插画', place: '示例公园', date: '2026-01-01', footprint: 'demo-park', story: '这张图片由项目内脚本绘制，用来展示图库与足迹关联。\n\n上传自己的照片后，可以在后台补充拍摄日期、地点和文字记录。' },
  { id: 'demo-lake', src: 'content/gallery/lake.webp', thumb: 'content/gallery/thumbs/lake.webp', title: '湖边散步 · 示例插画', place: '示例公园', date: '2026-01-02', footprint: 'demo-park', story: '这是一张原创示例插画，没有真实人物、拍摄位置或 EXIF 信息。点击照片可以查看大图。' },
  { id: 'demo-city', src: 'content/gallery/city.webp', thumb: 'content/gallery/thumbs/city.webp', title: '城市剪影 · 示例插画', place: '示例城市', date: '2026-01-03', footprint: 'demo-city', story: '图库支持多张图片与一处足迹关联。示例城市与日期仅为展示功能。' },
];
