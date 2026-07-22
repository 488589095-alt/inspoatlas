# InspoAtlas Figma Bridge

这是一个本地开发版 Figma 插件，用于把“Figma 可编辑导入”任务包中的 `figma-import.json` 写入当前 Figma 文件。

1. Figma Desktop 打开 Plugins -> Development -> Import plugin from manifest。
2. 选择本目录的 `manifest.json`。
3. 在 InspoAtlas 导出“Figma 可编辑导入”任务包并解压。
4. 运行插件，选择 `figma-import.json`。

插件创建本地颜色 Variables 和可编辑 Component 草稿，不覆盖已有内容，也不声称能直接生成原生 `.fig` 文件。导入后仍需对照来源确认字体、图片、状态和精确尺寸。
