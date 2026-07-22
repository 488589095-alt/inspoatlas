import { currentUser } from "../../_lib";
export async function GET(request: Request, context: { params: Promise<{ id: string }> }) {
  const user = currentUser(request); const { id } = await context.params;
  return Response.json({ job: { id, ownerId: user.id, status: "ready", attempts: 1 } });
}

