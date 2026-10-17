import type { Metadata } from "next";
import InspoWorkspace from "./InspoWorkspace";
import { chatGPTSignInPath, getChatGPTUser } from "./chatgpt-auth";

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "InspoAtlas 灵感图谱",
  description: "把零散灵感变成可搜索、可关联、可复用的设计资产。",
};

export default async function Home() {
  const user = await getChatGPTUser();
  if (!user && process.env.NODE_ENV === "production") return <main className="signin-screen"><div className="signin-art" aria-hidden="true"><img src="/inspo-sprite.png" alt="" /></div><section><span className="modal-kicker">InspoAtlas · 个人灵感空间</span><h1>每个灵感，都有自己的位置。</h1><p>登录后创建独立作品。每件作品是一张画布，你的参考、连线和设计方案都会随作品保存。</p><a className="button primary" href={chatGPTSignInPath("/")} target="_top">登录并开始创作 <span aria-hidden="true">↗</span></a><small>使用 ChatGPT 账号登录</small></section></main>;
  return <InspoWorkspace />;
}
