"use client";

import { useState, type FormEvent } from "react";

export default function LoginPage() {
  const [email, setEmail] = useState("");
  const [code, setCode] = useState("");
  const [sent, setSent] = useState(false);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setBusy(true);
    setMessage("");
    try {
      const response = await fetch(sent ? "/api/auth/email/verify" : "/api/auth/email/start", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(sent ? { email, code } : { email }),
      });
      const result = await response.json() as { error?: string };
      if (!response.ok) throw new Error(result.error || "操作失败，请重试");
      if (sent) window.location.assign("/");
      else { setSent(true); setMessage("验证码已发送，10 分钟内有效。请查看收件箱。"); }
    } catch (error) { setMessage(error instanceof Error ? error.message : "操作失败，请重试"); }
    finally { setBusy(false); }
  }

  return <main className="signin-screen"><div className="signin-art" aria-hidden="true"><img src="/inspo-sprite.png" alt="" /></div><section className="email-login"><span className="modal-kicker">InspoAtlas · 个人灵感空间</span><h1>回到你的灵感空间。</h1><p>使用原账号的邮箱登录，原有作品会归入同一空间。</p><form onSubmit={submit}>
    <label htmlFor="login-email">邮箱地址</label>
    <input id="login-email" type="email" autoComplete="email" required value={email} disabled={sent || busy} onChange={(event) => setEmail(event.target.value)} placeholder="you@example.com" />
    {sent && <><label htmlFor="login-code">六位验证码</label><input id="login-code" type="text" inputMode="numeric" autoComplete="one-time-code" pattern="[0-9]{6}" maxLength={6} required value={code} disabled={busy} onChange={(event) => setCode(event.target.value.replace(/\D/g, ""))} placeholder="000000" /></>}
    <button className="button primary" type="submit" disabled={busy}>{busy ? "请稍候…" : sent ? "验证并登录 ↗" : "发送验证码 ↗"}</button>
  </form>{message && <p role="status" className="email-login-message">{message}</p>}{sent && <button className="email-login-restart" type="button" onClick={() => { setSent(false); setCode(""); setMessage(""); }}>换个邮箱或重新获取验证码</button>}<a className="signin-secondary" href="/">返回首页</a></section></main>;
}
