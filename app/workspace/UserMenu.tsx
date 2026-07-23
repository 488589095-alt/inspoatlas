"use client";

import { useEffect, useRef, useState } from "react";

type SessionUser = {
  id: string;
  email: string;
  displayName: string;
  initials: string;
};

export function UserMenu() {
  const [user, setUser] = useState<SessionUser | null>(null);
  const [open, setOpen] = useState(false);
  const root = useRef<HTMLDivElement>(null);

  useEffect(() => {
    fetch("/api/session", { cache: "no-store" })
      .then(async (response) => response.ok ? response.json() : null)
      .then((payload) => setUser(payload?.user ?? null))
      .catch(() => setUser(null));
  }, []);

  useEffect(() => {
    if (!open) return;
    const close = (event: PointerEvent) => {
      if (!root.current?.contains(event.target as Node)) setOpen(false);
    };
    window.addEventListener("pointerdown", close);
    return () => window.removeEventListener("pointerdown", close);
  }, [open]);

  return (
    <div className="user-menu" ref={root}>
      <button
        className="user-trigger"
        onClick={() => setOpen((value) => !value)}
        aria-label="账号与空间"
        aria-expanded={open}
      >
        <span>{user?.initials || "··"}</span>
      </button>
      {open && (
        <section className="user-popover">
          <header>
            <span>{user?.initials || "IA"}</span>
            <div><strong>{user?.displayName || "InspoAtlas 用户"}</strong><small>{user?.email || "正在读取账号…"}</small></div>
          </header>
          <div className="account-status"><i />私人空间 · 邀请制 Beta</div>
          <p>画布、素材和 AI 凭据只归当前账号所有。</p>
          <a href="/signout-with-chatgpt?return_to=/">退出登录</a>
        </section>
      )}
    </div>
  );
}
