export type ProductionGoal = "recreate" | "explore" | "scale";
export type ExportDestination = "figma-design" | "coding-ai" | "image-ai" | "figma-make" | "figma-buzz";
export type ExportPurpose = "web-rebuild" | "visual-remix" | "campaign-system" | "figma-bridge";

export const productionGoalOptions: Array<{
  id: ProductionGoal;
  step: string;
  title: string;
  description: string;
}> = [
  {
    id: "recreate",
    step: "01",
    title: "复现参考设计",
    description: "目标已经比较明确，尽量保留参考的结构和视觉规律。",
  },
  {
    id: "explore",
    step: "02",
    title: "生成一个新方向",
    description: "借用喜欢的感觉，但根据新目标重新设计，不照搬原作品。",
  },
  {
    id: "scale",
    step: "03",
    title: "建立批量生产系统",
    description: "固定模板和规则，只替换每次活动的内容、图片和少量主题元素。",
  },
];

export const exportDestinationsByGoal: Record<ProductionGoal, Array<{
  id: ExportDestination;
  purpose: ExportPurpose;
  icon: string;
  title: string;
  description: string;
  deliverable: string;
  action: string;
  nextStep: string;
  recommended?: boolean;
  glossary?: { term: string; explanation: string };
}>> = {
  recreate: [
    {
      id: "figma-design",
      purpose: "figma-bridge",
      icon: "◇",
      title: "在 Figma 里继续编辑",
      description: "下载一张可编辑画板，直接拖进 Figma，不用先装插件。",
      deliverable: "可编辑 Figma 画板（SVG）",
      action: "下载可编辑画板",
      nextStep: "把下载的 SVG 直接拖进 Figma；文字、色块和图形都可以继续编辑。",
      recommended: true,
    },
    {
      id: "coding-ai",
      purpose: "web-rebuild",
      icon: "⌘",
      title: "交给 AI 做网页 / UI",
      description: "生成结构、设计规范、实现提示词和两轮检查清单。",
      deliverable: "编码 AI 任务",
      action: "生成编码任务",
      nextStep: "打开“使用说明.txt”，把 COPY_TO_AI.txt 交给 Codex、Claude Code 或 Cursor。",
    },
  ],
  explore: [
    {
      id: "image-ai",
      purpose: "visual-remix",
      icon: "◉",
      title: "交给图片 AI 出方向",
      description: "根据目标重写构图、材质、光线和色彩提示词，并保留禁止项。",
      deliverable: "图片生成任务",
      action: "生成图片任务",
      nextStep: "从保守、同风格新构图、系列延展三个方向开始抽卡。",
      recommended: true,
    },
    {
      id: "coding-ai",
      purpose: "web-rebuild",
      icon: "⌘",
      title: "交给 AI 做新网页 / UI",
      description: "参考视觉语言，但用你的新目标重新组织页面，而不是机械照抄。",
      deliverable: "新方案编码任务",
      action: "生成新方案任务",
      nextStep: "先让编码 AI 输出结构提案，确认后再进入实现。",
    },
    {
      id: "figma-make",
      purpose: "web-rebuild",
      icon: "✦",
      title: "交给 Figma Make 探索",
      description: "输出可复制的设计规则和生成说明，适合在 Figma Make 中快速试方向。",
      deliverable: "Figma Make 指南",
      action: "准备 Make 任务",
      nextStep: "在 Figma Make 新建文件，粘贴包内的 Make 指南并添加参考图。",
      glossary: {
        term: "什么是 Figma Make？",
        explanation: "它是 Figma 里的 AI 生成工具，可以根据文字、参考设计和设计系统快速生成可交互界面。",
      },
    },
  ],
  scale: [
    {
      id: "figma-design",
      purpose: "campaign-system",
      icon: "▦",
      title: "在 Figma 建立可复用模板",
      description: "先下载模板画板直接拖进 Figma，再按需要升级为 Variables 和正式组件。",
      deliverable: "可编辑模板画板（SVG）",
      action: "下载模板画板",
      nextStep: "把 SVG 拖进 Figma，先确认版式和内容区；需要正式组件时再下载完整导入包。",
      recommended: true,
      glossary: {
        term: "什么是可替换内容区（Slots）？",
        explanation: "可以把它理解成模板里的“预留位置”：标题区只能换标题，主图区只能换图片，组件位置和设计规则不会被随意破坏。",
      },
    },
    {
      id: "figma-buzz",
      purpose: "campaign-system",
      icon: "⊞",
      title: "批量做海报 / 社媒图",
      description: "为 Figma Buzz 准备字段表，一次生成多张不同文案和图片的物料。",
      deliverable: "Buzz 批量内容表",
      action: "准备批量物料",
      nextStep: "在 Figma Buzz 选择一张模板，上传包内 CSV；如需批量图片则改用 XLSX。",
      glossary: {
        term: "什么是 Figma Buzz？",
        explanation: "它是 Figma 的品牌物料工具，适合用同一模板批量做海报、横幅和社媒图，不是用来设计复杂网页的。",
      },
    },
    {
      id: "coding-ai",
      purpose: "campaign-system",
      icon: "⌘",
      title: "交给 AI 批量做活动页",
      description: "输出固定层、可变层、内容 Schema、页面 Brief 和一致性检查。",
      deliverable: "活动页生产任务",
      action: "生成批量开发任务",
      nextStep: "先实现一张母版，通过 QA 后再批量注入不同活动内容。",
    },
  ],
};
