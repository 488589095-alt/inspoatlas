# AI 用量预算

公开主站（Vercel）和公开 Beta 站（Sites）使用独立数据库，因此每个部署分别保留全站 **¥2.50/日、¥10/月** 的预算。两站合计的应用内预留额最多 **¥5/日、¥20/月**。日期按北京时间自然日、自然月计算。

每个部署中的访客或已登录用户分别限制为 **¥1/日、¥3/月**。访客以私有浏览器身份识别；删除 Cookie 会换身份，但不能绕过全站预算。使用两个部署的同一人会分别占用各自的用户额度，全站合计仍受上述上限限制。

所有 AI 入口在调用百炼前，通过数据库中的单条条件写入原子预留额度；余额不足返回 HTTP 429。预留额保守估算，不等于百炼账单，失败的请求也不退回预留额，以免外部服务已计费而站点少记。预留：小in对话 ¥0.20、联网找参考 ¥0.50、素材拆解 ¥0.70、图层识别 ¥0.50、单张图片改造 ¥0.25。素材拆解最多可能调用模型四次（结构修复与 JSON 修复），所以比单次对话预留更多。

预算只覆盖通过本网站发出的已接入 AI 调用，不包含同一 API Key 在其他应用产生的费用，也不能代替百炼的真实账单。百炼模型价格或项目模型变更时，应先更新预留额，未知模型默认拒绝。建议同时在百炼控制台为该 API Key 设置 **¥20 月度预算**，开启“达到预算后立即停止”；百炼说明停用可能有延迟，实际费用以控制台为准。

价格依据：[百炼模型价格](https://help.aliyun.com/zh/model-studio/model-pricing)、[qwen3.7-plus](https://help.aliyun.com/zh/model-studio/qwen3-7-plus)、[qwen-image-edit-plus](https://help.aliyun.com/zh/model-studio/qwen-image-edit-plus)、[联网搜索计费](https://help.aliyun.com/zh/model-studio/web-search)、[百炼预算管理](https://help.aliyun.com/zh/model-studio/budget-management)。
