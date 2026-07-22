import { z } from "zod";
import { MAX_TEXT_LENGTH, isSafePublicUrl } from "@/packages/domain/src";
import { currentUser, errorResponse, newId } from "../_lib";

const inputSchema = z.object({ kind: z.enum(["image", "web", "text"]), title: z.string().trim().min(1).max(500), text: z.string().max(MAX_TEXT_LENGTH).optional(), sourceUrl: z.string().optional() });

export async function POST(request: Request) {
  try {
    const user = currentUser(request); const input = inputSchema.parse(await request.json());
    if (input.sourceUrl && !isSafePublicUrl(input.sourceUrl)) throw new Error("该 URL 不允许抓取");
    return Response.json({ asset: { id: newId("asset"), ownerId: user.id, status: "idle", ...input } }, { status: 201 });
  } catch (error) { return errorResponse(error); }
}

