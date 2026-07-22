import { defineConfig } from "wxt";

export default defineConfig({
  manifest: {
    name: "InspoAtlas 灵感采集",
    description: "主动采集当前网页的全页视觉、正文和关键样式。",
    permissions: ["activeTab", "scripting", "storage"],
    host_permissions: ["http://localhost:3000/*", "https://*.inspoatlas.app/*"],
  },
});

