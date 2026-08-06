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
    if (!stored || stored.status !== "confirmed") throw new HttpError(409, "请先保存设计方案");
    const contract = designContractSchema.parse(stored.content);
    const sourceRows = await db.select().from(assets).where(and(eq(assets.boardId, board.id), eq(assets.ownerId, user.id)));
    const elements = await db.select().from(confirmedElements).where(and(eq(confirmedElements.boardId, board.id), eq(confirmedElements.ownerId, user.id)));
    const context: ExportContext = { purpose: input.purpose, goal: input.goal, destination: input.destination, title: contract.title, version: stored.version };
    if (input.destination === "figma-design" && input.format === "quick") {
      const svg = buildFigmaBoardSvg(contract, stored.version);
      return new Response(svg, {
        headers: {
          "content-type": "image/svg+xml; charset=utf-8",
          "content-disposition": 'attachment; filename="inspoatlas-figma-board-v' + stored.version + '.svg"',
          "cache-control": "no-store",
        },
      });
    }
    const taskFiles = { ...buildFiles(input.purpose, contract, stored.version, sourceRows, elements), ...destinationFiles(context, contract) };
    const manifest = JSON.stringify({ schemaVersion: 1, ...context, files: Object.keys(taskFiles), generatedAt: new Date().toISOString() }, null, 2);
    const files = { "使用说明.txt": usageText(context), "manifest.json": manifest, ...taskFiles };
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
    next: "解压后在 Figma Desktop 中导入 figma-plugin/manifest.json，运行插件并选择 figma-import.json。",
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

function usageText(context: ExportContext) {
  const destination = destinationGuides[context.destination || "coding-ai"] ?? destinationGuides["coding-ai"];
  const goal = goalLabels[context.goal || "recreate"] || "继续设计";
  return [
    context.title,
    "",
    "目标：" + goal,
    "使用：" + destination.label,
    "",
    destination.summary,
    "",
    "下一步：",
    destination.next,
    "",
    "设计方案版本：" + context.version,
    "重要：颜色、字体、组件和结构仍需在最终工具中核对来源。",
  ].join("\n");
}

function figmaPluginFiles(): Record<string, string> {
  const manifest = JSON.stringify({ name: "InspoAtlas Importer", id: "1629456193847000001", api: "1.0.0", main: "code.js", ui: "ui.html", editorType: ["figma"], documentAccess: "dynamic-page", networkAccess: { allowedDomains: ["none"] } }, null, 2);
  const ui = `<!doctype html><html><meta charset="utf-8"><style>body{font:12px Inter,sans-serif;margin:0;padding:16px;color:#242229}h2{font-size:16px;margin:0 0 8px}p{color:#706a75;line-height:1.5}input{width:100%;margin:12px 0}button{width:100%;min-height:36px;border:0;border-radius:8px;background:#725e91;color:white;font-weight:700}small{display:block;margin-top:10px;color:#8b848e}</style><body><h2>导入 InspoAtlas 方案</h2><p>选择导出包根目录里的 figma-import.json。</p><input id="file" type="file" accept="application/json"><button id="run" disabled>导入</button><small id="status"></small><script>let data;const file=document.querySelector('#file'),run=document.querySelector('#run'),status=document.querySelector('#status');file.onchange=async()=>{try{data=JSON.parse(await file.files[0].text());run.disabled=false;status.textContent='文件已读取';}catch(e){status.textContent='JSON 无法读取';}};run.onclick=()=>{run.disabled=true;status.textContent='正在创建…';parent.postMessage({pluginMessage:{type:'import',data}},'*')};onmessage=(event)=>{status.textContent=event.data.pluginMessage?.message||'';run.disabled=false};</script></body></html>`;
  const code = `figma.showUI(__html__,{width:340,height:250});function rgb(hex){const v=hex.replace('#','');return{r:parseInt(v.slice(0,2),16)/255,g:parseInt(v.slice(2,4),16)/255,b:parseInt(v.slice(4,6),16)/255}}figma.ui.onmessage=async(msg)=>{if(msg.type!=='import')return;try{const d=msg.data||{};const vars=d.variables||{};const collection=figma.variables.createVariableCollection('InspoAtlas');const mode=collection.defaultModeId;for(const item of vars.colors||[]){const variable=figma.variables.createVariable(item.name,collection,'COLOR');variable.setValueForMode(mode,rgb(item.value))}for(const [i,value] of (vars.spacing||[]).entries()){const variable=figma.variables.createVariable('spacing/'+(i+1),collection,'FLOAT');variable.setValueForMode(mode,value)}for(const [i,value] of (vars.radii||[]).entries()){const variable=figma.variables.createVariable('radius/'+(i+1),collection,'FLOAT');variable.setValueForMode(mode,value)}await figma.loadFontAsync({family:'Inter',style:'Regular'});await figma.loadFontAsync({family:'Inter',style:'Semi Bold'});const system=figma.createFrame();system.name=d.title||'InspoAtlas Design System';system.layoutMode='VERTICAL';system.itemSpacing=24;system.paddingTop=32;system.paddingRight=32;system.paddingBottom=32;system.paddingLeft=32;system.resize(720,Math.max(300,120+(d.components||[]).length*110));for(const item of d.components||[]){const component=figma.createComponent();component.name=item.name;component.layoutMode='VERTICAL';component.itemSpacing=8;component.paddingTop=16;component.paddingRight=16;component.paddingBottom=16;component.paddingLeft=16;component.resize(640,80);const title=figma.createText();title.fontName={family:'Inter',style:'Semi Bold'};title.characters=item.name;component.appendChild(title);const note=figma.createText();note.fontName={family:'Inter',style:'Regular'};note.characters=(item.rules||[]).join(' · ')||'请根据参考继续完善';component.appendChild(note);system.appendChild(component)}figma.currentPage.appendChild(system);figma.currentPage.selection=[system];figma.viewport.scrollAndZoomIntoView([system]);figma.ui.postMessage({message:'导入完成：已创建变量和组件草稿'});}catch(error){figma.ui.postMessage({message:'导入失败：'+String(error&&error.message||error)})}};`;
  return { "figma-plugin/manifest.json": manifest, "figma-plugin/ui.html": ui, "figma-plugin/code.js": code };
}
function buildFiles(purpose: ExportPurpose, contract: DesignContract, version: number, sourceRows: AssetRow[], elements: ElementRow[]): Record<string, string> {
  const sourceMap = sourceRows.map((item) => ({
    assetId: item.id, title: item.title, kind: item.kind, sourceUrl: item.sourceUrl,
    capturedAt: item.createdAt, contractVersion: version,
    evidenceState: item.kind === "web" && (item.metadata as Record<string, unknown>)?.styles ? "实测与视觉推断混合" : "视觉推断",
  }));
  const sources = JSON.stringify({ schemaVersion: 1, generatedAt: new Date().toISOString(), sources: sourceMap, contractEvidence: contract.evidence, review: contract.review, confirmedElements: elements.map((item) => ({ id: item.id, assetId: item.assetId, regionId: item.regionId, label: item.label, type: item.type, rect: item.rect, state: "人工确认" })) }, null, 2);
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
    "components.md": components, "QA_CHECKLIST.md": qaMarkdown(contract), "tokens/tokens.json": tokens, "tokens/variables.css": css,
  };
  if (purpose === "figma-bridge") return {
    ...common, "tokens.json": tokens,
    "figma-import.json": JSON.stringify({ schemaVersion: 2, contractVersion: version, title: contract.title, variables: contract.tokens, components: contract.components.map((item, index) => ({ id: "component-" + (index + 1), name: item.name, rules: item.rules, sourceAssetIds: item.sourceAssetIds })) }, null, 2),
    "FIGMA_IMPORT.md": "# 导入 Figma\n\n1. 解压整个文件夹。\n2. 在 Figma Desktop 选择 Plugins → Development → Import plugin from manifest。\n3. 选择 figma-plugin/manifest.json。\n4. 运行 InspoAtlas Importer，选择 figma-import.json。\n5. 插件会创建变量和组件草稿；完成后核对字体、交互状态和响应式。\n\nFigma 不提供把任意 JSON 直接写成官方 .fig 文件的公共接口，因此这里使用官方 Plugin API。",
    "components/README.md": "# 组件草稿\n\n" + (contract.components.length ? contract.components.map((item) => "- " + item.name + " · " + item.rules.join("；")).join("\n") : "当前方案没有组件。"),
    ...figmaPluginFiles(),
  };
  return {
    ...common,
    "STRUCTURE.md": "# 结构拆解\n\n" + sourceRows.map((item, index) => (index + 1) + ". " + item.title + " · " + item.kind + " · " + (item.sourceUrl || "上传素材")).join("\n"),
    "MAPPING.md": "# 来源 → 规则映射\n\n" + contract.principles.map((item, index) => (index + 1) + ". " + item + "\n   - 证据： " + evidenceIds(contract, "principles", item).join("、")).join("\n"),
    "IMPLEMENTATION_PROMPT.md": "# AI 实现提示词\n\n先读取 DESIGN.md、STRUCTURE.md、MAPPING.md 与 sources.json。先输出规范预检和结构映射，等待确认后再实现。原始参考决定内容结构，DESIGN.md 决定视觉语言。不得新增来源中不存在的模块，也不得把视觉推断写成事实。实现结束后分别执行 STRUCTURE_QA.md 与 DESIGN_QA.md。",
    "tokens/tokens.json": tokens, "tokens/variables.css": css, "components.md": components,
    "STRUCTURE_QA.md": "# 结构 QA\n\n- [ ] 模块顺序、文案、图片和 CTA 可定位到来源\n- [ ] 没有新增无证据的功能或营销模块\n- [ ] 指定画板尺寸无溢出与错位",
    "DESIGN_QA.md": qaMarkdown(contract),
  };
}

function buildFigmaBoardSvg(contract: DesignContract, version: number) {
  const colors = contract.tokens.colors.slice(0, 8);
  const principles = contract.principles.slice(0, 6);
  const components = contract.components.slice(0, 8);
  const componentRows = Math.max(1, components.length);
  const height = Math.max(1080, 690 + componentRows * 116);
  const colorMarkup = colors.map((item, index) => {
    const x = 80 + index * 150;
    return '<g id="Color-' + (index + 1) + '"><rect x="' + x + '" y="390" width="126" height="92" rx="8" fill="' + xmlEscape(item.value) + '"/><text x="' + x + '" y="510" class="label">' + xmlEscape(item.name) + '</text><text x="' + x + '" y="532" class="meta">' + xmlEscape(item.value) + '</text></g>';
  }).join("");
  const principleMarkup = principles.map((item, index) => '<text x="96" y="' + (198 + index * 34) + '" class="body">' + (index + 1) + '. ' + xmlEscape(item) + '</text>').join("");
  const componentMarkup = components.length
    ? components.map((item, index) => {
        const y = 650 + index * 116;
        return '<g id="Component-' + (index + 1) + '"><rect x="80" y="' + y + '" width="1280" height="88" rx="8" fill="#FFFFFF" stroke="#D7D1C7"/><text x="104" y="' + (y + 34) + '" class="component">' + xmlEscape(item.name) + '</text><text x="104" y="' + (y + 60) + '" class="meta">' + xmlEscape(item.rules[0] || "根据参考继续完善") + '</text><rect x="1160" y="' + (y + 23) + '" width="168" height="42" rx="6" fill="#262521"/><text x="1244" y="' + (y + 49) + '" text-anchor="middle" class="button">组件草稿</text></g>';
      }).join("")
    : '<text x="80" y="690" class="meta">当前方案没有组件。</text>';
  return [
    '<svg xmlns="http://www.w3.org/2000/svg" width="1440" height="' + height + '" viewBox="0 0 1440 ' + height + '">',
    '<style>.eyebrow{font:700 15px Inter,Arial,sans-serif;letter-spacing:2px;fill:#D66F55}.title{font:700 38px Georgia,serif;fill:#262521}.section{font:700 21px Georgia,serif;fill:#262521}.body{font:500 16px Inter,Arial,sans-serif;fill:#4D4942}.label{font:700 14px Inter,Arial,sans-serif;fill:#262521}.meta{font:400 13px Inter,Arial,sans-serif;fill:#756F65}.component{font:700 17px Inter,Arial,sans-serif;fill:#262521}.button{font:700 13px Inter,Arial,sans-serif;fill:#FFFFFF}</style>',
    '<rect width="1440" height="' + height + '" fill="#F5F1E8"/>',
    '<g id="Header"><text x="80" y="78" class="eyebrow">INSPOATLAS · FIGMA BOARD · V' + version + '</text><text x="80" y="132" class="title">' + xmlEscape(contract.title) + '</text><line x1="80" y1="154" x2="1360" y2="154" stroke="#BEB7AA"/></g>',
    '<g id="Principles"><text x="80" y="190" class="section">设计原则</text>' + principleMarkup + '</g>',
    '<g id="Tokens"><text x="80" y="352" class="section">颜色与变量参考</text>' + colorMarkup + '</g>',
    '<g id="Metrics"><text x="80" y="582" class="section">间距 ' + (contract.tokens.spacing.map((item) => item + "px").join(" · ") || "未确认") + '</text><text x="720" y="582" class="section">圆角 ' + (contract.tokens.radii.map((item) => item + "px").join(" · ") || "未确认") + '</text></g>',
    '<g id="Components"><text x="80" y="626" class="section">组件草稿</text>' + componentMarkup + '</g>',
    '<text x="1360" y="' + (height - 34) + '" text-anchor="end" class="meta">拖入 Figma 后可编辑文字、色块与图形；Variables 和正式组件需在 Figma 中确认。</text>',
    '</svg>',
  ].join("");
}

function xmlEscape(value: string) {
  return value.replace(/[&<>"']/g, (character) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&apos;" })[character] || character);
}
function designMarkdown(contract: DesignContract, version: number) {
  return "# " + contract.title + "\n\n合同版本：" + version + "\n生成时间：" + contract.generatedAt + "\n\n## 强制视觉原则\n\n" + contract.principles.map((item, index) => (index + 1) + ". " + item + "\n   - 证据：" + evidenceIds(contract, "principles", item).join("、")).join("\n") + "\n\n## Do\n\n" + contract.dos.map((item) => "- " + item).join("\n") + "\n\n## Don’t\n\n" + contract.donts.map((item) => "- " + item).join("\n") + "\n\n## 冲突\n\n" + (contract.conflicts.map((item) => "- " + item + decisionSuffix(contract.review.conflictDecisions, item)).join("\n") || "- 无") + "\n\n## 未确认项\n\n" + (contract.unresolved.map((item) => "- " + item + decisionSuffix(contract.review.unresolvedNotes, item)).join("\n") || "- 无") + "\n\n## 证据素材\n\n" + contract.sourceAssetIds.map((item) => "- " + item).join("\n");
}
function evidenceIds(contract: DesignContract, section: "principles" | "conflicts" | "unresolved", value: string) {
  return contract.evidence[section].find((item) => item.value === value)?.sourceAssetIds ?? contract.sourceAssetIds;
}
function decisionSuffix(rows: Array<{ issue: string; decision: string }>, issue: string) {
  const decision = rows.find((item) => item.issue === issue)?.decision;
  return decision ? "\n  - 已记录取舍：" + decision : "";
}
function qaMarkdown(contract: DesignContract) {
  const reviewItems = [
    ...contract.conflicts.map((issue) => "- [ ] 冲突：" + issue + (decisionSuffix(contract.review.conflictDecisions, issue) || "；尚未记录取舍")),
    ...contract.unresolved.map((issue) => "- [ ] 未确认：" + issue + (decisionSuffix(contract.review.unresolvedNotes, issue) || "；不得当作确定事实")),
  ];
  return "# 设计一致性 QA\n\n- [ ] 颜色、字号、间距和圆角均来自合同 Tokens\n- [ ] 重复组件的 default / hover / active / focus / disabled 状态一致\n- [ ] 实测、视觉推断与人工覆盖没有混淆\n- [ ] 每条关键结论可定位到 sources.json\n- [ ] 未确认字体、渐变与阴影没有进入生产规范" + (reviewItems.length ? "\n\n## 本方案的待核对项\n\n" + reviewItems.join("\n") : "");
}
