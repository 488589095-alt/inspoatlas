import { upload } from "@vercel/blob/client";

type PrepareInput =
  | { scope: "asset"; boardId: string; contentType: string; size: number }
  | { scope: "derivative"; sourceAssetId: string; contentType: "image/png"; size: number };

/** Returns null on the existing Sites host, which still accepts multipart uploads. */
export async function uploadPrivateFile(file: File | Blob, input: PrepareInput) {
  const response = await fetch("/api/uploads", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(input),
  });
  if (response.status === 404) return null;
  const prepared = await response.json().catch(() => ({})) as { id?: string; pathname?: string; clientPayload?: string; error?: string };
  if (!response.ok || !prepared.id || !prepared.pathname || !prepared.clientPayload) {
    throw new Error(prepared.error || "无法准备上传");
  }
  const result = await upload(prepared.pathname, file, {
    access: "private",
    contentType: input.contentType,
    clientPayload: prepared.clientPayload,
    handleUploadUrl: "/api/uploads",
    multipart: file.size > 5 * 1024 * 1024,
  });
  if (result.pathname !== prepared.pathname) throw new Error("上传文件路径校验失败");
  return { id: prepared.id, pathname: result.pathname };
}
