import type { Footprint, Wish } from './types';

/** City-level demo coordinates in GCJ-02; these are not an individual's travel records. */
export const footprints: Footprint[] = [
  { id: 'demo-park', name: '示例公园', region: '北京 · 演示地点', lnglat: [116.4, 39.9], date: '2026-01', note: '这是演示坐标，不代表真实行程。', photos: ['demo-mountains', 'demo-lake'] },
  { id: 'demo-city', name: '示例城市', region: '上海 · 演示地点', lnglat: [121.5, 31.2], date: '2026-01', note: '用来展示地图上的第二个点。', photos: ['demo-city'] },
];
export const wishes: Wish[] = [
  { id: 'demo-wish', name: '下一次散步', region: '杭州 · 演示地点', reason: '演示愿望清单；真的去了以后可以转换为足迹。', lnglat: [120.2, 30.3] },
];
