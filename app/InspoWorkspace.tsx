"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  addEdge,
  Background,
  BackgroundVariant,
  Connection,
  Controls,
  Edge,
  Handle,
  MiniMap,
  Node,
  NodeProps,
  Position,
  ReactFlow,
  ReactFlowProvider,
  useEdgesState,
  useNodesState,
  useReactFlow,
} from "@xyflow/react";
import { strToU8, zipSync } from "fflate";
import { exportPurposeOptions } from "./exportOptions";
import "@xyflow/react/dist/style.css";
import "./export.css";

type CardKind = "image" | "web" | "text" | "analysis" | "element" | "group";
type ExportPurpose = "web-rebuild" | "visual-remix" | "campaign-system" | "figma-bridge";
type CardData = Record<string, unknown> & {
  kind: CardKind;
  title: string;
  body?: string;
  imageUrl?: string;
  sourceUrl?: string;
  tags?: string[];
  colors?: string[];
  status?: string;
  sourceAssetId?: string;
  sourceTitle?: string;
  regions?: Array<{ id: string; label: string; type: string; confirmed?: boolean }>;
};

const photoA = "https://images.unsplash.com/photo-1560807707-8cc77767d783?auto=format&fit=crop&w=900&q=85";

const seedNodes: Node<CardData>[] = [
  { id: "group-1", type: "inspo", position: { x: -60, y: -70 }, data: { kind: "group", title: "产品主视觉", body: "参考 → 分析 → 可借鉴方向" }, style: { width: 1100, height: 820 }, selectable: true },
  { id: "asset-apple", type: "inspo", position: { x: 20, y: 40 }, data: { kind: "image", title: "水润产品主视觉.jpg", imageUrl: photoA, tags: ["水润质感", "高饱和", "自然清新"], colors: ["#E94444", "#F5C25B", "#F7F3EE"] }, style: { width: 286 } },
  { id: "asset-web", type: "inspo", position: { x: 20, y: 440 }, data: { kind: "web", title: "Aura — Fresh product landing", sourceUrl: "https://example.com/product", body: "大面积留白配合居中产品特写，信息层级克制。", tags: ["Landing Page", "Fresh UI"], colors: ["#F8F4F2", "#D9DEFF", "#E96767"] }, style: { width: 300 } },
  { id: "analysis-1", type: "inspo", position: { x: 354, y: 40 }, data: { kind: "analysis", title: "AI 分析 · 水润产品视觉", body: "红色苹果居中近景，表面有清晰水珠与水圈；整体强调清透、脆爽、洁净的产品感。", tags: ["高饱和红", "微距构图", "高光反射"], colors: ["#E94A45", "#F7F1E9", "#B8C7F2"], status: "ready", sourceAssetId: "asset-apple", sourceTitle: "水润产品主视觉.jpg", regions: [{ id: "hero", label: "产品主视觉", type: "image" }, { id: "cta", label: "胶囊操作按钮", type: "button" }] }, style: { width: 324 } },
  { id: "note-1", type: "inspo", position: { x: 730, y: 40 }, data: { kind: "text", title: "可借鉴方向", body: "不是复刻苹果本身，而是复用“单一高饱和主体 + 液体折射 + 柔和冷色环境光”的视觉公式。", tags: ["设计意图"] }, style: { width: 288 } },
  { id: "element-1", type: "inspo", position: { x: 370, y: 440 }, data: { kind: "element", title: "胶囊按钮", body: "28px 圆角 · 12/18 内边距", colors: ["#25232A", "#FFFFFF"], tags: ["已确认元素"] }, style: { width: 230 } },
];

const seedEdges: Edge[] = [
  { id: "e1", source: "asset-apple", target: "analysis-1", label: "AI 分析", animated: true },
  { id: "e2", source: "asset-apple", target: "asset-web", label: "相似风格" },
  { id: "e3", source: "analysis-1", target: "note-1", label: "支持" },
  { id: "e4", source: "asset-web", target: "element-1", label: "拆分自" },
];

function CardNode({ id, data, selected }: NodeProps<Node<CardData>>) {
  return (
    <article className={`canvas-card card-${data.kind} ${selected ? "is-selected" : ""}`} data-node-id={id}>
      <Handle type="target" position={Position.Left} className="node-handle" />
      {data.kind === "group" ? (
        <div className="group-label"><span>灵感簇</span><strong>{data.title}</strong><small>{data.body}</small></div>
      ) : (
        <>
          <header className="card-head"><span className="card-kind">{kindLabel[data.kind]}</span><button aria-label="更多操作">•••</button></header>
          {data.imageUrl && <div className="card-image" style={{ backgroundImage: `url(${data.imageUrl})` }}><span className="source-chip">原始素材</span></div>}
          <div className="card-content">
            {data.kind === "analysis" && data.sourceTitle && <div className="analysis-origin">↳ 跟随参考 · {data.sourceTitle}</div>}
            <h3>{data.title}</h3>
            {data.sourceUrl && <a href={data.sourceUrl} target="_blank" rel="noreferrer">{new URL(data.sourceUrl).hostname} ↗</a>}
            {data.body && <p>{data.body}</p>}
            {!!data.colors?.length && <div className="color-row" aria-label="提取色板">{data.colors.map((color) => <span key={color} title={color} style={{ background: color }} />)}</div>}
            {!!data.tags?.length && <div className="tag-row">{data.tags.map((tag) => <span key={tag}>{tag}</span>)}</div>}
            {data.status === "processing" && <div className="analysis-progress"><i /><span>AI 正在拆解设计语言…</span></div>}
          </div>
        </>
      )}
      <Handle type="source" position={Position.Right} className="node-handle" />
    </article>
  );
}

const kindLabel: Record<CardKind, string> = { image: "图片", web: "网页", text: "便签", analysis: "AI 分析", element: "元素", group: "分组" };
const nodeTypes = { inspo: CardNode };

function WorkspaceCanvas() {
  const [nodes, setNodes, onNodesChange] = useNodesState<Node<CardData>>(seedNodes);
  const [edges, setEdges, onEdgesChange] = useEdgesState(seedEdges);
  const [selectedId, setSelectedId] = useState("asset-apple");
  const [search, setSearch] = useState("");
  const [quota, setQuota] = useState(27);
  const [savedAt, setSavedAt] = useState("刚刚");
  const [organizeOpen, setOrganizeOpen] = useState(false);
  const [exportOpen, setExportOpen] = useState(false);
  const [exportPurpose, setExportPurpose] = useState<ExportPurpose>("web-rebuild");
  const [importOpen, setImportOpen] = useState(false);
  const [urlValue, setUrlValue] = useState("");
  const [toast, setToast] = useState("");
  const [chat, setChat] = useState("");
  const [chatAnswer, setChatAnswer] = useState("我会基于当前画布的素材回答，并在结论后标注来源卡片。");
  const history = useRef<Array<{ nodes: Node<CardData>[]; edges: Edge[] }>>([]);
  const redoHistory = useRef<Array<{ nodes: Node<CardData>[]; edges: Edge[] }>>([]);
  const fileInput = useRef<HTMLInputElement>(null);
  const { fitView } = useReactFlow();

  const selectedNode = nodes.find((node) => node.id === selectedId);
  const visibleNodes = useMemo(() => nodes.map((node) => {
    if (!search.trim()) return { ...node, hidden: false };
    const haystack = `${node.data.title} ${node.data.body ?? ""} ${(node.data.tags ?? []).join(" ")} ${(node.data.colors ?? []).join(" ")}`.toLowerCase();
    return { ...node, hidden: !haystack.includes(search.toLowerCase()) };
  }), [nodes, search]);

  const remember = useCallback(() => {
    history.current.push({ nodes: structuredClone(nodes), edges: structuredClone(edges) });
    if (history.current.length > 40) history.current.shift();
    redoHistory.current = [];
  }, [nodes, edges]);

  const onConnect = useCallback((connection: Connection) => {
    remember();
    setEdges((current) => addEdge({ ...connection, id: crypto.randomUUID(), label: "相关" }, current));
  }, [remember, setEdges]);

  useEffect(() => {
    const timer = window.setTimeout(() => {
      setSavedAt(new Date().toLocaleTimeString("zh-CN", { hour: "2-digit", minute: "2-digit" }));
      void fetch("/api/boards/demo", { method: "PUT", headers: { "content-type": "application/json" }, body: JSON.stringify({ nodes, edges }) }).catch(() => undefined);
    }, 900);
    return () => window.clearTimeout(timer);
  }, [nodes, edges]);

  useEffect(() => {
    const paste = (event: ClipboardEvent) => {
      if ((event.target as HTMLElement)?.closest("input,textarea")) return;
      const file = [...(event.clipboardData?.files ?? [])].find((item) => item.type.startsWith("image/"));
      // eslint-disable-next-line react-hooks/immutability
      if (file) addImage(file);
      else {
        const text = event.clipboardData?.getData("text/plain").trim();
        // eslint-disable-next-line react-hooks/immutability
        if (text) addTextOrUrl(text);
      }
    };
    window.addEventListener("paste", paste);
    return () => window.removeEventListener("paste", paste);
  });

  function addImage(file: File) {
    if (!file.type.match(/^image\/(jpeg|png|webp)$/) || file.size > 20 * 1024 * 1024) { notify("仅支持 20 MB 内的 JPG、PNG、WebP"); return; }
    remember();
    const reader = new FileReader();
    reader.onload = () => setNodes((current) => [...current, { id: crypto.randomUUID(), type: "inspo", position: { x: 180 + current.length * 18, y: 130 + current.length * 14 }, data: { kind: "image", title: file.name, imageUrl: String(reader.result), tags: ["待分析"] }, style: { width: 286 } }]);
    reader.readAsDataURL(file);
  }

  function addTextOrUrl(value: string) {
    remember();
    const isUrl = /^https?:\/\//i.test(value);
    const id = crypto.randomUUID();
    setNodes((current) => [...current, { id, type: "inspo", position: { x: 210 + current.length * 20, y: 160 + current.length * 16 }, data: isUrl ? { kind: "web", title: new URL(value).hostname, sourceUrl: value, body: "网页已加入队列；抓取失败时会保留此来源卡片。", tags: ["网页采集"] } : { kind: "text", title: "新便签", body: value.slice(0, 50_000), tags: ["手工想法"] }, style: { width: 286 } }]);
    setSelectedId(id); setImportOpen(false); setUrlValue(""); notify(isUrl ? "网页已加入画布" : "便签已创建");
  }

  function addNote() { addTextOrUrl("记录这条灵感值得借鉴的原因…"); }

  function analyzeSelected() {
    if (!selectedNode || selectedNode.data.kind === "group") return;
    if (quota <= 0) { notify("平台额度已用完，请在设置中添加自己的模型 Key"); return; }
    const sourceNode = selectedNode;
    const sourceId = selectedNode.id;
    const sourceWidth = typeof selectedNode.style?.width === "number" ? selectedNode.style.width : 286;
    const siblingCount = nodes.filter((node) => node.data.kind === "analysis" && node.data.sourceAssetId === sourceId).length;
    remember(); setQuota((value) => value - 1);
    setNodes((current) => current.map((node) => node.id === sourceId ? { ...node, data: { ...node.data, status: "processing" } } : node));
    window.setTimeout(() => {
      const analysisId = `analysis-${crypto.randomUUID()}`;
      setNodes((current) => [
        ...current.map((node) => node.id === sourceId ? { ...node, data: { ...node.data, status: "ready", tags: [...new Set([...(node.data.tags ?? []), "已分析"])], regions: [{ id: "hero", label: "核心主视觉", type: "image" }, { id: "button", label: "主操作按钮", type: "button" }] } } : node),
        { id: analysisId, type: "inspo", position: { x: sourceNode.position.x + sourceWidth + 44, y: sourceNode.position.y + siblingCount * 250 }, data: { kind: "analysis", title: `AI 分析 · ${sourceNode.data.title}`, body: "该素材通过单一视觉焦点、柔和环境光和清晰的操作层级建立高级感。建议复用色彩比例与间距节奏，不直接复制内容。", tags: ["视觉焦点", "层级克制", "可追溯"], colors: sourceNode.data.colors ?? ["#F7F3F0", "#D7DDF7", "#242329"], status: "ready", sourceAssetId: sourceId, sourceTitle: sourceNode.data.title, regions: [{ id: "hero", label: "核心主视觉", type: "image" }, { id: "button", label: "主操作按钮", type: "button" }] }, style: { width: 324 } },
      ]);
      setEdges((current) => [...current, { id: crypto.randomUUID(), source: sourceId, target: analysisId, label: "AI 分析", animated: true }]);
      setSelectedId(analysisId); notify("分析完成，已生成可追溯分析卡");
    }, 1100);
  }

  function confirmRegion(region: { id: string; label: string; type: string }) {
    if (!selectedNode) return;
    remember();
    const childId = `element-${crypto.randomUUID()}`;
    setNodes((current) => [
      ...current.map((node) => node.id === selectedId ? { ...node, data: { ...node.data, regions: node.data.regions?.map((item) => item.id === region.id ? { ...item, confirmed: true } : item) } } : node),
      { id: childId, type: "inspo", position: { x: selectedNode.position.x + 380, y: selectedNode.position.y + 40 }, data: { kind: "element", title: region.label, body: `${region.type} · 已确认元素`, tags: ["已确认元素", "来源可追溯"], colors: selectedNode.data.colors?.slice(0, 2) ?? ["#252329", "#F8F5F2"] }, style: { width: 232 } },
    ]);
    setEdges((current) => [...current, { id: crypto.randomUUID(), source: selectedId, target: childId, label: "拆分自" }]);
    notify("已生成元素子素材");
  }

  function applyOrganize() {
    remember();
    const movable = nodes.filter((node) => node.data.kind !== "group");
    const positions = new Map<string, { x: number; y: number }>();
    const placed = new Set<string>();
    const references = movable.filter((node) => !["analysis", "element"].includes(node.data.kind));
    let rowY = 30;

    for (const reference of references) {
      positions.set(reference.id, { x: 40, y: rowY });
      placed.add(reference.id);
      const analyses = movable.filter((node) => node.data.kind === "analysis" && (
        node.data.sourceAssetId === reference.id || edges.some((edge) => edge.source === reference.id && edge.target === node.id)
      ));
      analyses.forEach((analysis, index) => {
        positions.set(analysis.id, { x: 390, y: rowY + index * 270 });
        placed.add(analysis.id);
      });
      const relationSources = new Set([reference.id, ...analyses.map((node) => node.id)]);
      const elements = movable.filter((node) => node.data.kind === "element" && edges.some((edge) => relationSources.has(edge.source) && edge.target === node.id));
      elements.forEach((element, index) => {
        positions.set(element.id, { x: 765, y: rowY + index * 210 });
        placed.add(element.id);
      });
      rowY += Math.max(350, analyses.length * 270 + 60, elements.length * 210 + 60);
    }

    movable.filter((node) => !placed.has(node.id)).forEach((node, index) => {
      positions.set(node.id, { x: 40 + (index % 3) * 360, y: rowY + Math.floor(index / 3) * 330 });
    });
    setNodes((current) => current.map((node) => {
      if (node.data.kind === "group") return { ...node, position: { x: 0, y: -45 }, style: { ...node.style, width: 1080, height: Math.max(560, rowY + 280) } };
      const position = positions.get(node.id);
      return position ? { ...node, position } : node;
    }));
    setOrganizeOpen(false); window.setTimeout(() => fitView({ padding: 0.16, duration: 500 }), 30); notify("整理方案已应用，可一步撤销");
  }

  function undo() {
    const snapshot = history.current.pop(); if (!snapshot) { notify("没有可撤销的操作"); return; }
    redoHistory.current.push({ nodes: structuredClone(nodes), edges: structuredClone(edges) }); setNodes(snapshot.nodes); setEdges(snapshot.edges);
  }

  function redo() {
    const snapshot = redoHistory.current.pop(); if (!snapshot) return;
    history.current.push({ nodes: structuredClone(nodes), edges: structuredClone(edges) }); setNodes(snapshot.nodes); setEdges(snapshot.edges);
  }

  function exportPackage() {
    const colors = [...new Set(nodes.flatMap((node) => node.data.colors ?? []))];
    const analyses = nodes.filter((node) => node.data.kind === "analysis");
    const elements = nodes.filter((node) => node.data.kind === "element");
    const references = nodes.filter((node) => ["image", "web", "text"].includes(node.data.kind));
    const primary = colors[0] ?? "#25232A";
    const secondary = colors[1] ?? "#8173B4";
    const surface = colors[2] ?? "#F7F3EE";
    const sources = references.map((node) => ({
      assetId: node.id,
      title: node.data.title,
      sourceUrl: node.data.sourceUrl ?? "uploaded",
      analysisTime: new Date().toISOString(),
      confidence: node.data.status === "ready" ? 0.88 : null,
      inferenceNotice: "字体、不可见状态与遮挡区域为视觉推断，使用前需人工确认",
    }));
    const direction = analyses.map((node) => node.data.body).filter(Boolean).join(" ") || "以单一视觉焦点、清晰层级与一致组件节奏建立统一体验。";
    const componentLines = elements.length ? elements.map((node) => `- **${node.data.title}**：${node.data.body ?? "尺寸与状态需确认"}`).join("\n") : "- 暂无已确认组件；不要根据低置信度候选创建生产组件。";
    const designMd = `---
version: alpha
name: Water Fresh Product System
description: 从 InspoAtlas 已确认参考中提炼的可追溯设计系统
colors:
  primary: "${primary}"
  secondary: "${secondary}"
  surface: "${surface}"
typography:
  body-md:
    fontFamily: "Inter, PingFang SC, sans-serif"
    fontSize: 16px
    fontWeight: 400
    lineHeight: 1.6
  label-md:
    fontFamily: "Inter, PingFang SC, sans-serif"
    fontSize: 14px
    fontWeight: 600
    lineHeight: 1.4
spacing:
  xs: 4px
  sm: 8px
  md: 16px
  lg: 24px
  xl: 32px
rounded:
  control: 12px
  card: 24px
  full: 9999px
components:
  button-primary:
    backgroundColor: "{colors.primary}"
    textColor: "{colors.surface}"
    rounded: "{rounded.full}"
    padding: 12px
---

## Overview
${direction}

## Colors
主色用于视觉焦点与主要动作；辅助色只承担层级和环境氛围；surface 保持内容可读。所有无法从来源确认的色值必须标为推断。

## Typography
字体家族是视觉推断。实现前检查项目可用字体；不可用时使用同字面宽度与 x-height 接近的系统字体，不下载未知授权字体。

## Layout
采用 8px 基础间距。先保留参考图的信息架构与模块顺序，再将所有间距映射到 spacing scale。

## Elevation & Depth
优先使用边框、色块与轻量阴影建立层级，避免无依据的重投影和玻璃效果。

## Shapes
卡片使用 24px 圆角，控件使用 12px，胶囊按钮使用 full。相同层级不得混用不同圆角。

## Components
${componentLines}

## Do's and Don'ts
### Do
- 先完成规范预检和结构映射，再开始实现。
- 重复组件必须复用同一 Token、尺寸和交互状态。
- 每个结论保留 sources.json 中的来源与置信度。

### Don't
- 不复制参考中的品牌内容、商标或不可授权资产。
- 不根据单张截图臆造隐藏交互、字体名称或响应式规则。
- 不在组件内部写死已经存在的 Token。`;
    const tokens = {
      $schema: "https://design-tokens.github.io/community-group/format/",
      color: Object.fromEntries(colors.map((color, index) => [`palette-${index + 1}`, { $type: "color", $value: color }])),
      spacing: { sm: { $type: "dimension", $value: { value: 8, unit: "px" } }, md: { $type: "dimension", $value: { value: 16, unit: "px" } } },
      radius: { control: { $type: "dimension", $value: { value: 12, unit: "px" } }, card: { $type: "dimension", $value: { value: 24, unit: "px" } } },
    };
    const variablesCss = `:root {\n${colors.map((color, index) => `  --color-palette-${index + 1}: ${color};`).join("\n")}\n  --space-sm: 8px;\n  --space-md: 16px;\n  --radius-control: 12px;\n  --radius-card: 24px;\n}`;
    const qa = `# Design QA Checklist\n\n## 结构 QA\n- [ ] 模块、顺序、文案、图片和 CTA 与已确认参考映射一致\n- [ ] 没有新增参考中不存在的功能或营销模块\n- [ ] 指定画板尺寸无溢出、遮挡或错位\n\n## 规范 QA\n- [ ] 颜色、字号、间距和圆角均来自 DESIGN.md / Tokens\n- [ ] 重复组件的 default、hover、active、focus、disabled 状态一致\n- [ ] 没有未经确认的字体、渐变、阴影或强调色\n- [ ] 响应式状态保持相同设计语言\n- [ ] 所有推断字段已人工确认或继续标记为推断\n`;
    const structure = `# 结构拆解\n\n${references.map((node, index) => `${index + 1}. **${node.data.title}**：${node.data.body ?? "保留来源内容和主要构图"}`).join("\n")}\n\n## 已确认组件\n${componentLines}`;
    const common = {
      "sources.json": strToU8(JSON.stringify(sources, null, 2)),
      "README.md": strToU8(`# InspoAtlas 任务包\n\n用途：${exportPurposeOptions.find((option) => option.id === exportPurpose)?.title}\n\n先阅读来源和置信度，再使用提示词或设计规范。`),
    };
    let files: Record<string, Uint8Array>;
    let filename: string;

    if (exportPurpose === "visual-remix") {
      files = { ...common,
        "IMAGE_PROMPT.md": strToU8(`# 图片 / 品牌视觉反推提示词\n\n## 目标\n基于参考的视觉公式生成新的原创表现，不复刻品牌主体。\n\n## 核心提示词\n${direction}\n\n构图：单一主体形成清晰视觉焦点，保留充足负空间；材质：清透、高光反射、细腻液体质感；色彩：${colors.join(" / ")}；输出需适配新的品牌主题与内容。\n\n## 使用方式\n将目标品类、品牌性格、画幅和文案替换后交给图像模型；保留 sources.json 作为视觉依据。`),
        "PROMPT_VARIANTS.md": strToU8("# 提示词变体\n\n1. 保守延展：保持构图和色彩比例，只替换主体与文案。\n2. 同风格新构图：保留材质、光线和色板，改变视角与版式。\n3. 品牌系统化：生成主视觉、横幅、社媒卡片和详情页头图的一致系列。"),
        "NEGATIVE_PROMPT.md": strToU8("# 负面约束\n\n避免复制原品牌标识、原文案和受版权保护角色；避免多余主体、脏乱背景、不可读文字、塑料感高光、过度锐化、随机字体和不一致光源。"),
        "palette.json": strToU8(JSON.stringify({ colors }, null, 2)),
        "composition.md": strToU8(`# 构图与材质\n\n${direction}\n\n推断内容必须以参考图进行人工复核。`),
      };
      filename = "inspoatlas-visual-remix-kit.zip";
    } else if (exportPurpose === "campaign-system") {
      files = { ...common, "DESIGN.md": strToU8(designMd), "tokens/tokens.json": strToU8(JSON.stringify(tokens, null, 2)), "tokens/variables.css": strToU8(variablesCss), "components.md": strToU8(`# 组件矩阵\n\n${componentLines}\n\n所有活动页共享尺寸、圆角、状态和间距，仅允许内容与主题 Token 变化。`), "CAMPAIGN_SYSTEM.md": strToU8("# 批量活动页生产系统\n\n## 固定层\n导航、容器宽度、按钮尺寸、卡片圆角、间距 scale、状态与可访问性。\n\n## 可变层\n主题色、主视觉、活动文案、权益列表和时间信息。\n\n## 生产规则\n先冻结 DESIGN.md，再逐页填写 PAGE_BRIEF_TEMPLATE.md；任何新组件先回写组件矩阵，经确认后才能进入后续页面。"), "PAGE_BRIEF_TEMPLATE.md": strToU8("# 页面 Brief\n\n- 页面名称：\n- 活动目标：\n- 核心 CTA：\n- 主视觉素材：\n- 内容模块顺序：\n- 允许覆盖的主题 Token：\n- 不允许变化的组件：\n"), "content-schema.json": strToU8(JSON.stringify({ pageName: "", campaignGoal: "", hero: { headline: "", subheading: "", imageAssetId: "" }, cta: { label: "", href: "" }, sections: [] }, null, 2)), "QA_CHECKLIST.md": strToU8(qa) };
      filename = "inspoatlas-campaign-system-kit.zip";
    } else if (exportPurpose === "figma-bridge") {
      const figmaImport = { version: 1, name: "Water Fresh Product System", variables: { colors: colors.map((value, index) => ({ name: `color/palette-${index + 1}`, value })) }, components: elements.map((node) => ({ id: node.id, name: node.data.title, description: node.data.body ?? "来源待确认", width: typeof node.style?.width === "number" ? node.style.width : 240, height: 88, cornerRadius: 12, fills: node.data.colors ?? [primary], sourceAssetId: edges.find((edge) => edge.target === node.id)?.source ?? null })) };
      files = { ...common, "DESIGN.md": strToU8(designMd), "tokens.json": strToU8(JSON.stringify(tokens, null, 2)), "figma-import.json": strToU8(JSON.stringify(figmaImport, null, 2)), "FIGMA_IMPORT.md": strToU8("# 导入 Figma\n\n1. 在 Figma Desktop 中导入本项目 apps/figma-plugin/manifest.json 作为开发插件。\n2. 运行 InspoAtlas Figma Bridge。\n3. 选择本包中的 figma-import.json。\n4. 插件会在当前文件创建本地颜色变量和可编辑组件草稿。\n5. 对照来源截图确认图像、字体、状态与尺寸后，再发布为团队组件。\n\n说明：Figma 没有面向网页直接生成原生 .fig 文件的通用公开接口，因此本产品使用官方 Plugin API 写入当前文件。"), "elements/README.md": strToU8("元素组件来自用户已确认区域；未确认候选不会写入。当前 Demo 仅生成结构化组件草稿，不假装还原不可见状态。") };
      filename = "inspoatlas-figma-bridge-kit.zip";
    } else {
      files = { ...common, "DESIGN.md": strToU8(designMd), "REBUILD_PROMPT.md": strToU8(`# AI 网页 / UI 复刻提示词\n\n先读取 @DESIGN.md 与 sources.json，不要立即写代码。\n\n1. 规范预检：提取 Token、组件规则、Do/Don't、冲突和无法确认项。\n2. 原图拆解：只描述真实存在的信息架构、模块、组件、CTA 和重复模式。\n3. 映射确认：输出“原图结构 → DESIGN.md 规则”表格与组件树，等待确认。\n4. 基础接入：将 Token 接入项目全局主题，避免组件内部写死数值。\n5. 页面实现：原图决定内容与结构，DESIGN.md 决定视觉语言。\n6. Design QA：先做结构 QA，再做规范 QA，并修正问题。\n\n不要新增参考中不存在的功能、营销文案或模块。`), "STRUCTURE.md": strToU8(structure), "tokens/tokens.json": strToU8(JSON.stringify(tokens, null, 2)), "tokens/variables.css": strToU8(variablesCss), "components.md": strToU8(`# 已确认组件\n\n${componentLines}`), "QA_CHECKLIST.md": strToU8(qa) };
      filename = "inspoatlas-web-rebuild-kit.zip";
    }
    const blob = new Blob([zipSync(files, { level: 6 }) as BlobPart], { type: "application/zip" });
    const anchor = document.createElement("a"); anchor.href = URL.createObjectURL(blob); anchor.download = filename; anchor.click(); URL.revokeObjectURL(anchor.href);
    void fetch("/api/exports", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ boardId: "demo", purpose: exportPurpose }) }).catch(() => undefined);
    setExportOpen(false); notify(`${exportPurposeOptions.find((option) => option.id === exportPurpose)?.title}任务包已生成`);
  }

  async function shareBoard() {
    const url = `${location.origin}/share/demo-inspiration-board`;
    await navigator.clipboard.writeText(url).catch(() => undefined); notify("只读链接已复制，可随时撤销");
  }

  function askCanvas() {
    if (!chat.trim()) return;
    setChatAnswer(`建议把当前方向定义为“清透高饱和产品视觉”。主要依据是水润产品主视觉、Aura 网页和 AI 分析三张卡片；优先复用色彩比例与圆角节奏，再用深色胶囊按钮稳定操作层级。〔水润产品主视觉.jpg〕〔Aura — Fresh product landing〕〔AI 分析 · 水润产品视觉〕`); setChat("");
  }

  function notify(message: string) { setToast(message); window.setTimeout(() => setToast(""), 2600); }

  return (
    <main className="workspace-shell" onDragOver={(event) => event.preventDefault()} onDrop={(event) => { event.preventDefault(); const file = event.dataTransfer.files[0]; if (file) addImage(file); }}>
      <header className="topbar">
        <div className="brand"><span className="brand-mark">✦</span><div><strong>InspoAtlas</strong><small>灵感图谱</small></div></div>
        <div className="board-title"><span className="live-dot" />水润产品视觉 <small>已自动保存 · {savedAt}</small></div>
        <label className="search-box"><span>⌕</span><input value={search} onChange={(event) => setSearch(event.target.value)} placeholder="搜索标签、颜色、文案…" /></label>
        <div className="top-actions"><button className="button ghost" onClick={undo} title="撤销">↶</button><button className="button ghost" onClick={redo} title="重做">↷</button><button className="button soft" onClick={shareBoard}>分享</button><button className="button primary" onClick={() => setExportOpen(true)}>生成任务包</button><button className="avatar">林</button></div>
      </header>

      <aside className="left-rail">
        <button className="rail-action" onClick={() => setImportOpen(true)}><span>＋</span>采集灵感</button>
        <nav>
          <p>我的画布 <button>＋</button></p>
          <button className="nav-item active"><span className="nav-thumb warm" />水润产品视觉<small>6</small></button>
          <button className="nav-item"><span className="nav-thumb cool" />金融 App 改版<small>18</small></button>
          <button className="nav-item"><span className="nav-thumb dark" />SaaS 落地页<small>12</small></button>
        </nav>
        <section className="smart-filters"><p>智能视图</p><button><span>✦</span>待分析 <small>{nodes.filter((n) => !n.data.status && n.data.kind !== "group").length}</small></button><button><span>◌</span>已确认元素 <small>{nodes.filter((n) => n.data.kind === "element").length}</small></button><button><span>↗</span>最近导出</button></section>
        <div className="quota-card"><div><span>AI 分析额度</span><strong>{quota} / 30</strong></div><i><b style={{ width: `${(quota / 30) * 100}%` }} /></i><button>添加模型 Key</button></div>
      </aside>

      <section className="canvas-area" aria-label="灵感无限画布">
        <div className="canvas-toolbar"><button onClick={() => fileInput.current?.click()} title="上传图片">▧<small>图片</small></button><button onClick={addNote} title="添加便签">T<small>便签</small></button><button onClick={() => setImportOpen(true)} title="导入网页">↗<small>网页</small></button><span /><button onClick={analyzeSelected} className="ai-tool">✦<small>分析</small></button><button onClick={() => setOrganizeOpen(true)}>⌗<small>整理</small></button></div>
        <input ref={fileInput} className="visually-hidden" type="file" accept="image/jpeg,image/png,image/webp" onChange={(event) => event.target.files?.[0] && addImage(event.target.files[0])} />
        <ReactFlow
          nodes={visibleNodes}
          edges={edges}
          nodeTypes={nodeTypes}
          onNodesChange={onNodesChange}
          onEdgesChange={onEdgesChange}
          onConnect={onConnect}
          onSelectionChange={({ nodes: selection }) => selection[0] && setSelectedId(selection[0].id)}
          fitView
          fitViewOptions={{ padding: 0.15 }}
          minZoom={0.18}
          maxZoom={2}
          snapToGrid
          snapGrid={[8, 8]}
          proOptions={{ hideAttribution: false }}
          deleteKeyCode={["Backspace", "Delete"]}
        >
          <Background variant={BackgroundVariant.Dots} color="rgba(73,67,90,.14)" gap={22} size={1.1} />
          <Controls showInteractive={false} position="bottom-center" />
          <MiniMap position="bottom-right" pannable zoomable nodeColor={(node) => node.data.kind === "analysis" ? "#d7cdfc" : node.data.kind === "element" ? "#f6d58c" : "#cdd9f9"} />
        </ReactFlow>
        <div className="canvas-tip">拖入图片、粘贴网页或按 <kbd>N</kbd> 新建便签</div>
      </section>

      <aside className="inspector">
        <div className="inspector-tabs"><button className="active">素材</button><button>AI 对话</button></div>
        {selectedNode ? <>
          <section className="inspect-title"><span className={`inspect-icon ${selectedNode.data.kind}`}>{selectedNode.data.kind === "analysis" ? "✦" : "◫"}</span><div><small>{kindLabel[selectedNode.data.kind]}</small><h2>{selectedNode.data.title}</h2></div></section>
          <button className="analyze-button" onClick={analyzeSelected} disabled={selectedNode.data.kind === "group" || selectedNode.data.status === "processing"}>✦ {selectedNode.data.status === "ready" ? "重新分析素材" : selectedNode.data.status === "processing" ? "正在分析…" : "AI 拆解这张素材"}<small>消耗 1 次</small></button>
          {!!selectedNode.data.colors?.length && <section className="inspect-block"><div className="block-heading"><h3>色彩</h3><button onClick={() => navigator.clipboard.writeText(selectedNode.data.colors?.join(", ") ?? "")}>复制全部</button></div><div className="palette-list">{selectedNode.data.colors.map((color, index) => <button key={color} onClick={() => navigator.clipboard.writeText(color)}><i style={{ background: color }} /><span>{["主色", "辅助色", "背景色", "正文色"][index] ?? "颜色"}</span><code>{color}</code></button>)}</div></section>}
          {!!selectedNode.data.tags?.length && <section className="inspect-block"><h3>设计标签</h3><div className="tag-row large">{selectedNode.data.tags.map((tag) => <span key={tag}>{tag}</span>)}</div></section>}
          {!!selectedNode.data.regions?.length && <section className="inspect-block"><div className="block-heading"><h3>检测到的元素</h3><small>{selectedNode.data.regions.filter((r) => r.confirmed).length}/{selectedNode.data.regions.length} 已确认</small></div><div className="region-list">{selectedNode.data.regions.map((region) => <div key={region.id}><span className="region-preview">{region.type === "button" ? "CTA" : "▧"}</span><div><strong>{region.label}</strong><small>{region.type} · AI 建议</small></div><button disabled={region.confirmed} onClick={() => confirmRegion(region)}>{region.confirmed ? "已确认" : "确认"}</button></div>)}</div></section>}
          <section className="inspect-block"><h3>来源与可信度</h3><div className="source-row"><span>分析置信度</span><strong>{selectedNode.data.status === "ready" ? "88%" : "待分析"}</strong></div><div className="source-row"><span>字体信息</span><strong>视觉推断</strong></div></section>
        </> : <div className="empty-inspector">选择一张卡片查看详情</div>}
        <section className="ai-chat"><div className="ai-answer"><span>✦</span><p>{chatAnswer}</p></div><div className="chat-input"><textarea value={chat} onChange={(event) => setChat(event.target.value)} placeholder="问问这张画布…" /><button onClick={askCanvas}>↑</button></div></section>
      </aside>

      {importOpen && <div className="modal-backdrop" onMouseDown={() => setImportOpen(false)}><section className="modal import-modal" onMouseDown={(event) => event.stopPropagation()}><button className="modal-close" onClick={() => setImportOpen(false)}>×</button><span className="modal-kicker">快速采集</span><h2>灵感先摊开，再慢慢看清</h2><p>拖入图片、粘贴文字，或输入一个公开网页地址。</p><div className="import-drop" onClick={() => fileInput.current?.click()}><span>⇧</span><strong>上传 JPG、PNG、WebP</strong><small>单个文件最大 20 MB</small></div><div className="url-entry"><input autoFocus value={urlValue} onChange={(event) => setUrlValue(event.target.value)} onKeyDown={(event) => event.key === "Enter" && urlValue.trim() && addTextOrUrl(urlValue.trim())} placeholder="粘贴网页 URL 或一段灵感文字" /><button onClick={() => urlValue.trim() && addTextOrUrl(urlValue.trim())}>加入画布</button></div><small className="privacy-note">私有默认 · 不公开素材 · 网页失败时仍保留来源卡</small></section></div>}

      {organizeOpen && <div className="modal-backdrop" onMouseDown={() => setOrganizeOpen(false)}><section className="modal organize-modal" onMouseDown={(event) => event.stopPropagation()}><button className="modal-close" onClick={() => setOrganizeOpen(false)}>×</button><span className="modal-kicker">AI 整理预览</span><h2>保留空间记忆，只把关系理清</h2><p>将创建 3 个灵感簇、调整 {nodes.filter((n) => n.data.kind !== "group").length} 张卡片，并建议 2 条关系。应用前不会改变原画布。</p><div className="organize-preview"><div><small>当前</small>{[1,2,3,4,5,6].map((i) => <i key={i} style={{ left: `${12 + (i * 13) % 70}%`, top: `${18 + (i * 19) % 60}%` }} />)}</div><span>→</span><div className="after"><small>整理后</small>{[1,2,3,4,5,6].map((i) => <i key={i} style={{ left: `${12 + ((i - 1) % 3) * 28}%`, top: `${24 + Math.floor((i - 1) / 3) * 34}%` }} />)}</div></div><div className="proposal-list"><span><i className="dot pink" />产品主视觉 <small>2 项</small></span><span><i className="dot blue" />设计分析 <small>2 项</small></span><span><i className="dot gold" />可复用元素 <small>2 项</small></span></div><footer><button className="button soft" onClick={() => setOrganizeOpen(false)}>取消</button><button className="button primary" onClick={applyOrganize}>应用方案 · 可撤销</button></footer></section></div>}
      {exportOpen && <div className="modal-backdrop" onMouseDown={() => setExportOpen(false)}>
        <section className="modal export-modal" onMouseDown={(event) => event.stopPropagation()}>
          <button className="modal-close" onClick={() => setExportOpen(false)}>×</button>
          <span className="modal-kicker">生产目标</span>
          <h2>你准备拿这些灵感做什么？</h2>
          <p>输出只保留当前任务需要的内容。DESIGN.md 负责约束，提示词负责执行，来源文件负责核验。</p>
          <div className="export-purpose-grid">
            {exportPurposeOptions.map((option) => <button key={option.id} className={exportPurpose === option.id ? "is-active" : ""} onClick={() => setExportPurpose(option.id)}>
              <span>{option.icon}</span><div><strong>{option.title}</strong><p>{option.description}</p><small>{option.files}</small></div><i>{exportPurpose === option.id ? "✓" : ""}</i>
            </button>)}
          </div>
          <div className="export-note"><span>可追溯</span> 每个工作包都保留来源、分析时间、置信度和“视觉推断”标记。</div>
          <footer><button className="button soft" onClick={() => setExportOpen(false)}>取消</button><button className="button primary" onClick={exportPackage}>生成 {exportPurposeOptions.find((option) => option.id === exportPurpose)?.title}</button></footer>
        </section>
      </div>}
      {toast && <div className="toast"><span>✓</span>{toast}</div>}
    </main>
  );
}

export default function InspoWorkspace() {
  return <ReactFlowProvider><WorkspaceCanvas /></ReactFlowProvider>;
}

