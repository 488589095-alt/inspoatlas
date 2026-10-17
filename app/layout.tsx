import type { Metadata } from "next";
import { headers } from "next/headers";
import "./globals.css";

export async function generateMetadata(): Promise<Metadata> {
  const requestHeaders = await headers();
  const host = requestHeaders.get("x-forwarded-host") ?? requestHeaders.get("host") ?? "localhost:3000";
  const protocol = requestHeaders.get("x-forwarded-proto") ?? (host.startsWith("localhost") ? "http" : "https");
  const metadataBase = new URL(`${protocol}://${host}`);
  return {
    metadataBase,
    title: { default: "InspoAtlas 灵感图谱", template: "%s · InspoAtlas" },
    description: "面向 UI/产品设计师的 AI 灵感工作台。",
    icons: { icon: "/inspo-sprite.png", shortcut: "/inspo-sprite.png" },
    openGraph: {
      type: "website", locale: "zh_CN", siteName: "InspoAtlas 灵感图谱",
      title: "InspoAtlas 灵感图谱", description: "让零散灵感，变成可复用的设计语言。",
      images: [{ url: "/og.png", width: 1200, height: 630, alt: "InspoAtlas 灵感图谱产品预览" }],
    },
    twitter: { card: "summary_large_image", title: "InspoAtlas 灵感图谱", description: "让零散灵感，变成可复用的设计语言。", images: ["/og.png"] },
  };
}

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return <html lang="zh-CN" className="theme-light-root"><body>{children}</body></html>;
}

