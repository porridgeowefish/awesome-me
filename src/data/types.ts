type BrandName = string;

/** [longitude, latitude] in GCJ-02 (the coordinate system used by AMap). */
export type LngLat = [number, number];

export interface Contact {
  kind: 'email' | 'github' | 'phone' | 'link';
  label: string;
  href: string;
}

export interface TimelineItem {
  org: string;
  role: string;
  period: string;
  place?: string;
  logo?: BrandName;
  /** Text badge used when no logo file is available. */
  badge?: { text: string; color: string };
  points: { title?: string; text: string }[];
}

export interface Profile {
  name: string;
  nameEn: string;
  headline: string;
  status: string;
  intro: string;
  avatar: string;
  facts: { label: string; value: string }[];
  contacts: Contact[];
  interests: string[];
  education: TimelineItem[];
  experience: TimelineItem[];
  projects: TimelineItem[];
  skills: { group: string; items: { name: string; brand?: BrandName }[]; note?: string }[];
  honors: { text: string; brand?: BrandName }[];
  /** Public path of a downloadable résumé (PDF). Leave empty to hide the button. */
  resume?: string;
}

export interface Photo {
  id: string;
  /** Large image path under /public. */
  src: string;
  thumb: string;
  title: string;
  place: string;
  date: string;
  /** "文字记录" shown under the photo. Markdown-free plain text, paragraphs separated by blank lines. */
  story: string;
  /** Links the photo to a footprint id. */
  footprint?: string;
}

export interface Footprint {
  id: string;
  name: string;
  region: string;
  lnglat: LngLat;
  date: string;
  note: string;
  photos?: string[];
}

export interface Wish {
  id: string;
  name: string;
  region: string;
  reason: string;
  /** Optional coordinates → the wish also appears on the map as a dashed marker. */
  lnglat?: LngLat;
}
