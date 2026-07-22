# 产品决策：从“资产包”升级为“生产任务包”

## 结论

InspoAtlas 不改成通用 Figma 转换工具，也不继续把所有分析结果塞进同一个 ZIP。产品定位收紧为：**把分散灵感翻译成可执行、可追溯、可跨 AI 与设计工具复用的生产上下文。**

核心用户仍是 UI、产品与视觉设计师，但“参考灵感”后的下一步并不相同。产品以任务目标区分输出，而不是以设计师职级或行业分裂成多套画布。

## 为什么需要改变

附件中的工作流表明，`DESIGN.md` 的价值不在于“列出颜色”，而在于成为实现过程的约束层：

1. 先进行规范预检，识别 Token、Do/Don't、冲突与缺失。
2. 再拆解原图的真实结构，不提前写代码。
3. 建立“原图结构 -> DESIGN.md 视觉规则”的映射并确认。
4. 将 Token 接入项目基础层。
5. 实现页面。
6. 分别执行结构 QA 与规范 QA。
7. 将验证过的新规则回写规范，支持下一批页面复用。

因此，旧版固定 ZIP 的问题不是文件数量多，而是缺少明确任务、执行顺序和确认门槛。

## 四种任务包

### 1. AI 复刻网页 / UI

用于把参考页面交给 Codex、Claude Code、Cursor 等实现。包含规范化 `DESIGN.md`、结构拆解、分阶段复刻提示词、Design Tokens、CSS Variables、组件清单、QA 清单和来源映射。

### 2. 图片 / 品牌延展

用于生成同类视觉、品牌主视觉或其他载体。包含反推提示词、构图与材质说明、色板、提示词变体、负面约束和来源；不混入网页代码与无关组件文档。

### 3. 批量活动页系统

用于一批同类型、同风格页面。包含母版 `DESIGN.md`、固定层/可变层、页面 Brief 模板、内容 Schema、组件矩阵、Tokens 和双层 QA。任何新组件先确认并回写，再进入后续页面。

### 4. Figma 可编辑导入

不直接生成未经官方接口验证的 `.fig` 文件。导出 `figma-import.json`，由配套 Figma 插件使用官方 Plugin API 在用户当前文件内创建本地 Variables 与 Component 草稿。字体、图片、隐藏状态和精确尺寸仍需人工确认。

## 产品边界

- `DESIGN.md` 采用 Google Labs Code 的 alpha 规范：YAML Token frontmatter + 约定章节顺序。
- 来源事实、视觉推断和用户确认必须分开保存。
- 任务模式改变分析重点与输出结构，不复制四套素材库或画布。
- Figma Bridge 是“可编辑交接”，不是像素级截图转设计稿承诺。
- 不将参考品牌的 Logo、文案或受版权保护资产自动复制进新作品。

## 衡量方式

北极星指标更新为：用户选择生产目标后，成功把任务包用于一次 AI 生成、Figma 导入或批量页面生产，并完成至少一次来源核验/QA。

新增埋点：`export_purpose_selected`、`task_kit_downloaded`、`figma_kit_imported`、`design_qa_completed`、`design_rule_promoted`。

## 依据

- 用户提供的《Design.md 文档的使用方法》PDF，尤其是规范预检、原图拆解、映射、实现和两轮 QA 流程。
- [Google Labs Code DESIGN.md 规范](https://github.com/google-labs-code/design.md/blob/main/docs/spec.md)：`DESIGN.md` 是面向编码 Agent 的自包含设计系统表示，Token 为规范值，正文提供使用语境。
- [Figma Plugin API](https://developers.figma.com/docs/plugins/)：插件可在当前 Figma 文件中创建和修改节点；变量可通过 Plugin API 创建和绑定。
