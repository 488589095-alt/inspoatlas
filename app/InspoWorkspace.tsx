"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  addEdge, applyNodeChanges, Background, BackgroundVariant, Connection, Controls, Edge,
  MiniMap, NodeChange, ReactFlow, ReactFlowProvider, useEdgesState, useNodesState, useReactFlow,
} from "@xyflow/react";
import type { AnalysisResult, DesignContract, Relation, RelationType } from "@/packages/domain/src";
import { exportPurposeOptions } from "./exportOptions";
import { CardNode } from "./workspace/CardNode";
import { flowToScene, readDraft, relationLabel, saveDraft, sceneToFlow, type BoardSummary, type CanvasNode, type CardData } from "./workspace/model";
import "@xyflow/react/dist/style.css";
import "./export.css";

const nodeTypes = { inspo: CardNode };
const relationChoices: Array<{ type: RelationType; label: string }> = [
  { type: "similar-style", label: "同视觉语言" }, { type: "same-component", label: "同组件模式" },
  { type: "complements", label: "互补" }, { type: "contrasts", label: "对比" }, { type: "same-project", label: "同项目" },
];
const defaultSize: Record<CardData["kind"], { width: number; height: number }> = {
  image: { width: 300, height: 340 }, web: { width: 310, height: 250 }, text: { width: 290, height: 190 },
  analysis: { width: 350, height: 310 }, element: { width: 250, height: 170 }, group: { width: 760, height: 520 },
};

function WorkspaceCanvas() {
  const [boards, setBoards] = useState<BoardSummary[]>([]);
  const [boardId, setBoardId] = useState("");
  const [boardTitle, setBoardTitle] = useState("加载中…");
  const [nodes, setNodes] = useNodesState<CanvasNode>([]);
  const [edges, setEdges, onEdgesChange] = useEdgesState<Edge>([]);
  const [selectedIds, setSelectedIds] = useState<string[]>([]);
  const [search, setSearch] = useState("");
  const [savedState, setSavedState] = useState("正在读取");
  const [rightTab, setRightTab] = useState<"asset" | "contract">("asset");
  const [relationView, setRelationView] = useState<"all" | "provenance" | "direct" | "two-hop">("all");
  const [modal, setModal] = useState<"import" | "credentials" | "organize" | "export" | null>(null);
  const [menuId, setMenuId] = useState<string | null>(null);
  const [connection, setConnection] = useState<Connection | null>(null);
  const [toast, setToast] = useState("");
  const [urlValue, setUrlValue] = useState("");
  const [contract, setContract] = useState<DesignContract | null>(null);
  const [contractBusy, setContractBusy] = useState(false);
  const [exportPurpose, setExportPurpose] = useState("web-rebuild");
  const [credentialState, setCredentialState] = useState<Array<{ provider: string; model: string; lastFour: string; supportsVision: boolean }>>([]);
  const [credentialForm, setCredentialForm] = useState({ provider: "openai", apiKey: "", model: "", region: "intl" });
  const [loadingCredential, setLoadingCredential] = useState(false);
  const version = useRef(1);
  const loading = useRef(true);
  const saveTimer = useRef<number | undefined>(undefined);
  const history = useRef<Array<{ nodes: CanvasNode[]; edges: Edge[] }>>([]);
  const redoHistory = useRef<Array<{ nodes: CanvasNode[]; edges: Edge[] }>>([]);
  const syncedClips = useRef(new Set<string>());
  const fileInput = useRef<HTMLInputElement>(null);
  const { fitView, getViewport, setViewport } = useReactFlow();

  const selected = nodes.find((node) => node.id === selectedIds[0]);
  const graphFocus = useMemo(() => {
    if (relationView === "all" || !selectedIds[0]) return null;
    const focus = new Set([selectedIds[0]]);
    const accepted = edges.filter((edge) => relationView !== "provenance" || (edge.data as Relation | undefined)?.layer === "provenance");
    accepted.forEach((edge) => { if (edge.source === selectedIds[0]) focus.add(edge.target); if (edge.target === selectedIds[0]) focus.add(edge.source); });
    if (relationView === "two-hop") accepted.forEach((edge) => { if (focus.has(edge.source)) focus.add(edge.target); if (focus.has(edge.target)) focus.add(edge.source); });
    return focus;
  }, [edges, relationView, selectedIds]);
  const visibleNodes = useMemo(() => {
    const term = search.trim().toLowerCase();
    if (!term) return nodes.map((node) => ({ ...node, hidden: Boolean(graphFocus && !graphFocus.has(node.id) && node.data.kind !== "group") }));
    const hit = new Set(nodes.filter((node) => JSON.stringify(node.data).toLowerCase().includes(term)).map((node) => node.id));
    edges.forEach((edge) => { if (hit.has(edge.source)) hit.add(edge.target); if (hit.has(edge.target)) hit.add(edge.source); });
    return nodes.map((node) => ({ ...node, hidden: ((!hit.has(node.id)) || Boolean(graphFocus && !graphFocus.has(node.id))) && node.data.kind !== "group" }));
  }, [nodes, edges, search, graphFocus]);
  const visibleEdges = useMemo(() => edges.map((edge) => ({
    ...edge,
    hidden: relationView === "provenance"
      ? (edge.data as Relation | undefined)?.layer !== "provenance"
      : Boolean(graphFocus && (!graphFocus.has(edge.source) || !graphFocus.has(edge.target))),
  })), [edges, relationView, graphFocus]);

  const notify = useCallback((message: string) => {
    setToast(message); window.setTimeout(() => setToast(""), 2800);
  }, []);

  const remember = useCallback(() => {
    history.current.push({ nodes: structuredClone(nodes), edges: structuredClone(edges) });
    if (history.current.length > 50) history.current.shift();
    redoHistory.current = [];
  }, [nodes, edges]);

  const loadBoards = useCallback(async () => {
    const response = await fetch("/api/boards", { cache: "no-store" });
    if (!response.ok) throw new Error("无法读取画布");
    let list = ((await response.json()) as { boards: BoardSummary[] }).boards;
    if (!list.length) {
      const created = await fetch("/api/boards", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ title: "我的灵感图谱" }) });
      const payload = await created.json() as { board: BoardSummary }; list = [payload.board];
    }
    setBoards(list);
    const requested = new URLSearchParams(location.search).get("board");
    setBoardId(list.some((item) => item.id === requested) ? requested! : list[0].id);
  }, []);

  useEffect(() => { loadBoards().catch((error) => notify(error.message)); }, [loadBoards, notify]);

  useEffect(() => {
    if (!boardId) return;
    let active = true; loading.current = true; setSavedState("正在读取");
    fetch("/api/boards/" + boardId, { cache: "no-store" }).then(async (response) => {
      if (!response.ok) throw new Error("画布读取失败");
      const { board } = await response.json();
      if (!active) return;
      const flow = sceneToFlow(board.scene); version.current = board.version; setBoardTitle(board.title);
      const draft = await readDraft<{ baseVersion: number; scene: typeof board.scene }>(boardId);
      const recovered = draft && draft.baseVersion === board.version ? sceneToFlow(draft.scene) : flow;
      setNodes(recovered.nodes); setEdges(recovered.edges); setSelectedIds([]);
      if (recovered.viewport) await setViewport(recovered.viewport);
      setSavedState(draft && draft.baseVersion === board.version ? "已恢复本地草稿" : "已同步");
      loading.current = false;
      window.history.replaceState(null, "", "?board=" + encodeURIComponent(boardId));
      window.setTimeout(() => recovered.nodes.length && fitView({ padding: .18, duration: 300 }), 30);
    }).catch((error) => notify(error.message));
    return () => { active = false; };
  }, [boardId, fitView, setEdges, setNodes, setViewport, notify]);

  useEffect(() => {
    if (!boardId || loading.current) return;
    setSavedState("保存中…");
    window.clearTimeout(saveTimer.current);
    saveTimer.current = window.setTimeout(async () => {
      const scene = flowToScene(nodes, edges, getViewport());
      await saveDraft(boardId, { baseVersion: version.current, scene }).catch(() => undefined);
      try {
        const response = await fetch("/api/boards/" + boardId + "/scene", { method: "PUT", headers: { "content-type": "application/json" }, body: JSON.stringify({ baseVersion: version.current, scene }) });
        if (response.status === 409) { setSavedState("存在版本冲突"); notify("服务器画布已变化，请刷新后选择版本"); return; }
        if (!response.ok) throw new Error();
        const payload = await response.json(); version.current = payload.version; setSavedState("已自动保存");
      } catch { setSavedState("离线草稿已保留"); }
    }, 900);
    return () => window.clearTimeout(saveTimer.current);
  }, [nodes, edges, boardId, getViewport, notify]);

  useEffect(() => {
    const handler = (event: Event) => {
      const detail = (event as CustomEvent<{ id: string; action: string }>).detail;
      setSelectedIds([detail.id]);
      if (detail.action === "menu") setMenuId(detail.id);
      if (detail.action === "analyze") void analyze(detail.id);
    };
    window.addEventListener("inspo:node-action", handler); return () => window.removeEventListener("inspo:node-action", handler);
  });

  useEffect(() => {
    if (!boardId) return;
    async function syncClips() {
      try {
        const response = await fetch("/api/clips?boardId=" + encodeURIComponent(boardId), { cache: "no-store" });
        if (!response.ok) return;
        const assets = ((await response.json()) as { assets: Array<Record<string, unknown>> }).assets;
        const fresh = assets.filter((item) => !syncedClips.current.has(String(item.id)));
        assets.forEach((item) => syncedClips.current.add(String(item.id)));
        if (!fresh.length) return;
        setNodes((current) => [...current, ...fresh.filter((item) => !current.some((node) => node.id === item.id)).map((item, index): CanvasNode => ({
          id: String(item.id), type: "inspo", position: { x: 80 + index * 340, y: 100 + current.length * 16 },
          data: { kind: "web", title: String(item.title), assetId: String(item.id), sourceUrl: item.sourceUrl ? String(item.sourceUrl) : undefined, body: String(item.extractedText || "插件采集已到达，等待分析"), tags: ["插件采集"], status: String(item.status), imageUrl: "/api/assets/" + item.id + "/content" },
          style: defaultSize.web,
        }))]);
        notify("插件采集已进入当前画布");
      } catch { /* next poll retries */ }
    }
    void syncClips(); const timer = window.setInterval(syncClips, 3000); return () => window.clearInterval(timer);
  }, [boardId, setNodes, notify]);

  const onNodesChange = useCallback((changes: NodeChange<CanvasNode>[]) => {
    setNodes((current) => {
      const before = new Map(current.map((node) => [node.id, node]));
      let next = applyNodeChanges(changes, current);
      for (const change of changes) {
        if (change.type !== "position" && change.type !== "dimensions") continue;
        const source = before.get(change.id); if (!source || source.data.kind === "analysis") continue;
        if (change.type === "position" && change.position) {
          const dx = change.position.x - source.position.x, dy = change.position.y - source.position.y;
          next = next.map((node) => node.data.kind === "analysis" && node.data.sourceAssetId === (source.data.assetId || source.id)
            ? { ...node, position: { x: node.position.x + dx, y: node.position.y + dy }, parentId: source.parentId, extent: source.parentId ? "parent" : undefined }
            : node);
        }
        if (change.type === "dimensions" && change.dimensions) {
          const dimensions = change.dimensions;
          next = next.map((node) => node.data.kind === "analysis" && node.data.sourceAssetId === (source.data.assetId || source.id)
            ? { ...node, position: { x: source.position.x + dimensions.width + 44, y: node.position.y } } : node);
        }
      }
      return next;
    });
  }, [setNodes]);

  const onConnect = useCallback((value: Connection) => setConnection(value), []);

  function confirmConnection(type: RelationType) {
    if (!connection?.source || !connection.target) return;
    remember();
    const relation: Relation = { id: crypto.randomUUID(), sourceId: connection.source, targetId: connection.target, type, layer: "association", status: "confirmed", origin: "human" };
    setEdges((current) => addEdge({ ...connection, id: relation.id, label: relationLabel[type], data: relation, zIndex: 4, style: { strokeDasharray: "6 5", stroke: "#9b8aaa" } }, current));
    setConnection(null);
  }

  async function createBoard(sourceBoardId?: string) {
    const response = await fetch("/api/boards", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ title: sourceBoardId ? boardTitle + " 副本" : "未命名画布", sourceBoardId }) });
    if (!response.ok) return notify("新建画布失败");
    const { board } = await response.json(); setBoards((current) => [board, ...current]); setBoardId(board.id); notify(sourceBoardId ? "画布已复制" : "新画布已创建");
  }

  async function renameBoard() {
    const title = window.prompt("画布名称", boardTitle)?.trim(); if (!title || title === boardTitle) return;
    const response = await fetch("/api/boards/" + boardId, { method: "PATCH", headers: { "content-type": "application/json" }, body: JSON.stringify({ title }) });
    if (!response.ok) return notify("重命名失败");
    setBoardTitle(title); setBoards((current) => current.map((item) => item.id === boardId ? { ...item, title } : item));
  }

  async function deleteBoard() {
    if (!window.confirm("删除这个画布及其素材？此操作不可撤销。")) return;
    const response = await fetch("/api/boards/" + boardId, { method: "DELETE" });
    if (!response.ok) return notify("画布删除失败");
    const rest = boards.filter((item) => item.id !== boardId); setBoards(rest);
    if (rest.length) setBoardId(rest[0].id); else await createBoard();
  }

  async function addAsset(value: string) {
    const isUrl = /^https?:\/\//i.test(value);
    const response = await fetch("/api/assets", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ boardId, kind: isUrl ? "web" : "text", title: isUrl ? new URL(value).hostname : "新便签", sourceUrl: isUrl ? value : undefined, text: isUrl ? undefined : value.slice(0, 50_000) }) });
    if (!response.ok) return notify((await response.json().catch(() => ({}))).error || "导入失败");
    const { asset } = await response.json(); remember();
    const kind = isUrl ? "web" : "text";
    const node: CanvasNode = { id: asset.id, type: "inspo", position: { x: 120 + nodes.length * 20, y: 100 + nodes.length * 16 }, data: { kind, title: asset.title, assetId: asset.id, sourceUrl: asset.sourceUrl, body: value, tags: ["待分析"] }, style: defaultSize[kind] };
    setNodes((current) => [...current, node]); setSelectedIds([asset.id]); setModal(null); setUrlValue(""); notify(isUrl ? "网页来源卡已保存" : "文字灵感已保存");
  }

  async function addImage(file: File) {
    if (!/^image\/(jpeg|png|webp)$/.test(file.type) || file.size > 20 * 1024 * 1024) return notify("仅支持 20 MB 内的 JPG、PNG、WebP");
    const form = new FormData(); form.set("boardId", boardId); form.set("file", file);
    const response = await fetch("/api/assets", { method: "POST", body: form });
    if (!response.ok) return notify((await response.json().catch(() => ({}))).error || "图片上传失败");
    const { asset } = await response.json(); remember();
    setNodes((current) => [...current, { id: asset.id, type: "inspo", position: { x: 100 + current.length * 18, y: 100 + current.length * 14 }, data: { kind: "image", title: asset.title, assetId: asset.id, imageUrl: asset.contentUrl || "/api/assets/" + asset.id + "/content", tags: ["待分析"] }, style: defaultSize.image }]);
    setSelectedIds([asset.id]); setModal(null); notify("图片已持久化到素材库");
  }

  async function analyze(nodeId?: string) {
    const source = nodes.find((node) => node.id === (nodeId || selectedIds[0]));
    if (!source || !["image", "web", "text"].includes(source.data.kind)) return notify("请选择一张原始素材");
    const assetId = source.data.assetId || source.id;
    const analysisNodeId = "analysis-" + assetId;
    const width = Number(source.measured?.width ?? source.style?.width ?? 300);
    const previous = nodes.find((node) => node.id === analysisNodeId);
    remember();
    setNodes((current) => {
      const loadingCard: CanvasNode = previous ? { ...previous, data: { ...previous.data, status: "processing", error: undefined } } : {
        id: analysisNodeId, type: "inspo", parentId: source.parentId, extent: source.parentId ? "parent" : undefined,
        draggable: false, position: { x: source.position.x + width + 44, y: source.position.y },
        data: { kind: "analysis", title: "AI 分析 · " + source.data.title, sourceAssetId: assetId, sourceTitle: source.data.title, status: "processing", body: "等待真实模型返回结构化结果…" },
        style: defaultSize.analysis, zIndex: 3,
      };
      return previous ? current.map((item) => item.id === analysisNodeId ? loadingCard : item) : [...current, loadingCard];
    });
    const relation: Relation = { id: "analysis-edge-" + assetId, sourceId: source.id, targetId: analysisNodeId, type: "analysis-of", layer: "provenance", status: "confirmed", origin: "system" };
    setEdges((current) => current.some((edge) => edge.id === relation.id) ? current : [...current, { id: relation.id, source: source.id, target: analysisNodeId, label: "分析来源", data: relation, zIndex: 4, style: { stroke: "#64576f", strokeWidth: 2 } }]);
    const response = await fetch("/api/analyses", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ assetId, mode: "replace" }) });
    const payload = await response.json().catch(() => ({}));
    if (!response.ok) {
      setNodes((current) => current.map((item) => item.id === analysisNodeId ? { ...item, data: { ...item.data, status: previous?.data.status === "ready" ? "ready" : "failed", error: payload.error || "分析失败" } } : item));
      if (response.status === 409) setModal("credentials");
      return notify(payload.error || "分析失败，已保留上次有效结果");
    }
    const result = payload.analysis.result as AnalysisResult;
    setNodes((current) => current.map((item) => item.id === analysisNodeId ? { ...item, data: {
      ...item.data, analysisId: payload.analysis.id, status: "ready", error: undefined, title: "AI 分析 · " + source.data.title,
      body: result.summary, principles: result.principles, colors: result.palette.map((color) => color.hex),
      tags: result.tags.slice(0, 8).map((tag) => tag.value), regions: result.components,
    } } : item));
    notify(previous ? "原分析卡已原位更新" : "真实 AI 分析完成");
  }

  function createCluster() {
    const chosen = nodes.filter((node) => selectedIds.includes(node.id) && !node.parentId && node.data.kind !== "group");
    if (!chosen.length) return notify("请先选择至少一张未分组卡片");
    const included = new Set(chosen.map((node) => node.id));
    chosen.forEach((node) => nodes.filter((item) => item.data.kind === "analysis" && item.data.sourceAssetId === (node.data.assetId || node.id)).forEach((item) => included.add(item.id)));
    const members = nodes.filter((node) => included.has(node.id));
    const minX = Math.min(...members.map((node) => node.position.x)), minY = Math.min(...members.map((node) => node.position.y));
    const maxX = Math.max(...members.map((node) => node.position.x + Number(node.measured?.width ?? node.style?.width ?? 300)));
    const maxY = Math.max(...members.map((node) => node.position.y + Number(node.measured?.height ?? node.style?.height ?? 200)));
    const id = "group-" + crypto.randomUUID(); remember();
    const group: CanvasNode = { id, type: "inspo", position: { x: minX - 44, y: minY - 64 }, data: { kind: "group", title: "新灵感簇", body: members.length + " 张卡片" }, style: { width: Math.max(420, maxX - minX + 88), height: Math.max(300, maxY - minY + 108) }, zIndex: -1 };
    setNodes((current) => [group, ...current.map((node) => included.has(node.id) ? { ...node, parentId: id, extent: "parent" as const, position: { x: node.position.x - group.position.x, y: node.position.y - group.position.y } } : node)]);
    setSelectedIds([id]); notify("灵感簇已创建，来源与分析保持成组");
  }

  function detachNode(nodeId: string) {
    const node = nodes.find((item) => item.id === nodeId), parent = nodes.find((item) => item.id === node?.parentId);
    if (!node || !parent) return;
    remember(); setNodes((current) => current.map((item) => item.id === nodeId ? { ...item, parentId: undefined, extent: undefined, position: { x: parent.position.x + item.position.x, y: parent.position.y + item.position.y } } : item));
  }

  function moveToCluster(nodeId: string) {
    const groups = nodes.filter((item) => item.data.kind === "group");
    if (!groups.length) return notify("请先创建一个灵感簇");
    const requested = window.prompt("输入目标灵感簇名称", groups[0].data.title)?.trim();
    const target = groups.find((item) => item.data.title === requested); if (!target) return notify("没有找到这个灵感簇");
    const source = nodes.find((item) => item.id === nodeId); if (!source || source.data.kind === "group") return;
    const ids = new Set([source.id]);
    nodes.filter((item) => item.data.kind === "analysis" && item.data.sourceAssetId === (source.data.assetId || source.id)).forEach((item) => ids.add(item.id));
    remember();
    setNodes((current) => current.map((item) => {
      if (!ids.has(item.id)) return item;
      const oldParent = current.find((parent) => parent.id === item.parentId);
      const absolute = oldParent ? { x: oldParent.position.x + item.position.x, y: oldParent.position.y + item.position.y } : item.position;
      return { ...item, parentId: target.id, extent: "parent" as const, position: { x: Math.max(24, absolute.x - target.position.x), y: Math.max(56, absolute.y - target.position.y) } };
    }));
    notify("来源与分析卡已一起移入“" + target.data.title + "”");
  }

  function deleteNode(nodeId: string) {
    const target = nodes.find((node) => node.id === nodeId); if (!target) return;
    remember();
    if (target.data.kind === "group") {
      setNodes((current) => current.filter((node) => node.id !== nodeId).map((node) => node.parentId === nodeId ? { ...node, parentId: undefined, extent: undefined, position: { x: target.position.x + node.position.x, y: target.position.y + node.position.y } } : node));
      return notify("灵感簇已删除，成员已保留");
    }
    const remove = new Set([nodeId]);
    if (["image", "web", "text"].includes(target.data.kind) && window.confirm("同时删除它的分析卡和确认元素吗？")) {
      nodes.filter((node) => node.data.sourceAssetId === (target.data.assetId || target.id)).forEach((node) => remove.add(node.id));
    }
    setNodes((current) => current.filter((node) => !remove.has(node.id)));
    setEdges((current) => current.filter((edge) => !remove.has(edge.source) && !remove.has(edge.target)));
  }

  function renameNode(nodeId: string) {
    const node = nodes.find((item) => item.id === nodeId); if (!node) return;
    const title = window.prompt("名称", node.data.title)?.trim(); if (!title) return;
    remember(); setNodes((current) => current.map((item) => item.id === nodeId ? { ...item, data: { ...item.data, title } } : item));
  }

  function applyOrganize() {
    remember(); const roots = nodes.filter((node) => !node.parentId && node.data.kind !== "group");
    const positions = new Map<string, { x: number; y: number }>(); let y = 80;
    for (const source of roots.filter((node) => node.data.kind !== "analysis")) {
      positions.set(source.id, { x: 80, y });
      const companion = roots.find((node) => node.data.kind === "analysis" && node.data.sourceAssetId === (source.data.assetId || source.id));
      if (companion) positions.set(companion.id, { x: 80 + Number(source.style?.width ?? 300) + 44, y });
      y += Math.max(Number(source.style?.height ?? 220), Number(companion?.style?.height ?? 0)) + 72;
    }
    setNodes((current) => current.map((node) => positions.has(node.id) ? { ...node, position: positions.get(node.id)! } : node));
    setModal(null); window.setTimeout(() => fitView({ padding: .15, duration: 450 }), 40); notify("按来源链整理完成，可一步撤销");
  }

  function undo() {
    const snapshot = history.current.pop(); if (!snapshot) return notify("没有可撤销的操作");
    redoHistory.current.push({ nodes: structuredClone(nodes), edges: structuredClone(edges) }); setNodes(snapshot.nodes); setEdges(snapshot.edges);
  }
  function redo() {
    const snapshot = redoHistory.current.pop(); if (!snapshot) return;
    history.current.push({ nodes: structuredClone(nodes), edges: structuredClone(edges) }); setNodes(snapshot.nodes); setEdges(snapshot.edges);
  }

  async function previewContract() {
    setContractBusy(true);
    const response = await fetch("/api/boards/" + boardId + "/contracts/preview", { method: "POST" });
    const payload = await response.json().catch(() => ({})); setContractBusy(false);
    if (!response.ok) return notify(payload.error || "请先完成至少一次真实分析");
    setContract(payload.contract); setRightTab("contract");
  }
  async function confirmContract() {
    if (!contract) return;
    const response = await fetch("/api/boards/" + boardId + "/contracts", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ contract }) });
    notify(response.ok ? "设计系统合同已确认并版本化" : "合同保存失败");
  }

  async function exportPackage() {
    const response = await fetch("/api/exports", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ boardId, purpose: exportPurpose }) });
    if (!response.ok) return notify((await response.json().catch(() => ({}))).error || "请先确认设计系统合同");
    const blob = await response.blob(); const url = URL.createObjectURL(blob); const anchor = document.createElement("a");
    anchor.href = url; anchor.download = "inspoatlas-" + exportPurpose + ".zip"; anchor.click(); URL.revokeObjectURL(url); setModal(null);
  }

  async function loadCredentials() {
    const response = await fetch("/api/ai-credentials", { cache: "no-store" }); if (response.ok) setCredentialState((await response.json()).credentials || []);
    setModal("credentials");
  }
  async function saveCredential() {
    setLoadingCredential(true);
    const response = await fetch("/api/ai-credentials", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(credentialForm) });
    const payload = await response.json().catch(() => ({})); setLoadingCredential(false);
    if (!response.ok) return notify(payload.error || "Key 测试失败");
    setCredentialForm((value) => ({ ...value, apiKey: "" })); await loadCredentials(); notify("Key 已测试并加密保存");
  }

  function handleMenu(action: string) {
    const id = menuId; setMenuId(null); if (!id) return;
    if (action === "rename") renameNode(id);
    if (action === "analyze") void analyze(id);
    if (action === "detach") detachNode(id);
    if (action === "move") moveToCluster(id);
    if (action === "delete") deleteNode(id);
    if (action === "open") { const url = nodes.find((node) => node.id === id)?.data.sourceUrl; if (url) window.open(url, "_blank", "noopener"); }
  }

  async function confirmRegion(region: NonNullable<CardData["regions"]>[number]) {
    if (!selected?.data.analysisId || !selected.data.sourceAssetId || !region.rect) return notify("此候选缺少可调整区域");
    const label = window.prompt("确认元素名称", region.label)?.trim(); if (!label) return;
    const form = new FormData(); form.set("label", label); form.set("type", region.type); form.set("rect", JSON.stringify(region.rect));
    const response = await fetch("/api/analyses/" + selected.data.analysisId + "/regions/" + region.id, { method: "PATCH", body: form });
    const payload = await response.json().catch(() => ({})); if (!response.ok) return notify(payload.error || "确认失败");
    const source = nodes.find((node) => (node.data.assetId || node.id) === selected.data.sourceAssetId);
    const id = "element-" + region.id + "-" + selected.data.sourceAssetId; remember();
    setNodes((current) => [
      ...current.map((node) => node.id === selected.id ? { ...node, data: { ...node.data, regions: node.data.regions?.map((item) => item.id === region.id ? { ...item, confirmed: true, label } : item) } } : node),
      ...(current.some((node) => node.id === id) ? [] : [{ id, type: "inspo", parentId: source?.parentId, extent: source?.parentId ? "parent" as const : undefined, position: { x: selected.position.x + Number(selected.style?.width ?? 350) + 44, y: selected.position.y }, data: { kind: "element" as const, title: label, body: region.type + " · 人工确认区域", sourceAssetId: selected.data.sourceAssetId, tags: ["已确认元素"], imageUrl: payload.element?.contentUrl }, style: defaultSize.element }]),
    ]);
    const relation: Relation = { id: "element-edge-" + id, sourceId: source?.id || selected.id, targetId: id, type: "element-of", layer: "provenance", status: "confirmed", origin: "human" };
    setEdges((current) => current.some((edge) => edge.id === relation.id) ? current : [...current, { id: relation.id, source: relation.sourceId, target: id, label: "元素来源", data: relation, zIndex: 4, style: { stroke: "#64576f", strokeWidth: 2 } }]);
    notify("候选已成为可追溯的确认元素");
  }

  return (
    <main className="workspace-shell" onDragOver={(event) => event.preventDefault()} onDrop={(event) => { event.preventDefault(); const file = event.dataTransfer.files[0]; if (file) void addImage(file); }}>
      <header className="topbar">
        <div className="brand"><span className="brand-mark">✦</span><div><strong>InspoAtlas</strong><small>设计系统合同工作台</small></div></div>
        <button className="board-title editable" onDoubleClick={renameBoard} title="双击修改画布名称"><span className="live-dot" /><b>{boardTitle}</b><small>{savedState}</small></button>
        <label className="search-box"><span>⌕</span><input value={search} onChange={(event) => setSearch(event.target.value)} placeholder="搜索文案、标签、颜色与来源…" /></label>
        <div className="top-actions"><button className="button ghost" onClick={undo} title="撤销">↶</button><button className="button ghost" onClick={redo} title="重做">↷</button><button className="button soft" onClick={() => void loadCredentials()}>AI 设置</button><button className="button primary" onClick={() => setModal("export")}>生成任务包</button></div>
      </header>

      <aside className="left-rail">
        <button className="rail-action" onClick={() => setModal("import")}><span>＋</span>采集灵感</button>
        <nav><p>我的画布 <button onClick={() => void createBoard()} aria-label="新建画布">＋</button></p>
          {boards.map((board) => <button key={board.id} className={"nav-item " + (board.id === boardId ? "active" : "")} onClick={() => setBoardId(board.id)}><span className="nav-thumb cool" /><span>{board.title}</span><small>{board.version}</small></button>)}
        </nav>
        <section className="smart-filters"><p>画布操作</p><button onClick={() => void createBoard(boardId)}><span>⧉</span>复制当前画布</button><button onClick={renameBoard}><span>✎</span>重命名</button><button onClick={deleteBoard}><span>⌫</span>删除画布</button></section>
        <div className="quota-card"><div><span>真实模型</span><strong>{credentialState.length ? "已连接" : "BYOK"}</strong></div><p>分析只使用你配置并测试通过的 Key；无 Key 时不会生成演示答案。</p><button onClick={() => void loadCredentials()}>管理模型 Key</button></div>
      </aside>

      <section className="canvas-area" aria-label="灵感无限画布">
        <div className="canvas-toolbar">
          <button onClick={() => fileInput.current?.click()}>▧<small>图片</small></button>
          <button onClick={() => setModal("import")}>T<small>文字/网页</small></button>
          <button onClick={createCluster}>▱<small>灵感簇</small></button><span />
          <button className="ai-tool" onClick={() => void analyze()}>✦<small>真实分析</small></button>
          <button onClick={() => setModal("organize")}>⌗<small>整理预览</small></button>
        </div>
        <input ref={fileInput} className="visually-hidden" type="file" accept="image/jpeg,image/png,image/webp" onChange={(event) => event.target.files?.[0] && void addImage(event.target.files[0])} />
        <select className="relation-view" value={relationView} onChange={(event) => setRelationView(event.target.value as typeof relationView)}><option value="all">全部关系</option><option value="provenance">只看来源链</option><option value="direct">直接关系</option><option value="two-hop">两跳关系</option></select>
        <ReactFlow nodes={visibleNodes} edges={visibleEdges} nodeTypes={nodeTypes} onNodesChange={onNodesChange} onEdgesChange={onEdgesChange} onConnect={onConnect}
          onSelectionChange={({ nodes: selection }) => setSelectedIds(selection.map((node) => node.id))}
          onNodeDoubleClick={(_, node) => renameNode(node.id)} selectionOnDrag multiSelectionKeyCode={["Control", "Meta"]} deleteKeyCode={null}
          fitView minZoom={.14} maxZoom={2.2} snapToGrid snapGrid={[8, 8]} onlyRenderVisibleElements elevateEdgesOnSelect>
          <Background id="fine-dots" variant={BackgroundVariant.Dots} color="rgba(72,63,86,.27)" gap={20} size={1.25} />
          <Background id="major-dots" variant={BackgroundVariant.Dots} color="rgba(72,63,86,.16)" gap={100} size={2.1} />
          <Controls showInteractive={false} position="bottom-center" />
          <MiniMap position="bottom-right" pannable zoomable nodeColor={(node) => node.data.kind === "analysis" ? "#d9cff5" : node.data.kind === "group" ? "#f1eafa" : "#d7e2fb"} />
        </ReactFlow>
        <div className="canvas-tip">拖动来源时分析卡同步移动 · Ctrl 多选 · 双击名称重命名</div>
      </section>

      <aside className="inspector">
        <div className="inspector-tabs"><button className={rightTab === "asset" ? "active" : ""} onClick={() => setRightTab("asset")}>素材证据</button><button className={rightTab === "contract" ? "active" : ""} onClick={() => setRightTab("contract")}>设计系统</button></div>
        {rightTab === "asset" ? selected ? <>
          <section className="inspect-title"><span className={"inspect-icon " + selected.data.kind}>{selected.data.kind === "analysis" ? "✦" : "◫"}</span><div><small>{selected.data.kind === "group" ? "灵感簇" : "证据卡片"}</small><h2>{selected.data.title}</h2></div></section>
          {["image", "web", "text"].includes(selected.data.kind) && <button className="analyze-button" onClick={() => void analyze(selected.id)} disabled={selected.data.status === "processing"}>✦ {selected.data.status === "ready" ? "原位重新分析" : "用真实模型拆解"}<small>BYOK</small></button>}
          {!!selected.data.colors?.length && <section className="inspect-block"><div className="block-heading"><h3>设计令牌候选</h3><button onClick={() => navigator.clipboard.writeText(selected.data.colors?.join(", ") || "")}>复制全部</button></div><div className="palette-list">{selected.data.colors.map((color) => <button key={color} onClick={() => navigator.clipboard.writeText(color)}><i style={{ background: color }} /><span>颜色</span><code>{color}</code></button>)}</div></section>}
          {!!selected.data.principles?.length && <section className="inspect-block"><h3>视觉原则</h3><ol className="principle-list">{selected.data.principles.map((item) => <li key={item}>{item}</li>)}</ol></section>}
          {!!selected.data.regions?.length && <section className="inspect-block"><div className="block-heading"><h3>候选元素</h3><small>确认后才进入导出</small></div><div className="region-list">{selected.data.regions.map((region) => <div key={region.id}><span className="region-preview">{region.type}</span><div><strong>{region.label}</strong><small>{region.confidence && region.confidence < .75 ? "需要复核" : "视觉推断"}</small></div><button disabled={region.confirmed} onClick={() => void confirmRegion(region)}>{region.confirmed ? "已确认" : "调整并确认"}</button></div>)}</div></section>}
          <section className="inspect-block"><h3>证据状态</h3><div className="evidence-state"><span className={selected.data.kind === "element" ? "measured" : "inferred"}>{selected.data.kind === "element" ? "人工确认" : selected.data.status === "ready" ? "视觉推断" : "需要分析"}</span><p>具体置信度与模型信息保留在证据详情，不用单个百分比替代判断。</p></div></section>
        </> : <div className="empty-inspector">选择卡片查看证据、令牌与候选元素</div> : (
          <section className="contract-panel"><span className="modal-kicker">Design System Contract</span><h2>把多份参考合并成可执行约束</h2><p>先分析素材，再合并冲突。合同确认后才允许生成任务包。</p>
            <button className="analyze-button" onClick={() => void previewContract()} disabled={contractBusy}>✦ {contractBusy ? "正在合并…" : "生成合同预览"}</button>
            {contract && <div className="contract-content"><h3>{contract.title}</h3><h4>强制原则</h4><ol>{contract.principles.map((item) => <li key={item}>{item}</li>)}</ol><h4>Tokens</h4><div className="contract-swatches">{contract.tokens.colors.map((item) => <span key={item.name} title={item.name + " · " + item.sourceAssetIds.join(",")} style={{ background: item.value }} />)}</div>
              {!!contract.conflicts.length && <div className="contract-warning"><strong>需要处理的冲突</strong>{contract.conflicts.map((item) => <p key={item}>{item}</p>)}</div>}
              {!!contract.unresolved.length && <div className="contract-warning"><strong>未确认项</strong>{contract.unresolved.map((item) => <p key={item}>{item}</p>)}</div>}
              <button className="button primary wide" onClick={() => void confirmContract()}>确认并版本化合同</button>
            </div>}
          </section>
        )}
      </aside>

      {menuId && <div className="node-action-menu"><button onClick={() => handleMenu("rename")}>重命名</button><button onClick={() => handleMenu("analyze")}>分析 / 重新分析</button><button onClick={() => handleMenu("open")}>打开来源</button><button onClick={() => handleMenu("move")}>移动到灵感簇</button><button onClick={() => handleMenu("detach")}>移出灵感簇</button><button className="danger" onClick={() => handleMenu("delete")}>删除</button><button onClick={() => setMenuId(null)}>取消</button></div>}
      {connection && <div className="modal-backdrop"><section className="modal relation-modal"><button className="modal-close" onClick={() => setConnection(null)}>×</button><span className="modal-kicker">灵感联想</span><h2>这两张卡片是什么关系？</h2><p>来源关系由系统维护；手工连线需要明确语义。</p><div className="relation-options">{relationChoices.map((item) => <button key={item.type} onClick={() => confirmConnection(item.type)}>{item.label}</button>)}</div></section></div>}
      {modal === "import" && <div className="modal-backdrop" onMouseDown={() => setModal(null)}><section className="modal import-modal" onMouseDown={(event) => event.stopPropagation()}><button className="modal-close" onClick={() => setModal(null)}>×</button><span className="modal-kicker">持久化采集</span><h2>加入当前画布</h2><p>图片会存入私有对象存储；网页与文字保留可追溯来源。</p><div className="import-drop" onClick={() => fileInput.current?.click()}><span>⇧</span><strong>上传 JPG、PNG、WebP</strong><small>最大 20 MB</small></div><div className="url-entry"><input autoFocus value={urlValue} onChange={(event) => setUrlValue(event.target.value)} placeholder="公开 URL 或灵感文字" /><button onClick={() => urlValue.trim() && void addAsset(urlValue.trim())}>加入</button></div></section></div>}
      {modal === "organize" && <div className="modal-backdrop"><section className="modal"><button className="modal-close" onClick={() => setModal(null)}>×</button><span className="modal-kicker">整理预览</span><h2>按来源链整理，不拆散伴随卡</h2><p>将移动 {nodes.filter((node) => !node.parentId && node.data.kind !== "group").length} 张顶层卡片；现有灵感簇、来源实线和已确认联想均保留。应用后可一步撤销。</p><div className="organize-summary"><span>来源</span><b>→</b><span>分析伴随</span><b>→</b><span>确认元素</span></div><footer><button className="button soft" onClick={() => setModal(null)}>取消</button><button className="button primary" onClick={applyOrganize}>应用方案</button></footer></section></div>}
      {modal === "credentials" && <div className="modal-backdrop"><section className="modal credential-modal"><button className="modal-close" onClick={() => setModal(null)}>×</button><span className="modal-kicker">BYOK</span><h2>连接真实 AI</h2><p>Key 仅服务端 AES-256-GCM 加密保存，界面和日志不回传明文。</p><div className="credential-list">{credentialState.map((item) => <span key={item.provider}><b>{item.provider}</b>{item.model} · •••• {item.lastFour}{item.supportsVision ? " · 视觉" : " · 文字"}</span>)}</div><div className="credential-form"><select value={credentialForm.provider} onChange={(event) => setCredentialForm({ ...credentialForm, provider: event.target.value })}><option value="openai">OpenAI（视觉）</option><option value="qwen">Qwen（视觉）</option><option value="deepseek">DeepSeek（仅文字）</option></select><input type="password" value={credentialForm.apiKey} onChange={(event) => setCredentialForm({ ...credentialForm, apiKey: event.target.value })} placeholder="API Key" /><input value={credentialForm.model} onChange={(event) => setCredentialForm({ ...credentialForm, model: event.target.value })} placeholder="模型（留空使用默认）" /><button className="button primary" disabled={!credentialForm.apiKey || loadingCredential} onClick={() => void saveCredential()}>{loadingCredential ? "测试中…" : "测试并保存"}</button></div></section></div>}
      {modal === "export" && <div className="modal-backdrop"><section className="modal export-modal"><button className="modal-close" onClick={() => setModal(null)}>×</button><span className="modal-kicker">生产任务包</span><h2>选择设计师接下来的任务</h2><p>导出基于已确认合同与真实证据，不再从前端卡片拼装杂乱模板。</p><div className="export-purpose-grid">{exportPurposeOptions.map((option) => <button key={option.id} className={exportPurpose === option.id ? "is-active" : ""} onClick={() => setExportPurpose(option.id)}><span>{option.icon}</span><div><strong>{option.title}</strong><p>{option.description}</p><small>{option.files}</small></div></button>)}</div><footer><button className="button soft" onClick={() => setModal(null)}>取消</button><button className="button primary" onClick={() => void exportPackage()}>生成 ZIP</button></footer></section></div>}
      {toast && <div className="toast"><span>✓</span>{toast}</div>}
    </main>
  );
}

export default function InspoWorkspace() {
  return <ReactFlowProvider><WorkspaceCanvas /></ReactFlowProvider>;
}
