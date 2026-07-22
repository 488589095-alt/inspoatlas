import { z } from "zod";
import { errorResponse } from "../../../../_lib";
const schema = z.object({ proposalId: z.string().min(1), baseVersion: z.number().int().positive(), currentVersion: z.number().int().positive() });
export async function POST(request: Request) {
  try { const input = schema.parse(await request.json()); if (input.baseVersion !== input.currentVersion) return Response.json({ error: "画布已发生变化，请重新生成整理预览" }, { status: 409 }); return Response.json({ applied: true, version: input.currentVersion + 1, undoable: true }); }
  catch (error) { return errorResponse(error); }
}

