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
import "@xyflow/react/dist/style.css";

type CardKind = "image" | "web" | "text" | "analysis" | "element" | "group";
type CardData = Record<string, unknown> & {
  kind: CardKind;
  title: string;
  body?: string;
  imageUrl?: string;
  sourceUrl?: string;
  tags?: string[];
  colors?: string[];
  status?: string;
  regions?: Array<{ id: string; label: string; type: string; confirmed?: boolean }>;
};

const photoA = "https://images.unsplash.com/photo-1560807707-8cc77767d783?auto=format&fit=crop&w=900&q=85";

const seedNodes: Node<CardData>[] = [
  { id: "group-1", type: "inspo", position: { x: -60, y: -70 }, data: { kind: "group", title: "产品主视觉", body: "高饱和主体 · 通透质感 · 克制排版" }, style: { width: 840, height: 510 }, selectable: true },
  { id: "asset-apple", type: "inspo", position: { x: 20, y: 40 }, data: { kind: "image", title: "水润产品主视觉.jpg", imageUrl: photoA, tags: ["水润质感", "高饱和", "自然清新"], colors: ["#E94444", "#F5C25B", "#F7F3EE"] }, style: { width: 286 } },
  { id: "asset-web", type: "inspo", position: { x: 385, y: 30 }, data: { kind: "web", title: "Aura — Fresh product landing", sourceUrl: "https://example.com/product", body: "大面积留白配合居中产品特写，信息层级克制。", tags: ["Landing Page", "Fresh UI"], colors: ["#F8F4F2", "#D9DEFF", "#E96767"] }, style: { width: 300 } },
  { id: "analysis-1", type: "inspo", position: { x: 30, y: 345 }, data: { kind: "analysis", title: "AI 分析 · 水润产品视觉", body: "红色苹果居中近景，表面有清晰水珠与水圈；整体强调清透、脆爽、洁净的产品感。", tags: ["高饱和红", "微距构图", "高光反射"], colors: ["#E94A45", "#F7F1E9", "#B8C7F2"], status: "ready", regions: [{ id: "hero", label: "产品主视觉", type: "image" }, { id: "cta", label: "胶囊操作按钮", type: "button" }] }, style: { width: 324 } },
  { id: "note-1", type: "inspo", position: { x: 430, y: 342 }, data: { kind: "text", title: "可借鉴方向", body: "不是复刻苹果本身，而是复用“单一高饱和主体 + 液体折射 + 柔和冷色环境光”的视觉公式。", tags: ["设计意图"] }, style: { width: 288 } },
  { id: "element-1", type: "inspo", position: { x: 835, y: 42 }, data: { kind: "element", title: "胶囊按钮", body: "28px 圆角 · 12/18 内边距", colors: ["#25232A", "#FFFFFF"], tags: ["已确认元素"] }, style: { width: 230 } },
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
    remember(); setQuota((value) => value - 1);
    setNodes((current) => current.map((node) => node.id === selectedId ? { ...node, data: { ...node.data, status: "processing" } } : node));
    window.setTimeout(() => {
      const analysisId = `analysis-${crypto.randomUUID()}`;
      setNodes((current) => [
        ...current.map((node) => node.id === selectedId ? { ...node, data: { ...node.data, status: "ready", tags: [...new Set([...(node.data.tags ?? []), "已分析"])], regions: [{ id: "hero", label: "核心主视觉", type: "image" }, { id: "button", label: "主操作按钮", type: "button" }] } } : node),
        { id: analysisId, type: "inspo", position: { x: selectedNode.position.x + 360, y: selectedNode.position.y + 230 }, data: { kind: "analysis", title: `AI 分析 · ${selectedNode.data.title}`, body: "该素材通过单一视觉焦点、柔和环境光和清晰的操作层级建立高级感。建议复用色彩比例与间距节奏，不直接复制内容。", tags: ["视觉焦点", "层级克制", "可追溯"], colors: selectedNode.data.colors ?? ["#F7F3F0", "#D7DDF7", "#242329"], status: "ready", regions: [{ id: "hero", label: "核心主视觉", type: "image" }, { id: "button", label: "主操作按钮", type: "button" }] }, style: { width: 324 } },
      ]);
      setEdges((current) => [...current, { id: crypto.randomUUID(), source: selectedId, target: analysisId, label: "AI 分析", animated: true }]);
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
    const order: CardKind[] = ["image", "web", "analysis", "text", "element", "group"];
    const sorted = [...movable].sort((a, b) => order.indexOf(a.data.kind) - order.indexOf(b.data.kind));
    setNodes((current) => current.map((node) => {
      const index = sorted.findIndex((item) => item.id === node.id);
      if (index < 0) return node;
      const col = index % 3; const row = Math.floor(index / 3);
      return { ...node, position: { x: 40 + col * 360, y: 30 + row * 340 } };
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
    const sources = nodes.filter((node) => node.data.sourceUrl || node.data.imageUrl).map((node) => ({ id: node.id, title: node.data.title, sourceUrl: node.data.sourceUrl ?? "uploaded", confidence: node.data.status === "ready" ? 0.88 : null }));
    const files = {
      "design.md": strToU8(`# InspoAtlas 设计资产包\n\n## 设计方向\n${nodes.filter((n) => n.data.kind === "analysis").map((n) => `- ${n.data.body}`).join("\n")}\n\n## 色板\n${colors.join(" · ")}\n`),
      "tokens.json": strToU8(JSON.stringify({ color: Object.fromEntries(colors.map((color, index) => [`color${index + 1}`, { value: color }])) }, null, 2)),
      "variables.css": strToU8(`:root {\n${colors.map((color, index) => `  --color-${index + 1}: ${color};`).join("\n")}\n  --radius-card: 24px;\n  --space-base: 8px;\n}`),
      "components.md": strToU8(`# 已确认组件\n\n${nodes.filter((n) => n.data.kind === "element").map((n) => `- **${n.data.title}**：${n.data.body}`).join("\n")}`),
      "copy.md": strToU8(`# 文案\n\n${nodes.filter((n) => n.data.kind === "text").map((n) => `## ${n.data.title}\n${n.data.body}`).join("\n\n")}`),
      "sources.json": strToU8(JSON.stringify(sources, null, 2)),
      "elements/README.md": strToU8("已确认的元素切图将在生产环境由后台任务写入此目录。"),
    };
    const blob = new Blob([zipSync(files, { level: 6 }) as BlobPart], { type: "application/zip" });
    const anchor = document.createElement("a"); anchor.href = URL.createObjectURL(blob); anchor.download = "inspoatlas-design-package.zip"; anchor.click(); URL.revokeObjectURL(anchor.href); notify("设计资产包已生成");
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
        <div className="top-actions"><button className="button ghost" onClick={undo} title="撤销">↶</button><button className="button ghost" onClick={redo} title="重做">↷</button><button className="button soft" onClick={shareBoard}>分享</button><button className="button primary" onClick={exportPackage}>导出资产包</button><button className="avatar">林</button></div>
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
      {toast && <div className="toast"><span>✓</span>{toast}</div>}
    </main>
  );
}

export default function InspoWorkspace() {
  return <ReactFlowProvider><WorkspaceCanvas /></ReactFlowProvider>;
}

