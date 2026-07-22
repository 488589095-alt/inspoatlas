import { createHash, randomBytes } from "node:crypto";

export function currentUser(request: Request) {
  const email = request.headers.get("oai-authenticated-user-email") ?? request.headers.get("x-demo-user") ?? "demo@inspoatlas.local";
  return { id: createHash("sha256").update(email.toLowerCase()).digest("hex").slice(0, 24), email };
}

export function newId(prefix: string) { return `${prefix}_${crypto.randomUUID()}`; }
export function shareToken() { return randomBytes(24).toString("base64url"); }
export function tokenHash(token: string) { return createHash("sha256").update(token).digest("hex"); }
export function errorResponse(error: unknown, fallback = "请求失败") { return Response.json({ error: error instanceof Error ? error.message : fallback }, { status: 400 }); }

