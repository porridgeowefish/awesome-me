import { defaultSchema } from 'rehype-sanitize';

/**
 * Sanitisation allow-list for essay HTML ("rich text").
 * Extends GitHub's schema with the formatting tags people actually paste (mark, font, u, sub…),
 * media (video/audio) and inline SVG — but never scripts, iframes, event handlers or <use>.
 * Property names are hast names (camelCase), e.g. strokeWidth, viewBox.
 */
const SVG_TAGS = [
  'svg', 'g', 'path', 'circle', 'ellipse', 'rect', 'line', 'polyline', 'polygon', 'text', 'tspan',
  'defs', 'linearGradient', 'radialGradient', 'stop', 'marker', 'clipPath', 'mask', 'pattern', 'symbol', 'title', 'desc',
];
const SVG_ATTRS = [
  'viewBox', 'xmlns', 'width', 'height', 'x', 'y', 'x1', 'x2', 'y1', 'y2', 'cx', 'cy', 'r', 'rx', 'ry', 'd', 'points',
  'fill', 'fillOpacity', 'fillRule', 'stroke', 'strokeWidth', 'strokeLinecap', 'strokeLinejoin', 'strokeDasharray',
  'strokeOpacity', 'opacity', 'transform', 'offset', 'stopColor', 'stopOpacity', 'gradientUnits', 'gradientTransform',
  'textAnchor', 'dominantBaseline', 'fontSize', 'fontFamily', 'fontWeight', 'dx', 'dy', 'markerWidth', 'markerHeight',
  'refX', 'refY', 'orient', 'markerEnd', 'markerStart', 'clipPath', 'mask', 'preserveAspectRatio', 'patternUnits', 'role',
  'ariaLabel', 'ariaHidden',
];

export const sanitizeSchema = {
  ...defaultSchema,
  clobberPrefix: '',
  tagNames: [
    ...(defaultSchema.tagNames ?? []),
    'mark', 'u', 'font', 'center', 'figure', 'figcaption', 'video', 'audio', 'source', 'span', 'abbr', 'small', 'big',
    ...SVG_TAGS,
  ],
  attributes: {
    ...defaultSchema.attributes,
    '*': [...(defaultSchema.attributes?.['*'] ?? []), 'className', 'style', 'align', 'title', 'id'],
    font: ['color', 'size', 'face'],
    img: [...(defaultSchema.attributes?.img ?? []), 'width', 'height', 'loading'],
    video: ['src', 'poster', 'controls', 'width', 'height', 'loop', 'muted', 'playsInline', 'preload'],
    audio: ['src', 'controls', 'loop', 'preload'],
    source: ['src', 'type'],
    code: [...(defaultSchema.attributes?.code ?? []), 'className'],
    ...Object.fromEntries(SVG_TAGS.map((t) => [t, SVG_ATTRS])),
  },
  protocols: {
    ...defaultSchema.protocols,
    src: ['http', 'https', 'data'],
    poster: ['http', 'https'],
  },
  // GitHub strips <svg>'s children otherwise
  strip: ['script', 'style'],
};
