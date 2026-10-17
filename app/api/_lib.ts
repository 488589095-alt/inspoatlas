import { createHash, randomBytes } from "node:crypto";

export const GUEST_COOKIE_NAME = "inspo_guest";
const GUEST_TOKEN_PATTERN = /^[A-Za-z0-9_-]{43}$/;

export function isGuestToken(value: string | undefined | null): value is string {
  return Boolean(value && GUEST_TOKEN_PATTERN.test(value));
}

function guestTokenFromCookie(header: string | null): string | null {
  const entry = header?.split(";").map((part) => part.trim()).find((part) => part.startsWith(`${GUEST_COOKIE_NAME}=`));
  const value = entry?.slice(GUEST_COOKIE_NAME.length + 1);
  return isGuestToken(value) ? value : null;
}

export function currentUser(request: Request) {
  const hostedEmail = request.headers.get("oai-authenticated-user-email");
  if (hostedEmail) return {
    id: createHash("sha256").update(hostedEmail.toLowerCase()).digest("hex").slice(0, 24),
    email: hostedEmail,
    kind: "account" as const,
  };

  const guestToken = guestTokenFromCookie(request.headers.get("cookie"));
  if (guestToken) {
    const id = createHash("sha256").update(`guest:${guestToken}`).digest("hex").slice(0, 24);
    return { id, email: `guest-${id}@inspoatlas.local`, kind: "guest" as const };
  }

  if (process.env.NODE_ENV === "production") throw new HttpError(401, "请先开始创作或登录 InspoAtlas");
  const email = request.headers.get("x-demo-user") ?? "demo@inspoatlas.local";
  return { id: createHash("sha256").update(email.toLowerCase()).digest("hex").slice(0, 24), email, kind: "account" as const };
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
