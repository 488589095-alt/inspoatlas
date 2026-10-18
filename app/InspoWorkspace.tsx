"use client";

import { useCallback, useEffect, useMemo, useRef, useState, type CSSProperties, type MouseEvent as ReactMouseEvent, type PointerEvent as ReactPointerEvent } from "react";
import { createPortal } from "react-dom";
import {
  addEdge,
  applyNodeChanges,
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
import { type AnalysisResult, type DesignBrief, type DesignContract, type DesignPurpose, type Relation } from "@/packages/domain/src";
import {
  exportDestinationsByGoal,
  productionGoalOptions,
  type ExportDestination,
  type ProductionGoal,
} from "./exportOptions";
import { CardNode } from "./workspace/CardNode";
import { RelationEdge } from "./workspace/RelationEdge";
import { UserMenu } from "./workspace/UserMenu";
import { WorkspaceIcon, type WorkspaceIconName } from "./workspace/WorkspaceIcon";
import { ImageEditor } from "./workspace/ImageEditor";
import type { AssistantAction } from "./workspace/assistantConversation";
import { ToolbarMoreMenu } from "./workspace/ToolbarMoreMenu";
import { uploadPrivateFile } from "./workspace/clientUpload";
import { buildOrganizePreview, type OrganizePreview } from "./workspace/organize";
import {
  flowToScene,
  readDraft,
  saveDraft,
  sceneToFlow,
  type BoardSummary,
  type CanvasNode,
  type CardData,
} from "./workspace/model";
import "@xyflow/react/dist/style.css";
import "./export.css";

const nodeTypes = { inspo: CardNode };
const edgeTypes = { relation: RelationEdge };
const sourceKinds = new Set(["image", "web", "text"]);
const defaultSize: Record<CardData["kind"], { width: number; height: number }> = {
  image: { width: 300, height: 400 },
  video: { width: 320, height: 260 },
  audio: { width: 300, height: 190 },
  web: { width: 320, height: 280 },
  text: { width: 290, height: 190 },
  analysis: { width: 350, height: 310 },
  element: { width: 250, height: 170 },
  group: { width: 760, height: 520 },
};
const canvasSnapGrid: [number, number] = [8, 8];
const railCompactWidth = 68;
const railExpandedMinimum = { left: 204, right: 280 } as const;
const railDefaultWidth = { left: 242, right: 322 } as const;
const railMaximumWidth = { left: 360, right: 460 } as const;
const imageFriendlyFitPadding = { top: "36px", right: "56px", bottom: "110px", left: "56px" } as const;

type WorkspaceModal = "import" | "new-work" | null;
type RelationView = "hidden" | "selection" | "all";
type SearchKind = "all" | "image" | "video" | "audio" | "web" | "text" | "analysis" | "contract" | "group";
type NextStepMenu = { sourceId: string; x: number; y: number };
type NextStepAction = "analyze" | "redesign" | "edit" | "note" | "contract";
type NextStepOption = { action: NextStepAction; title: string; description: string; icon: WorkspaceIconName };

function nextStepOptions(node: CanvasNode): NextStepOption[] {
  if (node.data.workflowStage === "contract") return [];
  const options: NextStepOption[] = [];
  if (isAnalyzableNode(node)) options.push({ action: "analyze", title: node.data.analysisId ? "重新拆解" : "拆解参考", description: "提取版式、色彩与组件", icon: "analyze" });
  if (node.data.kind === "image" && node.data.assetId && node.data.imageUrl) {
    options.push({ action: "redesign", title: "AI 改造图片", description: "写下要求，生成设计新版本", icon: "ask" });
    options.push({ action: "edit", title: "编辑素材", description: "裁剪、旋转或创建蒙版", icon: "archive" });
  }
  if (node.data.workflowStage === "analysis") options.push({ action: "contract", title: "整合为方案", description: "合并要点并梳理设计方向", icon: "arrange" });
  options.push({ action: "note", title: "添加关联备注", description: "记录这条灵感的想法", icon: "note" });
  return options;
}
type ContextMenu = { kind: "node" | "board"; id: string; x: number; y: number };
type DeleteRequest = { kind: "board" | "nodes"; ids: string[]; title: string; body: string };
type AssistantScope = "selection" | "board";
type ContractEvidenceSection = "principles" | "conflicts" | "unresolved";
type ContractReviewSection = "conflicts" | "unresolved";
type AssistantMessage = {
  id?: string;
  role: "user" | "assistant";
  content: string;
  followUps?: string[];
  sources?: Array<{ title: string; url: string; reason: string }>;
  provider?: string;
  model?: string;
  promptVersion?: string;
  runMode?: "managed" | "byok";
  feedback?: "helpful" | "needs-work";
};
type AssistantConversation = {
  id: string;
  title: string;
  createdAt: string;
  updatedAt: string;
};
type AssistantMemory = { userRole: string; preferences: string; avoid: string };
const emptyAssistantMemory: AssistantMemory = { userRole: "", preferences: "", avoid: "" };

function conversationUrl(boardId: string, conversationId?: string) {
  const base = `/api/boards/${encodeURIComponent(boardId)}/conversations`;
  return conversationId ? `${base}/${encodeURIComponent(conversationId)}` : base;
}

function conversationDate(value: string) {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "";
  const today = new Date();
  if (date.toDateString() === today.toDateString()) return "今天";
  return date.getFullYear() === today.getFullYear()
    ? `${date.getMonth() + 1}月${date.getDate()}日`
    : `${date.getFullYear()}年${date.getMonth() + 1}月${date.getDate()}日`;
}
type BrowserSpeechRecognition = {
  lang: string;
  interimResults: boolean;
  continuous: boolean;
  onresult: ((event: { results: ArrayLike<ArrayLike<{ transcript: string }>> }) => void) | null;
  onerror: ((event: { error: string }) => void) | null;
  onend: (() => void) | null;
  start: () => void;
  stop: () => void;
};
type SpeechWindow = Window & {
  SpeechRecognition?: new () => BrowserSpeechRecognition;
  webkitSpeechRecognition?: new () => BrowserSpeechRecognition;
};
const searchKindOptions: Array<{ id: SearchKind; label: string; icon: string }> = [
  { id: "all", label: "全部", icon: "⌕" },
  { id: "image", label: "图片", icon: "▧" },
  { id: "video", label: "视频", icon: "▷" },
  { id: "audio", label: "音频", icon: "♪" },
  { id: "web", label: "网页", icon: "◎" },
  { id: "text", label: "文字", icon: "≡" },
  { id: "analysis", label: "拆解", icon: "✦" },
  { id: "contract", label: "方案", icon: "◇" },
  { id: "group", label: "分组", icon: "▱" },
];
const purposeOptions: Array<{
  id: DesignPurpose;
  mark: string;
  title: string;
  description: string;
  fields: [string, string, string, string];
}> = [
  { id: "web-ui-recreate", mark: "▧", title: "网页 / UI 复刻", description: "复用明确的结构与组件规律。", fields: ["复刻范围", "平台 / 尺寸", "必须保留", "排除项"] },
  { id: "brand-extension", mark: "◉", title: "图片 / 品牌视觉延展", description: "借用视觉语言，重写品牌与主体。", fields: ["品牌 / 主体", "使用场景与受众", "必须保留", "禁止项"] },
  { id: "campaign-system", mark: "▦", title: "批量活动页系统", description: "把可复用规则和可变内容分开。", fields: ["页面数量与目标", "投放渠道", "固定模块", "可变内容"] },
  { id: "organize", mark: "⌗", title: "仅整理灵感", description: "先形成可追溯的参考方案，不进入生产。", fields: ["整理目标", "整理范围", "重点保留", "暂不考虑"] },
];
const productionGoalByPurpose: Record<DesignPurpose, ProductionGoal | null> = {
  "web-ui-recreate": "recreate",
  "brand-extension": "explore",
  "campaign-system": "scale",
  organize: null,
};
const agentPromptPresets = [
  "我想参考一些网站，做一个新的网站。你能帮我找设计方向吗？",
  "我收集了几张参考图，你能帮我找出它们共同的视觉语言吗？",
  "我只有一个模糊的想法，你能陪我理清目标和下一步吗？",
] as const;
const agentWelcome = "我是你的设计小助手小in。跟我聊聊你的想法吧。";
function TypewriterText({ text, animate = true, speed = 72, onComplete }: { text: string; animate?: boolean; speed?: number; onComplete?: () => void }) {
  const [visible, setVisible] = useState(animate ? "" : text);
  const onCompleteRef = useRef(onComplete);
  useEffect(() => { onCompleteRef.current = onComplete; }, [onComplete]);
  useEffect(() => {
    if (!animate || window.matchMedia("(prefers-reduced-motion: reduce)").matches) {
      setVisible(text);
      onCompleteRef.current?.();
      return;
    }
    const chars = Array.from(text);
    let index = 0;
    setVisible("");
    const timer = window.setInterval(() => {
      index = Math.min(chars.length, index + 1);
      setVisible(chars.slice(0, index).join(""));
      if (index === chars.length) {
        window.clearInterval(timer);
        onCompleteRef.current?.();
      }
    }, speed);
    return () => window.clearInterval(timer);
  }, [text, animate, speed]);
  return <span className="typewriter-text" aria-label={text}><span aria-hidden="true">{animate ? visible : text}</span>{animate && visible.length < text.length && <span className="typewriter-cursor" aria-hidden="true" />}</span>;
}
const purposeIconById: Record<DesignPurpose, WorkspaceIconName> = {
  "web-ui-recreate": "archive",
  "brand-extension": "ask",
  "campaign-system": "arrange",
  organize: "folder",
};
function createDesignBrief(purpose: DesignPurpose = "organize"): DesignBrief {
  return { purpose, objective: "", context: "", keep: "", avoid: "" };
}
function designPurposeLabel(purpose: DesignPurpose | undefined) {
  return purposeOptions.find((item) => item.id === purpose)?.title ?? "未指定任务";
}

function WorkspaceCanvas() {
  const [boards, setBoards] = useState<BoardSummary[]>([]);
  const [boardId, setBoardId] = useState("");
  const [boardTitle, setBoardTitle] = useState("加载中…");
  const [nodes, setNodes] = useNodesState<CanvasNode>([]);
  const [edges, setEdges, onEdgesChange] = useEdgesState<Edge>([]);
  const [selectedIds, setSelectedIds] = useState<string[]>([]);
  const [search, setSearch] = useState("");
  const [searchExpanded, setSearchExpanded] = useState(false);
  const [searchKind, setSearchKind] = useState<SearchKind>("all");
  const [searchCursor, setSearchCursor] = useState(0);
  const [showMiniMap, setShowMiniMap] = useState(true);
  const [focusMode, setFocusMode] = useState(false);
  const [theme, setTheme] = useState<"light" | "dark">("light");
  const [themeHydrated, setThemeHydrated] = useState(false);
  const [savedState, setSavedState] = useState("正在读取");
  const [rightTab, setRightTab] = useState<"asset" | "baseline">("asset");
  const [inspectorOpen, setInspectorOpen] = useState(false);
  const [relationView, setRelationView] = useState<RelationView>("selection");
  const [modal, setModal] = useState<WorkspaceModal>(null);
  const [contextMenu, setContextMenu] = useState<ContextMenu | null>(null);
  const [deleteRequest, setDeleteRequest] = useState<DeleteRequest | null>(null);
  const [toast, setToast] = useState("");
  const [urlValue, setUrlValue] = useState("");
  const [uploadState, setUploadState] = useState<{ total: number; completed: number; name: string } | null>(null);
  const [organizePreview, setOrganizePreview] = useState<OrganizePreview | null>(null);
  const [editingBoardId, setEditingBoardId] = useState<string | null>(null);
  const [editingBoardSurface, setEditingBoardSurface] = useState<"header" | "sidebar" | "popover" | null>(null);
  const [boardDraft, setBoardDraft] = useState("");
  const [boardRenameTop, setBoardRenameTop] = useState(120);
  const [newWorkTitle, setNewWorkTitle] = useState("");
  const [contract, setContract] = useState<DesignContract | null>(null);
  const [contractBusy, setContractBusy] = useState(false);
  const [contractSourceNodeIds, setContractSourceNodeIds] = useState<string[]>([]);
  const [contractSetupNodeIds, setContractSetupNodeIds] = useState<string[]>([]);
  const [designBrief, setDesignBrief] = useState<DesignBrief>(() => createDesignBrief());
  const [workflowOverlay, setWorkflowOverlay] = useState<"purpose" | "contract" | "export" | null>(null);
  const [nextStepMenu, setNextStepMenu] = useState<NextStepMenu | null>(null);
  const [hoveredNextStep, setHoveredNextStep] = useState<NextStepAction | null>(null);
  const [productionGoal, setProductionGoal] = useState<ProductionGoal>("recreate");
  const [exportDestination, setExportDestination] = useState<ExportDestination>("figma-design");
  const [exportBusy, setExportBusy] = useState(false);
  const [exportComplete, setExportComplete] = useState<false | "quick" | "full">(false);
  const [exportStep, setExportStep] = useState<1 | 2 | 3>(1);

  const [assistantQuestion, setAssistantQuestion] = useState("");
  const [assistantMessages, setAssistantMessages] = useState<AssistantMessage[]>([]);
  const [assistantConversations, setAssistantConversations] = useState<AssistantConversation[]>([]);
  const [assistantConversationId, setAssistantConversationId] = useState<string | null>(null);
  const [assistantConversationVersion, setAssistantConversationVersion] = useState(0);
  const [assistantHistoryOpen, setAssistantHistoryOpen] = useState(false);
  const [assistantHistoryLoading, setAssistantHistoryLoading] = useState(false);
  const [assistantHistoryError, setAssistantHistoryError] = useState("");
  const [assistantDeleteId, setAssistantDeleteId] = useState<string | null>(null);
  const [assistantMemoryOpen, setAssistantMemoryOpen] = useState(false);
  const [assistantMemory, setAssistantMemory] = useState<AssistantMemory>(emptyAssistantMemory);
  const [assistantMemoryBusy, setAssistantMemoryBusy] = useState(false);
  const [assistantBusy, setAssistantBusy] = useState(false);
  const [assistantHasInteracted, setAssistantHasInteracted] = useState(false);
  const [completedAnswerId, setCompletedAnswerId] = useState<string | null>(null);
  const [voiceSupported, setVoiceSupported] = useState(false);
  const [voiceListening, setVoiceListening] = useState(false);
  const [assistantOpen, setAssistantOpen] = useState(false);
  const [agentRevealed, setAgentRevealed] = useState(true);
  const [agentHintVisible, setAgentHintVisible] = useState(false);
  const [portalReady, setPortalReady] = useState(false);
  const [editingImage, setEditingImage] = useState<{ assetId: string; sourceUrl: string; title: string; nodeId: string } | null>(null);
  const [redesignImage, setRedesignImage] = useState<{ assetId: string; sourceUrl: string; title: string } | null>(null);
  const [redesignPrompt, setRedesignPrompt] = useState("");
  const [redesignBusy, setRedesignBusy] = useState(false);
  const [redesignError, setRedesignError] = useState("");
  const [connecting, setConnecting] = useState(false);
  const [leftRailWidth, setLeftRailWidth] = useState(242);
  const [rightRailWidth, setRightRailWidth] = useState(322);
  const [leftRailCollapsed, setLeftRailCollapsed] = useState(false);
  const [rightRailCollapsed, setRightRailCollapsed] = useState(false);
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
  const uploadPending = useRef(false);
  const edgesRef = useRef<Edge[]>([]);
  const connectionSourceRef = useRef<string | null>(null);
  const connectionCompletedRef = useRef(false);
  const canvasAreaRef = useRef<HTMLElement>(null);
  const nextStepMenuRef = useRef<HTMLElement>(null);
  const assistantBoardRef = useRef("");
  const assistantScrollRef = useRef<HTMLDivElement>(null);
  const speechRecognitionRef = useRef<BrowserSpeechRecognition | null>(null);
  const assistantRequestPendingRef = useRef(false);
  const { fitView, screenToFlowPosition, setViewport: setFlowViewport } = useReactFlow();

  useEffect(() => {
    setPortalReady(true);
    const speechWindow = window as SpeechWindow;
    setVoiceSupported(Boolean(speechWindow.SpeechRecognition || speechWindow.webkitSpeechRecognition));
    return () => speechRecognitionRef.current?.stop();
  }, []);

  useEffect(() => {
    if (!agentRevealed || assistantOpen) {
      setAgentHintVisible(false);
      return;
    }
    const timer = window.setTimeout(() => setAgentHintVisible(true), 450);
    return () => window.clearTimeout(timer);
  }, [agentRevealed, assistantOpen]);

  useEffect(() => {
    assistantBoardRef.current = boardId;
    setAssistantMessages([]);
    setAssistantQuestion("");
    setAssistantHasInteracted(false);
    setCompletedAnswerId(null);
    setAssistantConversationId(null);
    setAssistantConversationVersion(0);
    setAssistantConversations([]);
    setAssistantHistoryOpen(false);
    setAssistantHistoryError("");
    speechRecognitionRef.current?.stop();
    if (!boardId) {
      setAssistantHistoryLoading(false);
      return;
    }
    const controller = new AbortController();
    const loadConversations = async () => {
      setAssistantHistoryLoading(true);
      try {
        const response = await fetch(conversationUrl(boardId), { cache: "no-store", signal: controller.signal });
        const payload = await response.json().catch(() => ({}));
        if (!response.ok) throw new Error(String(payload.error || "历史对话暂时无法读取"));
        const conversations: AssistantConversation[] = Array.isArray(payload.conversations) ? payload.conversations : [];
        const remembered = window.localStorage.getItem(`inspoatlas:assistant-conversation:${boardId}`);
        const preferred = remembered === "" ? null : conversations.find((item) => item.id === remembered) ?? conversations[0] ?? null;
        if (preferred) {
          const detailResponse = await fetch(conversationUrl(boardId, preferred.id), { cache: "no-store", signal: controller.signal });
          const detail = await detailResponse.json().catch(() => ({}));
          if (!detailResponse.ok) throw new Error(String(detail.error || "对话暂时无法读取"));
          if (controller.signal.aborted) return;
          const messages: AssistantMessage[] = Array.isArray(detail.conversation?.messages) ? detail.conversation.messages : [];
          setAssistantConversationId(preferred.id);
          setAssistantConversationVersion(Number(detail.conversation.version) || 1);
          setAssistantMessages(messages);
          setAssistantHasInteracted(messages.length > 0);
          setCompletedAnswerId([...messages].reverse().find((item) => item.role === "assistant")?.id ?? null);
        }
        if (!controller.signal.aborted) setAssistantConversations(conversations);
      } catch (error) {
        if (!controller.signal.aborted) setAssistantHistoryError(error instanceof Error ? error.message : "历史对话暂时无法读取");
      } finally {
        if (!controller.signal.aborted) setAssistantHistoryLoading(false);
      }
    };
    void loadConversations();
    return () => controller.abort();
  }, [boardId]);

  useEffect(() => {
    if (!assistantOpen) return;
    window.requestAnimationFrame(() => {
      if (assistantScrollRef.current) assistantScrollRef.current.scrollTop = assistantScrollRef.current.scrollHeight;
    });
  }, [assistantOpen, assistantMessages.length, assistantBusy]);

  useEffect(() => {
    if (!assistantOpen) speechRecognitionRef.current?.stop();
  }, [assistantOpen]);

  useEffect(() => {
    if (!assistantOpen) return;
    const controller = new AbortController();
    void fetch("/api/assistant-memory", { cache: "no-store", signal: controller.signal })
      .then(async (response) => response.ok ? response.json() : Promise.reject(new Error("记忆暂时无法读取")))
      .then((payload) => { if (!controller.signal.aborted) setAssistantMemory({ ...emptyAssistantMemory, ...payload.memory }); })
      .catch(() => {});
    return () => controller.abort();
  }, [assistantOpen]);

  useEffect(() => {
    if (!connecting) return;
    const trackTarget = (event: PointerEvent) => setHoveredNextStep(nextStepAt(event.clientX, event.clientY));
    window.addEventListener("pointermove", trackTarget);
    return () => window.removeEventListener("pointermove", trackTarget);
  }, [connecting, nextStepMenu]);

  useEffect(() => {
    edgesRef.current = edges;
  }, [edges]);

  useEffect(() => {
    const editEdgeLabel = (event: Event) => {
      const detail = (event as CustomEvent<{ id: string; label: string }>).detail;
      setEdges((current) => current.map((edge) => edge.id === detail.id ? {
        ...edge,
        label: detail.label,
        data: { ...(edge.data ?? {}), explanation: detail.label },
      } : edge));
    };
    window.addEventListener("inspo:edge-label", editEdgeLabel);
    return () => window.removeEventListener("inspo:edge-label", editEdgeLabel);
  }, [setEdges]);



  const selectedNodes = useMemo(() => nodes.filter((node) => selectedIds.includes(node.id)), [nodes, selectedIds]);
  const selected = selectedNodes[0];
  const exportDestinations = exportDestinationsByGoal[productionGoal];
  const activeDestination = exportDestinations.find((item) => item.id === exportDestination) ?? exportDestinations[0];
  const activePurposeOption = purposeOptions.find((item) => item.id === designBrief.purpose) ?? purposeOptions[3];
  const sourceTitlesByAssetId = useMemo(() => new Map(nodes.flatMap((node) => {
    const assetId = node.data.workflowStage === "analysis" ? node.data.sourceAssetId : node.data.assetId;
    return assetId ? [[String(assetId), String(node.data.sourceTitle || node.data.title)]] : [];
  })), [nodes]);
  const searchResults = useMemo(() => {
    const term = search.trim().toLowerCase();
    return nodes.filter((node) => nodeMatchesSearchKind(node, searchKind) && (!term || nodeMatchesQuery(node, term)));
  }, [nodes, search, searchKind]);
  const visibleNodes = useMemo(() => {
    const base = organizePreview?.nodes ?? nodes;
    const term = search.trim().toLowerCase();
    const activeSearch = searchExpanded && Boolean(term || searchKind !== "all");
    return base.map((node) => {
      const cleanClass = (node.className ?? "").replace(/\s*is-search-(?:match|dim)/g, "");
      if (!activeSearch) {
        return cleanClass === (node.className ?? "") ? node : { ...node, className: cleanClass };
      }
      const searchClass = nodeMatchesSearchKind(node, searchKind) && (!term || nodeMatchesQuery(node, term)) ? "is-search-match" : "is-search-dim";
      return { ...node, className: `${cleanClass} ${searchClass}`.trim() };
    });
  }, [nodes, organizePreview, search, searchExpanded, searchKind]);
  const searchMatchIds = useMemo(() => searchResults.map((node) => node.id), [searchResults]);
  const visibleEdges = useMemo(() => {
    const selectedSet = new Set(selectedIds);
    return edges.map((edge) => {
      let hidden = relationView === "hidden";
      if (relationView === "selection") hidden ||= !(selectedSet.has(edge.source) || selectedSet.has(edge.target));
      return { ...edge, hidden };
    });
  }, [edges, relationView, selectedIds]);
  const persistableSignature = useMemo(() => sceneSignature(nodes, edges, viewportState), [nodes, edges, viewportState]);

  useEffect(() => {
    signatureRef.current = persistableSignature;
  }, [persistableSignature]);

  useEffect(() => {
    const frame = window.requestAnimationFrame(() => {
      const storedLeft = Number(window.localStorage.getItem("inspoatlas:left-rail-width"));
      const storedRight = Number(window.localStorage.getItem("inspoatlas:right-rail-width"));
      const storedLeftCollapsed = window.localStorage.getItem("inspoatlas:left-rail-collapsed");
      const storedRightCollapsed = window.localStorage.getItem("inspoatlas:right-rail-collapsed");
      const nextLeftWidth = Number.isFinite(storedLeft) && storedLeft > 0 ? clamp(storedLeft, 204, 360) : 242;
      const nextRightWidth = Number.isFinite(storedRight) && storedRight > 0 ? clamp(storedRight, 280, 460) : 322;
      let nextLeftCollapsed = storedLeftCollapsed === null ? window.innerWidth <= 1100 : storedLeftCollapsed === "1";
      let nextRightCollapsed = storedRightCollapsed === "1";
      if (window.innerWidth > 700 && window.innerWidth - (nextLeftCollapsed ? 68 : nextLeftWidth) - (nextRightCollapsed ? 68 : nextRightWidth) < 280) nextLeftCollapsed = true;
      if (window.innerWidth > 700 && window.innerWidth - (nextLeftCollapsed ? 68 : nextLeftWidth) - (nextRightCollapsed ? 68 : nextRightWidth) < 280) nextRightCollapsed = true;
      setLeftRailWidth(nextLeftWidth);
      setRightRailWidth(nextRightWidth);
      setLeftRailCollapsed(nextLeftCollapsed);
      setRightRailCollapsed(nextRightCollapsed);
    });
    return () => window.cancelAnimationFrame(frame);
  }, []);

  useEffect(() => {
    const keepCanvasUsable = () => {
      if (window.innerWidth <= 700) return;
      if (window.innerWidth - (leftRailCollapsed ? 68 : leftRailWidth) - (rightRailCollapsed ? 68 : rightRailWidth) >= 280) return;
      if (!leftRailCollapsed) setLeftRailCollapsed(true);
      else if (!rightRailCollapsed) setRightRailCollapsed(true);
    };
    window.addEventListener("resize", keepCanvasUsable);
    return () => window.removeEventListener("resize", keepCanvasUsable);
  }, [leftRailCollapsed, rightRailCollapsed, leftRailWidth, rightRailWidth]);

  useEffect(() => {
    if (window.localStorage.getItem("inspoatlas:theme") === "dark") setTheme("dark");
    setThemeHydrated(true);
  }, []);

  useEffect(() => {
    if (!themeHydrated) return;
    document.documentElement.classList.toggle("theme-light-root", theme === "light");
    window.localStorage.setItem("inspoatlas:theme", theme);
  }, [theme, themeHydrated]);

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
        body: JSON.stringify({ title: "我的第一个作品" }),
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
      window.setTimeout(() => recovered.nodes.length && fitView({
        padding: recovered.nodes.some((node) => node.data.kind === "image") ? imageFriendlyFitPadding : 0.18,
        duration: 300,
      }), 30);

      void fetch("/api/analyses?boardId=" + encodeURIComponent(boardId), { cache: "no-store" })
        .then(async (analysisResponse) => analysisResponse.ok ? analysisResponse.json() : { analyses: [] })
        .then((payload: { analyses?: Array<Record<string, unknown>> }) => {
          if (!active || !payload.analyses?.length) return;
          setNodes((current) => {
            const updated = current.map((node) => {
              const assetId = String(node.data.assetId || node.id);
              const analysis = payload.analyses?.find((item) => item.assetId === assetId);
              return analysis ? mergeAnalysis(node, analysis) : node;
            });
            const additions = payload.analyses!.flatMap((analysis) => {
              const assetId = String(analysis.assetId || "");
              const id = "analysis-card-" + assetId;
              if (!assetId || updated.some((node) => node.id === id)) return [];
              const source = updated.find((node) => String(node.data.assetId || "") === assetId);
              if (!source) return [];
              const absolute = absoluteNodePosition(updated, source);
              const card = mergeAnalysis({
                id,
                type: "inspo",
                position: { x: absolute.x + nodeWidth(source) + 104, y: absolute.y },
                data: { kind: "analysis", workflowStage: "analysis", title: `拆解 · ${source.data.title}`, sourceAssetId: assetId, sourceTitle: source.data.title, tags: ["拆解结果"] },
                style: defaultSize.analysis,
                zIndex: 10,
              }, analysis);
              return [{ ...card, data: { ...card.data, body: card.data.analysisSummary } }];
            });
            return [...updated, ...additions];
          });
          setEdges((current) => {
            const additions = payload.analyses!.flatMap((analysis) => {
              const assetId = String(analysis.assetId || "");
              const sourceId = assetId;
              const targetId = "analysis-card-" + assetId;
              if (!sourceId || current.some((edge) => edge.source === sourceId && edge.target === targetId)) return [];
              const id = "analysis-link-" + assetId;
              const relation: Relation = { id, sourceId, targetId, type: "analysis-of", layer: "provenance", status: "confirmed", origin: "system", explanation: "拆解为" };
              return [{ id, source: sourceId, target: targetId, type: "relation", label: relation.explanation, data: relation, style: { stroke: "#62569a", strokeWidth: 2 } } as Edge];
            });
            return [...current, ...additions];
          });
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
      if (detail.action === "edit-image") {
        const node = nodes.find((item) => item.id === detail.id);
        if (node) openImageEditor(node);
      }
      if (detail.action === "feedback-analysis-helpful") void submitAnalysisFeedback(detail.id, "helpful");
      if (detail.action === "feedback-analysis-needs-work") void submitAnalysisFeedback(detail.id, "needs-work", "inaccurate");
      if (detail.action === "toggle-analysis") toggleAnalysis(detail.id);
      if (detail.action === "show-details") {
        setSelectedIds([detail.id]);
        setRightTab("asset");
      }
      if (detail.action === "focus-contract") {
        const node = nodes.find((item) => item.id === detail.id);
        if (node?.data.contract) setContract(node.data.contract);
        setSelectedIds([detail.id]);
        setRightTab("baseline");
        setInspectorOpen(true);
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
      if ((event.key === "Delete" || event.key === "Backspace") && selectedIds.length) {
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
        setNextStepMenu(null);
        setWorkflowOverlay(null);
        setSearchExpanded(false);
        setAssistantOpen(false);
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

  function onConnect(value: Connection) {
    if (!value.source || !value.target || value.source === value.target) return;
    connectionCompletedRef.current = true;
    setNextStepMenu(null);
    if (edges.some((edge) => edge.source === value.source && edge.target === value.target)) return notify("这两张卡片已经连接");
    remember();
    const relation: Relation = {
      id: crypto.randomUUID(),
      sourceId: value.source,
      targetId: value.target,
      type: "complements",
      layer: "association",
      status: "confirmed",
      origin: "human",
      explanation: "关联",
    };
    setEdges((current) => addEdge({
      ...value,
      id: relation.id,
      type: "relation",
      label: "关联",
      data: relation,
      zIndex: 0,
      style: { stroke: "#8f7da4", strokeWidth: 2 },
    }, current));
    notify("已连接");
  }

  function nextStepAt(clientX: number, clientY: number): NextStepAction | null {
    const buttons = nextStepMenuRef.current?.querySelectorAll<HTMLButtonElement>("[data-next-step-action]");
    if (!buttons) return null;
    for (const button of buttons) {
      const rect = button.getBoundingClientRect();
      if (clientX >= rect.left && clientX <= rect.right && clientY >= rect.top && clientY <= rect.bottom) {
        return button.dataset.nextStepAction as NextStepAction;
      }
    }
    return null;
  }

  function startConnection(event: MouseEvent | TouchEvent, nodeId: string | null, handleType: string | null) {
    connectionSourceRef.current = handleType === "source" ? nodeId : null;
    connectionCompletedRef.current = false;
    setHoveredNextStep(null);
    const source = nodes.find((node) => node.id === connectionSourceRef.current);
    const rect = canvasAreaRef.current?.getBoundingClientRect();
    if (!source || !rect || source.data.workflowStage === "contract") {
      setConnecting(false);
      setNextStepMenu(null);
      return;
    }
    const point = "touches" in event ? event.touches[0] : event;
    const count = nextStepOptions(source).length;
    const menuWidth = Math.min(296, Math.max(0, rect.width - 24));
    const menuHeight = Math.min(rect.height - 24, 44 + count * 62);
    const pointerX = (point?.clientX ?? rect.left + rect.width / 2) - rect.left;
    const pointerY = (point?.clientY ?? rect.top + rect.height / 2) - rect.top;
    const preferredX = pointerX + 76 + menuWidth <= rect.width - 12 ? pointerX + 76 : pointerX - menuWidth - 36;
    const safeTop = rect.height - menuHeight > 84 ? 72 : 12;
    setNextStepMenu({
      sourceId: source.id,
      x: clamp(preferredX, 12, Math.max(12, rect.width - menuWidth - 12)),
      y: clamp(pointerY - 46, safeTop, Math.max(safeTop, rect.height - menuHeight - 12)),
    });
    setConnecting(true);
  }

  function finishConnection(event: MouseEvent | TouchEvent) {
    const sourceId = connectionSourceRef.current;
    const completed = connectionCompletedRef.current;
    const point = "changedTouches" in event ? event.changedTouches[0] : event;
    const action = point ? nextStepAt(point.clientX, point.clientY) : null;
    setConnecting(false);
    setHoveredNextStep(null);
    connectionSourceRef.current = null;
    window.setTimeout(() => { connectionCompletedRef.current = false; }, 0);
    if (!sourceId || completed) { setNextStepMenu(null); return; }
    if (action) runNextStep(action, sourceId);
  }

  function focusConnectedNodes(sourceId: string, targetId: string) {
    window.setTimeout(() => { void fitView({ nodes: [{ id: sourceId }, { id: targetId }], padding: 0.2, duration: 320 }); }, 90);
  }

  function runNextStep(action: NextStepAction, sourceId = nextStepMenu?.sourceId) {
    const node = nodes.find((item) => item.id === sourceId);
    setNextStepMenu(null);
    if (!node) return;
    if (action === "analyze") return void analyze(node.id);
    if (action === "redesign" && node.data.kind === "image" && node.data.assetId && node.data.imageUrl) {
      setRedesignPrompt("");
      setRedesignError("");
      setRedesignImage({ assetId: String(node.data.assetId), sourceUrl: String(node.data.imageUrl), title: node.data.title });
      return;
    }
    if (action === "edit" && node.data.kind === "image" && node.data.assetId && node.data.imageUrl) {
      return openImageEditor(node);
    }
    if (action === "note") {
      const id = "note-" + crypto.randomUUID();
      const position = absoluteNodePosition(nodes, node);
      const relationId = "note-link-" + id;
      remember();
      setNodes((current) => [...current, {
        id, type: "inspo", position: { x: position.x + nodeWidth(node) + 88, y: position.y },
        data: { kind: "text", title: "关联备注", body: "单击这里写下想法", note: true },
        style: defaultSize.text, zIndex: 10,
      }]);
      setEdges((current) => addEdge({ id: relationId, source: node.id, target: id, type: "relation", label: "灵感备注",
        data: { id: relationId, sourceId: node.id, targetId: id, type: "complements", layer: "association", status: "confirmed", origin: "human", explanation: "灵感备注" } satisfies Relation,
        style: { stroke: "#8f7da4", strokeWidth: 2 },
      }, current));
      setSelectedIds([id]);
      focusConnectedNodes(node.id, id);
      notify("已创建关联备注，单击正文即可编辑");
      return;
    }
    if (action === "contract") {
      const selectedAnalysisIds = nodes
        .filter((item) => selectedIds.includes(item.id) && item.data.workflowStage === "analysis" && item.data.status === "ready")
        .map((item) => item.id);
      const ids = selectedAnalysisIds.includes(node.id) ? selectedAnalysisIds : [node.id];
      return openContractSetup(ids);
    }
  }
  const onSelectionChange = useCallback(({ nodes: selection }: { nodes: CanvasNode[] }) => {
    const next = selection.map((node) => node.id);
    setSelectedIds((current) => (
      current.length === next.length && next.every((id) => current.includes(id))
        ? current
        : next
    ));
    if (next.length) {
      setRightTab("asset");
      setEditingImage((current) => current && !next.includes(current.nodeId) ? null : current);
      setWorkflowOverlay((current) => current === "purpose" || current === "contract" ? null : current);
    }
  }, []);
  const onNodeClick = useCallback(() => { setRightTab("asset"); setEditingImage(null); setInspectorOpen(true); }, []);
  const onNodeContextMenu = useCallback((event: ReactMouseEvent, node: CanvasNode) => {
    event.preventDefault();
    setRightTab("asset");
    setSelectedIds((current) => current.length === 1 && current[0] === node.id ? current : [node.id]);
    setContextMenu({ kind: "node", id: node.id, x: event.clientX, y: event.clientY });
  }, []);
  const onPaneClick = useCallback(() => { setContextMenu(null); setNextStepMenu(null); setSearchExpanded(false); }, []);
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

  async function createBoard(sourceBoardId?: string, title?: string) {
    const response = await fetch("/api/boards", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ title: sourceBoardId ? boardTitle + " 副本" : title?.trim() || "未命名作品", sourceBoardId }),
    });
    if (!response.ok) return notify("新建作品失败");
    const { board } = await response.json();
    setBoards((current) => [board, ...current]);
    setBoardId(board.id);
    setModal(null);
    setNewWorkTitle("");
    notify(sourceBoardId ? "作品已复制" : "新作品已创建");
  }

  function startBoardRename(id: string, title: string, surface: "header" | "sidebar" = "sidebar") {
    const nextSurface = surface === "sidebar" && (leftRailCollapsed || window.innerWidth <= 700) ? "popover" : surface;
    if (nextSurface === "popover") {
      const item = Array.from(document.querySelectorAll<HTMLElement>(".left-rail .nav-item")).find((element) => element.dataset.boardId === id);
      setBoardRenameTop(clamp(item?.getBoundingClientRect().top ?? 120, 68, window.innerHeight - 152));
    }
    setEditingBoardId(id);
    setEditingBoardSurface(nextSurface);
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

  async function addAsset(value: string, options?: { title?: string; body?: string }) {
    const isUrl = /^https?:\/\//i.test(value);
    const response = await fetch("/api/assets", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        boardId,
        kind: isUrl ? "web" : "text",
        title: options?.title || (isUrl ? new URL(value).hostname : "新便签"),
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
        body: options?.body || value,
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

  function addDerivativeLayer(derivative: { id: string; sourceAssetId: string; title: string; operation: string; contentUrl: string; metadata?: Record<string, unknown> }) {
    const source = nodes.find((node) => String(node.data.assetId || "") === derivative.sourceAssetId);
    if (!source) return notify("图层已保存；原始素材不在当前画布。");
    const id = `element-${derivative.id}`;
    const sourcePosition = absoluteNodePosition(nodes, source);
    remember();
    setNodes((current) => [...current, {
      id, type: "inspo", position: { x: sourcePosition.x + nodeWidth(source) + 56, y: sourcePosition.y + 28 },
      data: { kind: "element", title: derivative.title, derivativeId: derivative.id, sourceAssetId: derivative.sourceAssetId, sourceTitle: source.data.title, imageUrl: derivative.contentUrl, body: derivative.operation === "ai-edit" ? "AI 改造版本" : derivative.operation === "mask" ? "可编辑图层" : "编辑副本", tags: [derivative.operation === "ai-edit" ? "AI 改造" : "图层"] },
      style: defaultSize.element, zIndex: 11,
    }]);
    setEdges((current) => [...current, {
      id: `element-of-${derivative.id}`, source: source.id, target: id, type: "relation", label: "来自素材", data: { id: `element-of-${derivative.id}`, sourceId: source.id, targetId: id, type: "element-of", layer: "provenance", status: "confirmed", origin: "human", explanation: "来自素材" }, style: { stroke: "#879b80", strokeWidth: 2 }, zIndex: 0,
    }]);
    focusConnectedNodes(source.id, id);
    setSelectedIds([id]); setEditingImage(null); setRedesignImage(null); notify(derivative.operation === "ai-edit" ? "改造图片已加入画布" : "图层已保存到画布");
  }

  async function submitImageRedesign() {
    if (!redesignImage || redesignBusy) return;
    const prompt = redesignPrompt.trim();
    if (prompt.length < 5) { setRedesignError("请至少描述 5 个字的改造方向"); return; }
    setRedesignBusy(true);
    setRedesignError("");
    try {
      const response = await fetch(`/api/assets/${encodeURIComponent(redesignImage.assetId)}/redesign`, {
        method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ prompt }),
      });
      const payload = await response.json().catch(() => ({}));
      if (!response.ok || !payload.derivative) throw new Error(String(payload.error || "AI 改造失败，请稍后重试"));
      addDerivativeLayer(payload.derivative);
    } catch (error) {
      setRedesignError(error instanceof Error ? error.message : "AI 改造失败，请稍后重试");
    } finally {
      setRedesignBusy(false);
    }
  }

  function createNote(initial?: { title?: string; body?: string }) {
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
        title: initial?.title || "备注",
        body: initial?.body || "单击这里写下备注",
        note: true,
      },
      style: defaultSize.text,
      zIndex: 10,
    };
    remember();
    setNodes((current) => [...current, note]);
    setSelectedIds([id]);
    setRightTab("asset");
    notify(initial ? "已放到画布，可继续修改" : "已添加备注，单击正文即可编辑");
  }

  function placeDirectionOnCanvas(message: AssistantMessage) {
    createNote({ title: "方向建议", body: message.content });
  }

  function toggleRailCollapsed(side: "left" | "right") {
    if (side === "left") {
      const next = !leftRailCollapsed;
      if (!next && window.innerWidth - leftRailWidth - (rightRailCollapsed ? 68 : rightRailWidth) < 280) {
        setRightRailCollapsed(true);
        window.localStorage.setItem("inspoatlas:right-rail-collapsed", "1");
      }
      setLeftRailCollapsed(next);
      window.localStorage.setItem("inspoatlas:left-rail-collapsed", next ? "1" : "0");
    } else {
      const next = !rightRailCollapsed;
      if (!next && window.innerWidth - rightRailWidth - (leftRailCollapsed ? 68 : leftRailWidth) < 280) {
        setLeftRailCollapsed(true);
        window.localStorage.setItem("inspoatlas:left-rail-collapsed", "1");
      }
      setRightRailCollapsed(next);
      if (next) setAssistantOpen(false);
      window.localStorage.setItem("inspoatlas:right-rail-collapsed", next ? "1" : "0");
    }
  }

  function startRailResize(side: "left" | "right", event: ReactPointerEvent<HTMLDivElement>) {
    if (window.innerWidth <= 700 || event.button !== 0) return;
    event.preventDefault();
    event.stopPropagation();
    const pointerId = event.pointerId;
    const startX = event.clientX;
    const startCollapsed = side === "left" ? leftRailCollapsed : rightRailCollapsed;
    const expandedWidth = side === "left" ? leftRailWidth : rightRailWidth;
    const startWidth = startCollapsed ? railCompactWidth : expandedWidth;
    let latestWidth = startWidth;
    const previousCursor = document.body.style.cursor;
    const previousUserSelect = document.body.style.userSelect;
    setResizingRail(side);
    document.body.style.cursor = "col-resize";
    document.body.style.userSelect = "none";

    const onMove = (moveEvent: PointerEvent) => {
      if (moveEvent.pointerId !== pointerId) return;
      const delta = moveEvent.clientX - startX;
      const otherWidth = side === "left" ? rightRailWidth : leftRailWidth;
      const availableMaximum = Math.max(railCompactWidth, window.innerWidth - (side === "left" ? (rightRailCollapsed ? railCompactWidth : otherWidth) : (leftRailCollapsed ? railCompactWidth : otherWidth)) - 280);
      latestWidth = clamp(startWidth + (side === "left" ? delta : -delta), railCompactWidth, Math.min(railMaximumWidth[side], availableMaximum));
      if (side === "left") {
        setLeftRailCollapsed(false);
        setLeftRailWidth(latestWidth);
      } else {
        setRightRailCollapsed(false);
        setRightRailWidth(latestWidth);
      }
    };
    const finish = (cancelled: boolean) => {
      const collapse = cancelled ? startCollapsed : latestWidth < railExpandedMinimum[side];
      const width = cancelled || collapse ? expandedWidth : latestWidth;
      if (side === "left") {
        setLeftRailCollapsed(collapse);
        setLeftRailWidth(width);
      } else {
        setRightRailCollapsed(collapse);
        if (collapse) setAssistantOpen(false);
        setRightRailWidth(width);
      }
      if (!cancelled) {
        window.localStorage.setItem(`inspoatlas:${side}-rail-collapsed`, collapse ? "1" : "0");
        window.localStorage.setItem(`inspoatlas:${side}-rail-width`, String(Math.round(width)));
      }
      setResizingRail(null);
      document.body.style.cursor = previousCursor;
      document.body.style.userSelect = previousUserSelect;
      window.removeEventListener("pointermove", onMove);
      window.removeEventListener("pointerup", onUp);
      window.removeEventListener("pointercancel", onCancel);
    };
    const onUp = (upEvent: PointerEvent) => { if (upEvent.pointerId === pointerId) finish(false); };
    const onCancel = (cancelEvent: PointerEvent) => { if (cancelEvent.pointerId === pointerId) finish(true); };
    window.addEventListener("pointermove", onMove);
    window.addEventListener("pointerup", onUp);
    window.addEventListener("pointercancel", onCancel);
  }

  function resetRailWidth(side: "left" | "right") {
    const width = railDefaultWidth[side];
    if (side === "left") { setLeftRailWidth(width); setLeftRailCollapsed(false); }
    else { setRightRailWidth(width); setRightRailCollapsed(false); }
    window.localStorage.setItem(`inspoatlas:${side}-rail-width`, String(width));
    window.localStorage.setItem(`inspoatlas:${side}-rail-collapsed`, "0");
  }

  async function addMedia(input: File[] | FileList, asFolder = false) {
    if (uploadPending.current) return;
    const allFiles = Array.from(input);
    const files = allFiles.filter((file) => supportedLocalMedia(file));
    if (!files.length) return notify("没有找到可导入的图片、视频或音频文件");

    uploadPending.current = true;
    setModal("import");
    setUploadState({ total: files.length, completed: 0, name: files[0].name });

    const uploaded: Array<{ asset: { id: string; title: string; kind: "image" | "video" | "audio"; contentUrl?: string }; size: { width: number; height: number } }> = [];
    let failed = allFiles.length - files.length;
    try {
      for (const [index, file] of files.entries()) {
        setUploadState({ total: files.length, completed: index, name: file.name });
        try {
          const staged = await uploadPrivateFile(file, { scope: "asset", boardId, contentType: file.type, size: file.size });
          let response: Response;
          if (staged) {
            response = await fetch("/api/assets", {
              method: "POST",
              headers: { "content-type": "application/json" },
              body: JSON.stringify({ uploadedAsset: true, ...staged, boardId, title: file.name, contentType: file.type, size: file.size }),
            });
          } else {
            const form = new FormData();
            form.set("boardId", boardId);
            form.set("file", file);
            if (file.webkitRelativePath) form.set("relativePath", file.webkitRelativePath);
            response = await fetch("/api/assets", { method: "POST", body: form });
          }
          if (!response.ok) throw new Error("素材上传失败");
          const result = await response.json() as { asset: { id: string; title: string; kind: "image" | "video" | "audio"; contentUrl?: string } };
          const size = result.asset.kind === "image"
            ? await importedImageSize(file).catch(() => defaultSize.image)
            : defaultSize[result.asset.kind];
          uploaded.push({ asset: result.asset, size });
        } catch {
          failed += 1;
        }
        setUploadState({ total: files.length, completed: index + 1, name: file.name });
      }
      if (!uploaded.length) { notify("素材上传失败，请检查文件或网络后重试"); return; }

    remember();
    const rootFolder = asFolder
      ? files[0]?.webkitRelativePath.split("/").filter(Boolean)[0] || "导入的文件夹"
      : "";
    const groupId = rootFolder ? crypto.randomUUID() : "";
    setNodes((current) => {
      if (!groupId) {
        const cards = uploaded.map(({ asset, size }, index): CanvasNode => ({
          id: asset.id,
          type: "inspo",
          position: { x: 100 + (current.length + index) * 18, y: 120 + (current.length + index) * 14 },
          data: {
            kind: asset.kind,
            title: asset.title,
            assetId: asset.id,
            imageUrl: asset.contentUrl || "/api/assets/" + asset.id + "/content",
            tags: [asset.kind === "image" ? "待拆解" : asset.kind === "video" ? "视频素材" : "音频素材"],
          },
          style: size,
          zIndex: 10,
        }));
        return [...current, ...cards];
      }

      const cellWidth = Math.max(320, ...uploaded.map(({ size }) => size.width));
      const cellHeight = Math.max(340, ...uploaded.map(({ size }) => size.height));
      const maxRows = Math.max(1, Math.floor((2400 - 118 + 24) / (cellHeight + 24)));
      const maxColumns = Math.max(1, Math.floor((2400 - 48 + 24) / (cellWidth + 24)));
      const columns = Math.min(maxColumns, Math.max(Math.min(3, uploaded.length), Math.ceil(uploaded.length / maxRows)));
      const rows = Math.ceil(uploaded.length / columns);
      const groupWidth = 48 + columns * cellWidth + (columns - 1) * 24;
      const groupHeight = 90 + rows * cellHeight + Math.max(0, rows - 1) * 24 + 28;
      const group: CanvasNode = {
        id: groupId,
        type: "inspo",
        position: { x: 96 + current.length * 12, y: 112 + current.length * 10 },
        data: { kind: "group", title: rootFolder, body: `从“${rootFolder}”文件夹导入 · 单击修改说明` },
        style: { width: groupWidth, height: groupHeight },
        zIndex: 0,
      };
      const cards = uploaded.map(({ asset, size }, index): CanvasNode => ({
        id: asset.id,
        type: "inspo",
        parentId: groupId,
        extent: "parent",
        position: { x: 24 + (index % columns) * (cellWidth + 24), y: 70 + Math.floor(index / columns) * (cellHeight + 24) },
        data: {
          kind: asset.kind,
          title: asset.title,
          assetId: asset.id,
          imageUrl: asset.contentUrl || "/api/assets/" + asset.id + "/content",
          tags: [asset.kind === "image" ? "待拆解" : asset.kind === "video" ? "视频素材" : "音频素材"],
        },
        style: size,
        zIndex: 10,
      }));
      return [...current, group, ...cards];
    });
    setSelectedIds(uploaded.map(({ asset }) => asset.id));
    if (uploaded.some(({ asset }) => asset.kind === "image")) {
      window.setTimeout(() => {
        void fitView({
          nodes: (groupId ? [groupId] : uploaded.map(({ asset }) => asset.id)).map((id) => ({ id })),
          padding: imageFriendlyFitPadding,
          maxZoom: 1,
          duration: 360,
        });
      }, 120);
    }
    setModal(null);
    notify(`已加入 ${uploaded.length} 个素材${rootFolder ? `，并建立“${rootFolder}”分组` : ""}${failed ? `，${failed} 个文件未导入` : ""}`);
    } finally {
      uploadPending.current = false;
      setUploadState(null);
    }
  }


  async function analyze(nodeId?: string, captureHistory = true) {
    const source = nodes.find((node) => node.id === (nodeId || selectedIds[0]));
    if (!source || !isAnalyzableNode(source)) return notify("请选择一张原始素材");
    const assetId = source.data.assetId || source.id;
    const analysisCardId = "analysis-card-" + assetId;
    if (captureHistory) remember();
    setNodes((current) => {
      const liveSource = current.find((item) => item.id === source.id) ?? source;
      const absolute = absoluteNodePosition(current, liveSource);
      const updated = current.map((item) => ({
        ...item,
        data: {
          ...item.data,
          analysisExpanded: false,
          ...(item.id === source.id ? { status: "processing", analysisError: undefined } : {}),
          ...(item.id === analysisCardId ? { status: "processing", analysisError: undefined } : {}),
        },
      }));
      if (updated.some((item) => item.id === analysisCardId)) return updated;
      return [...updated, {
        id: analysisCardId,
        type: "inspo",
        position: { x: absolute.x + nodeWidth(liveSource) + 104, y: absolute.y },
        data: {
          kind: "analysis",
          workflowStage: "analysis",
          title: `拆解 · ${source.data.title}`,
          sourceAssetId: String(assetId),
          sourceTitle: source.data.title,
          status: "processing",
          tags: ["拆解结果"],
        },
        style: defaultSize.analysis,
        zIndex: 10,
      }];
    });
    focusConnectedNodes(source.id, analysisCardId);
    setEdges((current) => current.some((edge) => edge.source === source.id && edge.target === analysisCardId) ? current : addEdge({
      id: "analysis-link-" + assetId,
      source: source.id,
      target: analysisCardId,
      type: "relation",
      label: "拆解为",
      data: { id: "analysis-link-" + assetId, sourceId: source.id, targetId: analysisCardId, type: "analysis-of", layer: "provenance", status: "confirmed", origin: "system", explanation: "拆解为" } satisfies Relation,
      style: { stroke: "#62569a", strokeWidth: 2 },
    }, current));
    const response = await fetch("/api/analyses", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ assetId, mode: "replace" }),
    });
    const payload = await response.json().catch(() => ({}));
    if (!response.ok) {
      setNodes((current) => current.map((item) => item.id === source.id || item.id === analysisCardId ? {
        ...item,
        data: { ...item.data, status: item.data.analysisSummary ? "ready" : "failed", analysisError: friendlyAnalysisError(payload.error) },
      } : item));
      return notify(friendlyAnalysisError(payload.error));
    }
    const result = payload.analysis.result as AnalysisResult;
    setNodes((current) => current.map((item) => item.id === source.id || item.id === analysisCardId ? {
      ...item,
      data: {
        ...item.data,
        analysisId: payload.analysis.id,
        analysisSummary: result.summary,
        body: item.id === analysisCardId ? result.summary : item.data.body,
        analysisExpanded: false,
        analysisError: undefined,
        status: "ready",
        principles: result.principles,
        colors: result.palette.map((color) => color.hex),
        tags: item.id === analysisCardId ? ["拆解结果", ...result.tags.slice(0, 5).map((tag) => tag.value)] : result.tags.slice(0, 8).map((tag) => tag.value),
        regions: result.components,
        analysisProvider: payload.analysis.provider,
        analysisModel: payload.analysis.model,
        analysisPromptVersion: payload.analysis.promptVersion ?? result.promptVersion,
        analysisRunMode: payload.analysis.runMode ?? result.runMode,
        analysisFeedback: undefined,
      },
    } : item));
    setSelectedIds([analysisCardId]);
    notify("参考拆解完成");
  }

  async function analyzeSelected() {
    const ids = selectedNodes.filter(isAnalyzableNode).map((node) => node.id);
    if (!ids.length) return notify("所选内容中没有可分析的原始素材");
    remember();
    for (const id of ids) await analyze(id, false);
  }

  function toggleVoiceInput() {
    if (speechRecognitionRef.current) {
      speechRecognitionRef.current.stop();
      return;
    }
    const speechWindow = window as SpeechWindow;
    const SpeechRecognition = speechWindow.SpeechRecognition ?? speechWindow.webkitSpeechRecognition;
    if (!SpeechRecognition) return notify("当前浏览器暂不支持语音输入，请使用文字提问");
    const recognition = new SpeechRecognition();
    const existingQuestion = assistantQuestion.trim();
    recognition.lang = "zh-CN";
    recognition.interimResults = true;
    recognition.continuous = false;
    recognition.onresult = (event) => {
      const transcript = Array.from(event.results).map((result) => result[0]?.transcript ?? "").join("").trim();
      if (!transcript) return;
      setAssistantHasInteracted(true);
      setAssistantQuestion([existingQuestion, transcript].filter(Boolean).join(" "));
    };
    recognition.onerror = (event) => {
      if (event.error !== "aborted" && event.error !== "no-speech") notify("没有听清楚，请重试或改用文字输入");
    };
    recognition.onend = () => {
      speechRecognitionRef.current = null;
      setVoiceListening(false);
    };
    speechRecognitionRef.current = recognition;
    try {
      recognition.start();
      setVoiceListening(true);
    } catch {
      speechRecognitionRef.current = null;
      setVoiceListening(false);
      notify("语音输入未能启动，请使用文字提问");
    }
  }

  function startNewAssistantConversation() {
    if (!boardId || assistantBusy || assistantHistoryLoading) return;
    setAssistantConversationId(null);
    setAssistantConversationVersion(0);
    setAssistantMessages([]);
    setAssistantQuestion("");
    setAssistantHasInteracted(false);
    setCompletedAnswerId(null);
    setAssistantHistoryOpen(false);
    setAssistantHistoryError("");
    window.localStorage.setItem(`inspoatlas:assistant-conversation:${boardId}`, "");
  }

  async function openAssistantConversation(conversationId: string) {
    if (!boardId || assistantBusy || assistantHistoryLoading) return;
    if (conversationId === assistantConversationId) { setAssistantHistoryOpen(false); return; }
    const targetBoardId = boardId;
    setAssistantHistoryLoading(true);
    setAssistantHistoryError("");
    try {
      const response = await fetch(conversationUrl(targetBoardId, conversationId), { cache: "no-store" });
      const payload = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(String(payload.error || "对话暂时无法读取"));
      if (assistantBoardRef.current !== targetBoardId) return;
      const messages: AssistantMessage[] = Array.isArray(payload.conversation?.messages) ? payload.conversation.messages : [];
      setAssistantConversationId(conversationId);
      setAssistantConversationVersion(Number(payload.conversation.version) || 1);
      setAssistantMessages(messages);
      setAssistantQuestion("");
      setAssistantHasInteracted(messages.length > 0);
      setCompletedAnswerId([...messages].reverse().find((item) => item.role === "assistant")?.id ?? null);
      setAssistantHistoryOpen(false);
      window.localStorage.setItem(`inspoatlas:assistant-conversation:${targetBoardId}`, conversationId);
    } catch (error) {
      if (assistantBoardRef.current === targetBoardId) setAssistantHistoryError(error instanceof Error ? error.message : "对话暂时无法读取");
    } finally {
      if (assistantBoardRef.current === targetBoardId) setAssistantHistoryLoading(false);
    }
  }

  async function deleteAssistantConversation(conversationId: string) {
    if (!boardId || assistantBusy || assistantHistoryLoading) return;
    if (assistantDeleteId !== conversationId) { setAssistantDeleteId(conversationId); return; }
    setAssistantHistoryLoading(true);
    try {
      const response = await fetch(conversationUrl(boardId, conversationId), { method: "DELETE" });
      if (!response.ok) {
        const payload = await response.json().catch(() => ({}));
        throw new Error(String(payload.error || "删除对话失败"));
      }
      setAssistantConversations((current) => current.filter((item) => item.id !== conversationId));
      if (assistantConversationId === conversationId) {
        setAssistantConversationId(null);
        setAssistantConversationVersion(0);
        setAssistantMessages([]);
        setAssistantQuestion("");
        setCompletedAnswerId(null);
        setAssistantHasInteracted(false);
        window.localStorage.setItem(`inspoatlas:assistant-conversation:${boardId}`, "");
      }
      notify("已删除这段对话");
    } catch (error) {
      setAssistantHistoryError(error instanceof Error ? error.message : "删除对话失败");
    } finally {
      setAssistantDeleteId(null);
      setAssistantHistoryLoading(false);
    }
  }

  async function saveAssistantMemory() {
    if (assistantMemoryBusy) return;
    setAssistantMemoryBusy(true);
    try {
      const response = await fetch("/api/assistant-memory", { method: "PUT", headers: { "content-type": "application/json" }, body: JSON.stringify(assistantMemory) });
      const payload = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(String(payload.error || "记忆保存失败"));
      setAssistantMemory({ ...emptyAssistantMemory, ...payload.memory });
      setAssistantMemoryOpen(false);
      notify("小in 已记住这些偏好");
    } catch (error) { notify(error instanceof Error ? error.message : "记忆保存失败"); }
    finally { setAssistantMemoryBusy(false); }
  }

  function applyAssistantActions(actions: AssistantAction[], originalQuestion: string, selectedAtRequest: string[]) {
    for (const action of actions) {
      if (action.type === "add_note" && /(?:添加|新增|创建|写|放|记录).{0,8}(?:备注|便签|卡片)|(?:备注|便签).{0,8}(?:添加|新增|创建|写|放|记录)/.test(originalQuestion)) {
        createNote({ title: action.title, body: action.body });
      } else if (action.type === "rename_selected" && selectedAtRequest.length === 1 && action.nodeId === selectedAtRequest[0] && nodes.some((node) => node.id === action.nodeId) && /(?:改名|重命名|命名|名称|标题|叫做)/.test(originalQuestion)) {
        renameNode(action.nodeId, action.title);
        notify("已为卡片改名，可撤销");
      } else if (action.type === "analyze_selected" && selectedAtRequest.length === 1 && action.nodeId === selectedAtRequest[0] && nodes.some((node) => node.id === action.nodeId && isAnalyzableNode(node)) && /(?:拆解|分析|识别|提取)/.test(originalQuestion)) {
        void analyze(action.nodeId);
      }
    }
  }

  async function askDesignAssistant(requestedQuestion?: string) {
    const question = (requestedQuestion ?? assistantQuestion).trim();
    if (!question) return notify("请输入你想讨论的问题");
    if (!boardId || assistantRequestPendingRef.current || assistantHistoryLoading) return;
    assistantRequestPendingRef.current = true;
    speechRecognitionRef.current?.stop();
    const scope: AssistantScope = selectedIds.length ? "selection" : "board";
    const selectedAtRequest = [...selectedIds];
    const previousMessages = assistantMessages;
    const userMessage: AssistantMessage = { id: crypto.randomUUID(), role: "user", content: question };
    const nextMessages: AssistantMessage[] = [...previousMessages, userMessage];
    setAssistantMessages(nextMessages);
    setAssistantQuestion("");
    setAssistantHasInteracted(true);
    setCompletedAnswerId(null);
    setAssistantBusy(true);
    const assistantController = new AbortController();
    const assistantReplyPromise = fetch(`/api/boards/${encodeURIComponent(boardId)}/design-assistant`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      signal: assistantController.signal,
      body: JSON.stringify({
        question,
        scope,
        selectedNodeIds: scope === "selection" ? selectedAtRequest : [],
        earlierContext: previousMessages.length > 20
          ? previousMessages.slice(2, -18).filter((message) => message.role === "user").map((message) => message.content.replace(/\s+/g, " ").slice(0, 120)).join("；").slice(-2400)
          : "",
        history: previousMessages.length > 20
          ? [...previousMessages.slice(0, 2), ...previousMessages.slice(-18)].map((message) => ({ role: message.role, content: message.content.slice(0, 1000) }))
          : previousMessages.map((message) => ({ role: message.role, content: message.content.slice(0, 1000) })),
      }),
    }).then(async (response) => ({ response, payload: await response.json().catch(() => ({})) }))
      .catch((error: unknown) => ({ error }));
    try {
      let conversationId = assistantConversationId;
      let version = assistantConversationVersion;
      try {
        const response = await fetch(conversationUrl(boardId, conversationId ?? undefined), {
          method: conversationId ? "PUT" : "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify(conversationId ? { version, messages: nextMessages } : { message: userMessage }),
        });
        const payload = await response.json().catch(() => ({}));
        if (!response.ok) throw new Error(String(payload.error || "对话保存失败"));
        conversationId = String(payload.conversation.id);
        version = Number(payload.conversation.version);
        if (assistantBoardRef.current === boardId) {
          setAssistantConversationId(conversationId);
          setAssistantConversationVersion(version);
          setAssistantConversations((current) => [payload.conversation, ...current.filter((item) => item.id !== conversationId)]);
          window.localStorage.setItem(`inspoatlas:assistant-conversation:${boardId}`, conversationId);
        }
      } catch (error) {
        assistantController.abort();
        if (assistantBoardRef.current === boardId) {
          setAssistantMessages(previousMessages);
          setAssistantQuestion(question);
          setAssistantHasInteracted(previousMessages.length > 0);
          notify(error instanceof Error ? error.message : "对话保存失败，请重试");
        }
        return;
      }

      let reply: AssistantMessage;
      try {
        const assistantResult = await assistantReplyPromise;
        if ("error" in assistantResult) throw assistantResult.error;
        const { response, payload } = assistantResult;
        if (!response.ok) throw new Error(friendlyAnalysisError(payload.error));
        reply = {
          id: String(payload.id || crypto.randomUUID()),
          role: "assistant",
          content: String(payload.answer || "暂时没有生成建议。"),
          followUps: Array.isArray(payload.followUps) ? payload.followUps.filter((item: unknown): item is string => typeof item === "string").slice(0, 3) : [],
          sources: Array.isArray(payload.sources) ? payload.sources.filter((item: unknown): item is { title: string; url: string; reason: string } => Boolean(item && typeof item === "object" && "title" in item && "url" in item && typeof item.title === "string" && typeof item.url === "string" && item.url.startsWith("https://"))).slice(0, 3) : [],
          provider: payload.provider,
          model: payload.model,
          promptVersion: payload.promptVersion,
          runMode: payload.runMode,
        };
        if (Array.isArray(payload.actions)) applyAssistantActions(payload.actions, question, selectedAtRequest);
      } catch (error) {
        const message = error instanceof Error ? error.message : "设计助手暂时不可用";
        reply = { id: crypto.randomUUID(), role: "assistant", content: `未能完成：${message}` };
      }
      const completedMessages = [...nextMessages, reply];
      if (assistantBoardRef.current === boardId) setAssistantMessages(completedMessages);
      try {
        const response = await fetch(conversationUrl(boardId, conversationId), {
          method: "PUT",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({ version, messages: completedMessages }),
        });
        const payload = await response.json().catch(() => ({}));
        if (!response.ok) throw new Error(String(payload.error || "回复保存失败"));
        if (assistantBoardRef.current === boardId) {
          setAssistantConversationVersion(Number(payload.conversation.version));
          setAssistantConversations((current) => [payload.conversation, ...current.filter((item) => item.id !== conversationId)]);
        }
      } catch (error) {
        if (assistantBoardRef.current === boardId) notify(error instanceof Error ? error.message : "回复保存失败，请稍后重试");
      }
    } finally {
      assistantRequestPendingRef.current = false;
      setAssistantBusy(false);
    }
  }
  async function submitAnalysisFeedback(nodeId: string, rating: "helpful" | "needs-work", reason?: "inaccurate" | "other") {
    const node = nodes.find((item) => item.id === nodeId);
    if (!node?.data.analysisId) return notify("还没有可评价的拆解结果");
    const response = await fetch("/api/ai-feedback", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        feature: "analysis",
        boardId,
        targetId: node.data.analysisId,
        rating,
        ...(rating === "needs-work" ? { reason: reason ?? "other" } : {}),
        provider: node.data.analysisProvider,
        model: node.data.analysisModel,
        promptVersion: node.data.analysisPromptVersion,
        runMode: node.data.analysisRunMode,
      }),
    });
    if (!response.ok) return notify("反馈暂时未保存，请稍后重试");
    setNodes((current) => current.map((item) => item.id === nodeId ? { ...item, data: { ...item.data, analysisFeedback: rating } } : item));
    notify(rating === "helpful" ? "已记录：这次拆解有帮助" : "已记录：这次结果需要改进");
  }

  async function submitAssistantFeedback(message: AssistantMessage, rating: "helpful" | "needs-work", reason?: "not-actionable" | "other") {
    if (!message.id) return;
    const response = await fetch("/api/ai-feedback", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        feature: "design-assistant",
        boardId,
        targetId: message.id,
        rating,
        ...(rating === "needs-work" ? { reason: reason ?? "other" } : {}),
        provider: message.provider,
        model: message.model,
        promptVersion: message.promptVersion,
        runMode: message.runMode,
      }),
    });
    if (!response.ok) return notify("反馈暂时未保存，请稍后重试");
    setAssistantMessages((current) => current.map((item) => item.id === message.id ? { ...item, feedback: rating } : item));
    notify(rating === "helpful" ? "已记录：这条建议有帮助" : "已记录：这条建议需要改进");
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
    setEditingImage(null);
    setWorkflowOverlay(null);
    setRightTab("asset");
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

  function openContractSetup(sourceNodeIds?: string[]) {
    setContractSetupNodeIds(sourceNodeIds ?? selectedNodes.filter((node) => node.data.workflowStage === "analysis" || isAnalyzableNode(node)).map((node) => node.id));
    setDesignBrief(createDesignBrief());
    setWorkflowOverlay("purpose");
    setEditingImage(null);
    setRightTab("baseline");
    setInspectorOpen(true);
  }

  function openImageEditor(node: CanvasNode) {
    if (node.data.kind !== "image" || !node.data.assetId || !node.data.imageUrl) return;
    setWorkflowOverlay(null);
    setRightTab("asset");
    setSelectedIds([node.id]);
    setEditingImage({ assetId: String(node.data.assetId), sourceUrl: String(node.data.imageUrl), title: node.data.title, nodeId: node.id });
    setInspectorOpen(true);
  }

  function updateDesignBrief(field: keyof Omit<DesignBrief, "purpose">, value: string) {
    setDesignBrief((current) => ({ ...current, [field]: value }));
  }

  function selectDesignPurpose(purpose: DesignPurpose) {
    setDesignBrief(createDesignBrief(purpose));
  }

  async function previewBaseline(sourceNodeIds: string[] = contractSetupNodeIds) {
    setContractBusy(true);
    const candidates = sourceNodeIds.length ? nodes.filter((node) => sourceNodeIds.includes(node.id)) : [];
    const selectedAssetIds = [...new Set(candidates.flatMap((node) => {
      if (node.data.workflowStage === "analysis" && node.data.sourceAssetId) return [String(node.data.sourceAssetId)];
      if (isAnalyzableNode(node) && node.data.assetId) return [String(node.data.assetId)];
      return [];
    }))];
    const response = await fetch("/api/boards/" + boardId + "/contracts/preview", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ ...(selectedAssetIds.length ? { assetIds: selectedAssetIds } : {}), brief: designBrief }),
    });
    const payload = await response.json().catch(() => ({}));
    setContractBusy(false);
    if (!response.ok) return notify(payload.error || "请先拆解至少一张参考");
    setContract(payload.contract);
    const directAnalysisIds = candidates.filter((node) => node.data.workflowStage === "analysis").map((node) => node.id);
    const resolvedAssetIds = payload.contract?.sourceAssetIds ?? selectedAssetIds;
    const matchingAnalysisIds = nodes.filter((node) => node.data.workflowStage === "analysis" && resolvedAssetIds.includes(String(node.data.sourceAssetId || ""))).map((node) => node.id);
    setContractSourceNodeIds(directAnalysisIds.length ? directAnalysisIds : matchingAnalysisIds);
    setWorkflowOverlay("contract");
    setRightTab("baseline");
  }

  function startExportWizard() {
    const savedContract = selected?.data.workflowStage === "contract" ? selected.data.contract : nodes.find((node) => node.data.workflowStage === "contract")?.data.contract;
    setContract(savedContract ?? null);
    if (savedContract) {
      const goal = productionGoalByPurpose[savedContract.brief?.purpose ?? "web-ui-recreate"];
      if (goal) {
        setProductionGoal(goal);
        setExportDestination(exportDestinationsByGoal[goal][0].id);
      }
    }
    setExportStep(1);
    setExportComplete(false);
    setWorkflowOverlay("export");
  }

  function removeContractItem(section: "principles" | "colors" | "spacing" | "radii" | "components", index: number) {
    setContract((current) => {
      if (!current) return current;
      if (section === "principles") return { ...current, principles: current.principles.filter((_, itemIndex) => itemIndex !== index) };
      if (section === "components") return { ...current, components: current.components.filter((_, itemIndex) => itemIndex !== index) };
      if (section === "colors") return { ...current, tokens: { ...current.tokens, colors: current.tokens.colors.filter((_, itemIndex) => itemIndex !== index) } };
      if (section === "spacing") return { ...current, tokens: { ...current.tokens, spacing: current.tokens.spacing.filter((_, itemIndex) => itemIndex !== index) } };
      return { ...current, tokens: { ...current.tokens, radii: current.tokens.radii.filter((_, itemIndex) => itemIndex !== index) } };
    });
  }

  function evidenceAssetIds(section: ContractEvidenceSection, value: string) {
    if (!contract) return [];
    return contract.evidence?.[section]?.find((item) => item.value === value)?.sourceAssetIds ?? contract.sourceAssetIds;
  }

  function evidenceLabels(assetIds: string[]) {
    return assetIds.map((assetId) => sourceTitlesByAssetId.get(assetId) || `参考 ${assetId.slice(-6)}`).join("、");
  }

  function focusEvidence(assetIds: string[]) {
    const sourceIds = new Set(assetIds);
    const directSources = nodes.filter((node) => isAnalyzableNode(node) && sourceIds.has(String(node.data.assetId || "")));
    const analysisSources = nodes.filter((node) => node.data.workflowStage === "analysis" && sourceIds.has(String(node.data.sourceAssetId || "")));
    const targets = directSources.length ? directSources : analysisSources;
    if (!targets.length) return notify("这条证据的参考卡已不在当前画布");
    setSelectedIds(targets.map((node) => node.id));
    setRightTab("asset");
    setWorkflowOverlay(null);
    window.setTimeout(() => { void fitView({ nodes: targets, padding: 0.28, duration: 260 }); }, 0);
    notify(`已定位 ${targets.length} 张来源参考`);
  }

  function ContractEvidenceLink({ assetIds }: { assetIds: string[] }) {
    return <button type="button" className="contract-evidence" onClick={() => focusEvidence(assetIds)} title="点击定位来源参考">证据 · {assetIds.length} 张：{evidenceLabels(assetIds)}</button>;
  }

  function reviewDecision(section: ContractReviewSection, issue: string) {
    if (!contract) return "";
    const key = section === "conflicts" ? "conflictDecisions" : "unresolvedNotes";
    return contract.review?.[key]?.find((item) => item.issue === issue)?.decision ?? "";
  }

  function updateReviewDecision(section: ContractReviewSection, issue: string, decision: string) {
    setContract((current) => {
      if (!current) return current;
      const key = section === "conflicts" ? "conflictDecisions" : "unresolvedNotes";
      const existing = current.review?.[key] ?? [];
      const next = decision.trim()
        ? [...existing.filter((item) => item.issue !== issue), { issue, decision }]
        : existing.filter((item) => item.issue !== issue);
      return { ...current, review: { ...(current.review ?? { conflictDecisions: [], unresolvedNotes: [] }), [key]: next } };
    });
  }

  async function confirmBaseline() {
    if (!contract) return;
    const response = await fetch("/api/boards/" + boardId + "/contracts", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ contract }),
    });
    const payload = await response.json().catch(() => ({}));
    if (!response.ok) return notify(payload.error || "设计方案保存失败");
    const savedContract = (payload.contract?.content as DesignContract | undefined) ?? contract;
    setContract(savedContract);
    const contractCardId = "contract-card-current";
    setNodes((current) => {
      const existing = current.find((node) => node.id === contractCardId);
      const sources = current.filter((node) => contractSourceNodeIds.includes(node.id));
      const right = sources.length ? Math.max(...sources.map((node) => absoluteNodePosition(current, node).x + nodeWidth(node))) : 360;
      const top = sources.length ? Math.min(...sources.map((node) => absoluteNodePosition(current, node).y)) : 180;
      const card: CanvasNode = {
        id: contractCardId,
        type: "inspo",
        position: existing?.position ?? { x: right + 120, y: top },
        data: { kind: "text", workflowStage: "contract", title: savedContract.title, contract: savedContract, tags: ["设计方案", designPurposeLabel(savedContract.brief?.purpose)] },
        style: existing?.style ?? { width: 360, height: 250 },
        zIndex: 10,
      };
      return existing ? current.map((node) => node.id === contractCardId ? card : node) : [...current, card];
    });
    setEdges((current) => {
      const additions = contractSourceNodeIds.flatMap((sourceId) => {
        if (current.some((edge) => edge.source === sourceId && edge.target === contractCardId)) return [];
        const id = `contract-link-${sourceId}`;
        const relation: Relation = { id, sourceId, targetId: contractCardId, type: "contract-derived-from", layer: "provenance", status: "confirmed", origin: "human", explanation: "整合为方案" };
        return [{ id, source: sourceId, target: contractCardId, type: "relation", label: relation.explanation, data: relation, style: { stroke: "#62569a", strokeWidth: 2 } } as Edge];
      });
      return [...current, ...additions];
    });
    setWorkflowOverlay(null);
    setRightTab("asset");
    setSelectedIds([contractCardId]);
    notify("设计方案已放到画布");
  }

  async function exportPackage(format: "quick" | "full" = "full") {
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
        format: activeDestination.id === "figma-design" ? format : "full",
      }),
    });
    if (!response.ok) {
      setExportBusy(false);
      return notify((await response.json().catch(() => ({}))).error || "请先保存设计方案");
    }
    const blob = await response.blob();
    const url = URL.createObjectURL(blob);
    const anchor = document.createElement("a");
    anchor.href = url;
    const quickFigma = activeDestination.id === "figma-design" && format === "quick";
    anchor.download = "inspoatlas-" + activeDestination.id + (quickFigma ? ".svg" : ".zip");
    anchor.click();
    URL.revokeObjectURL(url);
    setExportBusy(false);
    setExportComplete(quickFigma ? "quick" : "full");
    notify(quickFigma ? "已下载，直接拖进 Figma 即可" : "已下载完整任务包");
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

  function focusSearchNode(id: string) {
    const index = searchMatchIds.indexOf(id);
    setSearchCursor(Math.max(0, index));
    setNodes((current) => current.map((node) => ({ ...node, selected: node.id === id })));
    setSelectedIds([id]);
    setRightTab("asset");
    setSearchExpanded(false);
    void fitView({ nodes: [{ id }], padding: 0.55, minZoom: 0.85, maxZoom: 1.25, duration: 360 });
  }

  function handleSearchChange(value: string) {
    setSearch(value);
    setSearchCursor(0);
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

  const hasCanvasContent = nodes.length > 0;
  const hasSelection = selectedIds.length > 0;
  const selectionCanAnalyze = selectedNodes.some(isAnalyzableNode);
  const dockAgent = () => {
    setAgentRevealed(false);
    setAssistantOpen(false);
    setAgentHintVisible(false);
  };

  return (
    <main
      className={"workspace-shell" + (focusMode ? " focus-mode" : "") + (resizingRail ? " is-resizing" : "") + ((leftRailCollapsed || (resizingRail === "left" && leftRailWidth < railExpandedMinimum.left)) ? " left-collapsed" : "") + (rightRailCollapsed ? " right-collapsed" : "")}
      style={{ "--left-rail-width": `${leftRailCollapsed ? 68 : leftRailWidth}px`, "--right-rail-width": `${rightRailCollapsed ? 68 : rightRailWidth}px` } as CSSProperties}
      onDragOver={(event) => event.preventDefault()}
      onDrop={(event) => {
        event.preventDefault();
        const files = event.dataTransfer.files;
        if (files.length) void addMedia(files);
      }}
    >
      <header className="topbar">
        <div className="brand"><span className="brand-mark" title="小in"><img src="/inspo-sprite.png" alt="小in" /></span><div><strong>InspoAtlas</strong><small>灵感图谱</small></div></div>
        <div
          className="board-title editable"
          title="双击重命名当前作品"
          onDoubleClick={() => boardId && startBoardRename(boardId, boardTitle, "header")}
        >
          <span className="live-dot" />
          {editingBoardId === boardId && editingBoardSurface === "header" ? (
            <span className="board-name-editor" data-value={boardDraft || " "}>
              <input
                autoFocus
                aria-label="作品名称"
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
            </span>
          ) : <b>{boardTitle}</b>}
          <small>{savedState}</small>
        </div>
        <div className="top-actions">
          <button className="button ghost icon-button" onClick={undo} title="撤销" aria-label="撤销"><WorkspaceIcon name="undo" /></button>
          <button className="button ghost icon-button" onClick={redo} title="重做" aria-label="重做"><WorkspaceIcon name="redo" /></button>
          <button className="button ghost theme-toggle" onClick={() => setTheme((value) => value === "light" ? "dark" : "light")} title={theme === "light" ? "切换深色模式" : "切换浅色模式"} aria-label={theme === "light" ? "切换深色模式" : "切换浅色模式"}><span aria-hidden="true">{theme === "light" ? "☾" : "☀"}</span></button>
          <button className={"button soft focus-top-button" + (focusMode ? " active" : "")} onClick={() => setFocusMode((value) => !value)}>{focusMode ? "退出专注" : "专注模式"}</button>
          <button className="button primary export-top-button" onClick={startExportWizard}><WorkspaceIcon name="upload" size={15} />输出</button>
          <UserMenu />
        </div>
      </header>

      <aside className="left-rail">
        <button className="rail-action" onClick={() => setModal("new-work")} title="新建作品"><WorkspaceIcon name="add" size={16} />新建作品</button>
        <nav>
          <p>我的作品 <span>{boards.length}</span></p>
          {boards.map((board) => (
            <div
              key={board.id}
              data-board-id={board.id}
              className={"nav-item " + (board.id === boardId ? "active" : "")}
              role="button"
              tabIndex={0}
              aria-current={board.id === boardId ? "page" : undefined}
              aria-label={`打开作品：${board.title}`}
              title={`${board.title} · ${new Date(board.createdAt || board.updatedAt).toLocaleDateString("zh-CN")}`}
              onClick={() => setBoardId(board.id)}
              onKeyDown={(event) => {
                if (event.key === "Enter" || event.key === " ") {
                  event.preventDefault();
                  setBoardId(board.id);
                }
              }}
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
                <span className="board-name-editor" data-value={boardDraft || " "}>
                  <input
                    autoFocus
                    aria-label="作品名称"
                    value={boardDraft}
                    onClick={(event) => event.stopPropagation()}
                    onDoubleClick={(event) => event.stopPropagation()}
                    onChange={(event) => setBoardDraft(event.target.value)}
                    onBlur={() => void commitBoardRename(board.id)}
                    onKeyDown={(event) => {
                      event.stopPropagation();
                      if (event.key === "Enter") void commitBoardRename(board.id);
                      if (event.key === "Escape") { setEditingBoardId(null); setEditingBoardSurface(null); }
                    }}
                  />
                </span>
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
      </aside>
      <div className="rail-resizer rail-resizer-left" role="separator" aria-label="调整左侧栏宽度" aria-orientation="vertical" title="拖动调整左栏宽度，拖到尽头可收起" onDoubleClick={() => resetRailWidth("left")} onPointerDown={(event) => startRailResize("left", event)} />
      {!focusMode && <button type="button" className={"rail-collapse-button rail-collapse-left" + (leftRailCollapsed ? " is-collapsed" : "")} onClick={() => toggleRailCollapsed("left")} aria-label={leftRailCollapsed ? "展开左侧栏" : "收起左侧栏"} title={leftRailCollapsed ? "展开作品栏" : "收起作品栏"}><WorkspaceIcon name="chevron" size={14} /></button>}
      {editingBoardId && editingBoardSurface === "popover" && <form
        className="board-rename-popover"
        style={{ top: boardRenameTop }}
        aria-label="重命名作品"
        onSubmit={(event) => { event.preventDefault(); void commitBoardRename(editingBoardId); }}
        onKeyDown={(event) => { if (event.key === "Escape") { setEditingBoardId(null); setEditingBoardSurface(null); } }}
        onBlur={(event) => { if (!event.currentTarget.contains(event.relatedTarget)) { setEditingBoardId(null); setEditingBoardSurface(null); } }}
      >
        <strong>重命名作品</strong>
        <input autoFocus aria-label="新作品名称" value={boardDraft} onChange={(event) => setBoardDraft(event.target.value)} maxLength={120} />
        <div><button type="button" onClick={() => { setEditingBoardId(null); setEditingBoardSurface(null); }}>取消</button><button type="submit" className="button primary" disabled={!boardDraft.trim()}>保存名称</button></div>
      </form>}

      <section ref={canvasAreaRef} className={"canvas-area" + (rightPanning ? " is-right-panning" : "")} aria-label="灵感无限画布" onPointerDownCapture={(event) => { if (event.button === 2) setRightPanning(true); }}>
        {hasCanvasContent && <div className={"canvas-search node-search" + (searchExpanded ? " is-open" : " is-collapsed")}>
          {!searchExpanded && <button className="search-toggle" onClick={() => setSearchExpanded(true)} aria-label="搜索画布节点"><WorkspaceIcon name="search" /></button>}
          {searchExpanded && <div className="node-search-panel nodrag nowheel">
            <header><span><WorkspaceIcon name="search" size={16} /></span><input type="search" value={search} onChange={(event) => handleSearchChange(event.target.value)} onKeyDown={(event) => { if (event.key === "Enter" && searchMatchIds.length) { event.preventDefault(); focusSearchMatch(searchCursor + (event.shiftKey ? -1 : 1)); } }} placeholder="搜索节点…" autoFocus /><button onClick={() => setSearchExpanded(false)} aria-label="关闭节点搜索"><WorkspaceIcon name="close" size={15} /></button></header>
            <div className="node-search-kinds" role="tablist" aria-label="节点类型">
              {searchKindOptions.map((option) => <button key={option.id} className={searchKind === option.id ? "active" : ""} onClick={() => { setSearchKind(option.id); setSearchCursor(0); }}>{option.icon}<span>{option.label}</span></button>)}
            </div>
            <div className="node-search-results">
              {searchResults.length ? searchResults.slice(0, 80).map((node) => <button key={node.id} className={selectedIds.includes(node.id) ? "active" : ""} onClick={() => focusSearchNode(node.id)}><i>{nodeSearchIcon(node)}</i><span><strong>{node.data.title}</strong><small>{nodeSearchSummary(node)}</small></span><b>定位</b></button>) : <p>没有符合条件的节点</p>}
            </div>
          </div>}
        </div>}
        <div className="canvas-toolbar" role="toolbar" aria-label="画布工具">
          <ToolbarMoreMenu onImport={() => setModal("import")} onUpload={() => fileInput.current?.click()} onNote={() => createNote()} onGroup={() => createGroup()} />
          <button className={searchExpanded ? "is-active" : ""} onClick={() => setSearchExpanded((value) => !value)} disabled={!hasCanvasContent} title="搜索并定位画布节点"><WorkspaceIcon name="search" /><small>搜索</small></button>
          <button onClick={previewOrganize} disabled={!hasCanvasContent} title="按设计重点整理画布"><WorkspaceIcon name="arrange" /><small>整理</small></button>
          <button onClick={() => void fitView({ padding: 0.18, duration: 320 })} disabled={!hasCanvasContent} title="定位全部节点"><WorkspaceIcon name="fit" /><small>定位</small></button>
          <button className={showMiniMap ? "is-active" : ""} onClick={() => setShowMiniMap((value) => !value)} disabled={!hasCanvasContent} title={showMiniMap ? "收起小地图" : "打开小地图"}><WorkspaceIcon name="map" /><small>小地图</small></button>
          {hasSelection ? <>
            {selected?.data.kind === "image" && selectedIds.length === 1 && <button className="is-context" onClick={() => openImageEditor(selected)} title="在右侧栏裁剪、旋转、蒙版并保存副本"><WorkspaceIcon name="archive" /><small>编辑素材</small></button>}
            {selectionCanAnalyze && <button className="ai-tool" onClick={() => selectedIds.length > 1 ? void analyzeSelected() : void analyze()} title="拆解所选参考"><WorkspaceIcon name="analyze" /><small>拆解</small></button>}
            {selectedIds.length > 1 && <button className="is-context scheme-tool" onClick={() => openContractSetup(selectedIds)} title="在右侧栏整理所选参考"><WorkspaceIcon name="archive" /><small>整理方案</small></button>}
            {selectedIds.length > 1 && <button className="is-context" onClick={() => createGroup()} title="将所选卡片组成分组"><WorkspaceIcon name="folder" /><small>分组</small></button>}
            <button onClick={() => requestDeleteNodes(selectedIds)} title="删除所选"><WorkspaceIcon name="trash" /><small>删除</small></button>
          </> : null}
        </div>
        {!hasCanvasContent && <section className="canvas-empty" aria-label="开始画布">
          <span><WorkspaceIcon name="archive" size={21} /></span>
          <h1>从一条参考开始</h1>
          <p>导入图片、链接或文字；也可以直接把文件拖到这里。</p>
          <div className="empty-actions">
            <button className="button primary" onClick={() => setModal("import")}>导入参考</button>
          </div>
        </section>}
        {selectedIds.length > 1 && !organizePreview && (
          <div className="multi-toolbar">
            <strong>{selectedIds.length} 项</strong>
            <button onClick={() => createGroup()}>组成分组</button>
            {selectedNodes.some(isAnalyzableNode) && <button onClick={() => void analyzeSelected()}>批量拆解</button>}
            <button onClick={() => alignSelected("left")}>左对齐</button>
            <button onClick={() => alignSelected("top")}>顶对齐</button>
            <button onClick={() => alignSelected("horizontal")}>水平等距</button>
            <button onClick={previewOrganize}>整理所选</button>
            <button className="danger" onClick={() => requestDeleteNodes(selectedIds)}>删除</button>
          </div>
        )}
        <input ref={fileInput} className="visually-hidden" type="file" multiple accept="image/jpeg,image/png,image/webp,video/mp4,video/webm,video/quicktime,audio/mpeg,audio/wav,audio/ogg,audio/mp4" onChange={(event) => { const files = Array.from(event.target.files || []); event.target.value = ""; if (files.length) void addMedia(files); }} />
        <input
          ref={(node) => {
            folderInput.current = node;
            node?.setAttribute("webkitdirectory", "");
            node?.setAttribute("directory", "");
          }}
          className="visually-hidden"
          type="file"
          multiple
          accept="image/jpeg,image/png,image/webp,video/mp4,video/webm,video/quicktime,audio/mpeg,audio/wav,audio/ogg,audio/mp4"
          onChange={(event) => { const files = Array.from(event.target.files || []); event.target.value = ""; if (files.length) void addMedia(files, true); }}
        />
        {(hasCanvasContent || focusMode) && <div className="canvas-view-controls">
          {hasCanvasContent && <label className="relation-view" title="关联线只用于辅助整理，默认仅显示当前卡片相关关系">
            <span>{connecting ? "松开完成" : "连线显示"}</span>
            <select aria-label="连线显示范围" value={relationView} onChange={(event) => setRelationView(event.target.value as RelationView)}>
              <option value="selection">所选卡片</option>
              <option value="hidden">隐藏</option>
              <option value="all">全部</option>
            </select>
          </label>}
          {focusMode && <button className="focus-exit-button" onClick={() => setFocusMode(false)}>退出专注 <kbd>Esc</kbd></button>}
        </div>}
        <ReactFlow
          nodes={visibleNodes}
          edges={visibleEdges}
          nodeTypes={nodeTypes}
          edgeTypes={edgeTypes}
          onNodesChange={organizePreview ? undefined : onNodesChange}
          onEdgesChange={organizePreview ? undefined : onEdgesChange}
          onConnect={organizePreview ? undefined : onConnect}
          onConnectStart={(event, params) => startConnection(event, params.nodeId, params.handleType)}
          onConnectEnd={(event) => finishConnection(event)}
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
          connectOnClick
          connectionRadius={48}
          elementsSelectable={!organizePreview}
          fitView
          minZoom={0.14}
          maxZoom={2.2}
          snapToGrid
          snapGrid={canvasSnapGrid}
          onlyRenderVisibleElements
          elevateEdgesOnSelect
        >
          {showMiniMap && nodes.length > 0 && <MiniMap pannable zoomable nodeColor={miniMapNodeColor} maskColor="rgba(8,12,11,.76)" ariaLabel="画布缩略图" />}
        </ReactFlow>
        <button className={"inspector-toggle" + (inspectorOpen ? " is-open" : "")} onClick={() => setInspectorOpen((value) => !value)} title={inspectorOpen ? "收起阶段面板" : "打开阶段面板"} aria-label={inspectorOpen ? "收起阶段面板" : "打开阶段面板"}><WorkspaceIcon name="archive" /></button>

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

        {nextStepMenu && (() => {
          const node = nodes.find((item) => item.id === nextStepMenu.sourceId);
          if (!node) return null;
          return <aside ref={nextStepMenuRef} className={"next-step-menu is-canvas-menu" + (connecting ? " is-dragging" : "")} style={{ left: nextStepMenu.x, top: nextStepMenu.y }} aria-label="从当前卡片继续创作">
            <header><span>{connecting ? "拖到选项上松手" : "选择下一步"}</span><button type="button" onClick={() => setNextStepMenu(null)} aria-label="关闭下一步选项"><WorkspaceIcon name="close" size={15} /></button></header>
            {nextStepOptions(node).map((option) => <button key={option.action} type="button" data-next-step-action={option.action} className={hoveredNextStep === option.action ? "is-drop-target" : ""} onClick={() => runNextStep(option.action)}>
              <i><WorkspaceIcon name={option.icon} size={17} /></i><span><strong>{option.title}</strong><small>{option.description}</small></span><WorkspaceIcon name="chevron" size={14} />
            </button>)}
          </aside>;
        })()}

        {workflowOverlay === "export" && (
          <div className="workflow-dialog-backdrop" onMouseDown={(event) => { if (event.target === event.currentTarget) setWorkflowOverlay(null); }}>
            <section className="workflow-dialog export-dialog export-wizard" role="dialog" aria-modal="true" aria-label="输出任务">
              <header><div><h2>输出任务</h2><p>选择目标与后续工具，确认后生成对应文件。</p></div><button onClick={() => setWorkflowOverlay(null)} aria-label="关闭"><WorkspaceIcon name="close" size={16} /></button></header>
              <div className="export-progress" aria-label="输出步骤">
                <span className={exportStep >= 1 ? "is-active" : ""}><i>1</i>想得到什么</span><b />
                <span className={exportStep >= 2 ? "is-active" : ""}><i>2</i>在哪里工作</span><b />
                <span className={exportStep >= 3 ? "is-active" : ""}><i>3</i>确认输出</span>
              </div>
              {exportStep === 1 && <div className="export-wizard-body"><h3>这次想得到什么？</h3><div className="export-goal-list">{productionGoalOptions.map((option) => <button key={option.id} className={productionGoal === option.id ? "is-active" : ""} onClick={() => { setProductionGoal(option.id); setExportDestination(exportDestinationsByGoal[option.id][0].id); setExportComplete(false); }}><i>{option.step}</i><div><strong>{option.title}</strong><small>{option.description}</small></div><span>{productionGoal === option.id ? "✓" : "›"}</span></button>)}</div></div>}
              {exportStep === 2 && <div className="export-wizard-body"><h3>接下来在哪里工作？</h3><div className="export-destination-list">{exportDestinations.map((option) => <button key={option.id} className={activeDestination.id === option.id ? "is-active" : ""} onClick={() => { setExportDestination(option.id); setExportComplete(false); }}><span className="destination-icon">{option.icon}</span><div><strong>{option.title}{option.recommended && <em>推荐</em>}</strong><small>{option.description}</small></div><i>{activeDestination.id === option.id ? "✓" : "›"}</i></button>)}</div>{activeDestination.glossary && <details className="export-glossary"><summary>{activeDestination.glossary.term}</summary><p>{activeDestination.glossary.explanation}</p></details>}</div>}
              {exportStep === 3 && <div className="export-wizard-body"><h3>确认输出任务</h3><div className="export-result-preview"><span>将为你准备</span><strong>{activeDestination.deliverable}</strong><p>{activeDestination.nextStep}</p></div>{contract ? <p className="export-source-note">使用方案「{contract.title}」中的参考与取舍。</p> : <p className="export-source-note">还没有保存的设计方案。请先在右侧「方案」中整合并保存参考。</p>}{exportComplete && <div className="export-receipt" role="status"><span>✓</span><div><strong>已下载</strong><small>{exportComplete === "quick" ? "SVG 可直接拖入 Figma 编辑。" : "解压后按使用说明继续。"}</small></div></div>}</div>}
              <footer><button className="button soft" onClick={() => exportStep === 1 ? setWorkflowOverlay(null) : setExportStep((exportStep - 1) as 1 | 2)}>{exportStep === 1 ? "返回画布" : "上一步"}</button>{exportStep < 3 ? <button className="button primary" onClick={() => setExportStep((exportStep + 1) as 2 | 3)}>下一步</button> : contract ? <button className="button primary" onClick={() => void exportPackage(activeDestination.id === "figma-design" ? "quick" : "full")} disabled={exportBusy}>{exportBusy ? "正在准备…" : activeDestination.action}</button> : <button className="button primary" onClick={() => { setWorkflowOverlay(null); openContractSetup(); }}>去制作方案</button>}</footer>
              {exportStep === 3 && contract && activeDestination.id === "figma-design" && <details className="figma-advanced"><summary>需要 Variables 和组件草稿？</summary><p>完整导入包需在 Figma Desktop 中安装一次本地插件。</p><button onClick={() => void exportPackage("full")} disabled={exportBusy}>下载完整导入包</button></details>}
            </section>
          </div>
        )}

      </section>
      {portalReady && createPortal(
        <div className={"agent-entry" + (agentRevealed ? "" : " is-peeking") + (assistantOpen ? " is-chatting" : "")}>
          {agentRevealed && !assistantOpen && agentHintVisible && <div className="agent-hint"><TypewriterText text={agentWelcome} speed={110} /><button onClick={() => setAgentHintVisible(false)} aria-label="关闭提示">×</button></div>}
          <button
            className={"assistant-orb" + (assistantOpen ? " is-open" : "")}
            onClick={() => {
              if (!agentRevealed) { setAgentRevealed(true); return; }
              const next = !assistantOpen;
              setAssistantOpen(next);
              if (next) {
                setFocusMode(false);
                setRightRailCollapsed(false);
                setInspectorOpen(true);
                setAssistantMemoryOpen(false);
                setAssistantHistoryOpen(false);
                if (window.innerWidth > 1100 && rightRailWidth < 380) setRightRailWidth(380);
              }
              setAgentHintVisible(false);
            }}
            onContextMenu={(event) => { if (agentRevealed) { event.preventDefault(); dockAgent(); } }}
            title={agentRevealed ? "小in · 灵感 Agent" : "看看小in"}
            aria-label={agentRevealed ? (assistantOpen ? "关闭小in设计助手" : "打开小in设计助手") : "让小in露出全身"}
            aria-expanded={assistantOpen}
          ><img src="/inspo-sprite.png" alt="" /></button>
          {agentRevealed && <button className="agent-dock-button" onClick={dockAgent} aria-label="收起小in到侧边" title="收起小in到侧边"><span>收起</span><WorkspaceIcon name="chevron" size={16} /></button>}
        </div>, document.body
      )}
      <div className="rail-resizer rail-resizer-right" role="separator" aria-label="调整右侧栏宽度" aria-orientation="vertical" title="拖动调整右栏宽度，拖到尽头可收起" onDoubleClick={() => resetRailWidth("right")} onPointerDown={(event) => startRailResize("right", event)} />
      {!focusMode && <button type="button" className={"rail-collapse-button rail-collapse-right" + (rightRailCollapsed ? " is-collapsed" : "")} onClick={() => toggleRailCollapsed("right")} aria-label={rightRailCollapsed ? "展开右侧栏" : "收起右侧栏"} title={rightRailCollapsed ? "展开详情栏" : "收起详情栏"}><WorkspaceIcon name="chevron" size={14} /></button>}

      <aside className={"inspector" + (inspectorOpen ? " is-open" : "") + (assistantOpen ? " is-agent-open" : "") + ((rightRailCollapsed || (resizingRail === "right" && rightRailWidth < railExpandedMinimum.right)) ? " is-collapsed" : "")}>
        {assistantOpen && (
          <section className="agent-drawer agent-sidebar" aria-label="小in 设计助手">
            <header className="agent-header">
              <div className="agent-header-identity"><img src="/inspo-sprite.png" alt="" /><div><h2>小in</h2><span>你的设计小助手</span></div></div>
              <div className="agent-header-actions">
                <button type="button" className={assistantHistoryOpen ? "is-active" : ""} onClick={() => setAssistantHistoryOpen((open) => !open)} aria-label="历史对话" aria-expanded={assistantHistoryOpen} title="历史对话"><WorkspaceIcon name="history" size={18} /></button>
                <button type="button" className={assistantMemoryOpen ? "is-active" : ""} onClick={() => { setAssistantMemoryOpen((open) => !open); setAssistantHistoryOpen(false); }} aria-label="小in 的记忆" aria-expanded={assistantMemoryOpen} title="小in 的记忆"><WorkspaceIcon name="ask" size={17} /></button>
                <button type="button" className="agent-new-chat" onClick={startNewAssistantConversation} disabled={assistantBusy || assistantHistoryLoading} title="开始新对话"><WorkspaceIcon name="add" size={17} /><span>新对话</span></button>
                <button type="button" onClick={() => { setAssistantOpen(false); setAssistantMemoryOpen(false); setAssistantHistoryOpen(false); }} aria-label="关闭小in" title="关闭小in"><WorkspaceIcon name="close" size={16} /></button>
              </div>
            </header>
            {assistantHistoryOpen && <>
              <button type="button" className="agent-history-scrim" aria-label="关闭历史对话" onClick={() => setAssistantHistoryOpen(false)} />
              <nav className="agent-history-panel" aria-label="小in 历史对话">
                <div className="agent-history-heading"><div><strong>历史对话</strong><small>当前作品 · {assistantConversations.length} 段</small></div><button type="button" onClick={() => setAssistantHistoryOpen(false)} aria-label="收起历史对话"><WorkspaceIcon name="close" size={15} /></button></div>
                <div className="agent-history-list">
                  {assistantHistoryLoading && <p role="status">正在读取对话…</p>}
                  {assistantHistoryError && <p className="agent-history-error" role="alert">{assistantHistoryError}</p>}
                  {!assistantHistoryLoading && !assistantHistoryError && assistantConversations.length === 0 && <p>还没有对话。发出第一条消息后会保存在这里。</p>}
                  {assistantConversations.map((conversation) => <div className="agent-history-row" key={conversation.id}><button type="button" className={conversation.id === assistantConversationId ? "is-active" : ""} aria-current={conversation.id === assistantConversationId ? "true" : undefined} disabled={assistantBusy || assistantHistoryLoading} onClick={() => { setAssistantDeleteId(null); void openAssistantConversation(conversation.id); }}><span>{conversation.title}</span><small>{conversationDate(conversation.updatedAt)}</small></button><button type="button" className="agent-history-delete" disabled={assistantBusy || assistantHistoryLoading} onClick={() => void deleteAssistantConversation(conversation.id)} aria-label={assistantDeleteId === conversation.id ? `确认删除${conversation.title}` : `删除${conversation.title}`} title={assistantDeleteId === conversation.id ? "再次点击确认删除" : "删除对话"}>{assistantDeleteId === conversation.id ? "确认" : "删除"}</button></div>)}
                </div>
              </nav>
            </>}
            {assistantMemoryOpen && <section className="agent-memory-panel" aria-label="小in 的记忆设置">
              <header><div><strong>小in 的记忆</strong><small>完整对话保存在当前作品；这里仅保存跨作品偏好。</small></div><button type="button" onClick={() => setAssistantMemoryOpen(false)} aria-label="关闭记忆设置"><WorkspaceIcon name="close" size={15} /></button></header>
              <p>小in 是温和、敏锐的设计共创伙伴。你明确提出要求时，它能添加备注、重命名卡片或拆解选中的参考；画布修改可以撤销。</p>
              <label>我的角色或固定信息<textarea value={assistantMemory.userRole} maxLength={300} placeholder="例如：自由职业网页设计师" onChange={(event) => setAssistantMemory((current) => ({ ...current, userRole: event.target.value }))} /></label>
              <label>设计偏好<textarea value={assistantMemory.preferences} maxLength={800} placeholder="例如：喜欢圆润、轻盈的界面" onChange={(event) => setAssistantMemory((current) => ({ ...current, preferences: event.target.value }))} /></label>
              <label>想避免的风格<textarea value={assistantMemory.avoid} maxLength={500} placeholder="例如：不喜欢过深的背景色" onChange={(event) => setAssistantMemory((current) => ({ ...current, avoid: event.target.value }))} /></label>
              <div className="agent-memory-actions"><button type="button" onClick={() => setAssistantMemory(emptyAssistantMemory)}>清空内容</button><button type="button" onClick={() => void saveAssistantMemory()} disabled={assistantMemoryBusy}>{assistantMemoryBusy ? "保存中…" : "保存记忆"}</button></div>
            </section>}
            <div className="agent-conversation" ref={assistantScrollRef} aria-live="polite">
              {assistantHistoryLoading && !assistantMessages.length && <div className="agent-chat-loading" role="status">正在整理你的对话…</div>}
              {!assistantHistoryLoading && !assistantMessages.length && <div className="agent-chat-empty">
                <img src="/inspo-sprite.png" alt="" />
                <p><TypewriterText text={agentWelcome} /></p>
                {!assistantHasInteracted && <div className="agent-starters" aria-label="试试这样提问">
                  {agentPromptPresets.map((question) => <button key={question} title={question} onClick={() => void askDesignAssistant(question)} disabled={assistantBusy}><span>{question}</span><WorkspaceIcon name="chevron" size={15} /></button>)}
                </div>}
              </div>}
              {assistantMessages.map((message, index) => (
                <article className={"agent-chat-message agent-chat-message-" + message.role} key={message.id ?? `${message.role}-${index}`}>
                  <header><strong>{message.role === "user" ? "你" : "小in"}</strong></header>
                  <p>{message.role === "assistant" ? <TypewriterText text={message.content} animate={index === assistantMessages.length - 1 && completedAnswerId !== message.id} speed={Math.max(2, Math.min(16, Math.floor(1_400 / Math.max(1, message.content.length))))} onComplete={() => setCompletedAnswerId(message.id ?? null)} /> : message.content}</p>
                  {message.role === "assistant" && (index < assistantMessages.length - 1 || completedAnswerId === message.id) && Boolean(message.sources?.length) && <div className="agent-sources" aria-label="参考网站">{message.sources?.map((source) => <a key={source.url} href={source.url} target="_blank" rel="noopener noreferrer"><strong>{source.title}</strong><span>{new URL(source.url).hostname}</span></a>)}</div>}
                  {message.role === "assistant" && index === assistantMessages.length - 1 && completedAnswerId === message.id && !assistantBusy && Boolean(message.followUps?.length) && <div className="agent-followups" aria-label="继续追问">
                    {message.followUps?.map((question) => <button key={question} title={question} onClick={() => void askDesignAssistant(question)}><span>{question}</span><WorkspaceIcon name="chevron" size={14} /></button>)}
                  </div>}
                  {message.role === "assistant" && !assistantBusy && (index < assistantMessages.length - 1 || completedAnswerId === message.id) && !message.content.startsWith("未能完成：") && <div className="agent-reply-actions"><button onClick={() => placeDirectionOnCanvas(message)}>放到画布</button>{message.id && (message.feedback ? <small>{message.feedback === "helpful" ? "✓ 有帮助" : "✓ 需改进"}</small> : <><button onClick={() => void submitAssistantFeedback(message, "helpful")}>有用</button><button onClick={() => void submitAssistantFeedback(message, "needs-work", "not-actionable")}>不够具体</button></>)}</div>}
                </article>
              ))}
              {assistantBusy && <div className="agent-typing" role="status"><i /><i /><i /><span>小in 正在思考…</span></div>}
            </div>
            <form className="agent-composer" onSubmit={(event) => { event.preventDefault(); void askDesignAssistant(); }}>
              {selectedIds.length > 0 && <span className="agent-composer-context">已引用画布中的 {selectedIds.length} 张卡片</span>}
              <label htmlFor="direction-question" className="sr-only">给小in发送消息</label>
              <textarea id="direction-question" value={assistantQuestion} maxLength={2000} disabled={assistantBusy || assistantHistoryLoading} onChange={(event) => { setAssistantQuestion(event.target.value); if (event.target.value.trim()) setAssistantHasInteracted(true); }} onKeyDown={(event) => { if (event.key === "Enter" && !event.shiftKey && !event.nativeEvent.isComposing) { event.preventDefault(); void askDesignAssistant(); } }} placeholder="和小in聊聊你的想法…" rows={3} />
              <div className="agent-composer-footer"><span>{voiceListening ? "正在听你说…" : "Enter 发送 · Shift + Enter 换行"}</span><div><button type="button" className={voiceListening ? "agent-voice is-listening" : "agent-voice"} onClick={toggleVoiceInput} disabled={assistantBusy || assistantHistoryLoading || !voiceSupported} aria-label={voiceListening ? "停止语音输入" : "语音输入"} title={voiceSupported ? "语音输入" : "当前浏览器不支持语音输入"}><WorkspaceIcon name="mic" size={18} /></button><button type="submit" className="agent-send" disabled={assistantBusy || assistantHistoryLoading || !assistantQuestion.trim()}>发送 <WorkspaceIcon name="chevron" size={15} /></button></div></div>
            </form>
          </section>
        )}
        <div className="inspector-compact" aria-label="右侧栏快捷入口">
          <button type="button" onClick={() => { setRightTab("asset"); toggleRailCollapsed("right"); }} aria-label="展开素材详情" title="展开素材详情"><WorkspaceIcon name="archive" size={18} /></button>
          <button type="button" onClick={() => { if (selectedIds.length > 1) { setRightTab("baseline"); toggleRailCollapsed("right"); } }} disabled={selectedIds.length < 2} aria-label="展开整理方案" title="选择多张卡片后整理方案"><WorkspaceIcon name="arrange" size={18} /></button>
        </div>
        <button className="mobile-inspector-close" onClick={() => setInspectorOpen(false)} aria-label="关闭阶段面板"><WorkspaceIcon name="close" size={16} /></button>
        <div className="inspector-context-header">
          <div><small>{editingImage ? "素材操作" : rightTab === "baseline" ? "整理方案" : selectedIds.length > 1 ? "当前选择" : "素材详情"}</small><strong>{editingImage ? "编辑素材" : rightTab === "baseline" ? workflowOverlay === "purpose" ? "明确设计任务" : "筛选与取舍" : selectedIds.length > 1 ? `${selectedIds.length} 张卡片` : selected?.data.title || "选择画布卡片"}</strong></div>
          {(editingImage || rightTab === "baseline") && <button type="button" onClick={() => { setEditingImage(null); setWorkflowOverlay(null); setRightTab("asset"); }} aria-label="返回素材详情">返回</button>}
        </div>
        {editingImage ? (
          <ImageEditor key={editingImage.assetId} assetId={editingImage.assetId} sourceUrl={editingImage.sourceUrl} title={editingImage.title} onClose={() => setEditingImage(null)} onSaved={addDerivativeLayer} />
        ) : rightTab === "baseline" && workflowOverlay === "purpose" ? (
          <section className="scheme-sidebar" aria-label="整理方案任务">
            <p>选择这次设计要解决的问题，再从所选素材的拆解结果中提取可用元素。</p>
            <div className="scheme-source-count">已选 {contractSetupNodeIds.length} 张卡片 · {contractSetupNodeIds.filter((id) => nodes.some((node) => node.id === id && (node.data.workflowStage === "analysis" || !!node.data.analysisSummary))).length} 张已有拆解</div>
            <div className="purpose-choice-grid" role="list" aria-label="选择设计任务">
              {purposeOptions.map((option) => <button key={option.id} type="button" role="listitem" className={designBrief.purpose === option.id ? "is-active" : ""} onClick={() => selectDesignPurpose(option.id)}><i><WorkspaceIcon name={purposeIconById[option.id]} size={17} /></i><span><strong>{option.title}</strong><small>{option.description}</small></span><b>{designBrief.purpose === option.id ? "✓" : ""}</b></button>)}
            </div>
            <section className="purpose-brief-fields" aria-label="设计任务说明">
              <h3>{activePurposeOption.title}</h3>
              {(["objective", "context", "keep", "avoid"] as const).map((field, index) => <label key={field}><span>{activePurposeOption.fields[index]}{field === "objective" ? " · 必填" : " · 可选"}</span><textarea value={designBrief[field]} onChange={(event) => updateDesignBrief(field, event.target.value)} placeholder={field === "objective" ? `例如：${activePurposeOption.title}的当前目标` : "暂时不确定可以留空"} /></label>)}
            </section>
            <button className="button primary wide" onClick={() => void previewBaseline()} disabled={contractBusy || !designBrief.objective.trim()}>{contractBusy ? "正在汇总…" : "生成方案预览"}</button>
          </section>
        ) : rightTab === "baseline" ? (
          <section className="contract-panel" aria-label="整理方案内容">
            <span className="step-kicker">整理方案</span><h2>{contract?.title || "从参考中提取设计元素"}</h2>
            {contract ? <>
              <p>{contract.sourceAssetIds.length} 张参考已汇总。检查来源，移除不采用的内容，再保存到画布。</p>
              <div className="contract-content">
                <div className="contract-title"><div><h3>采用内容</h3><small>点击 × 移除</small></div></div>
                <h4>设计原则</h4><div className="contract-items">{contract.principles.map((item, index) => <div key={item}><span>{item}<ContractEvidenceLink assetIds={evidenceAssetIds("principles", item)} /></span><button onClick={() => removeContractItem("principles", index)} aria-label="移除设计原则">×</button></div>)}</div>
                {!!contract.tokens.colors.length && <><h4>颜色</h4><div className="contract-items compact">{contract.tokens.colors.map((item, index) => <div key={item.name}><i style={{ background: item.value }} /><span>{item.value}<ContractEvidenceLink assetIds={item.sourceAssetIds} /></span><button onClick={() => removeContractItem("colors", index)} aria-label="移除颜色">×</button></div>)}</div></>}
                {!!contract.tokens.spacing.length && <><h4>间距</h4><div className="contract-items compact">{contract.tokens.spacing.map((item, index) => <div key={`${item}-${index}`}><span>{item}px</span><button onClick={() => removeContractItem("spacing", index)} aria-label="移除间距">×</button></div>)}</div></>}
                {!!contract.tokens.radii.length && <><h4>圆角</h4><div className="contract-items compact">{contract.tokens.radii.map((item, index) => <div key={`${item}-${index}`}><span>{item}px</span><button onClick={() => removeContractItem("radii", index)} aria-label="移除圆角">×</button></div>)}</div></>}
                {!!contract.components.length && <><h4>组件</h4><div className="contract-items">{contract.components.map((item, index) => <div key={item.name}><span><b>{item.name}</b>{item.rules[0] && <small>{item.rules[0]}</small>}<ContractEvidenceLink assetIds={item.sourceAssetIds} /></span><button onClick={() => removeContractItem("components", index)} aria-label="移除组件">×</button></div>)}</div></>}
                {!!contract.conflicts.length && <div className="contract-warning"><strong>需要取舍</strong>{contract.conflicts.map((item) => <div className="contract-review-item" key={item}><p>{item}</p><ContractEvidenceLink assetIds={evidenceAssetIds("conflicts", item)} /><label>已选取舍（可选）<input value={reviewDecision("conflicts", item)} onChange={(event) => updateReviewDecision("conflicts", item, event.target.value)} placeholder="写下采用哪一种方向" /></label></div>)}</div>}
                {!!contract.unresolved.length && <div className="contract-unresolved"><strong>仍待确认</strong>{contract.unresolved.map((item) => <div className="contract-review-item" key={item}><p>{item}</p><ContractEvidenceLink assetIds={evidenceAssetIds("unresolved", item)} /><label>确认方式或备注（可选）<input value={reviewDecision("unresolved", item)} onChange={(event) => updateReviewDecision("unresolved", item, event.target.value)} placeholder="写下后续如何确认" /></label></div>)}</div>}
              </div>
              <button className="button primary wide" onClick={() => void confirmBaseline()}>保存为方案卡</button>
            </> : <><p>先从底部工具栏选择“整理方案”，再填写任务并生成预览。</p><button className="button primary wide" onClick={() => openContractSetup()}>开始整理方案</button></>}
          </section>
        ) : selectedIds.length > 1 ? (
          <section className="multi-inspector">
            <small>已选择</small><h2>{selectedIds.length} 张卡片</h2>
            <p>可以批量拆解参考，或从底部工具栏进入“整理方案”。</p>
            <div className="selection-summary">{selectedNodes.map((node) => <div key={node.id}><span>{node.data.workflowStage === "analysis" ? "拆解" : node.data.kind === "image" ? "图片" : "素材"}</span><strong>{node.data.title}</strong></div>)}</div>
            {selectedNodes.some(isAnalyzableNode) && <button className="analyze-button" onClick={() => void analyzeSelected()}><WorkspaceIcon name="analyze" size={16} />拆解所选</button>}
          </section>
        ) : selected ? (
          <>
            <section className="inspect-title"><span className={"inspect-icon " + selected.data.kind}><WorkspaceIcon name={selected.data.note ? "note" : selected.data.kind === "group" ? "folder" : "archive"} /></span><div><small>{selected.data.kind === "group" ? "分组" : selected.data.workflowStage === "analysis" ? "拆解结果" : selected.data.workflowStage === "contract" ? "设计方案" : selected.data.note ? "备注" : "参考素材"}</small><h2>{selected.data.title}</h2></div></section>
            {selected.data.kind === "image" && selected.data.imageUrl && <div className="inspector-image-preview"><img src={String(selected.data.imageUrl)} alt={selected.data.title} /></div>}
            <section className="inspect-block"><h3>基本信息</h3><dl className="asset-facts"><div><dt>类型</dt><dd>{selected.data.workflowStage === "analysis" ? "AI 拆解" : selected.data.kind === "image" ? "图片" : selected.data.kind === "group" ? "分组" : selected.data.note ? "备注" : "参考素材"}</dd></div><div><dt>来源</dt><dd>{selected.data.sourceUrl ? <a href={String(selected.data.sourceUrl)} target="_blank" rel="noreferrer">打开原网页 ↗</a> : selected.data.workflowStage === "analysis" ? "来自画布参考" : "本地导入"}</dd></div><div><dt>状态</dt><dd>{selected.data.status === "processing" ? "正在拆解" : selected.data.status === "ready" ? "已拆解" : "已保存"}</dd></div></dl></section>
            {selected.data.kind === "image" && <button className="analyze-button" onClick={() => openImageEditor(selected)}><WorkspaceIcon name="archive" size={16} />编辑素材</button>}
            {isAnalyzableNode(selected) && <button className="analyze-button secondary" onClick={() => void analyze(selected.id)} disabled={selected.data.status === "processing"}><WorkspaceIcon name="analyze" size={16} />{selected.data.status === "processing" ? "正在拆解" : selected.data.analysisSummary ? "重新拆解" : "拆解参考"}</button>}
            {selected.data.analysisSummary && <section className="inspect-block"><h3>拆解概览</h3><p className="analysis-inspector-summary">{selected.data.analysisSummary}</p></section>}
            {!!selected.data.colors?.length && <section className="inspect-block"><div className="block-heading"><h3>颜色参考</h3><button onClick={() => navigator.clipboard.writeText(selected.data.colors?.join(", ") || "")}>复制全部</button></div><div className="palette-list">{selected.data.colors.map((color) => <button key={color} onClick={() => navigator.clipboard.writeText(color)}><i style={{ background: color }} /><span>颜色</span><code>{color}</code></button>)}</div></section>}
            {!!selected.data.principles?.length && <section className="inspect-block"><h3>可复用的设计要点</h3><ol className="principle-list">{selected.data.principles.map((item) => <li key={item}>{item}</li>)}</ol></section>}
            {!!selected.data.regions?.length && <section className="inspect-block"><div className="block-heading"><h3>识别到的组件</h3><small>整理方案时可筛选</small></div><div className="region-list simple">{selected.data.regions.map((region) => <div key={region.id}><span className="region-preview">{region.type}</span><div><strong>{region.label}</strong><small>{Math.round((region.confidence ?? 0) * 100)}% 可信</small></div></div>)}</div></section>}
            {selected.data.contract && <section className="inspect-block"><div className="block-heading"><h3>已保存的方案</h3><small>{selected.data.contract.sourceAssetIds.length} 张参考</small></div><ol className="principle-list">{selected.data.contract.principles.map((item) => <li key={item}>{item}</li>)}</ol><button className="button soft wide" onClick={() => { setContract(selected.data.contract ?? null); setRightTab("baseline"); }}>查看方案元素</button></section>}
          </>
        ) : <div className="empty-inspector"><WorkspaceIcon name="archive" size={22} /><strong>选中卡片，查看细节</strong><p>素材信息、拆解元素和编辑操作会在这里出现。</p></div>}
      </aside>

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

      {modal === "new-work" && <div className="modal-backdrop" onMouseDown={() => setModal(null)}><form className="modal new-work-modal" onMouseDown={(event) => event.stopPropagation()} onSubmit={(event) => { event.preventDefault(); void createBoard(undefined, newWorkTitle); }}><button type="button" className="modal-close" onClick={() => setModal(null)} aria-label="关闭"><WorkspaceIcon name="close" size={16} /></button><span className="modal-kicker">你的下一次灵感记录</span><h2>新建作品</h2><p>每件作品对应一张独立画布，参考、连线和方案会保存在这件作品里。</p><label htmlFor="new-work-title">作品名称</label><input id="new-work-title" autoFocus maxLength={120} value={newWorkTitle} onChange={(event) => setNewWorkTitle(event.target.value)} placeholder="例如：旅行品牌视觉探索" /><footer><button type="button" className="button soft" onClick={() => setModal(null)}>取消</button><button type="submit" className="button primary" disabled={!newWorkTitle.trim()}>创建作品</button></footer></form></div>}

      {modal === "import" && (
        <div className="modal-backdrop" onMouseDown={() => { if (!uploadState) setModal(null); }}>
          <section className="modal import-modal" role="dialog" aria-modal="true" aria-labelledby="import-modal-title" onMouseDown={(event) => event.stopPropagation()}>
            <button type="button" className="modal-close" onClick={() => setModal(null)} aria-label="关闭" disabled={Boolean(uploadState)}><WorkspaceIcon name="close" size={17} /></button>
            {uploadState ? <div className="import-loading" role="status" aria-live="polite">
              <img src="/inspo-sprite.png" alt="" className="import-loading-mascot" />
              <span className="import-loading-spinner" aria-hidden="true" />
              <h2 id="import-modal-title">正在加载中</h2>
              <p>小in正在把素材放进画布，请稍等片刻。</p>
              <small>{uploadState.name}{uploadState.total > 1 ? ` · ${uploadState.completed}/${uploadState.total} 个已处理` : ""}</small>
            </div> : <>
            <header className="import-modal-header">
              <img className="import-modal-mascot" src="/inspo-sprite.png" alt="小in" />
              <div>
                <h2 id="import-modal-title">添加节点</h2>
                <p>图片、视频、音频、网页与文字都会保留在当前个人空间。</p>
              </div>
            </header>
            <div className="import-choice">
              <button type="button" className="import-drop" onClick={() => fileInput.current?.click()}>
                <span className="import-drop-icon"><WorkspaceIcon name="upload" size={22} /></span>
                <strong>上传本地素材</strong>
                <small>图片最大 20 MB；视频和音频最大 100 MB</small>
              </button>
              <button type="button" className="import-drop folder-drop" onClick={() => folderInput.current?.click()}>
                <span className="import-drop-icon"><WorkspaceIcon name="folder" size={22} /></span>
                <strong>导入文件夹</strong>
                <small>自动建立同名分组，保留图片、视频和音频</small>
              </button>
            </div>
            <div className="url-entry">
              <input aria-label="公开网页链接" autoFocus value={urlValue} onChange={(event) => setUrlValue(event.target.value)} placeholder="粘贴公开网页链接" />
              <button type="button" onClick={() => urlValue.trim() && void addAsset(urlValue.trim())}>添加</button>
            </div>
            </>}
          </section>
        </div>
      )}



      {redesignImage && <div className="modal-backdrop" role="presentation" onMouseDown={(event) => { if (event.target === event.currentTarget && !redesignBusy) setRedesignImage(null); }}>
        <section className="modal redesign-dialog" role="dialog" aria-modal="true" aria-label="AI 改造图片">
          <header><div><span className="modal-kicker">从图片继续创作</span><h2>AI 改造图片</h2><p>描述想改变的内容。原图会保留，生成结果作为新卡片加入画布。</p></div><button onClick={() => setRedesignImage(null)} disabled={redesignBusy} aria-label="关闭">×</button></header>
          <div className="redesign-dialog-preview"><img src={redesignImage.sourceUrl} alt="待改造的原图" /><span><strong>{redesignImage.title}</strong><small>原始素材 · 生成新版本</small></span></div>
          <label htmlFor="redesign-prompt">你希望如何改造这张图片？</label>
          <textarea id="redesign-prompt" autoFocus maxLength={600} value={redesignPrompt} onChange={(event) => setRedesignPrompt(event.target.value)} placeholder="例如：保留人物姿态，把背景改为柔和的紫色渐变，并加入轻盈的光影。" />
          {redesignError && <p className="redesign-dialog-error" role="alert">{redesignError}</p>}
          <footer><small>{redesignPrompt.length}/600 · 生成可能需要一点时间</small><div><button onClick={() => setRedesignImage(null)} disabled={redesignBusy}>取消</button><button className="primary" onClick={() => void submitImageRedesign()} disabled={redesignBusy || redesignPrompt.trim().length < 5}>{redesignBusy ? "正在改造…" : "生成新版本"}</button></div></footer>
        </section>
      </div>}

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

function supportedLocalMedia(file: File) {
  if (/^image\/(jpeg|png|webp)$/.test(file.type)) return file.size <= 20 * 1024 * 1024;
  if (/^(video\/(mp4|webm|quicktime)|audio\/(mpeg|wav|ogg|mp4))$/.test(file.type)) return file.size <= 100 * 1024 * 1024;
  return false;
}

async function importedImageSize(file: File) {
  let bitmap: ImageBitmap | undefined;
  try {
    bitmap = await createImageBitmap(file);
    const aspect = bitmap.width / bitmap.height;
    const width = aspect >= 1.25 ? 360 : 300;
    return { width, height: clamp(Math.round(width / aspect), 180, 480) + 104 };
  } catch {
    return defaultSize.image;
  } finally {
    bitmap?.close();
  }
}

function clamp(value: number, minimum: number, maximum: number) {
  return Math.min(maximum, Math.max(minimum, value));
}

function miniMapNodeColor(node: CanvasNode) {
  if (node.data.kind === "group") return "#dcd4e7";
  if (node.data.kind === "web") return "#c9d8ef";
  if (node.data.kind === "image") return "#e7cbd9";
  if (node.data.kind === "video") return "#cfb998";
  if (node.data.kind === "audio") return "#a8c8cf";
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

function nodeMatchesSearchKind(node: CanvasNode, kind: SearchKind) {
  if (kind === "all") return true;
  if (kind === "contract") return node.data.workflowStage === "contract";
  if (kind === "analysis") return node.data.workflowStage === "analysis" || node.data.kind === "analysis";
  return node.data.kind === kind && !node.data.workflowStage;
}

function nodeSearchIcon(node: CanvasNode) {
  if (node.data.workflowStage === "analysis") return "✦";
  if (node.data.workflowStage === "contract") return "◇";
  return node.data.kind === "image" ? "▧" : node.data.kind === "video" ? "▷" : node.data.kind === "audio" ? "♪" : node.data.kind === "web" ? "◎" : node.data.kind === "group" ? "▱" : "≡";
}

function nodeSearchSummary(node: CanvasNode) {
  if (node.data.workflowStage === "analysis") return `来自 ${String(node.data.sourceTitle || "参考")} · 拆解结果`;
  if (node.data.workflowStage === "contract") return `${node.data.contract?.sourceAssetIds.length || 0} 张参考 · 点击输出`;
  if (node.data.kind === "group") return String(node.data.body || "分组");
  return String(node.data.sourceUrl || node.data.body || node.data.tags?.join(" · ") || "无补充说明").slice(0, 90);
}

function absoluteNodePosition(nodes: CanvasNode[], node: CanvasNode) {
  if (!node.parentId) return node.position;
  const parent = nodes.find((item) => item.id === node.parentId);
  return parent ? { x: parent.position.x + node.position.x, y: parent.position.y + node.position.y } : node.position;
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
      analysisProvider: result.model?.provider ?? String(analysis.provider || ""),
      analysisModel: result.model?.id ?? String(analysis.model || ""),
      analysisPromptVersion: result.promptVersion,
      analysisRunMode: result.runMode,
    },
  };
}

function friendlyAnalysisError(value: unknown) {
  if (typeof value !== "string" || !value.trim()) return "拆解失败，请重试。";
  const message = value.trim();
  if (/aborted|aborterror|timed? out|timeout/i.test(message)) return "视觉分析超时。系统已保留素材，请缩小截图后重试。";
  if (/JSON 无法解析|invalid_(?:type|value)|expected|zod|too_(?:big|small)|\[\s*\{/i.test(message) || message.length > 260) {
    return "模型返回的分析格式不完整，系统已保留原素材。请稍后重试。";
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
