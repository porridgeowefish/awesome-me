import type { ComponentType, LazyExoticComponent, ReactNode } from 'react';
import { lazyWithReload as lazy } from '@/shared/lib/lazyWithReload';
import type { IconName } from '@/shared/ui/Icon';
import { PlayerProvider } from '@/features/music/player/PlayerContext';
import { NavPlayer } from '@/features/music/NavPlayer';

/**
 * Feature registry — the single place that lists what the site is made of.
 *
 * A feature is a self-contained module under src/features/<name>. It can contribute
 *   - a page (a top-nav tab with routes),
 *   - a Provider (state that must outlive navigation),
 *   - a NavWidget (a control living in the top bar, e.g. the music player),
 *   - a Widget (mounted once in the shell).
 * Navigation, routing, lazy-loading, error isolation and provider composition are all derived
 * from this list, so adding or removing a feature never touches the shell (Open/Closed).
 */
export interface FeatureRoute {
  /** Path relative to the page path ("" = index, "*" = splat). */
  path: string;
  component: LazyExoticComponent<ComponentType>;
}

export interface PageDefinition {
  /** Route path without leading slash ("" for the home page). */
  path: string;
  label: string;
  labelEn: string;
  icon: IconName;
  routes: FeatureRoute[];
}

export interface FeatureModule {
  id: string;
  page?: PageDefinition;
  Provider?: ComponentType<{ children: ReactNode }>;
  NavWidget?: ComponentType;
  Widget?: ComponentType;
}

export const features: FeatureModule[] = [
  {
    id: 'me',
    page: {
      path: '',
      label: '我',
      labelEn: 'Me',
      icon: 'user',
      routes: [{ path: '', component: lazy(() => import('@/features/me/MePage')) }],
    },
  },
  {
    id: 'gallery',
    page: {
      path: 'gallery',
      label: '图库',
      labelEn: 'Gallery',
      icon: 'image',
      routes: [{ path: '', component: lazy(() => import('@/features/gallery/GalleryPage')) }],
    },
  },
  {
    id: 'footprints',
    page: {
      path: 'footprints',
      label: '足迹',
      labelEn: 'Footprints',
      icon: 'map',
      routes: [{ path: '', component: lazy(() => import('@/features/footprints/FootprintsPage')) }],
    },
  },
  {
    id: 'essays',
    page: {
      path: 'essays',
      label: '随笔',
      labelEn: 'Essays',
      icon: 'pen',
      routes: [
        { path: '', component: lazy(() => import('@/features/essays/EssaysPage')) },
        { path: '*', component: lazy(() => import('@/features/essays/EssayReader')) },
      ],
    },
  },
  {
    // No page of its own: a play button + progress bar in the top bar, playlist in a popover.
    id: 'music',
    Provider: PlayerProvider,
    NavWidget: NavPlayer,
  },
];

export const pages = features.flatMap((f) => (f.page ? [{ id: f.id, ...f.page }] : []));
