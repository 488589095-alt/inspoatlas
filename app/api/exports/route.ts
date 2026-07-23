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
    const files = buildFiles(input.purpose, contract, stored.version, sourceRows, elements);
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
