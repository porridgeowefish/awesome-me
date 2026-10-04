import { interfaceText, interfaceIcon } from '@/shared/content/interface';
import { useDeferredValue, useMemo, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { useDocumentTitle } from '@/shared/hooks/useDocumentTitle';
import { Icon } from '@/shared/ui/Icon';
import { Empty } from '@/shared/ui/states';
import { ArticleCard } from './ArticleCard';
import { FolderTree } from './FolderTree';
import { essayRepository } from './essayRepository';
import './essays.css';
import { useSiteContent } from '@/shared/content/runtime';

export default function EssaysPage() {
  const { revision, copy } = useSiteContent();
  useDocumentTitle(copy('essays.title'));
  // Folder + query live in the URL → shareable links and working back button.
  const [params, setParams] = useSearchParams();
  const folder = params.get('folder') ?? '';
  const query = params.get('q') ?? '';
  const deferredQuery = useDeferredValue(query);
  const [treeOpen, setTreeOpen] = useState(false); // mobile only: the tree collapses behind a toggle

  const tree = essayRepository.tree();
  const list = useMemo(() => essayRepository.search(essayRepository.inFolder(folder), deferredQuery), [folder, deferredQuery, revision]);

  const update = (next: { folder?: string; q?: string }) => {
    const p = new URLSearchParams(params);
    for (const [k, v] of Object.entries(next)) {
      if (v) p.set(k, v);
      else p.delete(k);
    }
    setParams(p, { replace: 'q' in next });
  };

  const featured = essayRepository.featured();
  const showFeatured = !folder && !query && list.length > 2 && !!featured;
  const rest = showFeatured ? list.filter((e) => e !== featured) : list;

  return (
    <div className="page essays-page fade-in">
      <div className="page-head">
        <div>
          <div className="eyebrow">{copy('essays.eyebrow')}</div>
          <h1>{copy('essays.title')}</h1>
        </div>
        <label className="essay-search">
          <Icon name={interfaceIcon("essayspage.search.0","search")} size={16} />
          <input type="search" placeholder={copy('essays.search')} value={query} onChange={(e) => update({ q: e.target.value })} aria-label={interfaceText("搜索随笔")} />
        </label>
      </div>

      <div className="essays-layout">
        <aside className={`essays-aside card ${treeOpen ? 'open' : ''}`}>
          <button className="tree-toggle" onClick={() => setTreeOpen((o) => !o)} aria-expanded={treeOpen}>
            <Icon name={interfaceIcon("essayspage.folder.1","folder")} size={16} />
            {copy('essays.directory')}
            <span className="muted">{folder ? folder.split('/').pop() : '全部'}</span>
            <Icon name={treeOpen ? 'up' : 'down'} size={16} />
          </button>
          <FolderTree
            tree={tree}
            selected={folder}
            onSelect={(f) => {
              update({ folder: f });
              setTreeOpen(false);
            }}
          />
        </aside>

        <section className="essays-list">
          <div className="essays-list-head">
            <span role="status">
              {folder ? folder.split('/').join(' / ') : copy('essays.all')} {interfaceText("·")}{list.length} {interfaceText("篇")}</span>
            {(folder || query) && (
              <button className="btn" onClick={() => setParams(new URLSearchParams())}>
                {copy('essays.clear')}
              </button>
            )}
          </div>
          {list.length === 0 ? (
            <div className="card">
              <Empty icon="search" title={interfaceText("没有找到相关文章")}>
                {interfaceText("换个关键词，或者在左侧选择其它分类。")}</Empty>
            </div>
          ) : (
            <div className="article-list">
              {showFeatured ? (
                <>
                  <ArticleCard essay={featured!} featured />
                  {rest.map((e) => (
                    <ArticleCard key={e.id} essay={e} />
                  ))}
                </>
              ) : (
                list.map((e) => <ArticleCard key={e.id} essay={e} />)
              )}
            </div>
          )}
        </section>
      </div>
    </div>
  );
}
