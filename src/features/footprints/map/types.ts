import type { LngLat } from '@/data/types';
import type { Theme } from '@/shared/hooks/useTheme';

export interface MapPlace {
  id: string;
  name: string;
  lnglat: LngLat;
  kind: 'visited' | 'wish';
}

/**
 * Contract every map implementation fulfils (Dependency Inversion): the page talks to this
 * interface, never to a vendor SDK. Today: AMap + an offline fallback; tomorrow: anything.
 */
export interface MapViewProps {
  places: MapPlace[];
  selectedId: string | null;
  onSelect: (id: string) => void;
  theme: Theme;
}
