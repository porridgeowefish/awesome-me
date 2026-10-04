import { publicUrl } from '@/shared/lib/url';
import { useSiteContent } from '@/shared/content/runtime';

/**
 * Registry of brand marks. `mono` marks are single-colour SVGs that should follow the
 * text colour (rendered through a CSS mask); colour marks are shown as-is.
 */
export type BrandName = string;

export function BrandIcon({ name, size = 18, className }: { name: BrandName; size?: number; className?: string }) {
  const { brands } = useSiteContent();
  const brand = brands[name];
  if (!brand) return null;
  const width = 'ratio' in brand ? Math.round(size * brand.ratio) : size;
  const url = publicUrl(brand.file);
  if (brand.mono) {
    return (
      <span
        role="img"
        aria-label={brand.label}
        className={className}
        style={{
          display: 'inline-block',
          width,
          height: size,
          backgroundColor: 'currentColor',
          WebkitMask: `url("${url}") center / contain no-repeat`,
          mask: `url("${url}") center / contain no-repeat`,
          flex: 'none',
        }}
      />
    );
  }
  return <img src={url} alt={brand.label} width={width} height={size} className={className} style={{ flex: 'none' }} loading="lazy" />;
}

