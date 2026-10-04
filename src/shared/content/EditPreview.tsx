import { useEffect, useRef } from 'react';
import { useLocation } from 'react-router-dom';
import { parseEditRegion } from '../../contracts/edit-preview';
import { applyPreviewDraft } from './runtime';
import './edit-preview.css';

/** An embedded-only bridge: local drafts and field selection, never API writes. */
export function EditPreview() {
  const { pathname } = useLocation();
  const selected = useRef('');
  useEffect(() => {
    if (new URLSearchParams(window.location.search).get('preview') !== '1' || window.parent === window) return;
    const post = (message: unknown) => window.parent.postMessage(message, window.location.origin);
    const root = document.documentElement;
    root.classList.add('is-editor-preview');
    const hint = document.createElement('div');
    hint.className = 'edit-preview-hint';
    hint.textContent = '点击文字或图片，在右侧修改 · 双击文字可直接输入';
    hint.setAttribute('role', 'status');
    document.body.append(hint);
    const regions: [string, string][] = [['.nav','site:navigation'], ['.nav-player','site:player'], ['.gallery-page .page-head','site:copy'], ['.footprints-page .page-head','site:copy'], ['.essays-page .page-head','site:copy'], ['.fp-map','footprints:'], ['.fp-wishes','wishes:'], ['.article-list','essays:']];
    const annotate = () => {
      for (const [selector, region] of regions) document.querySelectorAll<HTMLElement>(selector).forEach(el => { if (!el.dataset.editRegion) el.dataset.editRegion = region; });
      document.querySelectorAll<HTMLElement>('[data-edit-region]').forEach(el => {
        if (!el.matches('a,button,input,textarea,select,[tabindex]')) el.tabIndex = 0;
        el.classList.toggle('is-preview-selected', el.dataset.editRegion === selected.current);
        if (!el.hasAttribute('title')) el.title = el.dataset.editInline === 'true' ? '点击在右侧修改；双击直接输入；按 F2 直接编辑' : '点击在右侧修改';
      });
    };
    let editing: { element: HTMLElement; original: string; region: string } | null = null;
    const select = (element: HTMLElement) => {
      selected.current = element.dataset.editRegion ?? '';
      annotate();
      post({ type: 'site:edit-region', region: selected.current });
    };
    const finish = (commit: boolean) => {
      if (!editing) return;
      const { element, original, region } = editing;
      const value = element.innerText.replace(/\r\n/g, '\n');
      editing = null;
      element.removeAttribute('contenteditable');
      element.classList.remove('is-preview-editing');
      element.textContent = original;
      const target = parseEditRegion(region);
      if (commit && target && value !== original) post({ type: 'site:edit-value', ...target, value });
      post({ type: 'site:preview-editing', active: false });
      hint.textContent = '点击文字或图片，在右侧修改 · 双击文字可直接输入';
    };
    const begin = (element: HTMLElement) => {
      if (element.dataset.editInline !== 'true' || element.children.length || !parseEditRegion(element.dataset.editRegion)) return;
      if (editing?.element === element) return;
      finish(true);
      select(element);
      editing = { element, original: element.textContent ?? '', region: element.dataset.editRegion ?? '' };
      element.contentEditable = 'plaintext-only';
      element.classList.add('is-preview-editing');
      element.focus();
      const range = document.createRange(); range.selectNodeContents(element);
      const selection = window.getSelection(); selection?.removeAllRanges(); selection?.addRange(range);
      hint.textContent = element.dataset.editMultiline === 'true' ? '正在直接编辑 · Ctrl / ⌘ + Enter 完成 · 点击外部完成 · Esc 取消' : '正在直接编辑 · Enter 完成 · 点击外部完成 · Esc 取消';
      post({ type: 'site:preview-editing', active: true });
    };
    const regionElement = (target: EventTarget | null) => target instanceof Element ? target.closest<HTMLElement>('[data-edit-region]') : null;
    const click = (event: MouseEvent) => {
      const element = regionElement(event.target);
      if (!element || editing?.element === element) return;
      finish(true);
      event.preventDefault(); event.stopPropagation(); select(element);
    };
    const doubleClick = (event: MouseEvent) => {
      const element = regionElement(event.target);
      if (!element) return;
      event.preventDefault(); event.stopPropagation(); begin(element);
    };
    const keydown = (event: KeyboardEvent) => {
      if (editing && regionElement(event.target) === editing.element) {
        if (event.key === 'Escape') { event.preventDefault(); event.stopPropagation(); finish(false); }
        else if (event.key === 'Enter' && (editing.element.dataset.editMultiline !== 'true' || event.ctrlKey || event.metaKey)) { event.preventDefault(); event.stopPropagation(); finish(true); }
        return;
      }
      const element = regionElement(event.target);
      if (!element || (event.key !== 'Enter' && event.key !== ' ' && event.key !== 'F2')) return;
      event.preventDefault(); event.stopPropagation();
      if (event.key === 'F2') begin(element); else select(element);
    };
    const blur = (event: FocusEvent) => { if (editing?.element === event.target) finish(true); };
    const message = (event: MessageEvent) => {
      if (event.source !== window.parent || event.origin !== window.location.origin || !event.data || typeof event.data !== 'object') return;
      if (event.data.type === 'site:preview-draft') { if (!editing) applyPreviewDraft(event.data.site, event.data.profile); }
      else if (event.data.type === 'site:preview-select' && parseEditRegion(event.data.region)) {
        selected.current = event.data.region;
        annotate();
        const element = [...document.querySelectorAll<HTMLElement>('[data-edit-region]')].find(el => el.dataset.editRegion === selected.current);
        element?.scrollIntoView({ block: 'center', behavior: 'smooth' });
      }
    };
    annotate();
    const observer = new MutationObserver(annotate);
    observer.observe(document.getElementById('root') ?? document.body, { subtree: true, childList: true, attributes: true, attributeFilter: ['data-edit-region'] });
    document.addEventListener('click', click, true);
    document.addEventListener('dblclick', doubleClick, true);
    document.addEventListener('keydown', keydown, true);
    document.addEventListener('blur', blur, true);
    window.addEventListener('message', message);
    post({ type: 'site:preview-ready' });
    return () => {
      finish(false);
      observer.disconnect(); hint.remove(); root.classList.remove('is-editor-preview');
      document.removeEventListener('click', click, true);
      document.removeEventListener('dblclick', doubleClick, true);
      document.removeEventListener('keydown', keydown, true);
      document.removeEventListener('blur', blur, true);
      window.removeEventListener('message', message);
    };
  // Public refreshes must not tear down an active inline edit. The observer handles DOM updates.
  }, [pathname]);
  return null;
}
