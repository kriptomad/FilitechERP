// src/infra/storage/r2-client.ts — Cap. 3.3
import {
  S3Client,
  PutObjectCommand,
  GetObjectCommand,
} from "@aws-sdk/client-s3";
import { getSignedUrl } from "@aws-sdk/s3-request-presigner";

export const r2Client = new S3Client({
  region: "auto",
  endpoint: `https://${process.env.R2_ACCOUNT_ID}.r2.cloudflarestorage.com`,
  credentials: {
    accessKeyId: process.env.R2_ACCESS_KEY_ID!,
    secretAccessKey: process.env.R2_SECRET_ACCESS_KEY!,
  },
});

export async function uploadTenantAsset(params: {
  tenantId: string;
  category:
    | "avatar"
    | "os-photo"
    | "fiscal-xml"
    | "client-signature"
    | "nfe-entry-xml"
    | "backup";
  fileName: string;
  body: Buffer;
  contentType: string;
}): Promise<string> {
  const key = `tenants/${params.tenantId}/${params.category}/${params.fileName}`;
  await r2Client.send(
    new PutObjectCommand({
      Bucket: "filitech-assets",
      Key: key,
      Body: params.body,
      ContentType: params.contentType,
    }),
  );
  return key;
}

export async function getSignedAssetUrl(
  key: string,
  expiresInSeconds = 900,
): Promise<string> {
  return getSignedUrl(
    r2Client,
    new GetObjectCommand({ Bucket: "filitech-assets", Key: key }),
    { expiresIn: expiresInSeconds },
  );
}

// Used by backup job (platform-level, not tenant-scoped)
export async function uploadStreamToR2(params: {
  objectKey: string;
  body: Buffer;
  metadata?: Record<string, string>;
}): Promise<void> {
  await r2Client.send(
    new PutObjectCommand({
      Bucket: "filitech-backups",
      Key: params.objectKey,
      Body: params.body,
      ContentType: "application/octet-stream",
      Metadata: params.metadata,
    }),
  );
}
