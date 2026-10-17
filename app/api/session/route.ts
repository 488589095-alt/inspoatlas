import { count, desc, eq } from "drizzle-orm";
import { assets, boards } from "@/db/schema";
import { ensureCoreTables, getDb } from "@/db";
import { currentUser, errorResponse } from "../_lib";

export async function GET(request: Request) {
  try {
    const user = currentUser(request); await ensureCoreTables();
    const encodedName = request.headers.get("oai-authenticated-user-full-name");
    const encoding = request.headers.get("oai-authenticated-user-full-name-encoding");
    const fullName = encodedName && encoding === "percent-encoded-utf-8"
      ? safeDecode(encodedName)
      : null;
    const displayName = user.kind === "guest" ? "访客" : fullName || user.email.split("@")[0];
    const db = getDb();
    const [[boardTotal], [assetTotal], recentBoards] = await Promise.all([
      db.select({ value: count() }).from(boards).where(eq(boards.ownerId, user.id)),
      db.select({ value: count() }).from(assets).where(eq(assets.ownerId, user.id)),
      db.select({ id: boards.id, title: boards.title, updatedAt: boards.updatedAt }).from(boards).where(eq(boards.ownerId, user.id)).orderBy(desc(boards.updatedAt)).limit(4),
    ]);
    return Response.json({
      user: {
        id: user.id,
        email: user.kind === "guest" ? "" : user.email,
        displayName,
        initials: getInitials(displayName),
        kind: user.kind,
      },
      access: user.kind === "guest" ? "guest" : "account",
      space: { boardCount: boardTotal?.value ?? 0, assetCount: assetTotal?.value ?? 0, recentBoards },
    }, { headers: { "cache-control": "no-store" } });
  } catch (error) {
    return errorResponse(error);
  }
}

function safeDecode(value: string) {
  try { return decodeURIComponent(value); } catch { return null; }
}

function getInitials(value: string) {
  const clean = value.trim();
  if (!clean) return "IA";
  const words = clean.split(/\s+/).filter(Boolean);
  if (words.length > 1) return (words[0][0] + words.at(-1)![0]).toUpperCase();
  return Array.from(clean).slice(0, 2).join("").toUpperCase();
}
