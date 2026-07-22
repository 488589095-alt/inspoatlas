import { z } from "zod";
import { errorResponse, newId } from "../_lib";
const schema = z.object({ boardId: z.string().min(1) });
export async function POST(request: Request) {
  try { const input = schema.parse(await request.json()); return Response.json({ export: { id: newId("export"), boardId: input.boardId, status: "queued", files: ["design.md", "tokens.json", "variables.css", "components.md", "copy.md", "sources.json", "elements/"] } }, { status: 202 }); }
  catch (error) { return errorResponse(error); }
}

