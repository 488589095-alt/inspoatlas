# InspoAtlas 技术架构与数据字典

## 1. 运行架构

工程为 pnpm TypeScript 单仓库：

- `apps/web`：Next.js Web、画布、API 与只读分享。
- `apps/extension`：WXT Manifest V3 插件。
- `apps/figma-plugin`：Figma Bridge，本地导入任务包并创建 Variables 与 Component 草稿。
- `apps/worker`：Node 常驻进程，负责抓取、图像处理、AI、向量化与导出。
- `packages/domain`：Zod 类型、配额、安全校验和领域操作。
- `packages/ai`：Provider Adapter、提示词版本和结构化分析。

Beta 目标环境为新加坡：Web/Worker 运行于 Railway，Supabase 提供邮箱 Auth、PostgreSQL/pgvector 与对象存储；本地开发提供无密钥演示模式。异步任务使用 pg-boss，与业务记录共享 PostgreSQL 事务。

## 2. 数据模型

| 表 | 关键字段 | 说明 |
| --- | --- | --- |
| `profiles` | id, email, quotaRemaining, createdAt | 用户资料与平台额度 |
| `invites` | id, codeHash, email, usesRemaining, expiresAt | 邀请控制 |
| `boards` | id, ownerId, title, version, viewport, createdAt | 私有画布与乐观版本 |
| `assets` | id, ownerId, boardId, kind, source, objectKey, text, status | 原始素材元数据 |
| `canvas_items` | id, boardId, assetId, type, x, y, width, height, data | 画布实例 |
| `relations` | id, boardId, sourceId, targetId, type, origin, score | 手工/AI 关系 |
| `analyses` | id, assetId, schemaVersion, provider, model, result, status | 结构化分析 |
| `component_regions` | id, analysisId, rect, type, confidence, confirmed | 候选与已确认元素 |
| `organize_proposals` | id, boardId, baseVersion, payload, status | 非破坏式整理方案 |
| `board_snapshots` | id, boardId, version, scene, createdAt | 手动快照和整理撤销 |
| `jobs` | id, type, ownerId, subjectId, status, attempts, error | 用户可见任务状态 |
| `exports` | id, boardId, objectKey, manifest, createdAt | 资产包 |
| `share_links` | id, boardId, tokenHash, revokedAt | 只读分享 |
| `ai_credentials` | id, ownerId, provider, ciphertext, iv, authTag | 加密 BYOK |
| `usage_ledger` | id, ownerId, action, units, jobId, createdAt | 可审计额度流水 |
| `events` | id, ownerId, name, payload, createdAt | Beta 产品埋点 |

所有用户表启用 RLS。对象键采用 `users/{ownerId}/{assetId}/...`，服务端签发短时上传/下载 URL。

## 3. 公共类型

```ts
type AssetKind = "image" | "web" | "text";
type CanvasItemType = "image" | "web" | "text" | "analysis" | "element" | "group";
type RelationType = "similar-style" | "same-component" | "same-project" | "supports" | "contrasts" | "derived-from";
type JobStatus = "queued" | "processing" | "ready" | "failed";

interface ClipPayload {
  url: string;
  title: string;
  screenshotParts: Array<{ index: number; width: number; height: number; dataUrl: string }>;
  readableText: string;
  styles: Array<{ selectorHint: string; role: string; rect: Rect; style: StyleSnapshot }>;
}

interface AnalysisResult {
  summary: string;
  purpose: string[];
  copy: Array<{ text: string; role: string; sourceRegion?: string }>;
  tags: Array<{ value: string; category: "style" | "mood" | "industry" | "pattern"; confidence: number }>;
  palette: Array<{ hex: string; ratio: number; role: string; confidence: number }>;
  typography: Array<{ familyGuess: string; role: string; weight?: number; confidence: number; inferred: true }>;
  spacing: { base?: number; values: number[]; confidence: number };
  radii: number[];
  shadows: string[];
  layout: { description: string; grid?: string; confidence: number };
  components: ComponentRegion[];
  accessibility: Array<{ level: "info" | "warning"; message: string; sourceRegion?: string }>;
  sourceAssetId: string;
}
```

## 4. API 合约

- `POST /api/assets`：创建文本/URL 元数据或完成直传；幂等键防重复。
- `POST /api/clips`：接收插件采集；验证来源、尺寸、正文和样式数量。
- `POST /api/analyses`：校验所有权与额度，事务内创建账本和任务。
- `GET /api/jobs/:id`：仅所有者读取任务进度与可重试错误。
- `POST /api/boards/:id/organize/preview`：基于当前版本生成方案。
- `POST /api/boards/:id/organize/apply`：要求 `baseVersion` 相等，事务写入快照和新场景。
- `POST /api/exports`：校验 `purpose` 并生成网页复刻、视觉延展、批量活动页或 Figma Bridge 任务包；Manifest 记录来源、置信度、规范版本和生成模型。
- `POST /api/shares`：创建新令牌，只返回一次明文。
- `DELETE /api/shares/:id`：撤销并使缓存失效。

## 5. AI 与任务流

1. 原始素材入库后创建预处理任务。
2. Worker 校验文件，生成缩略图、感知哈希、确定性色板与可用文字。
3. Provider Adapter 将规范化素材发送给白名单模型。
4. Zod 校验结果；失败时使用修复提示重试一次。
5. 保存 `AnalysisResult`，生成嵌入，任务变为 `ready`；失败则退还平台额度。
6. 客户端通过轮询接收状态，后续可替换为实时订阅而不改变任务接口。

模型响应不能直接执行画布操作。画布问答只生成带引用的文本卡或 `OrganizeProposal`，应用动作必须由用户确认。

## 6. 部署与可观测性

- Web 与 Worker 使用独立容器，部署在 Railway 新加坡区；数据库和存储在 Supabase 新加坡区。
- 健康检查覆盖 Web、数据库、队列和对象存储；模型故障不影响基础素材访问。
- 日志包含 requestId/jobId/provider/latency/status，不包含素材正文、图片或密钥。
- 监控导入失败率、任务延迟、Schema 修复率、额度消耗、导出成功率和复用闭环。

