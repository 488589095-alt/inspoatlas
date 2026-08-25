import type { Edge, Node, Viewport } from "@xyflow/react";
import type { BoardSceneV2, DesignContract, Relation } from "@/packages/domain/src";

export type CardKind = "image" | "video" | "audio" | "web" | "text" | "analysis" | "element" | "group";
export type CardData = Record<string, unknown> & {
  kind: CardKind;
  title: string;
  body?: string;
  note?: boolean;
  imageUrl?: string;
  screenshotPartCount?: number;
  sourceUrl?: string;
  assetId?: string;
  derivativeId?: string;
  sourceAssetId?: string;
  sourceTitle?: string;
  status?: string;
  error?: string;
  tags?: string[];
  colors?: string[];
  inferred?: boolean;
  analysisId?: string;
  analysisSummary?: string;
  analysisExpanded?: boolean;
  analysisError?: string;
  analysisProvider?: string;
  analysisModel?: string;
  analysisPromptVersion?: string;
  analysisRunMode?: "managed" | "byok";
  analysisFeedback?: "helpful" | "needs-work";
  workflowStage?: "analysis" | "contract";
  contract?: DesignContract;
  preview?: boolean;
  principles?: string[];
  regions?: Array<{
    id: string;
    label: string;
    type: string;
    rect?: { x: number; y: number; width: number; height: number };
    confidence?: number;
    confirmed?: boolean;
  }>;
};
export type CanvasNode = Node<CardData>;
export type BoardSummary = { id: string; title: string; version: number; updatedAt: string; createdAt?: string };

type SceneAnalysisData = Pick<
  CardData,
  "analysisId" | "analysisSummary" | "status" | "analysisError" | "principles" | "colors" | "tags" | "regions"
>;

export function sceneToFlow(scene: BoardSceneV2): { nodes: CanvasNode[]; edges: Edge[]; viewport?: Viewport } {
  const analysisByAsset = new Map<string, SceneAnalysisData>();
  for (const item of scene.nodes) {
    if (item.kind !== "analysis") continue;
    const assetId = String(item.data.sourceAssetId || "");
    if (!assetId) continue;
    analysisByAsset.set(assetId, {
      analysisId: typeof item.data.analysisId === "string" ? item.data.analysisId : undefined,
      analysisSummary: typeof item.data.analysisSummary === "string" ? item.data.analysisSummary : typeof item.data.body === "string" ? item.data.body : undefined,
      status: typeof item.data.status === "string" ? item.data.status : undefined,
      analysisError: typeof item.data.error === "string" ? item.data.error : undefined,
      principles: Array.isArray(item.data.principles) ? item.data.principles as string[] : undefined,
      colors: Array.isArray(item.data.colors) ? item.data.colors as string[] : undefined,
      tags: Array.isArray(item.data.tags) ? item.data.tags as string[] : undefined,
      regions: Array.isArray(item.data.regions) ? item.data.regions as CardData["regions"] : undefined,
    });
  }

  const nodes = scene.nodes.map((item): CanvasNode => {
    const assetId = String(item.data.assetId || item.id);
    return {
      id: item.id,
      type: "inspo",
      position: item.position,
      parentId: item.parentId,
      extent: item.parentId ? "parent" : undefined,
      data: {
        ...item.data,
        ...analysisByAsset.get(assetId),
        kind: item.kind,
        workflowStage: item.kind === "analysis"
          ? "analysis"
          : item.data.workflowStage === "analysis" || item.data.workflowStage === "contract"
            ? item.data.workflowStage
            : undefined,
        title: String(item.data.title || "未命名"),
      },
      style: { width: item.width, height: item.height },
      zIndex: item.kind === "group" ? -20 : 10,
    };
  });
  const edges = scene.relations
    .filter((item) => item.status !== "rejected")
    .map(relationToEdge);
  return { nodes, edges, viewport: scene.viewport };
}

export function relationToEdge(item: Relation): Edge {
  const sourceRelation = item.layer === "provenance";
  return {
    id: item.id,
    source: item.sourceId,
    target: item.targetId,
    label: item.explanation || relationLabel[item.type] || item.type,
    type: "relation",
    zIndex: 0,
    animated: item.status === "suggested",
    data: item,
    style: {
      stroke: sourceRelation ? "#879b80" : "#64746d",
      strokeWidth: sourceRelation ? 2 : 1.5,
      strokeDasharray: item.status === "suggested" ? "6 5" : undefined,
    },
  };
}

export function flowToScene(nodes: CanvasNode[], edges: Edge[], viewport: Viewport): BoardSceneV2 {
  const relations = edges.flatMap((edge) => {
    const value = edge.data as Relation | undefined;
    return value
      ? [{ ...value, id: edge.id, sourceId: edge.source, targetId: edge.target }]
      : [];
  });
  return {
    schemaVersion: 2,
    nodes: nodes.map((node) => ({
      id: node.id,
      kind: node.data.kind,
      position: node.position,
      width: Number(node.measured?.width ?? node.width ?? node.style?.width ?? 286),
      height: Number(node.measured?.height ?? node.height ?? node.style?.height ?? 180),
      parentId: node.parentId,
      pinned: Boolean(node.data.pinned),
      collapsed: Boolean(node.data.collapsed),
      data: { ...node.data, analysisExpanded: false, preview: false },
    })),
    relations,
    viewport,
  };
}

export const relationLabel: Record<string, string> = {
  "analysis-of": "分析来源",
  "element-of": "来自素材",
  "contract-derived-from": "支持这条规则",
  "similar-style": "相似风格",
  "same-component": "相同结构",
  complements: "关联",
  contrasts: "对比参考",
  "same-project": "同一项目",
};

export async function saveDraft(boardId: string, payload: unknown) {
  if (!("indexedDB" in window)) return;
  await new Promise<void>((resolve, reject) => {
    const request = indexedDB.open("inspoatlas-drafts", 1);
    request.onupgradeneeded = () => request.result.createObjectStore("scenes");
    request.onerror = () => reject(request.error);
    request.onsuccess = () => {
      const tx = request.result.transaction("scenes", "readwrite");
      tx.objectStore("scenes").put(payload, boardId);
      tx.oncomplete = () => resolve();
      tx.onerror = () => reject(tx.error);
    };
  });
}

export async function readDraft<T>(boardId: string): Promise<T | undefined> {
  if (!("indexedDB" in window)) return undefined;
  return await new Promise<T | undefined>((resolve) => {
    const request = indexedDB.open("inspoatlas-drafts", 1);
    request.onupgradeneeded = () => request.result.createObjectStore("scenes");
    request.onerror = () => resolve(undefined);
    request.onsuccess = () => {
      const tx = request.result.transaction("scenes");
      const get = tx.objectStore("scenes").get(boardId);
      get.onsuccess = () => resolve(get.result as T | undefined);
      get.onerror = () => resolve(undefined);
    };
  });
}
