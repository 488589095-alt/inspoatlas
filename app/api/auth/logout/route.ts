import { clearSessionCookie } from "../../_email-auth";

export async function POST(request: Request) {
  if (!process.env.VERCEL) return new Response(null, { status: 404 });
  return new Response(null, { status: 303, headers: { location: new URL("/", request.url).toString(), "set-cookie": clearSessionCookie(), "cache-control": "no-store" } });
}
