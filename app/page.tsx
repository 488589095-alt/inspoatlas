import type { Metadata } from "next";
import InspoWorkspace from "./InspoWorkspace";

export const metadata: Metadata = {
  title: "InspoAtlas 灵感图谱",
  description: "把零散灵感变成可搜索、可关联、可复用的设计资产。",
};

export default function Home() {
  return <InspoWorkspace />;
}

