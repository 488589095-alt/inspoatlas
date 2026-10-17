import type { Metadata } from "next";
import { cookies } from "next/headers";
import InspoWorkspace from "./InspoWorkspace";
import { chatGPTSignInPath, getChatGPTUser } from "./chatgpt-auth";
import { GUEST_COOKIE_NAME, isGuestToken } from "./api/_lib";

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "InspoAtlas 灵感图谱",
  description: "把零散灵感变成可搜索、可关联、可复用的设计资产。",
};

export default async function Home() {
  const user = await getChatGPTUser();
  const guestToken = (await cookies()).get(GUEST_COOKIE_NAME)?.value;
  if (!user && !isGuestToken(guestToken) && process.env.NODE_ENV === "production") return <main className="signin-screen"><div className="signin-art" aria-hidden="true"><img src="/inspo-sprite.png" alt="" /></div><section><span className="modal-kicker">InspoAtlas · 个人灵感空间</span><h1>每个灵感，都有自己的位置。</h1><p>无需登录，先打开一张画布开始整理灵感。访客作品保存在当前浏览器的独立空间中。</p><form action="/api/guest/start" method="post"><button className="button primary" type="submit">免登录开始创作 <span aria-hidden="true">↗</span></button></form><a className="signin-secondary" href={chatGPTSignInPath("/")} target="_top">已有账号？登录后进入个人空间</a></section></main>;
  return <InspoWorkspace />;
}
