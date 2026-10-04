import { interfaceText, interfaceIcon } from '@/shared/content/interface';
import { useState } from 'react';
import type { FolderNode } from '@/shared/content/types';
import { Icon } from '@/shared/ui/Icon';
import { useSiteContent } from '@/shared/content/runtime';

interface Props {
  tree: FolderNode;
  selected: string;
  onSelect: (path: string) => void;
}

/** Collapsible folder tree (left column of 随笔). */
export function FolderTree({ tree, selected, onSelect }: Props) {
  const {copy}=useSiteContent();
  const [open, setOpen] = useState<Set<string>>(() => {
    // top-level folders and the ancestors of the current selection start expanded
    const s = new Set(tree.children.map((c) => c.path));
    selected.split('/').forEach((_, i, arr) => s.add(arr.slice(0, i + 1).join('/')));
    return s;
  });

  const toggle = (path: string) =>
    setOpen((prev) => {
      const next = new Set(prev);
      if (next.has(path)) next.delete(path);
      else next.add(path);
      return next;
    });

  const renderNode = (node: FolderNode, depth: number) => {
    const hasChildren = node.children.length > 0;
    const isOpen = open.has(node.path);
    const active = selected === node.path;
    return (
      <li key={node.path || 'root'}>
        <div className={`tree-row ${active ? 'active' : ''}`} style={{ paddingLeft: 8 + depth * 14 }}>
          {hasChildren ? (
            <button className="tree-chevron" onClick={() => toggle(node.path)} aria-expanded={isOpen} aria-label={isOpen ? `${interfaceText("收起")} ${node.name}` : `${interfaceText("展开")} ${node.name}`}>
              <Icon name={isOpen ? interfaceIcon('folder.collapse','down') : interfaceIcon('folder.expand','right')} size={14} />
            </button>
          ) : (
            <span className="tree-chevron" aria-hidden />
          )}
          <button className="tree-label" onClick={() => onSelect(node.path)} aria-current={active ? 'true' : undefined}>
            <Icon name={node.path === '' ? interfaceIcon('folder.root','list') : isOpen && hasChildren ? interfaceIcon('folder.open','folderOpen') : interfaceIcon('folder.closed','folder')} size={16} />
            <span className="tree-name">{node.name}</span>
            <span className="tree-count">{node.count}</span>
          </button>
        </div>
        {hasChildren && isOpen && <ul>{node.children.map((c) => renderNode(c, depth + 1))}</ul>}
      </li>
    );
  };

  return (
    <ul className="tree" aria-label={interfaceText("随笔目录")}>
      {renderNode({ ...tree, name:copy('essays.all'), children: [] }, 0)}
      {tree.children.map((c) => renderNode(c, 0))}
    </ul>
  );
}
