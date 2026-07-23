import type { Edge, Node, Viewport } from "@xyflow/react";
import type { BoardSceneV2, Relation } from "@/packages/domain/src";

export type CardKind = "image" | "web" | "text" | "analysis" | "element" | "group";
export type CardData = Record<string, unknown> & {
  kind: CardKind;
  title: string;
  body?: string;
  imageUrl?: string;
  sourceUrl?: string;
  assetId?: string;
  sourceAssetId?: string;
  sourceTitle?: string;
  status?: string;
  error?: string;
  tags?: string[];
  colors?: string[];
  inferred?: boolean;
  analysisId?: string;
  principles?: string[];
  regions?: Array<{ id: string; label: string; type: string; rect?: { x: number; y: number; width: number; height: number }; confidence?: number; confirmed?: boolean }>;
};
export type CanvasNode = Node<CardData>;
export type BoardSummary = { id: string; title: string; version: number; updatedAt: string; createdAt?: string };

export function sceneToFlow(scene: BoardSceneV2): { nodes: CanvasNode[]; edges: Edge[]; viewport?: Viewport } {
  const nodes = scene.nodes.map((item): CanvasNode => ({
    id: item.id, type: "inspo", position: item.position, parentId: item.parentId,
    extent: item.parentId ? "parent" : undefined,
    draggable: item.kind !== "analysis",
    data: { ...item.data, kind: item.kind, title: String(item.data.title || "未命名") },
    style: { width: item.width, height: item.height },
    zIndex: item.kind === "group" ? -1 : item.kind === "analysis" ? 3 : 2,
  }));
  const edges = scene.relations.filter((item) => item.status !== "rejected").map(relationToEdge);
  return { nodes, edges, viewport: scene.viewport };
}

export function relationToEdge(item: Relation): Edge {
  const evidence = item.layer === "provenance";
  return {
    id: item.id, source: item.sourceId, target: item.targetId,
    label: relationLabel[item.type] ?? item.type,
    zIndex: 4, animated: item.status === "suggested",
    data: item,
    style: { stroke: evidence ? "#64576f" : "#9b8aaa", strokeWidth: evidence ? 2 : 1.5, strokeDasharray: item.status === "suggested" || !evidence ? "6 5" : undefined },
  };
}

export function flowToScene(nodes: CanvasNode[], edges: Edge[], viewport: Viewport): BoardSceneV2 {
  const relations = edges.flatMap((edge) => {
    const value = edge.data as Relation | undefined;
    return value ? [{ ...value, id: edge.id, sourceId: edge.source, targetId: edge.target }] : [];
  });
  return {
    schemaVersion: 2,
    nodes: nodes.map((node) => ({
      id: node.id, kind: node.data.kind, position: node.position,
      width: Number(node.measured?.width ?? node.width ?? node.style?.width ?? 286),
      height: Number(node.measured?.height ?? node.height ?? node.style?.height ?? 180),
      parentId: node.parentId, pinned: Boolean(node.data.pinned), collapsed: Boolean(node.data.collapsed),
      data: { ...node.data },
    })),
    relations, viewport,
  };
}

export const relationLabel: Record<string, string> = {
  "analysis-of": "分析来源", "element-of": "元素来源", "contract-derived-from": "合同证据",
  "similar-style": "同视觉语言", "same-component": "同组件模式", complements: "互补",
  contrasts: "对比", "same-project": "同项目",
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
      tx.oncomplete = () => resolve(); tx.onerror = () => reject(tx.error);
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
      get.onsuccess = () => resolve(get.result as T | undefined); get.onerror = () => resolve(undefined);
    };
  });
}
