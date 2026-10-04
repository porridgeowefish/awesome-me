import type { SVGProps } from 'react';

/** Minimal stroke icon set (24×24 grid). Add an entry here to add an icon. */
const PATHS = {
  user: 'M12 12a4 4 0 1 0 0-8 4 4 0 0 0 0 8Zm-7 9a7 7 0 0 1 14 0',
  image: 'M4 5h16v14H4zM4 16l5-5 4 4 3-3 4 4M15.5 9.5h.01',
  map: 'M9 4 3 6v14l6-2 6 2 6-2V4l-6 2-6-2Zm0 0v14m6-12v14',
  pen: 'M4 20h4L19 9l-4-4L4 16v4Zm9-13 4 4',
  music: 'M9 18V5l11-2v13M9 18a3 3 0 1 1-6 0 3 3 0 0 1 6 0Zm11-2a3 3 0 1 1-6 0 3 3 0 0 1 6 0Z',
  sun: 'M12 16a4 4 0 1 0 0-8 4 4 0 0 0 0 8Zm0-14v2m0 16v2M4.9 4.9l1.4 1.4m11.4 11.4 1.4 1.4M2 12h2m16 0h2M4.9 19.1l1.4-1.4M17.7 6.3l1.4-1.4',
  moon: 'M20 14.5A8 8 0 1 1 9.5 4a6.5 6.5 0 0 0 10.5 10.5Z',
  left: 'M15 18l-6-6 6-6',
  right: 'M9 18l6-6-6-6',
  down: 'M6 9l6 6 6-6',
  up: 'M18 15l-6-6-6 6',
  close: 'M18 6 6 18M6 6l12 12',
  play: 'M7 4.5v15l12-7.5-12-7.5Z',
  pause: 'M7 5h3v14H7zM14 5h3v14h-3z',
  prev: 'M18 5v14L8 12l10-7ZM6 5v14',
  next: 'M6 5v14l10-7L6 5Zm12 0v14',
  shuffle: 'M16 3h5v5M4 20 21 3M21 16v5h-5M15 15l6 6M4 4l5 5',
  repeat: 'M17 2l4 4-4 4M3 11V9a3 3 0 0 1 3-3h15M7 22l-4-4 4-4M21 13v2a3 3 0 0 1-3 3H3',
  repeatOne: 'M17 2l4 4-4 4M3 11V9a3 3 0 0 1 3-3h15M7 22l-4-4 4-4M21 13v2a3 3 0 0 1-3 3H3M11 10h1v5',
  volume: 'M4 9v6h4l5 4V5L8 9H4Zm12.5-1.5a5 5 0 0 1 0 9',
  mute: 'M4 9v6h4l5 4V5L8 9H4Zm12 0 5 6m0-6-5 6',
  folder: 'M3 6.5A1.5 1.5 0 0 1 4.5 5H9l2 2h8.5A1.5 1.5 0 0 1 21 8.5v9a1.5 1.5 0 0 1-1.5 1.5h-15A1.5 1.5 0 0 1 3 17.5v-11Z',
  folderOpen: 'M3 7V5.5A1.5 1.5 0 0 1 4.5 4H9l2 2h7.5A1.5 1.5 0 0 1 20 7.5V9M3 7v11h15.5l2.5-9H5.5L3 18',
  file: 'M14 3H7a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2V8l-5-5Zm0 0v5h5M9 13h6M9 17h4',
  search: 'M11 18a7 7 0 1 0 0-14 7 7 0 0 0 0 14Zm9 3-4.35-4.35',
  pin: 'M12 21s7-6.1 7-11.5A7 7 0 0 0 5 9.5C5 14.9 12 21 12 21Zm0-9a2.5 2.5 0 1 0 0-5 2.5 2.5 0 0 0 0 5Z',
  calendar: 'M4 6h16v14H4zM4 10h16M8 3v4m8-4v4',
  clock: 'M12 21a9 9 0 1 0 0-18 9 9 0 0 0 0 18Zm0-13v4l3 2',
  mail: 'M3 6h18v12H3zM3 7l9 6 9-6',
  download: 'M12 3v12m0 0-4.5-4.5M12 15l4.5-4.5M4 17v3h16v-3',
  external: 'M14 4h6v6M20 4l-9 9M19 14v5H5V5h5',
  zoomIn: 'M11 18a7 7 0 1 0 0-14 7 7 0 0 0 0 14Zm9 3-4.35-4.35M11 8v6M8 11h6',
  zoomOut: 'M11 18a7 7 0 1 0 0-14 7 7 0 0 0 0 14Zm9 3-4.35-4.35M8 11h6',
  reset: 'M3 12a9 9 0 1 0 3-6.7L3 8m0-5v5h5',
  gamepad: 'M6 9h4M8 7v4m7-1h.01M18 12h.01M7 5h10a5 5 0 0 1 4.9 6l-1 5a3 3 0 0 1-5.3 1.3L14 15h-4l-1.6 2.3A3 3 0 0 1 3.1 16l-1-5A5 5 0 0 1 7 5Z',
  sparkle: 'M12 3l1.8 5.2L19 10l-5.2 1.8L12 17l-1.8-5.2L5 10l5.2-1.8L12 3Zm7 12 .8 2.2L22 18l-2.2.8L19 21l-.8-2.2L16 18l2.2-.8L19 15Z',
  list: 'M8 6h13M8 12h13M8 18h13M3 6h.01M3 12h.01M3 18h.01',
  video: 'M3 6h13v12H3zM16 10l5-3v10l-5-3',
  heart: 'M12 20s-7-4.4-7-10a4 4 0 0 1 7-2.6A4 4 0 0 1 19 10c0 5.6-7 10-7 10Z',
  menu: 'M4 7h16M4 12h16M4 17h16',
  flag: 'M5 21V4m0 0h11l-2 4 2 4H5',
  award: 'M12 15a6 6 0 1 0 0-12 6 6 0 0 0 0 12Zm-4 0-1 7 5-3 5 3-1-7',
  briefcase: 'M4 8h16v11H4zM9 8V5h6v3M4 13h16',
  school: 'M3 9l9-5 9 5-9 5-9-5Zm3 2v5c2 2 10 2 12 0v-5',
  code: 'M8 7l-5 5 5 5M16 7l5 5-5 5M14 4l-4 16',
} as const;

export type IconName = keyof typeof PATHS;

interface IconProps extends Omit<SVGProps<SVGSVGElement>, 'name'> {
  name: IconName;
  size?: number;
  /** Filled glyph instead of stroked (used for play / pause). */
  solid?: boolean;
  title?: string;
}

export function Icon({ name, size = 18, solid = false, title, ...rest }: IconProps) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill={solid ? 'currentColor' : 'none'}
      stroke="currentColor"
      strokeWidth={solid ? 1.6 : 1.8}
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden={title ? undefined : true}
      role={title ? 'img' : undefined}
      {...rest}
    >
      {title && <title>{title}</title>}
      <path d={PATHS[name]} />
    </svg>
  );
}
