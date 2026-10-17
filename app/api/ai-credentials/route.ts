import { managedAiSummary } from "../_credentials";
import { currentUser, errorResponse } from "../_lib";

export async function GET(request: Request) {
  try {
    currentUser(request);
    return Response.json({ managed: managedAiSummary() }, { headers: { "cache-control": "no-store" } });
  } catch (error) { return errorResponse(error); }
}

function managedOnly(request: Request) {
  try {
    currentUser(request);
    return Response.json({ error: "AI 服务由工作区统一配置" }, { status: 403 });
  } catch (error) { return errorResponse(error); }
}

export async function POST(request: Request) { return managedOnly(request); }
export async function PATCH(request: Request) { return managedOnly(request); }
export async function DELETE(request: Request) { return managedOnly(request); }
