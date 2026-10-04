import { interfaceText, interfaceIcon } from '@/shared/content/interface';
import { useCallback, useEffect, useMemo, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import type { EssayMeta } from '@/shared/content/types';
import { useDocumentTitle } from '@/shared/hooks/useDocumentTitle';
import { MarkdownRenderer } from '@/shared/markdown/MarkdownRenderer';
import type { TocItem } from '@/shared/markdown/slug';
import { formatDate } from '@/shared/lib/format';
import { ErrorBoundary } from '@/shared/ui/ErrorBoundary';
import { Icon } from '@/shared/ui/Icon';
import { Empty, Loading } from '@/shared/ui/states';
import { essayHref, essayRepository, essayRouteResolver } from './essayRepository';
import { TableOfContents } from './TableOfContents';
import { ReadingProgress } from './ReadingProgress';
import './essays.css';
import { useSiteContent } from '@/shared/content/runtime';

type Load = { status: 'loading' } | { status: 'ready'; body: string } | { status: 'error'; message: string };

/** Route entry: keyed by id so switching essays starts from a clean state (no stale body/basePath frame). */
export default function EssayReaderRoute() {
  const { revision } = useSiteContent();
  const id = useParams()['*'] ?? '';
  const meta = essayRepository.get(id);
  useDocumentTitle(meta?.title ?? '随笔');
  if (!meta) {
    return (
      <div className="page">
        <div className="card">
          <Empty icon="file" title={interfaceText("这篇文章不存在或已被移动")}>
            <Link to="/essays">{interfaceText("回到随笔列表")}</Link>
          </Empty>
        </div>
      </div>
    );
  }
  return <EssayReader key={`${revision}:${meta.id}`} meta={meta} />;
}

function EssayReader({ meta }: { meta: EssayMeta }) {
  const [load, setLoad] = useState<Load>({ status: 'loading' });
  const [attempt, setAttempt] = useState(0);
  const [toc, setToc] = useState<TocItem[]>([]);
  const resolveRoute = useMemo(() => essayRouteResolver(meta), [meta]);
  const onToc = useCallback((items: TocItem[]) => setToc(items), []);

  useEffect(() => {
    let alive = true;
    setLoad({ status: 'loading' });
    essayRepository
      .body(meta)
      .then((body) => alive && setLoad({ status: 'ready', body }))
      .catch((err: Error) => alive && setLoad({ status: 'error', message: err.message }));
    return () => {
      alive = false;
    };
  }, [meta, attempt]);

  const { prev, next } = essayRepository.neighbours(meta.id);

  return (
    <div className="page reader-page">
      <ReadingProgress />
      <div className="reader-layout">
        <article className="reader card fade-in">
          <header className="reader-head">
            <nav className="reader-crumbs" aria-label={interfaceText("面包屑")}>
              <Link to="/essays">{interfaceText("随笔")}</Link>
              {meta.folder.map((f, i) => (
                <span key={i}>
                  <Icon name={interfaceIcon("essayreader.right.0","right")} size={12} />
                  <Link to={`/essays?folder=${encodeURIComponent(meta.folder.slice(0, i + 1).join('/'))}`}>{f}</Link>
                </span>
              ))}
            </nav>
            <h1>{meta.title}</h1>
            {meta.subtitle && <p className="reader-subtitle">{meta.subtitle}</p>}
            <div className="reader-meta">
              <span>
                <Icon name={interfaceIcon("essayreader.calendar.1","calendar")} size={15} /> {formatDate(meta.date)}
              </span>
              <span>
                <Icon name={interfaceIcon("essayreader.clock.2","clock")} size={15} /> {meta.wordCount.toLocaleString()} {interfaceText("字 · 约")}{meta.readingMinutes} {interfaceText("分钟")}</span>
              {meta.tags.map((t) => (
                <span key={t} className="chip">
                  {t}
                </span>
              ))}
            </div>
          </header>

          {load.status === 'loading' && <Loading label="正在展开文章" />}
          {load.status === 'error' && (
            <div className="card">
              <Empty icon="file" title={interfaceText("文章没能加载出来")}>
                {load.message}
                <br />
                <button className="btn" style={{ marginTop: 12 }} onClick={() => setAttempt((a) => a + 1)}>
                  {interfaceText("重试")}</button>
              </Empty>
            </div>
          )}
          {load.status === 'ready' && (
            <ErrorBoundary label="文章渲染">
              <MarkdownRenderer source={load.body} basePath={meta.bodyUrl} needsMath={meta.features.math} resolveRoute={resolveRoute} onToc={onToc} />
            </ErrorBoundary>
          )}

          <footer className="reader-foot">
            {prev ? (
              <Link to={essayHref(prev)} className="reader-nav">
                <span>{interfaceText("上一篇")}</span>
                <strong>{prev.title}</strong>
              </Link>
            ) : (
              <span />
            )}
            {next && (
              <Link to={essayHref(next)} className="reader-nav next">
                <span>{interfaceText("下一篇")}</span>
                <strong>{next.title}</strong>
              </Link>
            )}
          </footer>
        </article>
        {toc.length > 2 && <TableOfContents items={toc} />}
      </div>
    </div>
  );
}
