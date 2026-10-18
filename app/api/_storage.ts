import { env } from "cloudflare:workers";
import { del, get, head, put } from "@vercel/blob";
import { HttpError } from "./_lib";

type BucketObject = { body: BodyInit; httpMetadata?: { contentType?: string }; writeHttpMetadata(headers: Headers): void };
type Bucket = {
  put(key: string, value: ArrayBuffer | Uint8Array | Blob, options?: { httpMetadata?: { contentType?: string }; customMetadata?: Record<string, string> }): Promise<unknown>;
  get(key: string): Promise<BucketObject | null>;
  delete(key: string | string[]): Promise<void>;
};

export function getAssetBucket(): Bucket {
  if (process.env.VERCEL) {
    return {
      async put(key, value, options) {
        const body = value instanceof Blob ? value : value instanceof ArrayBuffer ? Buffer.from(value) : Buffer.from(value);
        await put(key, body, {
          access: "private",
          allowOverwrite: true,
          contentType: options?.httpMetadata?.contentType,
        });
      },
      async get(key) {
        const result = await get(key, { access: "private" });
        if (!result || result.statusCode !== 200 || !result.stream) return null;
        return {
          body: result.stream,
          httpMetadata: { contentType: result.blob.contentType ?? undefined },
          writeHttpMetadata(headers) {
            if (result.blob.contentType) headers.set("content-type", result.blob.contentType);
          },
        };
      },
      async delete(key) { await del(key); },
    };
  }
  const bucket = (env as unknown as { ASSET_BUCKET?: Bucket }).ASSET_BUCKET;
  if (!bucket) throw new HttpError(503, "素材存储暂不可用");
  return bucket;
}

export function decodeDataUrl(value: string) {
  const match = value.match(/^data:([^;,]+);base64,(.+)$/);
  if (!match) throw new HttpError(400, "截图格式无效");
  return { contentType: match[1], bytes: Uint8Array.from(atob(match[2]), (char) => char.charCodeAt(0)) };
}

export async function verifyUploadedBlob(pathname: string, contentType: string, maximumSize: number) {
  const blob = await head(pathname);
  if (blob.contentType !== contentType || blob.size > maximumSize) throw new HttpError(400, "上传内容与登记信息不一致");
  return blob;
}
