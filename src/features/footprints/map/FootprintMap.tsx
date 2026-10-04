import { useState } from 'react';
import { ErrorBoundary } from '@/shared/ui/ErrorBoundary';
import { AmapView } from './AmapView';
import { FallbackMap } from './FallbackMap';
import type { MapViewProps } from './types';

/**
 * Uses AMap (高德) whenever a key is configured. The offline map is only a safety net for
 * network failures, and it offers a one-click retry so visitors get back to the real map.
 */
export function FootprintMap(props: MapViewProps) {
  const [failure, setFailure] = useState<string | null>(null);
  const [attempt, setAttempt] = useState(0);
  const retry = () => {
        setFailure(null);
        setAttempt((a) => a + 1);
      };

  if (failure) return <FallbackMap {...props} reason={failure} onRetry={retry} />;
  return (
    <ErrorBoundary key={attempt} label="地图" fallback={(e) => <FallbackMap {...props} reason={`地图出错：${e.message}`} onRetry={retry} />}>
      <AmapView {...props} onError={(e) => setFailure(`${e.message || '高德地图加载失败'}，暂时显示离线示意图`)} />
    </ErrorBoundary>
  );
}
