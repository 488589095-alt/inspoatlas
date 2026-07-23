"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  addEdge,
  applyNodeChanges,
  Background,
  BackgroundVariant,
  Connection,
  Controls,
  Edge,
  MiniMap,
  NodeChange,
  ReactFlow,
  ReactFlowProvider,
  SelectionMode,
  useEdgesState,
  useNodesState,
  useReactFlow,
} from "@xyflow/react";
import type { AnalysisResult, DesignContract, Relation, RelationType } from "@/packages/domain/src";
import { exportPurposeOptions } from "./exportOptions";
import { CardNode } from "./workspace/CardNode";
import { buildOrganizePreview, type OrganizePreview } from "./workspace/organize";
import {
  flowToScene,
  readDraft,
  relationLabel,
  saveDraft,
  sceneToFlow,
  type BoardSummary,
  type CanvasNode,
  type CardData,
} from "./workspace/model";
import "@xyflow/react/dist/style.css";
import "./export.css";

const nodeTypes = { inspo: CardNode };
const sourceKinds = new Set(["image", "web", "text"]);
const relationChoices: Array<{ type: RelationType; label: string }> = [
  { type: "similar-style", label: "相似风格" },
  { type: "same-component", label: "相同结构" },
  { type: "complements", label: "可组合使用" },
  { type: "contrasts", label: "对比参考" },
  { type: "same-project", label: "同一项目" },
];
const defaultSize: Record<CardData["kind"], { width: number; height: number }> = {
  image: { width: 300, height: 340 },
  web: { width: 320, height: 280 },
  text: { width: 290, height: 190 },
  analysis: { width: 350, height: 310 },
  element: { width: 250, height: 170 },
  group: { width: 760, height: 520 },
};

type WorkspaceModal = "import" | "credentials" | "export" | null;
type RelationView = "hidden" | "selection" | "related" | "all";
type ContextMenu = { kind: "node" | "board"; id: string; x: number; y: number };
type DeleteRequest = { kind: "board" | "nodes"; ids: string[]; title: string; body: string };

function WorkspaceCanvas() {
  const [boards, setBoards] = useState<BoardSummary[]>([]);
  const [boardId, setBoardId] = useState("");
  const [boardTitle, setBoardTitle] = useState("加载中…");
  const [nodes, setNodes] = useNodesState<CanvasNode>([]);
  const [edges, setEdges, onEdgesChange] = useEdgesState<Edge>([]);
  const [selectedIds, setSelectedIds] = useState<string[]>([]);
  const [search, setSearch] = useState("");
  const [savedState, setSavedState] = useState("正在读取");
  const [rightTab, setRightTab] = useState<"asset" | "baseline">("asset");
  const [relationView, setRelationView] = useState<RelationView>("selection");
  const [modal, setModal] = useState<WorkspaceModal>(null);
  const [contextMenu, setContextMenu] = useState<ContextMenu | null>(null);
  const [deleteRequest, setDeleteRequest] = useState<DeleteRequest | null>(null);
  const [connection, setConnection] = useState<Connection | null>(null);
  const [toast, setToast] = useState("");
  const [urlValue, setUrlValue] = useState("");
  const [organizePreview, setOrganizePreview] = useState<OrganizePreview | null>(null);
  const [editingBoardId, setEditingBoardId] = useState<string | null>(null);
  const [boardDraft, setBoardDraft] = useState("");
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

  const selectedNodes = useMemo(() => nodes.filter((node) => selectedIds.includes(node.id)), [nodes, selectedIds]);
  const selected = selectedNodes[0];
  const visibleNodes = useMemo(() => {
    const base = organizePreview?.nodes ?? nodes;
    const term = search.trim().toLowerCase();
    if (!term) return base;
    return base.map((node) => ({
      ...node,
      hidden: node.data.kind !== "group" && !JSON.stringify(node.data).toLowerCase().includes(term),
    }));
  }, [nodes, organizePreview, search]);
  const visibleEdges = useMemo(() => {
    const selectedSet = new Set(selectedIds);
    const hiddenNodeIds = new Set(visibleNodes.filter((node) => node.hidden).map((node) => node.id));
    return edges.map((edge) => {
      let hidden = relationView === "hidden" || hiddenNodeIds.has(edge.source) || hiddenNodeIds.has(edge.target);
      if (relationView === "selection") hidden ||= !(selectedSet.has(edge.source) && selectedSet.has(edge.target));
      if (relationView === "related") hidden ||= !(selectedSet.has(edge.source) || selectedSet.has(edge.target));
      return { ...edge, hidden };
    });
  }, [edges, relationView, selectedIds, visibleNodes]);

  const notify = useCallback((message: string) => {
    setToast(message);
    window.setTimeout(() => setToast(""), 3000);
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
      const created = await fetch("/api/boards", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ title: "我的灵感图谱" }),
      });
      const payload = await created.json() as { board: BoardSummary };
      list = [payload.board];
    }
    setBoards(list);
    const requested = new URLSearchParams(location.search).get("board");
    setBoardId(list.some((item) => item.id === requested) ? requested! : list[0].id);
  }, []);

  useEffect(() => {
    loadBoards().catch((error) => notify(error.message));
  }, [loadBoards, notify]);

  useEffect(() => {
    if (!boardId) return;
    let active = true;
    loading.current = true;
    setSavedState("正在读取");
    setOrganizePreview(null);
    fetch("/api/boards/" + boardId, { cache: "no-store" }).then(async (response) => {
      if (!response.ok) throw new Error("画布读取失败");
      const { board } = await response.json();
      if (!active) return;
      const flow = sceneToFlow(board.scene);
      version.current = board.version;
      setBoardTitle(board.title);
      const draft = await readDraft<{ baseVersion: number; scene: typeof board.scene }>(boardId);
      const recovered = draft && draft.baseVersion === board.version ? sceneToFlow(draft.scene) : flow;
      setNodes(recovered.nodes);
      setEdges(recovered.edges);
      setSelectedIds([]);
      if (recovered.viewport) await setViewport(recovered.viewport);
      setSavedState(draft && draft.baseVersion === board.version ? "已恢复本地草稿" : "已同步");
      loading.current = false;
      window.history.replaceState(null, "", "?board=" + encodeURIComponent(boardId));
      window.setTimeout(() => recovered.nodes.length && fitView({ padding: 0.18, duration: 300 }), 30);

      void fetch("/api/analyses?boardId=" + encodeURIComponent(boardId), { cache: "no-store" })
        .then(async (analysisResponse) => analysisResponse.ok ? analysisResponse.json() : { analyses: [] })
        .then((payload: { analyses?: Array<Record<string, unknown>> }) => {
          if (!active || !payload.analyses?.length) return;
          setNodes((current) => current.map((node) => {
            const assetId = String(node.data.assetId || node.id);
            const analysis = payload.analyses?.find((item) => item.assetId === assetId);
            return analysis ? mergeAnalysis(node, analysis) : node;
          }));
        }).catch(() => undefined);
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
        const response = await fetch("/api/boards/" + boardId + "/scene", {
          method: "PUT",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({ baseVersion: version.current, scene }),
        });
        if (response.status === 409) {
          setSavedState("存在版本冲突");
          notify("服务器画布已变化，请刷新后选择版本");
          return;
        }
        if (!response.ok) throw new Error();
        const payload = await response.json();
        version.current = payload.version;
        setSavedState("已自动保存");
      } catch {
        setSavedState("离线草稿已保留");
      }
    }, 900);
    return () => window.clearTimeout(saveTimer.current);
  }, [nodes, edges, boardId, getViewport, notify]);

  useEffect(() => {
    const handler = (event: Event) => {
      const detail = (event as CustomEvent<{ id: string; action: string; title?: string; x?: number; y?: number }>).detail;
      if (detail.action === "rename" && detail.title) return renameNode(detail.id, detail.title);
      if (detail.action === "menu") {
        setSelectedIds([detail.id]);
        setContextMenu({
          kind: "node",
          id: detail.id,
          x: detail.x ?? window.innerWidth / 2,
          y: detail.y ?? window.innerHeight / 2,
        });
      }
      if (detail.action === "analyze") void analyze(detail.id);
      if (detail.action === "toggle-analysis") toggleAnalysis(detail.id);
      if (detail.action === "show-details") {
        setSelectedIds([detail.id]);
        setRightTab("asset");
      }
    };
    window.addEventListener("inspo:node-action", handler);
    return () => window.removeEventListener("inspo:node-action", handler);
  });

  useEffect(() => {
    const closeMenu = () => setContextMenu(null);
    window.addEventListener("pointerdown", closeMenu);
    window.addEventListener("blur", closeMenu);
    return () => {
      window.removeEventListener("pointerdown", closeMenu);
      window.removeEventListener("blur", closeMenu);
    };
  }, []);

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      const target = event.target as HTMLElement | null;
      if (target?.closest("input, textarea, select, [contenteditable=true]")) return;
      if (event.key === "Delete" && selectedIds.length) {
        event.preventDefault();
        requestDeleteNodes(selectedIds);
      }
      if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === "a") {
        event.preventDefault();
        setNodes((current) => current.map((node) => ({
          ...node,
          selected: node.data.kind !== "group" && !node.data.pinned,
        })));
      }
      if (event.key === "Escape") {
        setContextMenu(null);
        setSelectedIds([]);
        setNodes((current) => current.map((node) => ({ ...node, selected: false })));
      }
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
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
        setNodes((current) => [
          ...current,
          ...fresh.filter((item) => !current.some((node) => node.id === item.id)).map((item, index): CanvasNode => ({
            id: String(item.id),
            type: "inspo",
            position: { x: 80 + index * 340, y: 120 + current.length * 16 },
            data: {
              kind: "web",
              title: String(item.title),
              assetId: String(item.id),
              sourceUrl: item.sourceUrl ? String(item.sourceUrl) : undefined,
              body: String(item.extractedText || "插件采集已到达，等待拆解"),
              tags: ["插件采集"],
              status: String(item.status),
              imageUrl: "/api/assets/" + item.id + "/content",
            },
            style: defaultSize.web,
            zIndex: 10,
          })),
        ]);
        notify("插件采集已进入当前画布");
      } catch {
        // Polling retries automatically.
      }
    }
    void syncClips();
    const timer = window.setInterval(syncClips, 3000);
    return () => window.clearInterval(timer);
  }, [boardId, setNodes, notify]);

  const onNodesChange = useCallback((changes: NodeChange<CanvasNode>[]) => {
    setNodes((current) => applyNodeChanges(changes, current));
  }, [setNodes]);

  const onConnect = useCallback((value: Connection) => setConnection(value), []);

  function confirmConnection(type: RelationType) {
    if (!connection?.source || !connection.target) return;
    remember();
    const relation: Relation = {
      id: crypto.randomUUID(),
      sourceId: connection.source,
      targetId: connection.target,
      type,
      layer: "association",
      status: "confirmed",
      origin: "human",
    };
    setEdges((current) => addEdge({
      ...connection,
      id: relation.id,
      type: "smoothstep",
      label: relationLabel[type],
      data: relation,
      zIndex: 0,
      style: { stroke: "#9b8aaa", strokeWidth: 1.6 },
    }, current));
    setConnection(null);
  }

  async function createBoard(sourceBoardId?: string) {
    const response = await fetch("/api/boards", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ title: sourceBoardId ? boardTitle + " 副本" : "未命名画布", sourceBoardId }),
    });
    if (!response.ok) return notify("新建画布失败");
    const { board } = await response.json();
    setBoards((current) => [board, ...current]);
    setBoardId(board.id);
    notify(sourceBoardId ? "画布已复制" : "新画布已创建");
  }

  function startBoardRename(id: string, title: string) {
    setEditingBoardId(id);
    setBoardDraft(title);
    setContextMenu(null);
  }

  async function commitBoardRename(id: string) {
    const previous = boards.find((item) => item.id === id)?.title ?? boardTitle;
    const title = boardDraft.trim();
    setEditingBoardId(null);
    if (!title || title === previous) return setBoardDraft("");
    const response = await fetch("/api/boards/" + id, {
      method: "PATCH",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ title }),
    });
    if (!response.ok) return notify("重命名失败");
    setBoards((current) => current.map((item) => item.id === id ? { ...item, title } : item));
    if (id === boardId) setBoardTitle(title);
    setBoardDraft("");
  }

  function requestDeleteBoard(id: string) {
    const title = boards.find((item) => item.id === id)?.title ?? "这个画布";
    setDeleteRequest({
      kind: "board",
      ids: [id],
      title: "删除画布？",
      body: `“${title}”中的素材、分析和设计基准都会被删除。`,
    });
    setContextMenu(null);
  }

  async function performDeleteBoard(id: string) {
    const response = await fetch("/api/boards/" + id, { method: "DELETE" });
    if (!response.ok) return notify("画布删除失败");
    const rest = boards.filter((item) => item.id !== id);
    setBoards(rest);
    setDeleteRequest(null);
    if (id === boardId) {
      if (rest.length) setBoardId(rest[0].id);
      else await createBoard();
    }
  }

  async function addAsset(value: string) {
    const isUrl = /^https?:\/\//i.test(value);
    const response = await fetch("/api/assets", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        boardId,
        kind: isUrl ? "web" : "text",
        title: isUrl ? new URL(value).hostname : "新便签",
        sourceUrl: isUrl ? value : undefined,
        text: isUrl ? undefined : value.slice(0, 50_000),
      }),
    });
    if (!response.ok) return notify((await response.json().catch(() => ({}))).error || "导入失败");
    const { asset } = await response.json();
    remember();
    const kind = isUrl ? "web" : "text";
    const node: CanvasNode = {
      id: asset.id,
      type: "inspo",
      position: { x: 120 + nodes.length * 20, y: 120 + nodes.length * 16 },
      data: {
        kind,
        title: asset.title,
        assetId: asset.id,
        sourceUrl: asset.sourceUrl,
        body: value,
        tags: ["待拆解"],
      },
      style: defaultSize[kind],
      zIndex: 10,
    };
    setNodes((current) => [...current, node]);
    setSelectedIds([asset.id]);
    setModal(null);
    setUrlValue("");
    notify(isUrl ? "网页来源卡已保存" : "文字参考已保存");
  }

  async function addImage(file: File) {
    if (!/^image\/(jpeg|png|webp)$/.test(file.type) || file.size > 20 * 1024 * 1024) {
      return notify("仅支持 20 MB 内的 JPG、PNG、WebP");
    }
    const form = new FormData();
    form.set("boardId", boardId);
    form.set("file", file);
    const response = await fetch("/api/assets", { method: "POST", body: form });
    if (!response.ok) return notify((await response.json().catch(() => ({}))).error || "图片上传失败");
    const { asset } = await response.json();
    remember();
    setNodes((current) => [...current, {
      id: asset.id,
      type: "inspo",
      position: { x: 100 + current.length * 18, y: 120 + current.length * 14 },
      data: {
        kind: "image",
        title: asset.title,
        assetId: asset.id,
        imageUrl: asset.contentUrl || "/api/assets/" + asset.id + "/content",
        tags: ["待拆解"],
      },
      style: defaultSize.image,
      zIndex: 10,
    }]);
    setSelectedIds([asset.id]);
    setModal(null);
    notify("图片已加入当前画布");
  }

  async function analyze(nodeId?: string, captureHistory = true) {
    const source = nodes.find((node) => node.id === (nodeId || selectedIds[0]));
    if (!source || !sourceKinds.has(source.data.kind)) return notify("请选择一张原始素材");
    const assetId = source.data.assetId || source.id;
    if (captureHistory) remember();
    setNodes((current) => current.map((item) => ({
      ...item,
      data: {
        ...item.data,
        analysisExpanded: item.id === source.id,
        ...(item.id === source.id ? { status: "processing", analysisError: undefined } : {}),
      },
    })));
    const response = await fetch("/api/analyses", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ assetId, mode: "replace" }),
    });
    const payload = await response.json().catch(() => ({}));
    if (!response.ok) {
      setNodes((current) => current.map((item) => item.id === source.id ? {
        ...item,
        data: {
          ...item.data,
          status: item.data.analysisSummary ? "ready" : "failed",
          analysisError: payload.error || "拆解失败",
        },
      } : item));
      if (response.status === 409) setModal("credentials");
      return notify(payload.error || "拆解失败，已保留上次结果");
    }
    const result = payload.analysis.result as AnalysisResult;
    setNodes((current) => current.map((item) => item.id === source.id ? {
      ...item,
      data: {
        ...item.data,
        analysisId: payload.analysis.id,
        analysisSummary: result.summary,
        analysisExpanded: true,
        analysisError: undefined,
        status: "ready",
        principles: result.principles,
        colors: result.palette.map((color) => color.hex),
        tags: result.tags.slice(0, 8).map((tag) => tag.value),
        regions: result.components,
      },
    } : item));
    notify("参考拆解完成");
  }

  async function analyzeSelected() {
    const ids = selectedNodes.filter((node) => sourceKinds.has(node.data.kind)).map((node) => node.id);
    if (!ids.length) return notify("所选内容中没有可分析的原始素材");
    remember();
    for (const id of ids) await analyze(id, false);
  }

  function toggleAnalysis(nodeId: string) {
    setNodes((current) => {
      const target = current.find((node) => node.id === nodeId);
      const nextValue = !target?.data.analysisExpanded;
      return current.map((node) => ({
        ...node,
        data: { ...node.data, analysisExpanded: node.id === nodeId ? nextValue : false },
      }));
    });
  }

  function createGroup(ids = selectedIds) {
    const chosen = nodes.filter((node) =>
      ids.includes(node.id) &&
      !node.parentId &&
      node.data.kind !== "group" &&
      node.data.kind !== "analysis",
    );
    if (!chosen.length) return notify("请先选择至少一张未分组卡片");
    const minX = Math.min(...chosen.map((node) => node.position.x));
    const minY = Math.min(...chosen.map((node) => node.position.y));
    const maxX = Math.max(...chosen.map((node) => node.position.x + nodeWidth(node)));
    const maxY = Math.max(...chosen.map((node) => node.position.y + nodeHeight(node)));
    const id = "group-" + crypto.randomUUID();
    const group: CanvasNode = {
      id,
      type: "inspo",
      position: { x: minX - 36, y: minY - 62 },
      data: { kind: "group", title: "新分组", body: `${chosen.length} 张卡片 · 拖动分组可整体移动` },
      style: {
        width: Math.max(380, maxX - minX + 72),
        height: Math.max(260, maxY - minY + 98),
      },
      zIndex: -20,
    };
    const chosenIds = new Set(chosen.map((node) => node.id));
    remember();
    setNodes((current) => [
      group,
      ...current.map((node) => chosenIds.has(node.id) ? {
        ...node,
        parentId: id,
        extent: "parent" as const,
        position: { x: node.position.x - group.position.x, y: node.position.y - group.position.y },
        selected: false,
        zIndex: 10,
      } : node),
    ]);
    setSelectedIds([id]);
    notify("已建立分组，内部卡片会随分组一起移动");
  }

  function moveNodesToGroup(ids: string[], groupId: string) {
    const target = nodes.find((node) => node.id === groupId && node.data.kind === "group");
    if (!target) return;
    const moveIds = new Set(ids);
    remember();
    setNodes((current) => current.map((item) => {
      if (!moveIds.has(item.id) || item.data.kind === "group") return item;
      const oldParent = current.find((parent) => parent.id === item.parentId);
      const absolute = oldParent
        ? { x: oldParent.position.x + item.position.x, y: oldParent.position.y + item.position.y }
        : item.position;
      return {
        ...item,
        parentId: target.id,
        extent: "parent" as const,
        position: {
          x: Math.max(24, absolute.x - target.position.x),
          y: Math.max(66, absolute.y - target.position.y),
        },
        zIndex: 10,
      };
    }));
    notify(`已移入“${target.data.title}”`);
  }

  function detachNodes(ids: string[]) {
    const detachIds = new Set(ids);
    remember();
    setNodes((current) => current.map((item) => {
      if (!detachIds.has(item.id) || !item.parentId) return item;
      const parent = current.find((candidate) => candidate.id === item.parentId);
      if (!parent) return item;
      return {
        ...item,
        parentId: undefined,
        extent: undefined,
        position: { x: parent.position.x + item.position.x, y: parent.position.y + item.position.y },
      };
    }));
  }

  function requestDeleteNodes(ids: string[]) {
    const targets = nodes.filter((node) => ids.includes(node.id));
    if (!targets.length) return;
    const hasGroupMembers = targets.some((target) =>
      target.data.kind === "group" && nodes.some((node) => node.parentId === target.id),
    );
    const hasDerived = targets.some((target) =>
      sourceKinds.has(target.data.kind) && Boolean(target.data.analysisId || target.data.analysisSummary || target.data.regions?.length),
    );
    if (hasGroupMembers || hasDerived || targets.length > 1) {
      setDeleteRequest({
        kind: "nodes",
        ids,
        title: targets.length > 1 ? `删除 ${targets.length} 张卡片？` : "删除这张卡片？",
        body: hasGroupMembers
          ? "删除分组会保留内部卡片；其他选中卡片会被删除。"
          : hasDerived
            ? "与来源关联的拆解结果和已确认元素也会一起删除。"
            : "这次批量删除可以通过撤销恢复。",
      });
      return;
    }
    performDeleteNodes(ids);
  }

  function performDeleteNodes(ids: string[]) {
    const remove = new Set(ids);
    const groupTargets = nodes.filter((node) => remove.has(node.id) && node.data.kind === "group");
    for (const source of nodes.filter((node) => remove.has(node.id) && sourceKinds.has(node.data.kind))) {
      nodes.filter((node) => node.data.sourceAssetId === (source.data.assetId || source.id)).forEach((node) => remove.add(node.id));
    }
    remember();
    setNodes((current) => current.filter((node) => !remove.has(node.id)).map((node) => {
      const deletedParent = groupTargets.find((group) => group.id === node.parentId);
      return deletedParent ? {
        ...node,
        parentId: undefined,
        extent: undefined,
        position: { x: deletedParent.position.x + node.position.x, y: deletedParent.position.y + node.position.y },
      } : node;
    }));
    setEdges((current) => current.filter((edge) => !remove.has(edge.source) && !remove.has(edge.target)));
    setSelectedIds([]);
    setDeleteRequest(null);
    notify(groupTargets.length ? "分组已删除，内部卡片已保留" : "已删除，可使用撤销恢复");
  }

  function renameNode(nodeId: string, title: string) {
    remember();
    setNodes((current) => current.map((item) => item.id === nodeId
      ? { ...item, data: { ...item.data, title } }
      : item));
  }

  function togglePinned(nodeId: string) {
    remember();
    setNodes((current) => current.map((node) => node.id === nodeId
      ? { ...node, data: { ...node.data, pinned: !node.data.pinned }, draggable: Boolean(node.data.pinned) }
      : node));
  }

  function alignSelected(mode: "left" | "top" | "horizontal" | "vertical") {
    if (selectedNodes.length < 2) return;
    const parents = new Set(selectedNodes.map((node) => node.parentId || "root"));
    if (parents.size > 1) return notify("请在同一个分组内进行对齐");
    remember();
    const orderedX = [...selectedNodes].sort((a, b) => a.position.x - b.position.x);
    const orderedY = [...selectedNodes].sort((a, b) => a.position.y - b.position.y);
    const left = Math.min(...selectedNodes.map((node) => node.position.x));
    const top = Math.min(...selectedNodes.map((node) => node.position.y));
    const totalWidth = orderedX.reduce((sum, node) => sum + nodeWidth(node), 0);
    const totalHeight = orderedY.reduce((sum, node) => sum + nodeHeight(node), 0);
    const spanWidth = Math.max(...orderedX.map((node) => node.position.x + nodeWidth(node))) - left;
    const spanHeight = Math.max(...orderedY.map((node) => node.position.y + nodeHeight(node))) - top;
    const horizontalGap = orderedX.length > 1 ? Math.max(16, (spanWidth - totalWidth) / (orderedX.length - 1)) : 0;
    const verticalGap = orderedY.length > 1 ? Math.max(16, (spanHeight - totalHeight) / (orderedY.length - 1)) : 0;
    const positions = new Map<string, { x: number; y: number }>();
    if (mode === "horizontal") {
      let x = left;
      orderedX.forEach((node) => { positions.set(node.id, { x, y: node.position.y }); x += nodeWidth(node) + horizontalGap; });
    }
    if (mode === "vertical") {
      let y = top;
      orderedY.forEach((node) => { positions.set(node.id, { x: node.position.x, y }); y += nodeHeight(node) + verticalGap; });
    }
    setNodes((current) => current.map((node) => selectedIds.includes(node.id) ? {
      ...node,
      position: mode === "left"
        ? { x: left, y: node.position.y }
        : mode === "top"
          ? { x: node.position.x, y: top }
          : positions.get(node.id) ?? node.position,
    } : node));
  }

  function previewOrganize() {
    const preview = buildOrganizePreview(nodes, selectedIds);
    if (!preview) return notify("至少需要两张未分组、未锁定的卡片");
    setOrganizePreview(preview);
    setContextMenu(null);
    window.setTimeout(() => fitView({ nodes: preview.nodes.map((node) => ({ id: node.id })), padding: 0.12, duration: 420 }), 30);
  }

  function applyOrganize() {
    if (!organizePreview) return;
    remember();
    setNodes(organizePreview.nodes.map((node) => ({
      ...node,
      selectable: true,
      data: { ...node.data, preview: false },
    })));
    setOrganizePreview(null);
    setSelectedIds([]);
    notify("画布已按设计重点整理，可一步撤销");
  }

  function undo() {
    const snapshot = history.current.pop();
    if (!snapshot) return notify("没有可撤销的操作");
    redoHistory.current.push({ nodes: structuredClone(nodes), edges: structuredClone(edges) });
    setNodes(snapshot.nodes);
    setEdges(snapshot.edges);
  }

  function redo() {
    const snapshot = redoHistory.current.pop();
    if (!snapshot) return notify("没有可重做的操作");
    history.current.push({ nodes: structuredClone(nodes), edges: structuredClone(edges) });
    setNodes(snapshot.nodes);
    setEdges(snapshot.edges);
  }

  async function previewBaseline() {
    setContractBusy(true);
    const response = await fetch("/api/boards/" + boardId + "/contracts/preview", { method: "POST" });
    const payload = await response.json().catch(() => ({}));
    setContractBusy(false);
    if (!response.ok) return notify(payload.error || "请先完成至少一次真实拆解");
    setContract(payload.contract);
    setRightTab("baseline");
  }

  async function confirmBaseline() {
    if (!contract) return;
    const response = await fetch("/api/boards/" + boardId + "/contracts", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ contract }),
    });
    notify(response.ok ? "设计基准已保存" : "设计基准保存失败");
  }

  async function exportPackage() {
    const response = await fetch("/api/exports", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ boardId, purpose: exportPurpose }),
    });
    if (!response.ok) return notify((await response.json().catch(() => ({}))).error || "请先确认设计基准");
    const blob = await response.blob();
    const url = URL.createObjectURL(blob);
    const anchor = document.createElement("a");
    anchor.href = url;
    anchor.download = "inspoatlas-" + exportPurpose + ".zip";
    anchor.click();
    URL.revokeObjectURL(url);
    setModal(null);
  }

  async function loadCredentials() {
    const response = await fetch("/api/ai-credentials", { cache: "no-store" });
    if (response.ok) setCredentialState((await response.json()).credentials || []);
    setModal("credentials");
  }

  async function saveCredential() {
    setLoadingCredential(true);
    const response = await fetch("/api/ai-credentials", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(credentialForm),
    });
    const payload = await response.json().catch(() => ({}));
    setLoadingCredential(false);
    if (!response.ok) return notify(payload.error || "Key 测试失败");
    setCredentialForm((value) => ({ ...value, apiKey: "" }));
    await loadCredentials();
    notify("Key 已测试并加密保存");
  }

  function handleNodeMenu(action: string) {
    const menu = contextMenu;
    if (!menu || menu.kind !== "node") return;
    const node = nodes.find((item) => item.id === menu.id);
    setContextMenu(null);
    if (!node) return;
    if (action === "rename") window.dispatchEvent(new CustomEvent("inspo:rename-node", { detail: { id: node.id } }));
    if (action === "analyze") void analyze(node.id);
    if (action === "detach") detachNodes([node.id]);
    if (action === "delete") requestDeleteNodes([node.id]);
    if (action === "lock") togglePinned(node.id);
    if (action === "select-children") {
      const childIds = nodes.filter((item) => item.parentId === node.id).map((item) => item.id);
      setNodes((current) => current.map((item) => ({ ...item, selected: childIds.includes(item.id) })));
    }
    if (action === "open" && node.data.sourceUrl) window.open(node.data.sourceUrl, "_blank", "noopener");
  }

  async function confirmRegion(region: NonNullable<CardData["regions"]>[number]) {
    if (!selected?.data.analysisId || !selected.data.assetId || !region.rect) return notify("此候选缺少可调整区域");
    const form = new FormData();
    form.set("label", region.label);
    form.set("type", region.type);
    form.set("rect", JSON.stringify(region.rect));
    const response = await fetch("/api/analyses/" + selected.data.analysisId + "/regions/" + region.id, {
      method: "PATCH",
      body: form,
    });
    const payload = await response.json().catch(() => ({}));
    if (!response.ok) return notify(payload.error || "确认失败");
    const id = "element-" + region.id + "-" + selected.data.assetId;
    remember();
    setNodes((current) => [
      ...current.map((node) => node.id === selected.id ? {
        ...node,
        data: {
          ...node.data,
          regions: node.data.regions?.map((item) => item.id === region.id
            ? { ...item, confirmed: true }
            : item),
        },
      } : node),
      ...(current.some((node) => node.id === id) ? [] : [{
        id,
        type: "inspo",
        parentId: selected.parentId,
        extent: selected.parentId ? "parent" as const : undefined,
        position: {
          x: selected.position.x + nodeWidth(selected) + 44,
          y: selected.position.y,
        },
        data: {
          kind: "element" as const,
          title: region.label,
          body: `${region.type} · 已确认可复用元素`,
          sourceAssetId: selected.data.assetId,
          tags: ["确认元素"],
          imageUrl: payload.element?.contentUrl,
        },
        style: defaultSize.element,
        zIndex: 10,
      }]),
    ]);
    const relation: Relation = {
      id: "element-edge-" + id,
      sourceId: selected.id,
      targetId: id,
      type: "element-of",
      layer: "provenance",
      status: "confirmed",
      origin: "human",
    };
    setEdges((current) => current.some((edge) => edge.id === relation.id) ? current : [...current, {
      id: relation.id,
      source: relation.sourceId,
      target: id,
      type: "smoothstep",
      label: "来自素材",
      data: relation,
      zIndex: 0,
      style: { stroke: "#64576f", strokeWidth: 2 },
    }]);
    notify("元素已确认，可用于导出");
  }

  const groups = nodes.filter((node) => node.data.kind === "group");

  return (
    <main
      className="workspace-shell"
      onDragOver={(event) => event.preventDefault()}
      onDrop={(event) => {
        event.preventDefault();
        const file = event.dataTransfer.files[0];
        if (file) void addImage(file);
      }}
    >
      <header className="topbar">
        <div className="brand"><span className="brand-mark">✦</span><div><strong>InspoAtlas</strong><small>设计基准工作台</small></div></div>
        <div className="board-title editable" title="双击修改画布名称">
          <span className="live-dot" />
          {editingBoardId === boardId ? (
            <input
              autoFocus
              value={boardDraft}
              onChange={(event) => setBoardDraft(event.target.value)}
              onBlur={() => void commitBoardRename(boardId)}
              onKeyDown={(event) => {
                if (event.key === "Enter") void commitBoardRename(boardId);
                if (event.key === "Escape") setEditingBoardId(null);
              }}
            />
          ) : <b onDoubleClick={() => startBoardRename(boardId, boardTitle)}>{boardTitle}</b>}
          <small>{savedState}</small>
        </div>
        <label className="search-box"><span>⌕</span><input value={search} onChange={(event) => setSearch(event.target.value)} placeholder="搜索文字、标签、颜色与来源…" /></label>
        <div className="top-actions">
          <button className="button ghost" onClick={undo} title="撤销">↶</button>
          <button className="button ghost" onClick={redo} title="重做">↷</button>
          <button className="button soft" onClick={() => void loadCredentials()}>AI 设置</button>
          <button className="button primary" onClick={() => setModal("export")}>导出使用</button>
        </div>
      </header>

      <aside className="left-rail">
        <button className="rail-action" onClick={() => setModal("import")}><span>＋</span>采集参考</button>
        <nav>
          <p>我的画布 <button onClick={() => void createBoard()} aria-label="新建画布">＋</button></p>
          {boards.map((board) => (
            <div
              key={board.id}
              className={"nav-item " + (board.id === boardId ? "active" : "")}
              onClick={() => setBoardId(board.id)}
              onContextMenu={(event) => {
                event.preventDefault();
                setContextMenu({ kind: "board", id: board.id, x: event.clientX, y: event.clientY });
              }}
            >
              <span className="nav-thumb cool" />
              {editingBoardId === board.id ? (
                <input
                  autoFocus
                  value={boardDraft}
                  onClick={(event) => event.stopPropagation()}
                  onChange={(event) => setBoardDraft(event.target.value)}
                  onBlur={() => void commitBoardRename(board.id)}
                  onKeyDown={(event) => {
                    event.stopPropagation();
                    if (event.key === "Enter") void commitBoardRename(board.id);
                    if (event.key === "Escape") setEditingBoardId(null);
                  }}
                />
              ) : (
                <span onDoubleClick={(event) => { event.stopPropagation(); startBoardRename(board.id, board.title); }}>{board.title}</span>
              )}
              <button
                className="board-menu-button"
                aria-label={`${board.title}操作`}
                onClick={(event) => {
                  event.stopPropagation();
                  setContextMenu({ kind: "board", id: board.id, x: event.clientX, y: event.clientY });
                }}
              >•••</button>
            </div>
          ))}
        </nav>
        <div className="shortcut-card">
          <strong>画布操作</strong>
          <p>拖动空白处框选；按住空格拖动画布；右键卡片或画布名称查看更多操作。</p>
          <span><kbd>Delete</kbd> 删除　<kbd>Ctrl A</kbd> 全选</span>
        </div>
        <div className="quota-card">
          <div><span>AI 模型</span><strong>{credentialState.length ? "已连接" : "未连接"}</strong></div>
          <p>没有 Key 时不会生成模拟结果。</p>
          <button onClick={() => void loadCredentials()}>连接自己的模型</button>
        </div>
      </aside>

      <section className="canvas-area" aria-label="灵感无限画布">
        <div className="workflow-strip" aria-label="工作流程">
          <span className={nodes.length ? "done" : "active"}><b>1</b>采集参考</span>
          <i>›</i>
          <span className={nodes.some((node) => node.data.analysisSummary) ? "done" : nodes.length ? "active" : ""}><b>2</b>拆解整理</span>
          <i>›</i>
          <span className={contract ? "done" : nodes.some((node) => node.data.analysisSummary) ? "active" : ""}><b>3</b>设计基准</span>
          <i>›</i>
          <span className={contract ? "active" : ""}><b>4</b>导出使用</span>
        </div>
        <div className="canvas-toolbar">
          <button onClick={() => fileInput.current?.click()}>▧<small>图片</small></button>
          <button onClick={() => setModal("import")}>T<small>文字/网页</small></button>
          <button onClick={() => createGroup()}>▱<small>分组</small></button>
          <span />
          <button className="ai-tool" onClick={() => selectedIds.length > 1 ? void analyzeSelected() : void analyze()}>✦<small>拆解参考</small></button>
          <button onClick={previewOrganize}>⌗<small>整理画布</small></button>
        </div>
        {selectedIds.length > 1 && !organizePreview && (
          <div className="multi-toolbar">
            <strong>{selectedIds.length} 项</strong>
            <button onClick={() => createGroup()}>组成分组</button>
            <button onClick={() => void analyzeSelected()}>批量拆解</button>
            <button onClick={() => alignSelected("left")}>左对齐</button>
            <button onClick={() => alignSelected("top")}>顶对齐</button>
            <button onClick={() => alignSelected("horizontal")}>水平等距</button>
            <button onClick={previewOrganize}>整理所选</button>
            <button className="danger" onClick={() => requestDeleteNodes(selectedIds)}>删除</button>
          </div>
        )}
        <input ref={fileInput} className="visually-hidden" type="file" accept="image/jpeg,image/png,image/webp" onChange={(event) => event.target.files?.[0] && void addImage(event.target.files[0])} />
        <label className="relation-view">
          <span>连线显示</span>
          <select value={relationView} onChange={(event) => setRelationView(event.target.value as RelationView)}>
            <option value="hidden">隐藏连线</option>
            <option value="selection">只看当前卡片</option>
            <option value="related">查看相关卡片</option>
            <option value="all">显示全部连线</option>
          </select>
        </label>
        <ReactFlow
          nodes={visibleNodes}
          edges={visibleEdges}
          nodeTypes={nodeTypes}
          onNodesChange={organizePreview ? undefined : onNodesChange}
          onEdgesChange={organizePreview ? undefined : onEdgesChange}
          onConnect={organizePreview ? undefined : onConnect}
          onSelectionChange={({ nodes: selection }) => setSelectedIds(selection.map((node) => node.id))}
          onNodeContextMenu={(event, node) => {
            event.preventDefault();
            setSelectedIds([node.id]);
            setContextMenu({ kind: "node", id: node.id, x: event.clientX, y: event.clientY });
          }}
          onPaneClick={() => setContextMenu(null)}
          selectionOnDrag={!organizePreview}
          selectionMode={SelectionMode.Partial}
          multiSelectionKeyCode={["Shift", "Control", "Meta"]}
          panOnDrag={[1, 2]}
          deleteKeyCode={null}
          nodesDraggable={!organizePreview}
          nodesConnectable={!organizePreview}
          elementsSelectable={!organizePreview}
          fitView
          minZoom={0.14}
          maxZoom={2.2}
          snapToGrid
          snapGrid={[8, 8]}
          onlyRenderVisibleElements
          elevateEdgesOnSelect
        >
          <Background id="fine-dots" variant={BackgroundVariant.Dots} color="rgba(72,63,86,.30)" gap={20} size={1.35} />
          <Background id="major-dots" variant={BackgroundVariant.Dots} color="rgba(72,63,86,.16)" gap={100} size={2.1} />
          <Controls showInteractive={false} position="bottom-center" />
          <MiniMap position="bottom-right" pannable zoomable nodeColor={(node) => node.data.kind === "group" ? "#eee7f6" : "#d7e2fb"} />
        </ReactFlow>
        <div className="canvas-tip">拖动空白框选 · Shift 添加选择 · 空格拖动画布 · Delete 删除</div>

        {organizePreview && (
          <aside className="organize-dock">
            <header><div><small>整理预览</small><h2>{organizePreview.scope === "selection" ? "整理所选卡片" : "整理整张画布"}</h2></div><button onClick={() => setOrganizePreview(null)}>×</button></header>
            <p>按设计重点归类，而不是按文件类型排列。预览不会改变原画布。</p>
            <div className="organize-group-list">
              {organizePreview.groups.map((group) => <div key={group.id}><i /><span><strong>{group.title}</strong><small>{group.count} 张 · {group.reason}</small></span></div>)}
            </div>
            <div className="organize-note">已规划 {organizePreview.movedCount} 张卡片。现有分组和锁定卡片保持不动。</div>
            <footer><button className="button soft" onClick={() => setOrganizePreview(null)}>返回原画布</button><button className="button primary" onClick={applyOrganize}>应用整理</button></footer>
          </aside>
        )}
      </section>

      <aside className="inspector">
        <div className="inspector-tabs">
          <button className={rightTab === "asset" ? "active" : ""} onClick={() => setRightTab("asset")}>素材详情</button>
          <button className={rightTab === "baseline" ? "active" : ""} onClick={() => setRightTab("baseline")}>设计基准</button>
        </div>
        {rightTab === "asset" ? (
          selectedIds.length > 1 ? (
            <section className="multi-inspector">
              <small>已选择</small><h2>{selectedIds.length} 张卡片</h2>
              <p>可以一起移动、建立分组、批量拆解、对齐或整理。右键其中一张卡片可处理单项。</p>
              <button className="analyze-button" onClick={() => void analyzeSelected()}>✦ 批量拆解所选参考</button>
              <button className="button soft wide" onClick={previewOrganize}>整理所选卡片</button>
            </section>
          ) : selected ? (
            <>
              <section className="inspect-title">
                <span className={"inspect-icon " + selected.data.kind}>◫</span>
                <div><small>{selected.data.kind === "group" ? "分组" : "参考卡片"}</small><h2>{selected.data.title}</h2></div>
              </section>
              {sourceKinds.has(selected.data.kind) && <button className="analyze-button" onClick={() => void analyze(selected.id)} disabled={selected.data.status === "processing"}>✦ {selected.data.analysisSummary ? "重新拆解这个参考" : "拆解这个参考"}<small>使用已连接模型</small></button>}
              {!!selected.data.colors?.length && <section className="inspect-block"><div className="block-heading"><h3>颜色参考</h3><button onClick={() => navigator.clipboard.writeText(selected.data.colors?.join(", ") || "")}>复制全部</button></div><div className="palette-list">{selected.data.colors.map((color) => <button key={color} onClick={() => navigator.clipboard.writeText(color)}><i style={{ background: color }} /><span>颜色</span><code>{color}</code></button>)}</div></section>}
              {!!selected.data.principles?.length && <section className="inspect-block"><h3>可复用的设计要点</h3><ol className="principle-list">{selected.data.principles.map((item) => <li key={item}>{item}</li>)}</ol></section>}
              {!!selected.data.regions?.length && <section className="inspect-block"><div className="block-heading"><h3>检测到的元素</h3><small>确认后才会导出</small></div><div className="region-list">{selected.data.regions.map((region) => <div key={region.id}><span className="region-preview">{region.type}</span><div><strong>{region.label}</strong><small>{region.confirmed ? "已经确认" : "等待确认"}</small></div><button disabled={region.confirmed} onClick={() => void confirmRegion(region)}>{region.confirmed ? "已确认" : "确认使用"}</button></div>)}</div></section>}
            </>
          ) : <div className="empty-inspector"><strong>从画布开始</strong><p>拖动空白处框选多张卡片，或选择一张参考查看拆解结果。</p></div>
        ) : (
          <section className="contract-panel">
            <span className="step-kicker">第 3 步 · 设计基准</span>
            <h2>把参考整理成一套可复用的设计规则</h2>
            <p>AI 会比较颜色、排版、组件和风格差异。确认后，可导出 DESIGN.md、提示词或 Figma 素材。</p>
            <button className="analyze-button" onClick={() => void previewBaseline()} disabled={contractBusy}>✦ {contractBusy ? "正在整理…" : "整理成设计基准"}</button>
            {contract && <div className="contract-content"><h3>{contract.title}</h3><h4>必须保持的设计原则</h4><ol>{contract.principles.map((item) => <li key={item}>{item}</li>)}</ol><h4>颜色</h4><div className="contract-swatches">{contract.tokens.colors.map((item) => <span key={item.name} title={item.name} style={{ background: item.value }} />)}</div>{!!contract.conflicts.length && <div className="contract-warning"><strong>需要你决定</strong>{contract.conflicts.map((item) => <p key={item}>{item}</p>)}</div>}<button className="button primary wide" onClick={() => void confirmBaseline()}>确认这套设计基准</button></div>}
          </section>
        )}
      </aside>

      {contextMenu?.kind === "node" && (() => {
        const node = nodes.find((item) => item.id === contextMenu.id);
        if (!node) return null;
        return (
          <div className="node-action-menu" style={{ left: contextMenu.x, top: contextMenu.y }} onPointerDown={(event) => event.stopPropagation()}>
            <button onClick={() => handleNodeMenu("rename")}>重命名</button>
            {sourceKinds.has(node.data.kind) && <button onClick={() => handleNodeMenu("analyze")}>{node.data.analysisSummary ? "重新拆解" : "拆解参考"}</button>}
            {node.data.sourceUrl && <button onClick={() => handleNodeMenu("open")}>打开来源</button>}
            {node.data.kind === "group" && <button onClick={() => handleNodeMenu("select-children")}>选择组内卡片</button>}
            {node.data.kind !== "group" && groups.map((group) => <button key={group.id} onClick={() => { setContextMenu(null); moveNodesToGroup([node.id], group.id); }}>移入：{group.data.title}</button>)}
            {node.parentId && <button onClick={() => handleNodeMenu("detach")}>移出分组</button>}
            <button onClick={() => handleNodeMenu("lock")}>{node.data.pinned ? "解除锁定" : "锁定位置"}</button>
            <hr />
            <button className="danger" onClick={() => handleNodeMenu("delete")}>删除</button>
          </div>
        );
      })()}

      {contextMenu?.kind === "board" && (() => {
        const board = boards.find((item) => item.id === contextMenu.id);
        if (!board) return null;
        return (
          <div className="node-action-menu" style={{ left: contextMenu.x, top: contextMenu.y }} onPointerDown={(event) => event.stopPropagation()}>
            <button onClick={() => startBoardRename(board.id, board.title)}>重命名</button>
            <button onClick={() => { setContextMenu(null); void createBoard(board.id); }}>复制画布</button>
            <hr />
            <button className="danger" onClick={() => requestDeleteBoard(board.id)}>删除画布</button>
          </div>
        );
      })()}

      {deleteRequest && <div className="modal-backdrop"><section className="modal confirm-modal"><span className="confirm-icon">⌫</span><h2>{deleteRequest.title}</h2><p>{deleteRequest.body}</p><footer><button className="button soft" onClick={() => setDeleteRequest(null)}>取消</button><button className="button danger-fill" onClick={() => deleteRequest.kind === "board" ? void performDeleteBoard(deleteRequest.ids[0]) : performDeleteNodes(deleteRequest.ids)}>确认删除</button></footer></section></div>}

      {connection && <div className="modal-backdrop"><section className="modal relation-modal"><button className="modal-close" onClick={() => setConnection(null)}>×</button><span className="step-kicker">建立关联</span><h2>这两张参考如何一起使用？</h2><p>关系应帮助后续查找和整理，不是为了把画布连满。</p><div className="relation-options">{relationChoices.map((item) => <button key={item.type} onClick={() => confirmConnection(item.type)}>{item.label}</button>)}</div></section></div>}

      {modal === "import" && <div className="modal-backdrop" onMouseDown={() => setModal(null)}><section className="modal import-modal" onMouseDown={(event) => event.stopPropagation()}><button className="modal-close" onClick={() => setModal(null)}>×</button><span className="step-kicker">第 1 步 · 采集参考</span><h2>加入当前画布</h2><p>上传图片、粘贴文字或输入网页地址。网页使用插件采集时会保存完整截图。</p><div className="import-drop" onClick={() => fileInput.current?.click()}><span>⇧</span><strong>上传 JPG、PNG、WebP</strong><small>最大 20 MB</small></div><div className="url-entry"><input autoFocus value={urlValue} onChange={(event) => setUrlValue(event.target.value)} placeholder="公开 URL 或参考文字" /><button onClick={() => urlValue.trim() && void addAsset(urlValue.trim())}>加入</button></div></section></div>}

      {modal === "credentials" && <div className="modal-backdrop"><section className="modal credential-modal"><button className="modal-close" onClick={() => setModal(null)}>×</button><span className="step-kicker">AI 设置</span><h2>连接自己的模型</h2><p>Key 只会在服务端加密保存。没有 Key 时，产品不会生成模拟分析。</p><div className="credential-list">{credentialState.map((item) => <span key={item.provider}><b>{item.provider}</b>{item.model} · •••• {item.lastFour}{item.supportsVision ? " · 可分析图片" : " · 仅文字"}</span>)}</div><div className="credential-form"><select value={credentialForm.provider} onChange={(event) => setCredentialForm({ ...credentialForm, provider: event.target.value })}><option value="openai">OpenAI（图片与文字）</option><option value="qwen">Qwen（图片与文字）</option><option value="deepseek">DeepSeek（仅文字）</option></select><input type="password" value={credentialForm.apiKey} onChange={(event) => setCredentialForm({ ...credentialForm, apiKey: event.target.value })} placeholder="API Key" /><input value={credentialForm.model} onChange={(event) => setCredentialForm({ ...credentialForm, model: event.target.value })} placeholder="模型（留空使用推荐模型）" /><button className="button primary" disabled={!credentialForm.apiKey || loadingCredential} onClick={() => void saveCredential()}>{loadingCredential ? "正在测试…" : "测试并保存"}</button></div></section></div>}

      {modal === "export" && <div className="modal-backdrop"><section className="modal export-modal"><button className="modal-close" onClick={() => setModal(null)}>×</button><span className="step-kicker">第 4 步 · 导出使用</span><h2>你接下来要做什么？</h2><p>选择具体任务，只导出真正需要的设计规则、提示词或 Figma 素材。</p><div className="export-purpose-grid">{exportPurposeOptions.map((option) => <button key={option.id} className={exportPurpose === option.id ? "is-active" : ""} onClick={() => setExportPurpose(option.id)}><span>{option.icon}</span><div><strong>{option.title}</strong><p>{option.description}</p><small>{option.files}</small></div></button>)}</div><footer><button className="button soft" onClick={() => setModal(null)}>取消</button><button className="button primary" onClick={() => void exportPackage()}>生成导出文件</button></footer></section></div>}

      {toast && <div className="toast"><span>✓</span>{toast}</div>}
    </main>
  );
}

function mergeAnalysis(node: CanvasNode, analysis: Record<string, unknown>): CanvasNode {
  const result = analysis.result as AnalysisResult | null | undefined;
  if (!result) {
    return {
      ...node,
      data: {
        ...node.data,
        analysisId: String(analysis.id || ""),
        status: String(analysis.status || node.data.status || "failed"),
        analysisError: typeof analysis.error === "string" ? analysis.error : undefined,
      },
    };
  }
  return {
    ...node,
    data: {
      ...node.data,
      analysisId: String(analysis.id || ""),
      analysisSummary: result.summary,
      status: String(analysis.status || "ready"),
      analysisError: typeof analysis.error === "string" ? analysis.error : undefined,
      principles: result.principles,
      colors: result.palette.map((color) => color.hex),
      tags: result.tags.slice(0, 8).map((tag) => tag.value),
      regions: result.components,
    },
  };
}

function nodeWidth(node: CanvasNode) {
  return Number(node.measured?.width ?? node.width ?? node.style?.width ?? 286);
}

function nodeHeight(node: CanvasNode) {
  return Number(node.measured?.height ?? node.height ?? node.style?.height ?? 180);
}

export default function InspoWorkspace() {
  return <ReactFlowProvider><WorkspaceCanvas /></ReactFlowProvider>;
}
