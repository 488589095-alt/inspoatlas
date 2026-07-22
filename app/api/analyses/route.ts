import { z } from "zod";
import { currentUser, errorResponse, newId } from "../_lib";

const schema = z.object({ assetId: z.string().min(1), title: z.string().min(1).max(500) });
export async function POST(request: Request) {
  try {
    const user = currentUser(request); const input = schema.parse(await request.json()); const jobId = newId("job");
    return Response.json({ job: { id: jobId, ownerId: user.id, type: "analyze-asset", subjectId: input.assetId, status: "queued", attempts: 0 }, quotaCharged: 1 }, { status: 202 });
  } catch (error) { return errorResponse(error); }
}

