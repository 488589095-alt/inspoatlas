/* global figma, __html__ */

figma.showUI(__html__, { width: 420, height: 520, themeColors: true });

function hexToRgb(hex) {
  const value = hex.replace("#", "");
  if (!/^[0-9a-fA-F]{6}$/.test(value)) throw new Error(`无效颜色：${hex}`);
  return {
    r: parseInt(value.slice(0, 2), 16) / 255,
    g: parseInt(value.slice(2, 4), 16) / 255,
    b: parseInt(value.slice(4, 6), 16) / 255,
  };
}

figma.ui.onmessage = async (message) => {
  if (message.type === "cancel") { figma.closePlugin(); return; }
  if (message.type !== "import") return;

  try {
    const kit = message.payload;
    if (kit.version !== 1 || !kit.variables || !Array.isArray(kit.components)) throw new Error("这不是有效的 InspoAtlas Figma 导入文件");

    const collection = figma.variables.createVariableCollection(`${kit.name || "InspoAtlas"} / Imported`);
    for (const color of kit.variables.colors || []) {
      const variable = figma.variables.createVariable(color.name, collection.id, "COLOR");
      variable.setValueForMode(collection.defaultModeId, hexToRgb(color.value));
      variable.description = "Imported from InspoAtlas; verify against source before publishing.";
    }

    await figma.loadFontAsync({ family: "Inter", style: "Regular" });
    const root = figma.createFrame();
    root.name = `${kit.name || "InspoAtlas"} / Components`;
    root.layoutMode = "VERTICAL";
    root.primaryAxisSizingMode = "AUTO";
    root.counterAxisSizingMode = "AUTO";
    root.itemSpacing = 24;
    root.paddingTop = 32;
    root.paddingRight = 32;
    root.paddingBottom = 32;
    root.paddingLeft = 32;
    root.fills = [{ type: "SOLID", color: { r: 0.97, g: 0.96, b: 0.98 } }];

    for (const item of kit.components) {
      const component = figma.createComponent();
      component.name = item.name || "Imported component";
      component.description = `${item.description || ""}\nSource asset: ${item.sourceAssetId || "unconfirmed"}`.trim();
      component.resizeWithoutConstraints(Math.max(120, Number(item.width) || 240), Math.max(44, Number(item.height) || 88));
      component.cornerRadius = Math.max(0, Number(item.cornerRadius) || 0);
      component.fills = [{ type: "SOLID", color: hexToRgb(item.fills?.[0] || "#F4F1F6") }];

      const label = figma.createText();
      label.name = "Label";
      label.fontName = { family: "Inter", style: "Regular" };
      label.characters = item.name || "Imported component";
      label.fontSize = 14;
      label.x = 16;
      label.y = Math.max(14, component.height / 2 - 8);
      label.fills = [{ type: "SOLID", color: { r: 0.15, g: 0.14, b: 0.17 } }];
      component.appendChild(label);
      root.appendChild(component);
    }

    figma.currentPage.appendChild(root);
    figma.currentPage.selection = [root];
    figma.viewport.scrollAndZoomIntoView([root]);
    figma.notify(`已导入 ${kit.variables.colors?.length || 0} 个颜色变量和 ${kit.components.length} 个组件草稿`);
    figma.ui.postMessage({ type: "complete", colors: kit.variables.colors?.length || 0, components: kit.components.length });
  } catch (error) {
    figma.ui.postMessage({ type: "error", message: error instanceof Error ? error.message : "导入失败" });
  }
};
