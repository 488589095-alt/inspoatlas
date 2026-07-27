"use client";

import { useCallback, useEffect, useMemo, useRef, useState, type CSSProperties, type MouseEvent as ReactMouseEvent, type PointerEvent as ReactPointerEvent } from "react";
import {
  addEdge,
  applyNodeChanges,
  Background,
  BackgroundVariant,
  Connection,
  Edge,
  MiniMap,
  NodeChange,
  ReactFlow,
  ReactFlowProvider,
  SelectionMode,
  useEdgesState,
  useNodesState,
  useReactFlow,
  type Viewport,
} from "@xyflow/react";
import { providerCatalog, type AnalysisResult, type DesignContract, type ProviderId, type Relation, type RelationType } from "@/packages/domain/src";
import {
  exportDestinationsByGoal,
  productionGoalOptions,
  type ExportDestination,
  type ProductionGoal,
} from "./exportOptions";
import { CardNode } from "./workspace/CardNode";
import { UserMenu } from "./workspace/UserMenu";
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
const canvasSnapGrid: [number, number] = [8, 8];

type WorkspaceModal = "import" | "credentials" | null;
type RelationView = "hidden" | "selection" | "all";
type ContextMenu = { kind: "node" | "board"; id: string; x: number; y: number };
type DeleteRequest = { kind: "board" | "nodes"; ids: string[]; title: string; body: string };
type AssistantScope = "selection" | "board";
type AssistantMessage = { role: "user" | "assistant"; content: string };

function WorkspaceCanvas() {
  const [boards, setBoards] = useState<BoardSummary[]>([]);
  const [boardId, setBoardId] = useState("");
  const [boardTitle, setBoardTitle] = useState("加载中…");
  const [nodes, setNodes] = useNodesState<CanvasNode>([]);
  const [edges, setEdges, onEdgesChange] = useEdgesState<Edge>([]);
  const [selectedIds, setSelectedIds] = useState<string[]>([]);
  const [search, setSearch] = useState("");
  const [searchExpanded, setSearchExpanded] = useState(false);
  const [searchCursor, setSearchCursor] = useState(0);
  const [showMiniMap, setShowMiniMap] = useState(true);
  const [focusMode, setFocusMode] = useState(false);
  const [savedState, setSavedState] = useState("正在读取");
  const [rightTab, setRightTab] = useState<"asset" | "baseline" | "export">("asset");
  const [relationView, setRelationView] = useState<RelationView>("selection");
  const [modal, setModal] = useState<WorkspaceModal>(null);
  const [contextMenu, setContextMenu] = useState<ContextMenu | null>(null);
  const [deleteRequest, setDeleteRequest] = useState<DeleteRequest | null>(null);
  const [connection, setConnection] = useState<Connection | null>(null);
  const [toast, setToast] = useState("");
  const [urlValue, setUrlValue] = useState("");
  const [organizePreview, setOrganizePreview] = useState<OrganizePreview | null>(null);
  const [editingBoardId, setEditingBoardId] = useState<string | null>(null);
  const [editingBoardSurface, setEditingBoardSurface] = useState<"header" | "sidebar" | null>(null);
  const [boardDraft, setBoardDraft] = useState("");
  const [contract, setContract] = useState<DesignContract | null>(null);
  const [contractBusy, setContractBusy] = useState(false);
  const [productionGoal, setProductionGoal] = useState<ProductionGoal>("recreate");
  const [exportDestination, setExportDestination] = useState<ExportDestination>("figma-design");
  const [exportBusy, setExportBusy] = useState(false);
  const [exportComplete, setExportComplete] = useState(false);
  const [credentialState, setCredentialState] = useState<Array<{ provider: string; model: string; lastFour: string; supportsVision: boolean; active: boolean }>>([]);
  const [credentialForm, setCredentialForm] = useState<{ provider: ProviderId; apiKey: string; model: string; region: string }>({ provider: "openai", apiKey: "", model: providerCatalog.openai.models[0], region: "intl" });
  const [loadingCredential, setLoadingCredential] = useState(false);
  const [credentialBusyProvider, setCredentialBusyProvider] = useState<ProviderId | null>(null);
  const [credentialToDelete, setCredentialToDelete] = useState<ProviderId | null>(null);
  const [assistantOpen, setAssistantOpen] = useState(false);
  const [assistantScope, setAssistantScope] = useState<AssistantScope>("board");
  const [assistantGoal, setAssistantGoal] = useState("");
  const [assistantQuestion, setAssistantQuestion] = useState("");
  const [assistantMessages, setAssistantMessages] = useState<AssistantMessage[]>([]);
  const [assistantBusy, setAssistantBusy] = useState(false);
  const [leftRailWidth, setLeftRailWidth] = useState(242);
  const [rightRailWidth, setRightRailWidth] = useState(322);
  const [resizingRail, setResizingRail] = useState<"left" | "right" | null>(null);
  const [rightPanning, setRightPanning] = useState(false);
  const [viewportState, setViewportState] = useState<Viewport>({ x: 0, y: 0, zoom: 1 });
  const version = useRef(1);
  const loading = useRef(true);
  const saveTimer = useRef<number | undefined>(undefined);
  const draftTimer = useRef<number | undefined>(undefined);
  const savedSignature = useRef("");
  const signatureRef = useRef("");
  const history = useRef<Array<{ nodes: CanvasNode[]; edges: Edge[] }>>([]);
  const redoHistory = useRef<Array<{ nodes: CanvasNode[]; edges: Edge[] }>>([]);
  const syncedClips = useRef(new Set<string>());
  const fileInput = useRef<HTMLInputElement>(null);
  const folderInput = useRef<HTMLInputElement>(null);
  const edgesRef = useRef<Edge[]>([]);
  const { fitView, screenToFlowPosition, setViewport: setFlowViewport } = useReactFlow();

  useEffect(() => {
    edgesRef.current = edges;
  }, [edges]);



  const selectedNodes = useMemo(() => nodes.filter((node) => selectedIds.includes(node.id)), [nodes, selectedIds]);
  const selected = selectedNodes[0];
  const exportDestinations = exportDestinationsByGoal[productionGoal];
  const activeDestination = exportDestinations.find((item) => item.id === exportDestination) ?? exportDestinations[0];
  const selectedProvider = providerCatalog[credentialForm.provider];
  const visibleNodes = useMemo(() => {
    const base = organizePreview?.nodes ?? nodes;
    const term = search.trim().toLowerCase();
    return base.map((node) => {
      const cleanClass = (node.className ?? "").replace(/\s*is-search-(?:match|dim)/g, "");
      if (!term || node.data.kind === "group") {
        return cleanClass === (node.className ?? "") ? node : { ...node, className: cleanClass };
      }
      const searchClass = nodeMatchesQuery(node, term) ? "is-search-match" : "is-search-dim";
      return { ...node, className: `${cleanClass} ${searchClass}`.trim() };
    });
  }, [nodes, organizePreview, search]);
  const searchMatchIds = useMemo(
    () => search.trim() ? visibleNodes.filter((node) => node.data.kind !== "group" && node.className?.includes("is-search-match")).map((node) => node.id) : [],
    [search, visibleNodes],
  );
  const visibleEdges = useMemo(() => {
    const selectedSet = new Set(selectedIds);
    return edges.map((edge) => {
      let hidden = relationView === "hidden";
      if (relationView === "selection") hidden ||= !(selectedSet.has(edge.source) || selectedSet.has(edge.target));
      return { ...edge, hidden };
    });
  }, [edges, relationView, selectedIds]);
  const persistableSignature = useMemo(() => sceneSignature(nodes, edges, viewportState), [nodes, edges, viewportState]);
  const connectedModelLabel = credentialState.find((item) => item.active)?.model ?? credentialState[0]?.model ?? "未连接";

  useEffect(() => {
    signatureRef.current = persistableSignature;
  }, [persistableSignature]);

  useEffect(() => {
    const frame = window.requestAnimationFrame(() => {
      const storedLeft = Number(window.localStorage.getItem("inspoatlas:left-rail-width"));
      const storedRight = Number(window.localStorage.getItem("inspoatlas:right-rail-width"));
      if (Number.isFinite(storedLeft) && storedLeft > 0) setLeftRailWidth(clamp(storedLeft, 190, 360));
      if (Number.isFinite(storedRight) && storedRight > 0) setRightRailWidth(clamp(storedRight, 280, 460));
    });
    return () => window.cancelAnimationFrame(frame);
  }, []);

  useEffect(() => {
    let active = true;
    void fetch("/api/ai-credentials", { cache: "no-store" })
      .then(async (response) => response.ok ? response.json() : { credentials: [] })
      .then((payload: { credentials?: typeof credentialState }) => {
        if (active) setCredentialState(payload.credentials ?? []);
      })
      .catch(() => undefined);
    return () => { active = false; };
  }, []);

  useEffect(() => {
    const stopRightPan = () => setRightPanning(false);
    window.addEventListener("pointerup", stopRightPan);
    window.addEventListener("pointercancel", stopRightPan);
    return () => {
      window.removeEventListener("pointerup", stopRightPan);
      window.removeEventListener("pointercancel", stopRightPan);
    };
  }, []);

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
    const boardPayload = await response.json().catch(() => null) as { boards?: BoardSummary[] } | null;
    let list = Array.isArray(boardPayload?.boards)
      ? boardPayload.boards.filter((item) => item && typeof item.id === "string")
      : [];
    if (!list.length) {
      const created = await fetch("/api/boards", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ title: "我的灵感图谱" }),
      });
      if (!created.ok) throw new Error("无法创建初始画布");
      const payload = await created.json().catch(() => null) as { board?: BoardSummary } | null;
      if (!payload?.board?.id) throw new Error("初始画布数据无效");
      list = [payload.board];
    }
    setBoards(list);
    const requested = new URLSearchParams(window.location.search).get("board");
    const nextBoardId = list.some((item) => item.id === requested) ? requested : list[0]?.id;
    if (!nextBoardId) throw new Error("没有可打开的画布");
    setBoardId(nextBoardId);
  }, []);

  useEffect(() => {
    const frame = window.requestAnimationFrame(() => {
      void loadBoards().catch((error) => {
        loading.current = false;
        setBoardTitle("画布载入失败");
        setSavedState("请刷新重试");
        notify(error instanceof Error ? error.message : "画布载入失败");
      });
    });
    return () => window.cancelAnimationFrame(frame);
  }, [loadBoards, notify]);

  useEffect(() => {
    if (!boardId) return;
    let active = true;
    loading.current = true;
    const statusFrame = window.requestAnimationFrame(() => {
      if (!active) return;
      setSavedState("正在读取");
      setOrganizePreview(null);
    });
    fetch("/api/boards/" + boardId, { cache: "no-store" }).then(async (response) => {
      if (!response.ok) throw new Error("画布读取失败");
      const { board } = await response.json();
      if (!active) return;
      const flow = sceneToFlow(board.scene);
      version.current = board.version;
      setBoardTitle(board.title);
      const draft = await readDraft<{ baseVersion: number; scene: typeof board.scene }>(boardId);
      const hasRecoverableDraft = Boolean(draft && draft.baseVersion === board.version);
      const recovered = hasRecoverableDraft ? sceneToFlow(draft!.scene) : flow;
      const serverViewport = flow.viewport ?? { x: 0, y: 0, zoom: 1 };
      const recoveredViewport = recovered.viewport ?? serverViewport;
      savedSignature.current = sceneSignature(flow.nodes, flow.edges, serverViewport);
      signatureRef.current = sceneSignature(recovered.nodes, recovered.edges, recoveredViewport);
      setNodes(recovered.nodes);
      setEdges(recovered.edges);
      setViewportState(recoveredViewport);
      setSelectedIds([]);
      await setFlowViewport(recoveredViewport);
      setSavedState(hasRecoverableDraft ? "已恢复本地草稿" : "已同步");
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
    return () => { active = false; window.cancelAnimationFrame(statusFrame); };
  }, [boardId, fitView, setEdges, setFlowViewport, setNodes, notify]);

  useEffect(() => {
    if (!boardId || loading.current || persistableSignature === savedSignature.current) return;
    setSavedState("有未保存更改");
    window.clearTimeout(draftTimer.current);
    window.clearTimeout(saveTimer.current);
    const scene = flowToScene(nodes, edges, viewportState);
    const signature = persistableSignature;

    draftTimer.current = window.setTimeout(() => {
      void saveDraft(boardId, { baseVersion: version.current, scene }).catch(() => undefined);
    }, 700);

    saveTimer.current = window.setTimeout(async () => {
      setSavedState("保存中…");
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
        savedSignature.current = signature;
        if (signatureRef.current === signature) setSavedState("已自动保存");
      } catch {
        if (signatureRef.current === signature) setSavedState("离线草稿已保留");
      }
    }, 3_200);
    return () => {
      window.clearTimeout(draftTimer.current);
      window.clearTimeout(saveTimer.current);
    };
  }, [persistableSignature, nodes, edges, viewportState, boardId, notify]);

  useEffect(() => {
    if (!boardId || loading.current) return;
    const preserveDraft = () => {
      if (signatureRef.current === savedSignature.current) return;
      const scene = flowToScene(nodes, edges, viewportState);
      void saveDraft(boardId, { baseVersion: version.current, scene }).catch(() => undefined);
    };
    const onVisibilityChange = () => { if (document.visibilityState === "hidden") preserveDraft(); };
    window.addEventListener("pagehide", preserveDraft);
    document.addEventListener("visibilitychange", onVisibilityChange);
    return () => {
      window.removeEventListener("pagehide", preserveDraft);
      document.removeEventListener("visibilitychange", onVisibilityChange);
    };
  }, [boardId, nodes, edges, viewportState]);

  useEffect(() => {
    const handler = (event: Event) => {
      const detail = (event as CustomEvent<{ id: string; action: string; title?: string; body?: string; x?: number; y?: number }>).detail;
      if (detail.action === "rename" && detail.title) return renameNode(detail.id, detail.title);
      if (detail.action === "update-body" && typeof detail.body === "string") return updateNodeBody(detail.id, detail.body);
      if (detail.action === "menu") {
        setSelectedIds([detail.id]);
        setRightTab("asset");
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
        setFocusMode(false);
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
        const byId = new Map(assets.map((item) => [String(item.id), item]));
        setNodes((current) => {
          let changed = false;
          const next = current.map((node) => {
            const clip = byId.get(node.id);
            if (!clip || node.data.kind !== "web") return node;
            const count = clipScreenshotCount(clip);
            const imageUrl = count ? "/api/assets/" + node.id + "/content" : undefined;
            if (node.data.screenshotPartCount === count && node.data.imageUrl === imageUrl) return node;
            changed = true;
            return { ...node, data: { ...node.data, screenshotPartCount: count || undefined, imageUrl } };
          });
          return changed ? next : current;
        });
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
              imageUrl: clipScreenshotCount(item) ? "/api/assets/" + item.id + "/content" : undefined,
              screenshotPartCount: clipScreenshotCount(item) || undefined,
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
  const onSelectionChange = useCallback(({ nodes: selection }: { nodes: CanvasNode[] }) => {
    const next = selection.map((node) => node.id);
    setSelectedIds((current) => (
      current.length === next.length && next.every((id) => current.includes(id))
        ? current
        : next
    ));
    if (next.length) setRightTab("asset");
  }, []);
  const onNodeClick = useCallback(() => setRightTab("asset"), []);
  const onNodeContextMenu = useCallback((event: ReactMouseEvent, node: CanvasNode) => {
    event.preventDefault();
    setRightTab("asset");
    setSelectedIds((current) => current.length === 1 && current[0] === node.id ? current : [node.id]);
    setContextMenu({ kind: "node", id: node.id, x: event.clientX, y: event.clientY });
  }, []);
  const onPaneClick = useCallback(() => setContextMenu(null), []);
  const onNodeDragStop = useCallback((_: unknown, movedNode: CanvasNode) => {
    if (movedNode.data.kind === "group" || movedNode.parentId) return;
    setNodes((current) => {
      const dragged = current.find((node) => node.id === movedNode.id);
      if (!dragged || dragged.data.kind === "group" || dragged.parentId) return current;
      const cardWidth = nodeWidth(dragged);
      const cardHeight = nodeHeight(dragged);
      const cardArea = Math.max(1, cardWidth * cardHeight);
      const target = current
        .filter((node) => node.data.kind === "group" && !node.parentId)
        .map((group) => {
          const left = Math.max(dragged.position.x, group.position.x);
          const top = Math.max(dragged.position.y, group.position.y);
          const right = Math.min(dragged.position.x + cardWidth, group.position.x + nodeWidth(group));
          const bottom = Math.min(dragged.position.y + cardHeight, group.position.y + nodeHeight(group));
          return { group, ratio: Math.max(0, right - left) * Math.max(0, bottom - top) / cardArea };
        })
        .filter((item) => item.ratio >= 0.42)
        .sort((a, b) => b.ratio - a.ratio)[0]?.group;
      if (!target) return current;

      history.current.push({ nodes: structuredClone(current), edges: structuredClone(edgesRef.current) });
      if (history.current.length > 50) history.current.shift();
      redoHistory.current = [];
      const targetWidth = nodeWidth(target);
      const targetHeight = nodeHeight(target);
      const candidates = dragged.selected
        ? new Set(current.filter((node) => node.selected && !node.parentId && node.data.kind !== "group").map((node) => node.id))
        : new Set([dragged.id]);
      return current.map((node) => {
        if (!candidates.has(node.id)) return node;
        const relativeX = node.position.x - target.position.x;
        const relativeY = node.position.y - target.position.y;
        return {
          ...node,
          parentId: target.id,
          extent: "parent" as const,
          position: {
            x: Math.max(24, Math.min(relativeX, targetWidth - nodeWidth(node) - 24)),
            y: Math.max(66, Math.min(relativeY, targetHeight - nodeHeight(node) - 24)),
          },
          zIndex: 10,
        };
      });
    });
  }, [setNodes]);

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

  function startBoardRename(id: string, title: string, surface: "header" | "sidebar" = "sidebar") {
    setEditingBoardId(id);
    setEditingBoardSurface(surface);
    setBoardDraft(title);
    setContextMenu(null);
  }

  async function commitBoardRename(id: string) {
    const previous = boards.find((item) => item.id === id)?.title ?? boardTitle;
    const title = boardDraft.trim();
    setEditingBoardId(null);
    setEditingBoardSurface(null);
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

  function createNote() {
    const id = "note-" + crypto.randomUUID();
    const center = screenToFlowPosition({
      x: leftRailWidth + Math.max(0, window.innerWidth - leftRailWidth - rightRailWidth) / 2,
      y: 64 + Math.max(0, window.innerHeight - 64) / 2,
    });
    const note: CanvasNode = {
      id,
      type: "inspo",
      position: { x: center.x - 145, y: center.y - 95 },
      data: {
        kind: "text",
        title: "备注",
        body: "单击这里写下备注",
        note: true,
      },
      style: defaultSize.text,
      zIndex: 10,
    };
    remember();
    setNodes((current) => [...current, note]);
    setSelectedIds([id]);
    setRightTab("asset");
    notify("已添加备注，单击正文即可编辑");
  }

  function startRailResize(side: "left" | "right", event: ReactPointerEvent<HTMLDivElement>) {
    if (window.innerWidth <= 1050) return;
    event.preventDefault();
    event.stopPropagation();
    const startX = event.clientX;
    const startWidth = side === "left" ? leftRailWidth : rightRailWidth;
    let latestWidth = startWidth;
    setResizingRail(side);
    document.body.style.cursor = "col-resize";
    document.body.style.userSelect = "none";

    const onMove = (moveEvent: PointerEvent) => {
      const delta = moveEvent.clientX - startX;
      const minimum = side === "left" ? 190 : 280;
      const hardMaximum = side === "left" ? 360 : 460;
      const otherWidth = side === "left" ? rightRailWidth : leftRailWidth;
      const availableMaximum = Math.max(minimum, window.innerWidth - otherWidth - 480);
      latestWidth = clamp(startWidth + (side === "left" ? delta : -delta), minimum, Math.min(hardMaximum, availableMaximum));
      if (side === "left") setLeftRailWidth(latestWidth);
      else setRightRailWidth(latestWidth);
    };
    const onUp = () => {
      setResizingRail(null);
      document.body.style.cursor = "";
      document.body.style.userSelect = "";
      window.localStorage.setItem(`inspoatlas:${side}-rail-width`, String(Math.round(latestWidth)));
      window.removeEventListener("pointermove", onMove);
      window.removeEventListener("pointerup", onUp);
      window.removeEventListener("pointercancel", onUp);
    };
    window.addEventListener("pointermove", onMove);
    window.addEventListener("pointerup", onUp);
    window.addEventListener("pointercancel", onUp);
  }

  async function addImages(input: File[] | FileList, asFolder = false) {
    const allFiles = Array.from(input);
    const files = allFiles.filter((file) => /^image\/(jpeg|png|webp)$/.test(file.type) && file.size <= 20 * 1024 * 1024);
    if (!files.length) return notify("没有找到 20 MB 内的 JPG、PNG 或 WebP");

    const uploaded: Array<{ asset: { id: string; title: string; contentUrl?: string } }> = [];
    let failed = allFiles.length - files.length;
    for (const file of files) {
      const form = new FormData();
      form.set("boardId", boardId);
      form.set("file", file);
      if (file.webkitRelativePath) form.set("relativePath", file.webkitRelativePath);
      const response = await fetch("/api/assets", { method: "POST", body: form });
      if (!response.ok) {
        failed += 1;
        continue;
      }
      uploaded.push(await response.json());
    }
    if (!uploaded.length) return notify("图片上传失败，请稍后重试");

    remember();
    const rootFolder = asFolder
      ? files[0]?.webkitRelativePath.split("/").filter(Boolean)[0] || "导入的文件夹"
      : "";
    const groupId = rootFolder ? crypto.randomUUID() : "";
    setNodes((current) => {
      if (!groupId) {
        const cards = uploaded.map(({ asset }, index): CanvasNode => ({
          id: asset.id,
          type: "inspo",
          position: { x: 100 + (current.length + index) * 18, y: 120 + (current.length + index) * 14 },
          data: {
            kind: "image",
            title: asset.title,
            assetId: asset.id,
            imageUrl: asset.contentUrl || "/api/assets/" + asset.id + "/content",
            tags: ["待拆解"],
          },
          style: defaultSize.image,
          zIndex: 10,
        }));
        return [...current, ...cards];
      }

      const columns = Math.min(3, Math.max(1, uploaded.length));
      const rows = Math.ceil(uploaded.length / columns);
      const groupWidth = 48 + columns * 300 + (columns - 1) * 24;
      const groupHeight = 90 + rows * 340 + Math.max(0, rows - 1) * 24 + 28;
      const group: CanvasNode = {
        id: groupId,
        type: "inspo",
        position: { x: 96 + current.length * 12, y: 112 + current.length * 10 },
        data: { kind: "group", title: rootFolder, body: `从“${rootFolder}”文件夹导入 · 单击修改说明` },
        style: { width: groupWidth, height: groupHeight },
        zIndex: 0,
      };
      const cards = uploaded.map(({ asset }, index): CanvasNode => ({
        id: asset.id,
        type: "inspo",
        parentId: groupId,
        extent: "parent",
        position: { x: 24 + (index % columns) * 324, y: 70 + Math.floor(index / columns) * 364 },
        data: {
          kind: "image",
          title: asset.title,
          assetId: asset.id,
          imageUrl: asset.contentUrl || "/api/assets/" + asset.id + "/content",
          tags: ["待拆解"],
        },
        style: defaultSize.image,
        zIndex: 10,
      }));
      return [...current, group, ...cards];
    });
    setSelectedIds(uploaded.map(({ asset }) => asset.id));
    setModal(null);
    notify(`已加入 ${uploaded.length} 张图片${rootFolder ? `，并建立“${rootFolder}”分组` : ""}${failed ? `，跳过 ${failed} 个不支持的文件` : ""}`);
  }


  async function analyze(nodeId?: string, captureHistory = true) {
    const source = nodes.find((node) => node.id === (nodeId || selectedIds[0]));
    if (!source || !isAnalyzableNode(source)) return notify("请选择一张原始素材");
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
          analysisError: friendlyAnalysisError(payload.error),
        },
      } : item));
      if (response.status === 409) setModal("credentials");
      return notify(friendlyAnalysisError(payload.error));
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
    const ids = selectedNodes.filter(isAnalyzableNode).map((node) => node.id);
    if (!ids.length) return notify("所选内容中没有可分析的原始素材");
    remember();
    for (const id of ids) await analyze(id, false);
  }

  async function askDesignAssistant() {
    const goal = assistantGoal.trim();
    const question = assistantQuestion.trim();
    if (!goal) return notify("请先说明你要设计什么");
    if (!question) return notify("请输入你想讨论的问题");
    if (assistantScope === "selection" && !selectedIds.length) return notify("请先选择要分析的卡片");

    const nextMessages: AssistantMessage[] = [...assistantMessages, { role: "user", content: question }];
    setAssistantMessages(nextMessages);
    setAssistantQuestion("");
    setAssistantBusy(true);
    try {
      const response = await fetch(`/api/boards/${encodeURIComponent(boardId)}/design-assistant`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          goal,
          question,
          scope: assistantScope,
          selectedNodeIds: assistantScope === "selection" ? selectedIds : [],
          history: assistantMessages.slice(-6),
        }),
      });
      const payload = await response.json().catch(() => ({}));
      if (!response.ok) {
        if (response.status === 409) setModal("credentials");
        throw new Error(friendlyAnalysisError(payload.error));
      }
      setAssistantMessages([...nextMessages, { role: "assistant", content: String(payload.answer || "暂时没有生成建议。") }]);
    } catch (error) {
      const message = error instanceof Error ? error.message : "设计助手暂时不可用";
      setAssistantMessages([...nextMessages, { role: "assistant", content: `未能完成：${message}` }]);
    } finally {
      setAssistantBusy(false);
    }
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
      data: { kind: "group", title: "新分组", body: "单击添加分组说明" },
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
      isAnalyzableNode(target) && Boolean(target.data.analysisId || target.data.analysisSummary || target.data.regions?.length),
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
    for (const source of nodes.filter((node) => remove.has(node.id) && isAnalyzableNode(node))) {
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

  function updateNodeBody(nodeId: string, body: string) {
    remember();
    setNodes((current) => current.map((item) => item.id === nodeId
      ? { ...item, data: { ...item.data, body } }
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
    setExportBusy(true);
    setExportComplete(false);
    const response = await fetch("/api/exports", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        boardId,
        purpose: activeDestination.purpose,
        goal: productionGoal,
        destination: activeDestination.id,
      }),
    });
    if (!response.ok) {
      setExportBusy(false);
      return notify((await response.json().catch(() => ({}))).error || "请先确认设计基准");
    }
    const blob = await response.blob();
    const url = URL.createObjectURL(blob);
    const anchor = document.createElement("a");
    anchor.href = url;
    anchor.download = "inspoatlas-" + activeDestination.id + ".zip";
    anchor.click();
    URL.revokeObjectURL(url);
    setExportBusy(false);
    setExportComplete(true);
    notify("任务已准备好，下载后先打开 START_HERE.html");
  }

  async function loadCredentials() {
    const response = await fetch("/api/ai-credentials", { cache: "no-store" });
    if (response.ok) {
      const rows = ((await response.json()).credentials || []) as typeof credentialState;
      setCredentialState(rows);
      const active = rows.find((item) => item.active) ?? rows[0];
      if (active && providerCatalog[active.provider as ProviderId]) {
        setCredentialForm({ provider: active.provider as ProviderId, apiKey: "", model: reconnectModel(active.provider as ProviderId, active.model), region: "intl" });
      }
    }
    setModal("credentials");
  }

  async function saveCredential() {
    setLoadingCredential(true);
    const existing = credentialState.find((item) => item.provider === credentialForm.provider);
    const response = await fetch("/api/ai-credentials", {
      method: credentialForm.apiKey ? "POST" : existing ? "PATCH" : "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(credentialForm.apiKey ? credentialForm : { provider: credentialForm.provider, model: credentialForm.model }),
    });
    const payload = await response.json().catch(() => ({}));
    setLoadingCredential(false);
    if (!response.ok) return notify(payload.error || "模型服务验证失败");
    setCredentialForm((value) => ({ ...value, apiKey: "" }));
    await loadCredentials();
    notify(existing && !credentialForm.apiKey ? "已使用保存的 Key 更新模型" : "模型服务已验证并保存");
  }

  async function activateCredential(provider: ProviderId, model?: string) {
    setCredentialBusyProvider(provider);
    const response = await fetch("/api/ai-credentials", {
      method: "PATCH",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ provider, model: reconnectModel(provider, model) }),
    });
    const payload = await response.json().catch(() => ({}));
    setCredentialBusyProvider(null);
    if (!response.ok) return notify(payload.error || "模型服务连接失败");
    await loadCredentials();
    notify("已切换当前模型服务");
  }

  async function deleteCredential(provider: ProviderId) {
    const response = await fetch("/api/ai-credentials?provider=" + encodeURIComponent(provider), { method: "DELETE" });
    if (!response.ok) return notify("删除模型服务失败");
    setCredentialToDelete(null);
    await loadCredentials();
    notify("已删除模型服务");
  }

  function focusSearchMatch(index: number) {
    if (!searchMatchIds.length) return;
    const normalized = (index + searchMatchIds.length) % searchMatchIds.length;
    const id = searchMatchIds[normalized];
    setSearchCursor(normalized);
    setNodes((current) => current.map((node) => ({ ...node, selected: node.id === id })));
    setSelectedIds([id]);
    setRightTab("asset");
    void fitView({ nodes: [{ id }], padding: 0.55, minZoom: 0.85, maxZoom: 1.25, duration: 360 });
  }

  function handleSearchChange(value: string) {
    setSearch(value);
    setSearchCursor(0);
    const term = value.trim().toLowerCase();
    if (!term) return;
    const match = nodes.find((node) => node.data.kind !== "group" && nodeMatchesQuery(node, term));
    if (match) window.setTimeout(() => {
      setNodes((current) => current.map((node) => ({ ...node, selected: node.id === match.id })));
      setSelectedIds([match.id]);
      setRightTab("asset");
      void fitView({ nodes: [{ id: match.id }], padding: 0.55, minZoom: 0.85, maxZoom: 1.25, duration: 360 });
    }, 40);
  }

  function handleNodeMenu(action: string) {
    const menu = contextMenu;
    if (!menu || menu.kind !== "node") return;
    const node = nodes.find((item) => item.id === menu.id);
    setContextMenu(null);
    if (!node) return;
    if (action === "rename") window.dispatchEvent(new CustomEvent("inspo:rename-node", { detail: { id: node.id } }));
    if (action === "analyze" && isAnalyzableNode(node)) void analyze(node.id);
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

  return (
    <main
      className={"workspace-shell" + (focusMode ? " focus-mode" : "") + (resizingRail ? " is-resizing" : "")}
      style={{ "--left-rail-width": `${leftRailWidth}px`, "--right-rail-width": `${rightRailWidth}px` } as CSSProperties}
      onDragOver={(event) => event.preventDefault()}
      onDrop={(event) => {
        event.preventDefault();
        const files = event.dataTransfer.files;
        if (files.length) void addImages(files);
      }}
    >
      <header className="topbar">
        <div className="brand"><span className="brand-mark">✦</span><div><strong>InspoAtlas</strong><small>灵感拆解工作台</small></div></div>
        <div
          className="board-title editable"
          title="双击原位修改画布名称"
          onDoubleClick={() => boardId && startBoardRename(boardId, boardTitle, "header")}
        >
          <span className="live-dot" />
          {editingBoardId === boardId && editingBoardSurface === "header" ? (
            <input
              autoFocus
              value={boardDraft}
              onClick={(event) => event.stopPropagation()}
              onDoubleClick={(event) => event.stopPropagation()}
              onChange={(event) => setBoardDraft(event.target.value)}
              onBlur={() => void commitBoardRename(boardId)}
              onKeyDown={(event) => {
                if (event.key === "Enter") void commitBoardRename(boardId);
                if (event.key === "Escape") { setEditingBoardId(null); setEditingBoardSurface(null); }
              }}
            />
          ) : <b>{boardTitle}</b>}
          <small>{savedState}</small>
        </div>
        <div className="top-actions">
          <button className="button ghost" onClick={undo} title="撤销">↶</button>
          <button className="button ghost" onClick={redo} title="重做">↷</button>
          <button className={"button soft assistant-top-button" + (assistantOpen ? " active" : "")} onClick={() => { setAssistantScope(selectedIds.length ? "selection" : "board"); setAssistantOpen((value) => !value); }}>✦ 设计助手</button>
          <button className={"button soft focus-top-button" + (focusMode ? " active" : "")} onClick={() => setFocusMode((value) => !value)}>{focusMode ? "退出专注" : "专注模式"}</button>
          <UserMenu />
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
              onDoubleClick={(event) => {
                event.stopPropagation();
                startBoardRename(board.id, board.title, "sidebar");
              }}
              onContextMenu={(event) => {
                event.preventDefault();
                setContextMenu({ kind: "board", id: board.id, x: event.clientX, y: event.clientY });
              }}
            >
              <span className="nav-thumb cool" />
              {editingBoardId === board.id && editingBoardSurface === "sidebar" ? (
                <input
                  autoFocus
                  value={boardDraft}
                  onClick={(event) => event.stopPropagation()}
                  onChange={(event) => setBoardDraft(event.target.value)}
                  onBlur={() => void commitBoardRename(board.id)}
                  onKeyDown={(event) => {
                    event.stopPropagation();
                    if (event.key === "Enter") void commitBoardRename(board.id);
                    if (event.key === "Escape") { setEditingBoardId(null); setEditingBoardSurface(null); }
                  }}
                />
              ) : (
                <span>{board.title}</span>
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
        <div className="quota-card">
          <div><span>模型服务</span><strong title={connectedModelLabel}>{connectedModelLabel}</strong></div>
          <p>管理用于参考拆解、设计基准和一致性检查的模型服务。</p>
          <button onClick={() => void loadCredentials()}>管理模型服务</button>
        </div>
      </aside>
      <div className="rail-resizer rail-resizer-left" role="separator" aria-label="调整左侧栏宽度" aria-orientation="vertical" onPointerDown={(event) => startRailResize("left", event)} />

      <section className={"canvas-area" + (rightPanning ? " is-right-panning" : "")} aria-label="灵感无限画布" onPointerDownCapture={(event) => { if (event.button === 2) setRightPanning(true); }}>
        <div className={"canvas-search" + (searchExpanded ? "" : " is-collapsed")} title="按标题、标签、文字、来源、颜色和拆解结果查找">
          {!searchExpanded && <button className="search-toggle" onClick={() => setSearchExpanded(true)} aria-label="打开画布查找">⌕</button>}
          {searchExpanded && <span className="search-leading">⌕</span>}
          {searchExpanded && <input type="search" value={search} onChange={(event) => handleSearchChange(event.target.value)} onKeyDown={(event) => { if (event.key === "Enter") { event.preventDefault(); focusSearchMatch(searchCursor + (event.shiftKey ? -1 : 1)); } }} placeholder="查找标题、标签、颜色…" autoFocus />}
          {searchExpanded && <div className="search-result-nav"><button disabled={!searchMatchIds.length} onClick={() => focusSearchMatch(searchCursor - 1)} aria-label="上一个结果">‹</button><small>{search ? searchMatchIds.length ? (searchCursor + 1) + "/" + searchMatchIds.length : "0 项" : "画布"}</small><button disabled={!searchMatchIds.length} onClick={() => focusSearchMatch(searchCursor + 1)} aria-label="下一个结果">›</button></div>}
          {searchExpanded && <button className="search-close" onClick={() => { setSearch(""); setSearchExpanded(false); }} aria-label="关闭画布查找">×</button>}
        </div>
        <div className="canvas-toolbar" role="toolbar" aria-label="画布工具">
          <button onClick={() => fileInput.current?.click()} title="从本地上传图片素材"><b>↑</b><small>上传</small></button>
          <button onClick={() => setModal("import")} title="添加网页、文字或文件夹"><b>＋</b><small>添加</small></button>
          <button onClick={createNote} title="添加可原位编辑的画布备注"><b>✎</b><small>备注</small></button>
          <button onClick={() => createGroup()} title="新建分组"><b>▱</b><small>分组</small></button>
          <span />
          <button className="ai-tool" onClick={() => selectedIds.length > 1 ? void analyzeSelected() : void analyze()} title="拆解所选参考"><b>✦</b><small>拆解</small></button>
          <button onClick={previewOrganize} title="整理画布"><b>⌗</b><small>整理</small></button>
          <span />
          <button onClick={() => void fitView({ padding: 0.18, duration: 320 })} title="快速定位全部内容"><b>⛶</b><small>定位</small></button>
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
        <input ref={fileInput} className="visually-hidden" type="file" multiple accept="image/jpeg,image/png,image/webp" onChange={(event) => event.target.files?.length && void addImages(event.target.files)} />
        <input
          ref={(node) => {
            folderInput.current = node;
            node?.setAttribute("webkitdirectory", "");
            node?.setAttribute("directory", "");
          }}
          className="visually-hidden"
          type="file"
          multiple
          accept="image/jpeg,image/png,image/webp"
          onChange={(event) => event.target.files?.length && void addImages(event.target.files, true)}
        />
        <label className="relation-view" title="关联线只用于辅助整理，默认仅显示当前卡片相关关系">
          <span>辅助关联</span>
          <select value={relationView} onChange={(event) => setRelationView(event.target.value as RelationView)}>
            <option value="selection">当前相关</option>
            <option value="hidden">全部隐藏</option>
            <option value="all">显示全部</option>
          </select>
        </label>
        <ReactFlow
          nodes={visibleNodes}
          edges={visibleEdges}
          nodeTypes={nodeTypes}
          onNodesChange={organizePreview ? undefined : onNodesChange}
          onEdgesChange={organizePreview ? undefined : onEdgesChange}
          onConnect={organizePreview ? undefined : onConnect}
          onSelectionChange={onSelectionChange}
          onNodeClick={onNodeClick}
          onNodeContextMenu={onNodeContextMenu}
          onPaneClick={onPaneClick}
          onNodeDragStop={onNodeDragStop}
          onMoveEnd={(_, viewport) => setViewportState(viewport)}
          selectionOnDrag={!organizePreview}
          selectionMode={SelectionMode.Full}
          multiSelectionKeyCode={["Shift", "Control", "Meta"]}
          panOnDrag={[2]}
          deleteKeyCode={null}
          nodesDraggable={!organizePreview}
          nodesConnectable={!organizePreview}
          connectionRadius={32}
          elementsSelectable={!organizePreview}
          fitView
          minZoom={0.14}
          maxZoom={2.2}
          snapToGrid
          snapGrid={canvasSnapGrid}
          onlyRenderVisibleElements
          elevateEdgesOnSelect
        >
          <Background id="fine-dots" variant={BackgroundVariant.Dots} color="rgba(72,63,86,.30)" gap={20} size={1.35} />
          <Background id="major-dots" variant={BackgroundVariant.Dots} color="rgba(72,63,86,.16)" gap={100} size={2.1} />
          {showMiniMap && <MiniMap pannable zoomable nodeColor={miniMapNodeColor} maskColor="rgba(246,243,248,.58)" ariaLabel="画布缩略图" />}
        </ReactFlow>
        <button className={"minimap-toggle" + (showMiniMap ? " is-open" : "")} onClick={() => setShowMiniMap((value) => !value)} title={showMiniMap ? "收起缩略图" : "打开缩略图"} aria-label={showMiniMap ? "收起缩略图" : "打开缩略图"}>▣</button>
        {focusMode && <button className="focus-exit-button" onClick={() => setFocusMode(false)}>退出专注 <kbd>Esc</kbd></button>}

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
      <div className="rail-resizer rail-resizer-right" role="separator" aria-label="调整右侧栏宽度" aria-orientation="vertical" onPointerDown={(event) => startRailResize("right", event)} />

      <aside className="inspector">
        <div className="inspector-tabs">
          <button className={rightTab === "asset" ? "active" : ""} onClick={() => setRightTab("asset")}>素材</button>
          <button className={rightTab === "baseline" ? "active" : ""} onClick={() => setRightTab("baseline")}>设计基准</button>
          <button className={rightTab === "export" ? "active" : ""} onClick={() => setRightTab("export")}>导出</button>
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
                <div><small>{selected.data.kind === "group" ? "分组" : selected.data.note ? "备注" : "参考卡片"}</small><h2>{selected.data.title}</h2></div>
              </section>
              {isAnalyzableNode(selected) && <button className="analyze-button" onClick={() => void analyze(selected.id)} disabled={selected.data.status === "processing"}>✦ {selected.data.analysisSummary ? "重新拆解这个参考" : "拆解这个参考"}<small>使用已连接模型</small></button>}
              {!!selected.data.colors?.length && <section className="inspect-block"><div className="block-heading"><h3>颜色参考</h3><button onClick={() => navigator.clipboard.writeText(selected.data.colors?.join(", ") || "")}>复制全部</button></div><div className="palette-list">{selected.data.colors.map((color) => <button key={color} onClick={() => navigator.clipboard.writeText(color)}><i style={{ background: color }} /><span>颜色</span><code>{color}</code></button>)}</div></section>}
              {!!selected.data.principles?.length && <section className="inspect-block"><h3>可复用的设计要点</h3><ol className="principle-list">{selected.data.principles.map((item) => <li key={item}>{item}</li>)}</ol></section>}
              {!!selected.data.regions?.length && <section className="inspect-block"><div className="block-heading"><h3>检测到的元素</h3><small>确认后才会导出</small></div><div className="region-list">{selected.data.regions.map((region) => <div key={region.id}><span className="region-preview">{region.type}</span><div><strong>{region.label}</strong><small>{region.confirmed ? "已经确认" : "等待确认"}</small></div><button disabled={region.confirmed} onClick={() => void confirmRegion(region)}>{region.confirmed ? "已确认" : "确认使用"}</button></div>)}</div></section>}
            </>
          ) : <div className="empty-inspector"><strong>从画布开始</strong><p>拖动空白处框选多张卡片，或选择一张参考查看拆解结果。</p></div>
        ) : rightTab === "baseline" ? (
          <section className="contract-panel">
            <span className="step-kicker">设计基准工作区</span>
            <h2>把多份参考合并成可复用规则</h2>
            <p>比较颜色、排版、组件和风格差异，确认后再进入导出工作区。</p>
            <button className="analyze-button" onClick={() => void previewBaseline()} disabled={contractBusy}>✦ {contractBusy ? "正在整理…" : "生成设计基准"}</button>
            {contract && <div className="contract-content"><h3>{contract.title}</h3><h4>必须保持的设计原则</h4><ol>{contract.principles.map((item) => <li key={item}>{item}</li>)}</ol><h4>颜色</h4><div className="contract-swatches">{contract.tokens.colors.map((item) => <span key={item.name} title={item.name} style={{ background: item.value }} />)}</div>{!!contract.conflicts.length && <div className="contract-warning"><strong>需要你决定</strong>{contract.conflicts.map((item) => <p key={item}>{item}</p>)}</div>}<button className="button primary wide" onClick={() => void confirmBaseline()}>确认这套设计基准</button></div>}
          </section>
        ) : (
          <section className="export-panel export-flow">
            <span className="step-kicker">下一步工作区</span>
            <h2>从参考走到可用结果</h2>
            <p>先选想完成的事情，再选要在哪个工具继续。系统只准备这条路径真正需要的内容。</p>

            <div className="export-progress" aria-label="导出步骤">
              <span className="is-active"><i>1</i>想做什么</span>
              <b />
              <span className="is-active"><i>2</i>去哪里用</span>
              <b />
              <span><i>3</i>开始制作</span>
            </div>

            <div className="export-section-heading"><small>第一步</small><h3>你想得到什么？</h3></div>
            <div className="export-goal-list">
              {productionGoalOptions.map((option) => (
                <button
                  key={option.id}
                  className={productionGoal === option.id ? "is-active" : ""}
                  onClick={() => {
                    setProductionGoal(option.id);
                    setExportDestination(exportDestinationsByGoal[option.id][0].id);
                    setExportComplete(false);
                  }}
                >
                  <i>{option.step}</i>
                  <div><strong>{option.title}</strong><small>{option.description}</small></div>
                  <span>{productionGoal === option.id ? "✓" : "›"}</span>
                </button>
              ))}
            </div>

            <div className="export-section-heading"><small>第二步</small><h3>接下来在哪里工作？</h3></div>
            <div className="export-destination-list">
              {exportDestinations.map((option) => (
                <button
                  key={option.id}
                  className={activeDestination.id === option.id ? "is-active" : ""}
                  onClick={() => { setExportDestination(option.id); setExportComplete(false); }}
                >
                  <span className="destination-icon">{option.icon}</span>
                  <div>
                    <strong>{option.title}{option.recommended && <em>推荐</em>}</strong>
                    <small>{option.description}</small>
                  </div>
                  <i>{activeDestination.id === option.id ? "✓" : "›"}</i>
                </button>
              ))}
            </div>

            {activeDestination.glossary && (
              <details className="export-glossary">
                <summary>{activeDestination.glossary.term}</summary>
                <p>{activeDestination.glossary.explanation}</p>
              </details>
            )}

            <div className="export-result-preview">
              <span>将为你准备</span>
              <strong>{activeDestination.deliverable}</strong>
              <p><b>下一步：</b>{activeDestination.nextStep}</p>
            </div>

            <button className="button primary wide export-now" onClick={() => void exportPackage()} disabled={exportBusy}>
              {exportBusy ? "正在准备…" : activeDestination.action}
            </button>

            {exportComplete && (
              <div className="export-receipt" role="status">
                <span>✓</span>
                <div><strong>已经下载</strong><small>解压后先打开 START_HERE.html，它会告诉你下一步点哪里、复制什么。</small></div>
              </div>
            )}
          </section>
        )}
      </aside>

      {assistantOpen && (
        <aside className="assistant-drawer" aria-label="设计助手">
          <header>
            <div><span>✦</span><div><strong>设计助手</strong><small>基于画布里的参考给出设计思路</small></div></div>
            <button onClick={() => setAssistantOpen(false)} aria-label="关闭设计助手">×</button>
          </header>
          <section className="assistant-goal">
            <label htmlFor="assistant-goal">你要设计什么？</label>
            <textarea id="assistant-goal" value={assistantGoal} onChange={(event) => setAssistantGoal(event.target.value)} placeholder="例如：为户外运动品牌设计一套夏季活动落地页，需要保持年轻、专业且便于批量延展。" />
          </section>
          <div className="assistant-scope" role="group" aria-label="分析范围">
            <button className={assistantScope === "selection" ? "active" : ""} disabled={!selectedIds.length} onClick={() => setAssistantScope("selection")}>当前选择{selectedIds.length ? " · " + selectedIds.length + " 张" : ""}</button>
            <button className={assistantScope === "board" ? "active" : ""} onClick={() => setAssistantScope("board")}>整张画布</button>
          </div>
          <div className="assistant-thread">
            {!assistantMessages.length && <div className="assistant-empty"><strong>先说明目标，再从参考中找方向</strong><p>我会引用画布中的具体卡片，比较可复用的视觉语言、结构和冲突，不会替你凭空决定。</p><div><button onClick={() => setAssistantQuestion("这些参考里，哪些视觉规律最适合我的设计目标？")}>提炼视觉规律</button><button onClick={() => setAssistantQuestion("请给出信息结构、组件和视觉风格的落地建议。")}>生成落地思路</button></div></div>}
            {assistantMessages.map((message, index) => <article key={index} className={message.role}><span>{message.role === "assistant" ? "✦" : "我"}</span><p>{message.content}</p></article>)}
            {assistantBusy && <article className="assistant is-loading"><span>✦</span><p>正在结合目标与参考内容思考…</p></article>}
          </div>
          <form className="assistant-compose" onSubmit={(event) => { event.preventDefault(); void askDesignAssistant(); }}>
            <textarea value={assistantQuestion} onChange={(event) => setAssistantQuestion(event.target.value)} onKeyDown={(event) => { if (event.key === "Enter" && !event.shiftKey) { event.preventDefault(); void askDesignAssistant(); } }} placeholder="继续追问设计方向、结构、组件或一致性…" />
            <button disabled={assistantBusy || !assistantGoal.trim() || !assistantQuestion.trim()}>{assistantBusy ? "…" : "发送"}</button>
          </form>
        </aside>
      )}
      {contextMenu?.kind === "node" && (() => {
        const node = nodes.find((item) => item.id === contextMenu.id);
        if (!node) return null;
        return (
          <div className="node-action-menu" style={{ left: contextMenu.x, top: contextMenu.y }} onPointerDown={(event) => event.stopPropagation()}>
            <button onClick={() => handleNodeMenu("rename")}>重命名</button>
            {isAnalyzableNode(node) && <button onClick={() => handleNodeMenu("analyze")}>{node.data.analysisSummary ? "重新拆解" : "拆解参考"}</button>}
            {node.data.sourceUrl && <button onClick={() => handleNodeMenu("open")}>打开来源</button>}
            {node.data.kind === "group" && <button onClick={() => handleNodeMenu("select-children")}>选择组内卡片</button>}
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

      {modal === "import" && <div className="modal-backdrop" onMouseDown={() => setModal(null)}><section className="modal import-modal" onMouseDown={(event) => event.stopPropagation()}><button className="modal-close" onClick={() => setModal(null)}>×</button><span className="step-kicker">第 1 步 · 采集参考</span><h2>加入当前画布</h2><p>上传图片或整个灵感文件夹，也可以粘贴文字、输入网页地址。网页使用插件采集时会保存完整截图。</p><div className="import-choice"><button className="import-drop" onClick={() => fileInput.current?.click()}><span>⇧</span><strong>上传图片</strong><small>JPG、PNG、WebP · 单张最大 20 MB</small></button><button className="import-drop folder-drop" onClick={() => folderInput.current?.click()}><span>▱</span><strong>上传文件夹</strong><small>自动建立同名分组并排列图片</small></button></div><div className="url-entry"><input autoFocus value={urlValue} onChange={(event) => setUrlValue(event.target.value)} placeholder="公开 URL 或参考文字" /><button onClick={() => urlValue.trim() && void addAsset(urlValue.trim())}>加入</button></div></section></div>}

      {modal === "credentials" && <div className="modal-backdrop"><section className="modal credential-modal model-service-modal"><button className="modal-close" onClick={() => setModal(null)}>×</button><span className="step-kicker">模型服务</span><h2>管理分析服务</h2><p>Key 由服务端加密保存，页面只会读取末四位。点击已保存记录可重新验证并切换当前服务。</p>{credentialState.length > 0 && <><div className="credential-section-title"><span>已保存的服务</span><small>紫色标记为当前使用</small></div><div className="credential-list">{credentialState.map((item) => { const provider = item.provider as ProviderId; const catalog = providerCatalog[provider]; return <article key={item.provider} className={"credential-card" + (item.active ? " is-active" : "")}><button className="credential-card-main" disabled={credentialBusyProvider === provider} onClick={() => void activateCredential(provider, reconnectModel(provider, item.model))}><strong>{catalog?.label ?? item.provider}</strong><span>{item.model} · •••• {item.lastFour}</span><small>{credentialBusyProvider === provider ? "正在验证…" : provider === "moonshot" && item.model === "kimi-k2.5" ? "旧模型 · 点击迁移到 kimi-k3" : item.active ? "● 当前使用 · 点击重新验证" : "点击连接并设为当前"}</small></button><button className="credential-remove" onClick={() => setCredentialToDelete(provider)} aria-label={"删除 " + (catalog?.label ?? item.provider)}>×</button></article>; })}</div></>}<div className="credential-section-title"><span>{credentialState.some((item) => item.provider === credentialForm.provider) ? "更新当前平台" : "添加新平台"}</span><small>模型会影响视觉能力、速度和费用</small></div><div className="provider-picker"><label><span>开放平台</span><select value={credentialForm.provider} onChange={(event) => { const provider = event.target.value as ProviderId; const saved = credentialState.find((item) => item.provider === provider); setCredentialForm({ ...credentialForm, provider, model: saved?.model ?? providerCatalog[provider].models[0], apiKey: "" }); }}>{Object.entries(providerCatalog).map(([id, item]) => <option key={id} value={id}>{item.label}{item.supportsVision ? " · 图片与文字" : " · 仅文字"}</option>)}</select></label><div className="provider-summary"><div><strong>{selectedProvider.label}</strong><small>{selectedProvider.description}</small></div><a href={selectedProvider.platformUrl} target="_blank" rel="noreferrer">开放平台 ↗</a></div></div><div className="credential-form"><label><span>API Key{credentialState.some((item) => item.provider === credentialForm.provider) ? "（留空则使用已保存 Key）" : ""}</span><input type="password" value={credentialForm.apiKey} onChange={(event) => setCredentialForm({ ...credentialForm, apiKey: event.target.value })} placeholder={credentialState.some((item) => item.provider === credentialForm.provider) ? "使用已保存的 Key" : "粘贴 API Key"} /></label><label><span>分析模型</span><input list="provider-model-options" value={credentialForm.model} onChange={(event) => setCredentialForm({ ...credentialForm, model: event.target.value })} placeholder={selectedProvider.models[0]} /><datalist id="provider-model-options">{selectedProvider.models.map((model) => <option key={model} value={model} />)}</datalist></label><button className="button primary" disabled={(!credentialForm.apiKey && !credentialState.some((item) => item.provider === credentialForm.provider)) || loadingCredential} onClick={() => void saveCredential()}>{loadingCredential ? "正在验证…" : credentialState.some((item) => item.provider === credentialForm.provider) && !credentialForm.apiKey ? "验证并更新" : "验证并保存"}</button></div><p className="credential-form-note">模型选择会影响图片理解能力、调用费用和输出速度。不了解时保留系统推荐即可。</p></section></div>}


      {credentialToDelete && <div className="modal-backdrop"><section className="modal credential-delete-modal"><span className="step-kicker">删除模型服务</span><h2>删除 {providerCatalog[credentialToDelete].label}？</h2><p>保存的加密 Key 和模型设置会立即删除，之后需要重新添加才能使用。</p><div className="confirm-actions"><button className="button soft" onClick={() => setCredentialToDelete(null)}>取消</button><button className="button danger" onClick={() => void deleteCredential(credentialToDelete)}>删除</button></div></section></div>}

      {toast && <div className="toast"><span>✓</span>{toast}</div>}
    </main>
  );
}

function sceneSignature(nodes: CanvasNode[], edges: Edge[], viewport: Viewport) {
  return JSON.stringify(flowToScene(nodes, edges, viewport));
}

function isAnalyzableNode(node: CanvasNode) {
  return sourceKinds.has(node.data.kind) && !node.data.note && Boolean(node.data.assetId);
}

function clamp(value: number, minimum: number, maximum: number) {
  return Math.min(maximum, Math.max(minimum, value));
}

function reconnectModel(provider: ProviderId, model?: string) {
  if (provider === "moonshot" && model === "kimi-k2.5") return "kimi-k3";
  return model || providerCatalog[provider].models[0];
}

function miniMapNodeColor(node: CanvasNode) {
  if (node.data.kind === "group") return "#dcd4e7";
  if (node.data.kind === "web") return "#c9d8ef";
  if (node.data.kind === "image") return "#e7cbd9";
  if (node.data.kind === "element") return "#d8e7d3";
  return "#d7d0dd";
}

function clipScreenshotCount(item: Record<string, unknown>) {
  const metadata = item.metadata && typeof item.metadata === "object" ? item.metadata as Record<string, unknown> : {};
  const keys = Array.isArray(metadata.screenshotKeys) ? metadata.screenshotKeys : [];
  if (keys.length) return keys.length;
  const count = Number(metadata.viewportCaptures);
  return Number.isInteger(count) && count > 0 && metadata.captureSource === "browser-extension" ? count : 0;
}

function nodeMatchesQuery(node: CanvasNode, term: string) {
  const searchable = [
    node.data.title,
    node.data.body,
    node.data.sourceUrl,
    node.data.analysisSummary,
    ...(node.data.tags ?? []),
    ...(node.data.colors ?? []),
    ...(node.data.principles ?? []),
  ].filter(Boolean).join(" ").toLowerCase();
  return searchable.includes(term);
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
        analysisError: typeof analysis.error === "string" ? friendlyAnalysisError(analysis.error) : undefined,
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
      analysisError: typeof analysis.error === "string" ? friendlyAnalysisError(analysis.error) : undefined,
      principles: result.principles,
      colors: result.palette.map((color) => color.hex),
      tags: result.tags.slice(0, 8).map((tag) => tag.value),
      regions: result.components,
    },
  };
}

function friendlyAnalysisError(value: unknown) {
  if (typeof value !== "string" || !value.trim()) return "拆解失败，请重试。";
  const message = value.trim();
  if (/aborted|aborterror|timed? out|timeout/i.test(message)) return "视觉分析用时超过当前限制。系统已保留素材，请重试；若仍超时，可先缩小截图或更换响应更快的视觉模型。";
  if (/JSON 无法解析|invalid_(?:type|value)|expected|zod|too_(?:big|small)|\[\s*\{/i.test(message) || message.length > 260) {
    return "模型返回的分析格式不完整，系统已保留原素材。请重试；若持续失败，请在 AI 设置中更换支持结构化输出的模型。";
  }
  return message;
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
