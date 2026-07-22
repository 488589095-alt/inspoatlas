import { z } from "zod";
import { currentUser, errorResponse, newId, shareToken, tokenHash } from "../_lib";
const schema = z.object({ boardId: z.string().min(1) });
export async function POST(request: Request) {
  try { const user = currentUser(request); const input = schema.parse(await request.json()); const token = shareToken(); return Response.json({ share: { id: newId("share"), boardId: input.boardId, ownerId: user.id, token, tokenHash: tokenHash(token), url: `/share/${token}` } }, { status: 201 }); }
  catch (error) { return errorResponse(error); }
}
export async function DELETE() { return Response.json({ revoked: true }); }

