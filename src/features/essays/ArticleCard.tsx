import { interfaceText } from '@/shared/content/interface';
import { useState } from 'react';
import { Link } from 'react-router-dom';
import type { EssayMeta } from '@/shared/content/types';
import { formatDate } from '@/shared/lib/format';
import { publicUrl } from '@/shared/lib/url';
import { TitleCover } from './TitleCover';
import { essayHref } from './essayRepository';

/** 公众号式文章卡片：左侧标题与摘要，右侧封面；无封面时用「主题 + 副标题」文字封面。 */
export function ArticleCard({ essay, featured = false }: { essay: EssayMeta; featured?: boolean }) {
  const topic = essay.folder[essay.folder.length - 1] ?? '随笔';
  const [coverFailed, setCoverFailed] = useState(false);
  const cover = essay.cover && !coverFailed ? (
    <img src={publicUrl(essay.cover)} alt="" loading="lazy" decoding="async" onError={() => setCoverFailed(true)} />
  ) : (
    <TitleCover topic={topic} title={essay.title} subtitle={essay.subtitle} size={featured ? 'lg' : 'sm'} />
  );
  return (
    <Link to={essayHref(essay)} className={`article-card ${featured ? 'featured' : ''}`}>
      <div className="article-cover">{cover}</div>
      <div className="article-body">
        <span className="article-topic">{essay.folder.join(' / ') || '随笔'}</span>
        <h3 className="article-title">{essay.title}</h3>
        {essay.subtitle && featured && <p className="article-subtitle">{essay.subtitle}</p>}
        <p className="article-summary">{essay.summary}</p>
        <div className="article-meta">
          <time dateTime={essay.date}>{formatDate(essay.date)}</time>
          <span>{interfaceText("·")}{essay.readingMinutes} {interfaceText("分钟")}</span>
          {essay.features.mermaid && <span className="article-flag">{interfaceText("图解")}</span>}
          {essay.tags.slice(0, featured ? 4 : 2).map((t) => (
            <span key={t} className="chip">
              {t}
            </span>
          ))}
        </div>
      </div>
    </Link>
  );
}
