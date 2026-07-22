import { z } from "zod";
import { errorResponse, newId } from "../../../../_lib";
const schema = z.object({ version: z.number().int().positive(), nodes: z.array(z.object({ id: z.string(), kind: z.string() })).max(500) });
export async function POST(request: Request, context: { params: Promise<{ id: string }> }) {
  try {
    const input = schema.parse(await request.json()); const { id } = await context.params;
    const positions = Object.fromEntries(input.nodes.map((node, index) => [node.id, { x: 40 + (index % 3) * 360, y: 30 + Math.floor(index / 3) * 340 }]));
    return Response.json({ proposal: { id: newId("proposal"), boardId: id, baseVersion: input.version, groups: [], positions, suggestedRelations: [] } });
  } catch (error) { return errorResponse(error); }
}

