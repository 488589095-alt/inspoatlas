import type { CanvasNode } from "./model";

export type OrganizePreview = {
  nodes: CanvasNode[];
  groups: Array<{ id: string; title: string; count: number; reason: string }>;
  movedCount: number;
  scope: "selection" | "board";
};

const groupDefinitions = {
  overall: { title: "整体视觉参考", reason: "用于判断整体气质、密度和画面语言" },
  structure: { title: "页面结构与版式", reason: "用于参考布局、信息层级和导航结构" },
  component: { title: "组件与交互细节", reason: "用于参考按钮、卡片、输入框和局部模式" },
  brand: { title: "品牌与视觉语言", reason: "用于参考颜色、字体、材质和品牌特征" },
  content: { title: "内容与文案", reason: "用于参考标题、语气、信息组织和内容策略" },
} as const;

type GroupKey = keyof typeof groupDefinitions;

export function buildOrganizePreview(nodes: CanvasNode[], selectedIds: string[]): OrganizePreview | null {
  const selected = new Set(selectedIds);
  const selectionScope = selectedIds.some((id) => nodes.some((node) => node.id === id && node.data.kind !== "group"));
  const eligible = nodes.filter((node) =>
    !node.parentId &&
    node.data.kind !== "group" &&
    node.data.kind !== "analysis" &&
    !node.data.pinned &&
    (!selectionScope || selected.has(node.id)),
  );
  if (eligible.length < 2) return null;

  const buckets = new Map<GroupKey, CanvasNode[]>();
  for (const node of eligible) {
    const key = inferGroup(node);
    buckets.set(key, [...(buckets.get(key) ?? []), node]);
  }

  const minX = Math.min(...eligible.map((node) => node.position.x));
  const minY = Math.min(...eligible.map((node) => node.position.y));
  const eligibleIds = new Set(eligible.map((node) => node.id));
  const untouched = nodes.filter((node) => !eligibleIds.has(node.id));
  const arranged: CanvasNode[] = [];
  const previewGroups: OrganizePreview["groups"] = [];
  let cursorX = minX;
  let cursorY = minY;
  let rowHeight = 0;
  let column = 0;

  for (const [key, members] of buckets) {
    const definition = groupDefinitions[key];
    const groupId = `preview-group-${key}-${crypto.randomUUID()}`;
    const layout = layoutMembers(members, groupId);
    const groupWidth = layout.width;
    const groupHeight = layout.height;

    if (column === 2) {
      column = 0;
      cursorX = minX;
      cursorY += rowHeight + 52;
      rowHeight = 0;
    }

    const analyzedCount = members.filter((node) => Boolean(node.data.analysisId || node.data.analysisSummary || node.data.principles?.length)).length;
    const group: CanvasNode = {
      id: groupId,
      type: "inspo",
      position: { x: cursorX, y: cursorY },
      data: {
        kind: "group",
        title: definition.title,
        body: analyzedCount
          ? `AI 根据 ${analyzedCount} 张卡片的拆解结果归纳 · ${definition.reason}`
          : `根据卡片内容归纳 · ${definition.reason}`,
        groupOrigin: analyzedCount ? "ai-assisted" : "smart",
        preview: true,
      },
      style: { width: groupWidth, height: groupHeight },
      zIndex: -20,
      selectable: false,
    };
    arranged.push(group, ...layout.nodes);
    previewGroups.push({ id: groupId, title: definition.title, count: members.length, reason: definition.reason });
    cursorX += groupWidth + 46;
    rowHeight = Math.max(rowHeight, groupHeight);
    column += 1;
  }

  return {
    nodes: [...untouched.map((node) => ({ ...node, data: { ...node.data, preview: false } })), ...arranged],
    groups: previewGroups,
    movedCount: eligible.length,
    scope: selectionScope ? "selection" : "board",
  };
}

function inferGroup(node: CanvasNode): GroupKey {
  const text = [
    node.data.title,
    node.data.body,
    ...(node.data.tags ?? []),
    ...(node.data.principles ?? []),
  ].join(" ").toLowerCase();
  if (node.data.kind === "element" || /按钮|卡片|输入|导航|组件|button|card|input|component|icon/.test(text)) return "component";
  if (/布局|版式|网格|结构|层级|留白|layout|grid|structure|spacing/.test(text)) return "structure";
  if (/品牌|字体|颜色|色彩|材质|光影|brand|font|color|palette|material/.test(text)) return "brand";
  if (node.data.kind === "text" || /文案|标题|语气|内容|copy|headline|content|tone/.test(text)) return "content";
  return "overall";
}

function layoutMembers(members: CanvasNode[], parentId: string) {
  const gap = 22;
  const paddingX = 28;
  const paddingTop = 72;
  const paddingBottom = 28;
  const columnWidths = [0, 0];
  const rows: Array<{ nodes: CanvasNode[]; height: number }> = [];

  for (let index = 0; index < members.length; index += 2) {
    const rowNodes = members.slice(index, index + 2);
    rowNodes.forEach((node, column) => {
      columnWidths[column] = Math.max(columnWidths[column], nodeWidth(node));
    });
    rows.push({ nodes: rowNodes, height: Math.max(...rowNodes.map(nodeHeight)) });
  }

  const width = paddingX * 2 + columnWidths[0] + (columnWidths[1] ? gap + columnWidths[1] : 0);
  let y = paddingTop;
  const arranged: CanvasNode[] = [];
  for (const row of rows) {
    row.nodes.forEach((node, column) => {
      const x = paddingX + (column === 1 ? columnWidths[0] + gap : 0);
      arranged.push({
        ...node,
        parentId,
        extent: "parent",
        position: { x, y },
        selected: false,
        data: { ...node.data, preview: true },
        zIndex: 10,
      });
    });
    y += row.height + gap;
  }
  return { nodes: arranged, width: Math.max(360, width), height: Math.max(240, y - gap + paddingBottom) };
}

function nodeWidth(node: CanvasNode) {
  return Number(node.measured?.width ?? node.width ?? node.style?.width ?? 286);
}

function nodeHeight(node: CanvasNode) {
  return Number(node.measured?.height ?? node.height ?? node.style?.height ?? 180);
}
