import { timingSafeEqual } from "node:crypto";
import { and, desc, eq } from "drizzle-orm";
import { ensureCoreTables, getDb } from "@/db";
import { emailLoginCodes, profiles } from "@/db/schema";
import { accountIdForEmail, authReady, hashLoginCode, makeSessionCookie, normalizedEmail } from "../../../_email-auth";
import { errorResponse, HttpError } from "../../../_lib";

export async function POST(request: Request) {
  try {
    if (!process.env.VERCEL || !authReady()) throw new HttpError(503, "邮箱登录尚未配置完成");
    const input = await request.json() as { email?: unknown; code?: unknown };
    const email = typeof input.email === "string" ? normalizedEmail(input.email) : null;
    const code = typeof input.code === "string" ? input.code.trim() : "";
    if (!email || !/^\d{6}$/.test(code)) throw new HttpError(400, "请输入邮箱和六位验证码");

    await ensureCoreTables();
    const db = getDb();
    const [challenge] = await db.select().from(emailLoginCodes).where(eq(emailLoginCodes.email, email)).orderBy(desc(emailLoginCodes.createdAt)).limit(1);
    if (!challenge || challenge.expiresAt <= Date.now() || challenge.attempts >= 5) throw new HttpError(400, "验证码已失效，请重新获取");
    const [claimed] = await db.update(emailLoginCodes).set({ attempts: challenge.attempts + 1 }).where(and(eq(emailLoginCodes.id, challenge.id), eq(emailLoginCodes.attempts, challenge.attempts))).returning({ id: emailLoginCodes.id });
    if (!claimed) throw new HttpError(400, "请重试验证码");
    const expected = Buffer.from(challenge.codeHash, "hex");
    const supplied = Buffer.from(hashLoginCode(challenge.id, code), "hex");
    if (!timingSafeEqual(expected, supplied)) throw new HttpError(400, "验证码不正确");

    await db.delete(emailLoginCodes).where(eq(emailLoginCodes.email, email));
    await db.insert(profiles).values({ id: accountIdForEmail(email), email }).onConflictDoNothing();
    return Response.json({ ok: true }, { headers: { "set-cookie": makeSessionCookie(email), "cache-control": "no-store" } });
  } catch (error) { return errorResponse(error); }
}
