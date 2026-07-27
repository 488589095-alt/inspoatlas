import { and, eq } from "drizzle-orm";
import { strToU8, zipSync } from "fflate";
import { designContractSchema, exportRequestSchema, type DesignContract, type ExportPurpose } from "@/packages/domain/src";
import { ensureCoreTables, getDb } from "@/db";
import { assets, boards, confirmedElements, designContracts } from "@/db/schema";
import { currentUser, errorResponse, HttpError } from "../_lib";

export async function POST(request: Request) {
  try {
    const user = currentUser(request); const input = exportRequestSchema.parse(await request.json());
    await ensureCoreTables(); const db = getDb();
    const [board] = await db.select().from(boards).where(and(eq(boards.id, input.boardId), eq(boards.ownerId, user.id))).limit(1);
    if (!board) throw new HttpError(404, "画布不存在");
    const [stored] = await db.select().from(designContracts).where(and(eq(designContracts.boardId, board.id), eq(designContracts.ownerId, user.id))).limit(1);
    if (!stored || stored.status !== "confirmed") throw new HttpError(409, "请先生成并确认设计系统合同");
    const contract = designContractSchema.parse(stored.content);
    const sourceRows = await db.select().from(assets).where(and(eq(assets.boardId, board.id), eq(assets.ownerId, user.id)));
    const elements = await db.select().from(confirmedElements).where(and(eq(confirmedElements.boardId, board.id), eq(confirmedElements.ownerId, user.id)));
    const context: ExportContext = { purpose: input.purpose, goal: input.goal, destination: input.destination, title: contract.title, version: stored.version };
    const taskFiles = { ...buildFiles(input.purpose, contract, stored.version, sourceRows, elements), ...destinationFiles(context, contract) };
    const manifest = JSON.stringify({ schemaVersion: 1, ...context, files: Object.keys(taskFiles), generatedAt: new Date().toISOString() }, null, 2);
    const files = { "START_HERE.html": startHereHtml(context, Object.keys(taskFiles)), "manifest.json": manifest, ...taskFiles };
    const archive = zipSync(Object.fromEntries(Object.entries(files).map(([name, body]) => [name, strToU8(body)])), { level: 6 });
    return new Response(archive, {
      headers: {
        "content-type": "application/zip",
        "content-disposition": 'attachment; filename="inspoatlas-' + input.purpose + '-v' + stored.version + '.zip"',
        "cache-control": "no-store",
      },
    });
  } catch (error) { return errorResponse(error); }
}

type AssetRow = typeof assets.$inferSelect;
type ElementRow = typeof confirmedElements.$inferSelect;

type ExportContext = {
  purpose: ExportPurpose;
  goal?: string;
  destination?: string;
  title: string;
  version: number;
};

const goalLabels: Record<string, string> = {
  recreate: "复现参考设计",
  explore: "生成一个新方向",
  scale: "建立批量生产系统",
};

const destinationGuides: Record<string, { label: string; summary: string; next: string; primary: string }> = {
  "figma-design": {
    label: "Figma Design",
    summary: "把确认后的设计规则和元素带进 Figma 继续编辑。",
    next: "打开目标 Figma 文件，运行 InspoAtlas Bridge，再选择 figma-import.json。批量模板请同时查看 figma/template-slots.json。",
    primary: "figma-import.json",
  },
  "coding-ai": {
    label: "编码 AI",
    summary: "把结构、设计规则和检查标准交给 Codex、Claude Code 或 Cursor。",
    next: "打开 COPY_TO_AI.txt，复制整段任务；让 AI 先输出预检和结构映射，确认后再实现。",
    primary: "COPY_TO_AI.txt",
  },
  "image-ai": {
    label: "图片 AI",
    summary: "用参考的视觉规律生成新构图和系列方向。",
    next: "打开 COPY_TO_IMAGE_AI.txt，从保守变体开始生成，再根据结果调整可变项。",
    primary: "COPY_TO_IMAGE_AI.txt",
  },
  "figma-make": {
    label: "Figma Make",
    summary: "在 Figma 的 AI 生成环境中快速探索新的网页或界面方向。",
    next: "新建 Figma Make 文件，复制 make/Guidelines.md 的内容，并添加你的参考图。",
    primary: "make/Guidelines.md",
  },
  "figma-buzz": {
    label: "Figma Buzz",
    summary: "用同一个模板批量制作海报、横幅和社媒图。",
    next: "在 Figma Buzz 选择一张模板，上传 buzz/content-template.csv；如果需要批量替换图片，请把内容表保存为 XLSX。",
    primary: "buzz/content-template.csv",
  },
};

function destinationFiles(context: ExportContext, contract: DesignContract): Record<string, string> {
  const principles = contract.principles.map((item) => "- " + item).join("\n");
  if (context.destination === "figma-make") {
    return {
      "make/Guidelines.md": "# InspoAtlas × Figma Make\n\n## 目标\n\n根据新的设计目标生成原创界面，不复制来源品牌、Logo 和原文案。\n\n## 必须保持\n\n" + principles + "\n\n## 使用方式\n\n1. 先输出页面结构和组件清单。\n2. 等待确认后再生成界面。\n3. 优先使用已添加的 Figma Variables、Styles 和组件。\n4. 完成后检查结构、视觉和响应式。\n",
      "FIGMA_MAKE_START.md": "# 在 Figma Make 中使用\n\nFigma Make 是 Figma 里的 AI 生成工具。新建 Make 文件后，粘贴 make/Guidelines.md，并加入参考图和你的具体设计目标。\n",
    };
  }
  if (context.destination === "figma-buzz") {
    return {
      "buzz/content-template.csv": "name,headline,subheading,cta,date,image_filename\n示例-A,夏日灵感计划,用同一套模板快速生成系列物料,立即了解,2026-08-01,hero-a.jpg\n示例-B,秋季新品发布,替换内容但保持品牌规则一致,查看新品,2026-09-15,hero-b.jpg\n",
      "BUZZ_START.md": "# 用 Figma Buzz 批量做物料\n\nFigma Buzz 适合海报、横幅和社媒图，不适合复杂网页。先准备一张模板，再上传 buzz/content-template.csv，把列名连接到对应文字区域。CSV 只能批量替换文字；需要批量图片时请使用 XLSX。\n",
    };
  }
  if (context.destination === "figma-design" && context.purpose === "campaign-system") {
    return {
      "figma/template-slots.json": JSON.stringify({
        schemaVersion: 1,
        explanation: "Slots 是模板里的可替换内容区。它限定什么可以换、可以放多少内容，以及超出时怎么处理。",
        slots: [
          { id: "hero-title", label: "主标题", type: "text", required: true, maxCharacters: 28, overflow: "wrap-2-lines" },
          { id: "hero-media", label: "主视觉", type: "image", required: true, aspectRatio: "16:9", overflow: "crop" },
          { id: "benefit-list", label: "权益列表", type: "component-list", minItems: 2, maxItems: 4, preferredComponents: ["Benefit/Card"] },
          { id: "primary-cta", label: "主按钮", type: "component", required: true, preferredComponents: ["Button/Primary"] },
        ],
      }, null, 2),
      "FIGMA_TEMPLATE_START.md": "# Figma 模板与可替换内容区\n\nSlots 可以理解成模板里的预留位置：标题区只换标题、主图区只换图片、权益区只能放指定卡片。这样编辑者可以换内容，但不容易破坏整体版式。\n",
    };
  }
  if (context.destination === "coding-ai") {
    return {
      "COPY_TO_AI.txt": "请读取本任务包中的 DESIGN.md、STRUCTURE.md、MAPPING.md、components.md 与 sources.json。先做规范预检和来源映射，不要立即写代码。确认后再实现，并依次执行 STRUCTURE_QA.md 与 DESIGN_QA.md。没有来源证据的模块、字体、颜色和交互不要擅自补齐。",
    };
  }
  if (context.destination === "image-ai") {
    return {
      "COPY_TO_IMAGE_AI.txt": "请读取 IMAGE_PROMPT.md、composition.md、NEGATIVE_PROMPT.md、palette.json 与 sources.json。基于新的设计目标生成原创视觉，不复制来源品牌、Logo、受版权保护角色或原文案。先生成保守变体，再生成同风格新构图和系列延展。",
    };
  }
  return {};
}

function startHereHtml(context: ExportContext, files: string[]) {
  const destination = destinationGuides[context.destination || "coding-ai"] ?? destinationGuides["coding-ai"];
  const goal = goalLabels[context.goal || "recreate"] || "继续设计";
  const fileList = files.map((file) => "<li><code>" + escapeHtml(file) + "</code></li>").join("");
  const primaryExists = files.includes(destination.primary);
  const primaryLink = primaryExists
    ? '<a class="primary" href="' + encodeURI(destination.primary) + '">打开第一步文件</a>'
    : "";
  return '<!doctype html><html lang="zh-CN"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>' + escapeHtml(context.title) + ' · 从这里开始</title><style>' +
    ':root{font-family:Inter,"PingFang SC","Microsoft YaHei",sans-serif;color:#353039;background:#f3f0f7}*{box-sizing:border-box}body{margin:0;padding:40px 20px}.shell{max-width:840px;margin:auto}.kicker{color:#806ca1;font-size:12px;font-weight:800;letter-spacing:.12em}h1{margin:8px 0 10px;font-size:34px}p{color:#706875;line-height:1.7}.card{margin-top:18px;padding:22px;border:1px solid #e2dce7;border-radius:20px;background:#fff;box-shadow:0 18px 50px rgba(70,52,88,.08)}.route{display:grid;grid-template-columns:1fr auto 1fr;gap:14px;align-items:center}.route div{padding:15px;border-radius:14px;background:#f7f4fa}.route small{display:block;color:#958c9b}.route strong{display:block;margin-top:5px}.arrow{color:#8b75a7}.next{padding:16px;border-radius:14px;background:#eee8f5;color:#51465b}.primary{display:inline-block;margin-top:14px;padding:11px 16px;border-radius:12px;color:#fff;background:#725e91;text-decoration:none;font-weight:700}details{margin-top:18px}summary{cursor:pointer;font-weight:700}code{color:#675574}li{margin:7px 0}@media(max-width:640px){body{padding:24px 14px}.route{grid-template-columns:1fr}.arrow{transform:rotate(90deg);text-align:center}h1{font-size:28px}}' +
    '</style></head><body><main class="shell"><span class="kicker">INSPOATLAS · 从这里开始</span><h1>' + escapeHtml(context.title) + '</h1><p>这个页面会告诉你这次导出是什么、下一步做什么。你不需要先理解包里的 JSON 或 Markdown。</p>' +
    '<section class="card"><div class="route"><div><small>你想完成</small><strong>' + escapeHtml(goal) + '</strong></div><span class="arrow">→</span><div><small>接下来使用</small><strong>' + escapeHtml(destination.label) + '</strong></div></div><p>' + escapeHtml(destination.summary) + '</p><div class="next"><strong>下一步</strong><p>' + escapeHtml(destination.next) + '</p></div>' + primaryLink + '</section>' +
    '<details class="card"><summary>查看包内文件</summary><ul>' + fileList + '</ul></details>' +
    '<p>合同版本 ' + context.version + ' · 关键结论应回到 sources.json 核验。推断项在确认前不要当作正式规范。</p></main></body></html>';
}

function escapeHtml(value: string) {
  return value.replace(/[&<>"']/g, (char) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#039;" })[char] || char);
}

function buildFiles(purpose: ExportPurpose, contract: DesignContract, version: number, sourceRows: AssetRow[], elements: ElementRow[]): Record<string, string> {
  const sourceMap = sourceRows.map((item) => ({
    assetId: item.id, title: item.title, kind: item.kind, sourceUrl: item.sourceUrl,
    capturedAt: item.createdAt, contractVersion: version,
    evidenceState: item.kind === "web" && (item.metadata as Record<string, unknown>)?.styles ? "实测与视觉推断混合" : "视觉推断",
  }));
  const sources = JSON.stringify({ schemaVersion: 1, generatedAt: new Date().toISOString(), sources: sourceMap, confirmedElements: elements.map((item) => ({ id: item.id, assetId: item.assetId, regionId: item.regionId, label: item.label, type: item.type, rect: item.rect, state: "人工确认" })) }, null, 2);
  const design = designMarkdown(contract, version);
  const tokens = JSON.stringify(contract.tokens, null, 2);
  const css = ":root {\n" + contract.tokens.colors.map((item) => "  --" + item.name.replaceAll("/", "-") + ": " + item.value + "; /* evidence: " + item.sourceAssetIds.join(", ") + " */").join("\n") + "\n" + contract.tokens.spacing.map((value, index) => "  --space-" + (index + 1) + ": " + value + "px;").join("\n") + "\n" + contract.tokens.radii.map((value, index) => "  --radius-" + (index + 1) + ": " + value + "px;").join("\n") + "\n}";
  const components = "# 组件规则\n\n" + (contract.components.length ? contract.components.map((item) => "## " + item.name + "\n\n" + item.rules.map((rule) => "- " + rule).join("\n") + "\n\n证据：" + item.sourceAssetIds.join("、")).join("\n\n") : "当前没有已确认组件；不得凭空补齐。");
  const common = { "DESIGN.md": design, "sources.json": sources };
  if (purpose === "visual-remix") return {
    "IMAGE_PROMPT.md": "# 图片 / 品牌延展提示词\n\n" + contract.principles.map((item) => "- " + item).join("\n") + "\n\n色彩：" + contract.tokens.colors.map((item) => item.value).join(" / ") + "\n\n根据目标品牌替换主体与文案，保留已确认的构图、材质、光线与色彩逻辑，不复制原品牌内容。",
    "PROMPT_VARIANTS.md": "# 受控变体\n\n1. 保守变体：仅替换主体和文案。\n2. 同风格新构图：保持色彩、材质和光线规则。\n3. 系列延展：输出主视觉、横幅和社媒卡片，逐项执行一致性 QA。",
    "NEGATIVE_PROMPT.md": "# 禁止项\n\n" + [...contract.donts, ...contract.conflicts, "禁止复制来源品牌标识、受版权保护角色和原文案", "禁止引入合同中没有证据的字体、阴影和装饰"].map((item) => "- " + item).join("\n"),
    "palette.json": JSON.stringify(contract.tokens.colors, null, 2),
    "composition.md": "# 构图、材质与光线\n\n" + contract.principles.map((item) => "- " + item).join("\n") + "\n\n未确认项：\n" + contract.unresolved.map((item) => "- " + item).join("\n"),
    "sources.json": sources,
  };
  if (purpose === "campaign-system") return {
    ...common, "CAMPAIGN_SYSTEM.md": "# 批量活动页生产系统\n\n## 固定层\n\nTokens、组件尺寸、圆角、状态、容器与间距节奏。\n\n## 可变层\n\n主题内容、主视觉、权益、日期与经批准的主题色。\n\n## 变更规则\n\n任何新组件先回写 DESIGN.md 并补充来源证据，经确认后再进入后续页面。",
    "PAGE_BRIEF_TEMPLATE.md": "# 页面 Brief\n\n- 页面目标：\n- 核心 CTA：\n- 主视觉素材 ID：\n- 内容模块顺序：\n- 可覆盖 Token：\n- 不允许变化的组件：\n",
    "content-schema.json": JSON.stringify({ pageName: "", goal: "", hero: { headline: "", subheading: "", assetId: "" }, cta: { label: "", href: "" }, sections: [] }, null, 2),
    "components.md": components, "QA_CHECKLIST.md": qaMarkdown(), "tokens/tokens.json": tokens, "tokens/variables.css": css,
  };
  if (purpose === "figma-bridge") return {
    ...common, "tokens.json": tokens,
    "figma-import.json": JSON.stringify({ schemaVersion: 2, contractVersion: version, title: contract.title, variables: contract.tokens, components: elements.map((item) => ({ id: item.id, name: item.label, type: item.type, editable: Boolean((item.metadata as Record<string, unknown>)?.computedStyle), sourceAssetId: item.assetId, rect: item.rect, evidenceState: (item.metadata as Record<string, unknown>)?.computedStyle ? "实测" : "图片证据" })) }, null, 2),
    "FIGMA_IMPORT.md": "# Figma Bridge\n\n1. 在 Figma Desktop 运行 InspoAtlas Bridge。\n2. 选择 figma-import.json。\n3. 插件使用异步 Variables API 创建颜色、间距与圆角变量。\n4. 有计算样式证据的网页元素创建 Auto Layout 组件；只有图片证据的元素创建带来源说明的裁切图层。\n5. 逐项核验字体、交互状态和响应式行为后再发布组件。\n\n本包不伪装为原生 .fig 文件。",
    "elements/README.md": "# 已确认元素\n\n" + (elements.length ? elements.map((item) => "- " + item.label + " · " + item.type + " · 来源 " + item.assetId).join("\n") : "没有已确认元素；Figma Bridge 不会生成猜测组件。"),
  };
  return {
    ...common,
    "STRUCTURE.md": "# 结构拆解\n\n" + sourceRows.map((item, index) => (index + 1) + ". " + item.title + " · " + item.kind + " · " + (item.sourceUrl || "上传素材")).join("\n"),
    "MAPPING.md": "# 来源 → 规则映射\n\n" + contract.principles.map((item, index) => (index + 1) + ". " + item + "\n   - 证据： " + contract.sourceAssetIds.join("、")).join("\n"),
    "IMPLEMENTATION_PROMPT.md": "# AI 实现提示词\n\n先读取 DESIGN.md、STRUCTURE.md、MAPPING.md 与 sources.json。先输出规范预检和结构映射，等待确认后再实现。原始参考决定内容结构，DESIGN.md 决定视觉语言。不得新增来源中不存在的模块，也不得把视觉推断写成事实。实现结束后分别执行 STRUCTURE_QA.md 与 DESIGN_QA.md。",
    "tokens/tokens.json": tokens, "tokens/variables.css": css, "components.md": components,
    "STRUCTURE_QA.md": "# 结构 QA\n\n- [ ] 模块顺序、文案、图片和 CTA 可定位到来源\n- [ ] 没有新增无证据的功能或营销模块\n- [ ] 指定画板尺寸无溢出与错位",
    "DESIGN_QA.md": qaMarkdown(),
  };
}

function designMarkdown(contract: DesignContract, version: number) {
  return "# " + contract.title + "\n\n合同版本：" + version + "\n生成时间：" + contract.generatedAt + "\n\n## 强制视觉原则\n\n" + contract.principles.map((item, index) => (index + 1) + ". " + item).join("\n") + "\n\n## Do\n\n" + contract.dos.map((item) => "- " + item).join("\n") + "\n\n## Don’t\n\n" + contract.donts.map((item) => "- " + item).join("\n") + "\n\n## 冲突\n\n" + (contract.conflicts.map((item) => "- " + item).join("\n") || "- 无") + "\n\n## 未确认项\n\n" + (contract.unresolved.map((item) => "- " + item).join("\n") || "- 无") + "\n\n## 证据素材\n\n" + contract.sourceAssetIds.map((item) => "- " + item).join("\n");
}
function qaMarkdown() {
  return "# 设计一致性 QA\n\n- [ ] 颜色、字号、间距和圆角均来自合同 Tokens\n- [ ] 重复组件的 default / hover / active / focus / disabled 状态一致\n- [ ] 实测、视觉推断与人工覆盖没有混淆\n- [ ] 每条关键结论可定位到 sources.json\n- [ ] 未确认字体、渐变与阴影没有进入生产规范";
}
