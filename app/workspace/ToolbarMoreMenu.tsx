"use client";

import { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { WorkspaceIcon } from "./WorkspaceIcon";

export function ToolbarMoreMenu({ onUpload, onNote, onGroup, linkMode, onLink }: { onUpload(): void; onNote(): void; onGroup(): void; linkMode: boolean; onLink(): void }) {
  const [open, setOpen] = useState(false);
  const triggerRef = useRef<HTMLButtonElement>(null);
  const menuRef = useRef<HTMLDivElement>(null);
  const [position, setPosition] = useState({ top: 0, left: 0 });

  useEffect(() => {
    if (!open) return;
    const place = () => {
      const trigger = triggerRef.current; const menu = menuRef.current; if (!trigger || !menu) return;
      const rect = trigger.getBoundingClientRect(); const menuRect = menu.getBoundingClientRect(); const padding = 10;
      const enoughAbove = rect.top - menuRect.height - padding >= padding;
      const top = enoughAbove ? rect.top - menuRect.height - padding : Math.min(window.innerHeight - menuRect.height - padding, rect.bottom + padding);
      const left = Math.min(window.innerWidth - menuRect.width - padding, Math.max(padding, rect.right - menuRect.width));
      setPosition({ top, left });
    };
    const outside = (event: MouseEvent) => { if (!menuRef.current?.contains(event.target as Node) && !triggerRef.current?.contains(event.target as Node)) setOpen(false); };
    const escape = (event: KeyboardEvent) => { if (event.key === "Escape") { setOpen(false); triggerRef.current?.focus(); } };
    requestAnimationFrame(place); window.addEventListener("resize", place); window.addEventListener("scroll", place, true); document.addEventListener("mousedown", outside); document.addEventListener("keydown", escape);
    return () => { window.removeEventListener("resize", place); window.removeEventListener("scroll", place, true); document.removeEventListener("mousedown", outside); document.removeEventListener("keydown", escape); };
  }, [open]);

  const run = (callback: () => void) => { callback(); setOpen(false); };
  return <>
    <button ref={triggerRef} className={open ? "is-active" : ""} onClick={() => setOpen((value) => !value)} aria-expanded={open} aria-haspopup="menu" title="更多画布操作"><WorkspaceIcon name="note" /><small>更多</small></button>
    {open && typeof document !== "undefined" && createPortal(<div ref={menuRef} className="toolbar-more-popover" role="menu" style={{ top: position.top, left: position.left }}>
      <button autoFocus role="menuitem" onClick={() => run(onUpload)}><WorkspaceIcon name="upload" />上传图片</button>
      <button role="menuitem" onClick={() => run(onNote)}><WorkspaceIcon name="note" />新建备注</button>
      <button role="menuitem" onClick={() => run(onGroup)}><WorkspaceIcon name="folder" />新建分组</button>
      <button role="menuitem" className={linkMode ? "is-active" : ""} onClick={() => run(onLink)}><WorkspaceIcon name="connect" />{linkMode ? "完成连线" : "连接卡片"}</button>
    </div>, document.body)}
  </>;
}
