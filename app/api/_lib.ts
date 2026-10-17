import { createHash, randomBytes } from "node:crypto";

export function currentUser(request: Request) {
  const email = request.headers.get("oai-authenticated-user-email")
    ?? (process.env.NODE_ENV === "production" ? null : request.headers.get("x-demo-user") ?? "demo@inspoatlas.local");
  if (!email) throw new HttpError(401, "请先登录 InspoAtlas");
  return { id: createHash("sha256").update(email.toLowerCase()).digest("hex").slice(0, 24), email };
}

export function newId(prefix: string) { return `${prefix}_${crypto.randomUUID()}`; }
export function shareToken() { return randomBytes(24).toString("base64url"); }
export function tokenHash(token: string) { return createHash("sha256").update(token).digest("hex"); }
export class HttpError extends Error {
  constructor(public status: number, message: string) { super(message); }
}
export function errorResponse(error: unknown, fallback = "请求失败") {
  return Response.json({ error: error instanceof Error ? error.message : fallback }, { status: error instanceof HttpError ? error.status : 400 });
}
