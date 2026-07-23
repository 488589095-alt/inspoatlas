import { env } from "cloudflare:workers";
import { HttpError } from "./_lib";

type BucketObject = { body: BodyInit; httpMetadata?: { contentType?: string }; writeHttpMetadata(headers: Headers): void };
type Bucket = {
  put(key: string, value: ArrayBuffer | Uint8Array | Blob, options?: { httpMetadata?: { contentType?: string }; customMetadata?: Record<string, string> }): Promise<unknown>;
  get(key: string): Promise<BucketObject | null>;
  delete(key: string | string[]): Promise<void>;
};

export function getAssetBucket(): Bucket {
  const bucket = (env as unknown as { ASSET_BUCKET?: Bucket }).ASSET_BUCKET;
  if (!bucket) throw new HttpError(503, "素材存储暂不可用");
  return bucket;
}

export function decodeDataUrl(value: string) {
  const match = value.match(/^data:([^;,]+);base64,(.+)$/);
  if (!match) throw new HttpError(400, "截图格式无效");
  return { contentType: match[1], bytes: Uint8Array.from(atob(match[2]), (char) => char.charCodeAt(0)) };
}
