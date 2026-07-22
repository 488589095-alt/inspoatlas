import { PgBoss } from "pg-boss";
import { createDemoAnalysis } from "@inspoatlas/ai";

const databaseUrl = process.env.DATABASE_URL;
if (!databaseUrl) {
  console.log("[worker] DATABASE_URL 未配置；演示模式不启动队列。");
} else {
  const boss = new PgBoss(databaseUrl);
  await boss.start();
  await boss.work("analyze-asset", async ([job]) => {
    const data = job.data as { assetId: string };
    const result = createDemoAnalysis(data.assetId);
    console.log(JSON.stringify({ event: "analysis.completed", jobId: job.id, assetId: data.assetId, tags: result.tags.length }));
  });
  console.log("[worker] InspoAtlas analysis worker ready");
}

