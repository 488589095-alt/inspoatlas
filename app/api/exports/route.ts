import { exportFilesByPurpose, exportRequestSchema } from "../../../packages/domain/src/index";
import { errorResponse, newId } from "../_lib";

export async function POST(request: Request) {
  try {
    const input = exportRequestSchema.parse(await request.json());
    return Response.json({ export: { id: newId("export"), boardId: input.boardId, purpose: input.purpose, status: "queued", files: exportFilesByPurpose[input.purpose] } }, { status: 202 });
  } catch (error) { return errorResponse(error); }
}
