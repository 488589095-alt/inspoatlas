# InspoAtlas 灵感图谱

面向 UI/产品设计师的 AI 灵感工作台。图片、网页和文字可以直接进入无限画布，经 AI 拆解、元素确认和非破坏式整理后，导出为带来源的设计资产包。

## 当前可用能力

- React Flow 无限画布：六类卡片、缩放、拖拽、多选、连线、搜索、撤销/重做与整理预览。
- 图片拖放/粘贴、文字便签、公开 URL 来源卡和 WXT 浏览器插件。
- 单素材 AI 分析交互、元素确认、关系生成和带卡片引用的画布问答。
- 浏览器内生成 ZIP：`design.md`、令牌、CSS、组件、文案、来源与元素目录。
- D1/R2 Sites 演示适配，以及面向 Railway + Supabase 的生产 Schema、RLS、Worker 和环境模板。
- OpenAI、Qwen、DeepSeek 白名单 Provider Adapter 与 AES-GCM BYOK 加密工具。

## 本地运行

```bash
corepack enable
pnpm install
pnpm dev
```

浏览器插件：

```bash
pnpm extension:dev
```

后台 Worker 需要 `DATABASE_URL`：

```bash
pnpm worker:dev
```

## 验证

```bash
pnpm test
pnpm build
pnpm extension:build
```

完整产品定义见 `docs/PRD.md`，竞品结论见 `docs/competitive-analysis.md`，数据与部署架构见 `docs/architecture.md`。

