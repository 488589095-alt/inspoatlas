"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";

type SessionUser = {
  id: string;
  email: string;
  displayName: string;
  initials: string;
  kind: "guest" | "account";
};

type PersonalSpace = {
  boardCount: number;
  assetCount: number;
  recentBoards: Array<{ id: string; title: string; updatedAt: string }>;
};

type SessionPayload = { user?: SessionUser; space?: PersonalSpace };

export function UserMenu() {
  const [session, setSession] = useState<SessionPayload | null>(null);
  const [open, setOpen] = useState(false);
  const root = useRef<HTMLDivElement>(null);
  const user = session?.user ?? null;
  const space = session?.space;

  useEffect(() => {
    fetch("/api/session", { cache: "no-store" })
      .then(async (response) => response.ok ? response.json() as Promise<SessionPayload> : null)
      .then((payload) => setSession(payload))
      .catch(() => setSession(null));
  }, []);

  useEffect(() => {
    if (!open) return;
    const close = (event: PointerEvent) => {
      if (!root.current?.contains(event.target as Node)) setOpen(false);
    };
    const closeOnEscape = (event: KeyboardEvent) => {
      if (event.key === "Escape") setOpen(false);
    };
    window.addEventListener("pointerdown", close);
    window.addEventListener("keydown", closeOnEscape);
    return () => {
      window.removeEventListener("pointerdown", close);
      window.removeEventListener("keydown", closeOnEscape);
    };
  }, [open]);

  return (
    <div className="user-menu" ref={root}>
      <button className="user-trigger" onClick={() => setOpen((value) => !value)} aria-label="账号与个人空间" aria-expanded={open} aria-haspopup="dialog">
        <span>{user?.initials || "IA"}</span>
      </button>
      {open && (
        <section className="user-popover" role="dialog" aria-label="个人空间">
          {user ? <>
            <header>
              <span>{user.initials}</span>
              <div><strong>{user.displayName}</strong><small>{user.kind === "guest" ? "当前浏览器的独立空间" : user.email}</small></div>
            </header>
            <div className="account-status"><i />{user.kind === "guest" ? "访客空间" : "个人空间"}</div>
            <dl className="space-metrics"><div><dt>作品</dt><dd>{space?.boardCount ?? 0}</dd></div><div><dt>素材</dt><dd>{space?.assetCount ?? 0}</dd></div></dl>
            <section className="recent-boards"><span>最近作品</span>{space?.recentBoards?.length ? space.recentBoards.map((board) => <Link key={board.id} href={`/?board=${encodeURIComponent(board.id)}`} onClick={() => setOpen(false)}>{board.title}</Link>) : <small>还没有作品</small>}</section>
            {user.kind === "guest"
              ? <footer><span>请保留浏览器数据；登录后不会自动转移访客作品。</span><a href="/login" target="_top">登录</a></footer>
              : <footer><span>已登录个人空间</span><form action="/api/auth/logout" method="post"><button type="submit">退出登录</button></form></footer>}
          </> : <>
            <header><span>IA</span><div><strong>登录 InspoAtlas</strong><small>登录后即可创建个人空间</small></div></header>
            <p className="account-empty">你的作品、素材和 AI 使用记录会归入个人空间。</p>
            <footer><a href="/login" target="_top">登录</a></footer>
          </>}
        </section>
      )}
    </div>
  );
}
