import { useEffect, useId, useRef, useState, type ReactNode } from 'react';
import { publicUrl } from '@/shared/lib/url';
import { assetPreviewKind, assetPurposeLabel, formatAssetBytes, type LibraryAsset } from './media-library';

export function AssetDialog({ title, children, onClose, busy = false, confirmation = false }: {
  title: string; children: ReactNode; onClose: () => void; busy?: boolean; confirmation?: boolean;
}) {
  const dialog = useRef<HTMLDialogElement>(null), headingId = useId();
  useEffect(() => { const element = dialog.current; element?.showModal(); return () => { element?.close(); }; }, []);
  return <dialog ref={dialog} className={`admin-asset-dialog${confirmation ? ' is-confirmation' : ''}`} aria-labelledby={headingId}
    onCancel={event => { event.preventDefault(); if (!busy) onClose(); }}>
    <div className="admin-asset-detail-header"><h2 id={headingId}>{title}</h2><button type="button" className="btn" disabled={busy} onClick={onClose} aria-label="关闭素材详情">关闭</button></div>{children}
  </dialog>;
}
export function MediaAssetDetails({ asset, onClose, onDelete }: { asset: LibraryAsset; onClose: () => void; onDelete: () => void }) {
  const [copyMessage, setCopyMessage] = useState('');
  const kind = assetPreviewKind(asset), image = asset.variants.large ?? asset.variants.thumb;
  async function copy(url: string) {
    try { await navigator.clipboard.writeText(new URL(publicUrl(url), window.location.href).href); setCopyMessage('已复制完整地址。'); }
    catch { setCopyMessage('复制未完成，可以在地址框中选择并复制。'); }
  }
  return <AssetDialog title={asset.filename} onClose={onClose}>
    <div className="admin-asset-preview-large">{kind === 'image' && image ? <img src={publicUrl(image)} alt={asset.filename} /> : kind === 'audio' && asset.variants.original ? <audio controls preload="none" src={publicUrl(asset.variants.original)} /> : <div className="admin-asset-file-icon"><strong>{kind === 'pdf' ? 'PDF' : '文件'}</strong><p>{kind === 'pdf' ? '下载原文件查看简历。' : '此文件暂无在线预览。'}</p></div>}</div>
    <dl className="admin-asset-metadata">
      <div><dt>用途</dt><dd>{assetPurposeLabel(asset.purpose)}</dd></div><div><dt>原文件大小</dt><dd>{formatAssetBytes(asset.size)}</dd></div><div><dt>上传时间</dt><dd>{new Date(asset.createdAt).toLocaleString('zh-CN')}</dd></div>
      {asset.width && asset.height ? <div><dt>图片尺寸</dt><dd>{asset.width} × {asset.height}</dd></div> : null}
      {asset.originalContentType || asset.contentType ? <div><dt>文件格式</dt><dd>{asset.originalContentType ?? asset.contentType}</dd></div> : null}
      {asset.capturedAt && <div><dt>拍摄时间</dt><dd>{new Date(asset.capturedAt).toLocaleString('zh-CN')}</dd></div>}
      <div><dt>素材 ID</dt><dd>{asset.id}</dd></div>{asset.checksum && <div><dt>SHA-256</dt><dd>{asset.checksum}</dd></div>}
    </dl>
    {asset.warnings.length > 0 && <p className="admin-notice">{asset.warnings.join('；')}</p>}
    <div className="admin-asset-urls">{Object.entries(asset.variants).map(([variant, url]) => <div className="admin-asset-url-row" key={variant}><label>{variant === 'large' ? '展示图地址' : variant === 'thumb' ? '缩略图地址' : variant === 'original' ? '原文件地址' : variant}<input readOnly value={url} onFocus={event => event.currentTarget.select()} /></label><button type="button" className="btn" onClick={() => void copy(url)}>复制地址</button></div>)}</div>
    {copyMessage && <p role="status" className="muted">{copyMessage}</p>}
    <p className="muted admin-asset-access-note">上传本身不会公开素材。将地址保存到已公开内容后，对应展示版本才可供访客访问；图片原文件仅供站主管理访问。</p>
    <div className="admin-asset-detail-footer admin-actions">{image && <a className="btn" href={publicUrl(image)} target="_blank" rel="noopener noreferrer">打开展示图</a>}{asset.variants.original && <a className="btn" href={publicUrl(asset.variants.original)} download={asset.filename}>下载原文件</a>}<button type="button" className="btn btn-danger" onClick={onDelete}>删除素材</button></div>
  </AssetDialog>;
}
