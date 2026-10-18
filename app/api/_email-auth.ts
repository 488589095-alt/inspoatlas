import { createHash, createHmac, randomBytes, timingSafeEqual } from "node:crypto";

export const SESSION_COOKIE_NAME = "inspo_session";
const SESSION_LIFETIME_SECONDS = 60 * 60 * 24 * 30;

export function normalizedEmail(value: string): string | null {
  const email = value.trim().toLowerCase();
  return email.length <= 254 && /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email) ? email : null;
}

export function accountIdForEmail(email: string): string {
  // Matches the owner IDs previously created by ChatGPT Sites.
  return createHash("sha256").update(email.toLowerCase()).digest("hex").slice(0, 24);
}

function sessionSecret(): string | null {
  const secret = process.env.AUTH_SESSION_SECRET;
  if (secret && secret.length >= 32) return secret;
  // The Turso token is already a private, high-entropy server credential.
  // Derive a separate signing key so a second manual secret is not required.
  const databaseToken = process.env.TURSO_AUTH_TOKEN;
  return databaseToken && databaseToken.length >= 32
    ? createHmac("sha256", databaseToken).update("inspoatlas-email-session-v1").digest("hex")
    : null;
}

export function authReady(): boolean {
  return Boolean(sessionSecret() && process.env.RESEND_API_KEY && loginEmailFrom());
}

export function loginEmailFrom(): string | null {
  if (process.env.AUTH_EMAIL_FROM) return process.env.AUTH_EMAIL_FROM;
  const domain = process.env.RESEND_EMAIL_DOMAIN?.trim();
  return domain && /^[a-z0-9.-]+\.[a-z]{2,}$/i.test(domain) ? `InspoAtlas <login@${domain}>` : null;
}

function signature(value: string, secret: string): string {
  return createHmac("sha256", secret).update(value).digest("base64url");
}

export function makeSessionCookie(email: string, now = Date.now()): string {
  const secret = sessionSecret();
  if (!secret) throw new Error("AUTH_SESSION_SECRET is not configured");
  const payload = Buffer.from(JSON.stringify({ email, expires: now + SESSION_LIFETIME_SECONDS * 1000, nonce: randomBytes(12).toString("base64url") })).toString("base64url");
  return `${SESSION_COOKIE_NAME}=${payload}.${signature(payload, secret)}; Path=/; Max-Age=${SESSION_LIFETIME_SECONDS}; HttpOnly; Secure; SameSite=Lax`;
}

export function clearSessionCookie(): string {
  return `${SESSION_COOKIE_NAME}=; Path=/; Max-Age=0; HttpOnly; Secure; SameSite=Lax`;
}

export function readEmailSession(cookieHeader: string | null, now = Date.now()): string | null {
  const secret = sessionSecret();
  if (!secret || !cookieHeader) return null;
  const token = cookieHeader.split(";").map((part) => part.trim()).find((part) => part.startsWith(`${SESSION_COOKIE_NAME}=`))?.slice(SESSION_COOKIE_NAME.length + 1);
  if (!token) return null;
  const separator = token.lastIndexOf(".");
  if (separator < 1) return null;
  const payload = token.slice(0, separator);
  const supplied = token.slice(separator + 1);
  const expected = signature(payload, secret);
  if (supplied.length !== expected.length || !timingSafeEqual(Buffer.from(supplied), Buffer.from(expected))) return null;
  try {
    const decoded = JSON.parse(Buffer.from(payload, "base64url").toString("utf8")) as { email?: unknown; expires?: unknown };
    if (typeof decoded.email !== "string" || normalizedEmail(decoded.email) !== decoded.email || typeof decoded.expires !== "number" || decoded.expires <= now) return null;
    return decoded.email;
  } catch { return null; }
}

export function hashLoginCode(challengeId: string, code: string): string {
  const secret = sessionSecret();
  if (!secret) throw new Error("AUTH_SESSION_SECRET is not configured");
  return createHmac("sha256", secret).update(`${challengeId}:${code}`).digest("hex");
}

export function hashClientAddress(address: string): string {
  const secret = sessionSecret();
  if (!secret) throw new Error("AUTH_SESSION_SECRET is not configured");
  return createHmac("sha256", secret).update(address).digest("hex");
}
