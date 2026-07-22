export const exportPurposeOptions = [
  { id: "web-rebuild", icon: "⌘", title: "AI 复刻网页 / UI", description: "把结构与视觉规范拆开，让 AI 先预检、映射，再实现和 QA。", files: "DESIGN.md · 复刻提示词 · Tokens · QA" },
  { id: "visual-remix", icon: "◉", title: "图片 / 品牌延展", description: "输出构图、材质、光线、色彩和负面约束，不把网页代码混进来。", files: "反推提示词 · 变体 · 负面词 · 色板" },
  { id: "campaign-system", icon: "▦", title: "批量活动页系统", description: "沉淀一套母版规范、内容槽位和组件矩阵，保持一批页面一致。", files: "DESIGN.md · 页面契约 · 内容 Schema · QA" },
  { id: "figma-bridge", icon: "◇", title: "Figma 可编辑导入", description: "由配套插件在当前 Figma 文件中创建变量与组件，不伪造 .fig 文件。", files: "导入 JSON · Tokens · 组件 · 来源" },
] as const;
