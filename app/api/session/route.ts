import { currentUser, errorResponse } from "../_lib";

export async function GET(request: Request) {
  try {
    const user = currentUser(request);
    const encodedName = request.headers.get("oai-authenticated-user-full-name");
    const encoding = request.headers.get("oai-authenticated-user-full-name-encoding");
    const fullName = encodedName && encoding === "percent-encoded-utf-8"
      ? safeDecode(encodedName)
      : null;
    const displayName = fullName || user.email.split("@")[0];
    return Response.json({
      user: {
        id: user.id,
        email: user.email,
        displayName,
        initials: getInitials(displayName),
      },
      access: "invite-only",
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
