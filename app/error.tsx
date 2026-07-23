"use client";

import { useEffect } from "react";
import "./runtime-error.css";

export default function WorkspaceError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    const payload = JSON.stringify({
      message: error.message.slice(0, 1_000),
      digest: error.digest,
      path: window.location.pathname,
    });
    navigator.sendBeacon("/api/client-errors", new Blob([payload], { type: "application/json" }));
  }, [error]);

  return (
    <main className="runtime-error">
      <section>
        <span>!</span>
        <h1>工作台没有正确载入</h1>
        <p>你的画布数据没有丢失。请重新载入界面；如果仍然失败，错误信息会自动记录用于修复。</p>
        <div>
          <button onClick={reset}>重新载入</button>
          <button onClick={() => window.location.reload()}>刷新页面</button>
        </div>
        <small>{error.message || "未知的界面错误"}</small>
      </section>
    </main>
  );
}
