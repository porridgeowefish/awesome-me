import { useEffect } from 'react';
import { useSiteContent } from '@/shared/content/runtime';

export function useDocumentTitle(title?: string): void {
  const { settings: site } = useSiteContent();
  useEffect(() => {
    document.title = title ? `${title} · ${site.name}` : `${site.name} · ${site.tagline}`;
  }, [title, site.name, site.tagline]);
}
