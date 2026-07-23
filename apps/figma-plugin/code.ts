declare const figma: any;
declare const __html__: string;

type BridgeKit = {
  schemaVersion: 2; title: string;
  variables: { colors: Array<{ name: string; value: string }>; spacing: number[]; radii: number[]; shadows: string[] };
  components: Array<{ id: string; name: string; type: string; editable: boolean; sourceAssetId: string; evidenceState: string }>;
};

figma.showUI(__html__, { width: 440, height: 560, themeColors: true });

function hexToRgb(hex: string) {
  const value = hex.replace("#", ""); if (!/^[0-9a-fA-F]{6}$/.test(value)) throw new Error("无效颜色：" + hex);
  return { r: parseInt(value.slice(0, 2), 16) / 255, g: parseInt(value.slice(2, 4), 16) / 255, b: parseInt(value.slice(4, 6), 16) / 255 };
}

async function createVariableSet(kit: BridgeKit) {
  await figma.variables.getLocalVariableCollectionsAsync();
  const collection = figma.variables.createVariableCollection((kit.title || "InspoAtlas") + " / Contract");
  for (const color of kit.variables.colors || []) {
    const variable = figma.variables.createVariable(color.name, collection, "COLOR");
    variable.setValueForMode(collection.defaultModeId, hexToRgb(color.value));
    variable.description = "InspoAtlas 合同变量；发布前请对照 sources.json。";
  }
  for (const [index, value] of (kit.variables.spacing || []).entries()) {
    const variable = figma.variables.createVariable("space/" + (index + 1), collection, "FLOAT");
    variable.setValueForMode(collection.defaultModeId, value);
  }
  for (const [index, value] of (kit.variables.radii || []).entries()) {
    const variable = figma.variables.createVariable("radius/" + (index + 1), collection, "FLOAT");
    variable.setValueForMode(collection.defaultModeId, value);
  }
  return collection;
}

async function createElements(kit: BridgeKit) {
  await figma.loadFontAsync({ family: "Inter", style: "Regular" });
  const root = figma.createFrame(); root.name = (kit.title || "InspoAtlas") + " / Confirmed elements";
  root.layoutMode = "VERTICAL"; root.primaryAxisSizingMode = "AUTO"; root.counterAxisSizingMode = "AUTO";
  root.itemSpacing = 20; root.paddingTop = 28; root.paddingRight = 28; root.paddingBottom = 28; root.paddingLeft = 28;
  root.fills = [{ type: "SOLID", color: { r: .97, g: .96, b: .98 } }];
  for (const item of kit.components) {
    const node = item.editable ? figma.createComponent() : figma.createFrame();
    node.name = item.name || "Confirmed element"; node.layoutMode = "HORIZONTAL"; node.primaryAxisSizingMode = "AUTO"; node.counterAxisSizingMode = "AUTO";
    node.paddingTop = 14; node.paddingRight = 18; node.paddingBottom = 14; node.paddingLeft = 18; node.cornerRadius = 12;
    node.fills = [{ type: "SOLID", color: item.editable ? { r: .94, g: .92, b: .97 } : { r: .91, g: .91, b: .93 } }];
    node.description = "Source asset: " + item.sourceAssetId + "\nEvidence: " + item.evidenceState + "\nType: " + item.type;
    node.setPluginData("inspoatlasSourceAssetId", item.sourceAssetId); node.setPluginData("inspoatlasEvidenceState", item.evidenceState);
    const label = figma.createText(); label.fontName = { family: "Inter", style: "Regular" };
    label.characters = item.name + (item.editable ? " · Auto Layout" : " · 图片证据（不可伪装为组件）"); label.fontSize = 13;
    node.appendChild(label); root.appendChild(node);
  }
  figma.currentPage.appendChild(root); figma.currentPage.selection = [root]; figma.viewport.scrollAndZoomIntoView([root]);
}

figma.ui.onmessage = async (message: { type: string; payload?: BridgeKit }) => {
  if (message.type === "cancel") return figma.closePlugin();
  if (message.type !== "import" || !message.payload) return;
  try {
    const kit = message.payload;
    if (kit.schemaVersion !== 2 || !kit.variables || !Array.isArray(kit.components)) throw new Error("这不是 InspoAtlas Figma Bridge V2 文件");
    await createVariableSet(kit); await createElements(kit);
    figma.notify("已导入 " + kit.variables.colors.length + " 个颜色变量和 " + kit.components.length + " 个确认元素");
    figma.ui.postMessage({ type: "complete", colors: kit.variables.colors.length, components: kit.components.length });
  } catch (error) { figma.ui.postMessage({ type: "error", message: error instanceof Error ? error.message : "导入失败" }); }
};
