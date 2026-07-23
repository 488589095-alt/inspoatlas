import { z } from "zod";

const clientErrorSchema = z.object({
  message: z.string().max(1_000),
  digest: z.string().max(200).optional(),
  path: z.string().max(500).optional(),
});

export async function POST(request: Request) {
  const input = clientErrorSchema.safeParse(await request.json().catch(() => null));
  if (!input.success) return new Response(null, { status: 204 });
  console.error("CLIENT_RUNTIME_ERROR", input.data);
  return new Response(null, { status: 204 });
}
