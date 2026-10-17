import { randomBytes } from "node:crypto";
import { GUEST_COOKIE_NAME } from "../../_lib";

export async function POST(request: Request) {
  const token = randomBytes(32).toString("base64url");
  const secure = new URL(request.url).protocol === "https:" || process.env.NODE_ENV === "production";
  return new Response(null, {
    status: 303,
    headers: {
      location: "/",
      "cache-control": "no-store",
      "set-cookie": `${GUEST_COOKIE_NAME}=${token}; Path=/; Max-Age=2592000; HttpOnly; SameSite=Lax${secure ? "; Secure" : ""}`,
    },
  });
}
