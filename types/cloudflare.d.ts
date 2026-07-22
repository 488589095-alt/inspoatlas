interface Fetcher { fetch(input: Request | string, init?: RequestInit): Promise<Response>; }
interface D1Database { readonly __type?: "D1Database"; }
interface R2Bucket { readonly __type?: "R2Bucket"; }
declare module "cloudflare:workers" {
  export const env: { DB?: D1Database; ASSET_BUCKET?: R2Bucket; [key: string]: unknown };
}

