import { randomInt, randomUUID } from "node:crypto";
import { and, count, desc, eq, gte } from "drizzle-orm";
import { ensureCoreTables, getDb } from "@/db";
import { emailLoginCodes } from "@/db/schema";
import { authReady, hashClientAddress, hashLoginCode, loginEmailFrom, normalizedEmail } from "../../../_email-auth";
import { errorResponse, HttpError } from "../../../_lib";

export async function POST(request: Request) {
  try {
    if (!process.env.VERCEL || !authReady()) throw new HttpError(503, "邮箱登录尚未配置完成");
    const input = await request.json() as { email?: unknown };
    const email = typeof input.email === "string" ? normalizedEmail(input.email) : null;
    if (!email) throw new HttpError(400, "请输入有效的邮箱地址");

    await ensureCoreTables();
    const db = getDb();
    const now = Date.now();
    const clientHash = hashClientAddress(request.headers.get("x-vercel-forwarded-for")?.split(",")[0]?.trim() || "unknown");
    const [[latest], [emailHour], [clientHour]] = await Promise.all([
      db.select({ createdAt: emailLoginCodes.createdAt }).from(emailLoginCodes).where(eq(emailLoginCodes.email, email)).orderBy(desc(emailLoginCodes.createdAt)).limit(1),
      db.select({ value: count() }).from(emailLoginCodes).where(and(eq(emailLoginCodes.email, email), gte(emailLoginCodes.createdAt, now - 3_600_000))),
      db.select({ value: count() }).from(emailLoginCodes).where(and(eq(emailLoginCodes.clientHash, clientHash), gte(emailLoginCodes.createdAt, now - 3_600_000))),
    ]);
    if ((latest && now - latest.createdAt < 60_000) || (emailHour?.value ?? 0) >= 5 || (clientHour?.value ?? 0) >= 20) {
      throw new HttpError(429, "请求过于频繁，请稍后再试");
    }

    const id = randomUUID();
    const code = randomInt(0, 1_000_000).toString().padStart(6, "0");
    await db.insert(emailLoginCodes).values({ id, email, codeHash: hashLoginCode(id, code), clientHash, attempts: 0, expiresAt: now + 10 * 60_000, createdAt: now });
    const sent = await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: { authorization: `Bearer ${process.env.RESEND_API_KEY}`, "content-type": "application/json" },
      body: JSON.stringify({
        from: loginEmailFrom(),
        to: [email],
        subject: "InspoAtlas 登录验证码",
        text: `你的 InspoAtlas 登录验证码是 ${code}。10 分钟内有效，请勿转发。如果不是你本人操作，可以忽略这封邮件。`,
      }),
    });
    if (!sent.ok) {
      await db.delete(emailLoginCodes).where(eq(emailLoginCodes.id, id));
      throw new HttpError(503, "验证码暂时无法发送，请稍后再试");
    }
    return Response.json({ ok: true }, { headers: { "cache-control": "no-store" } });
  } catch (error) { return errorResponse(error); }
}
