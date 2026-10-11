// src/server/infra/storage/r2-client.ts — Cap. 3.3
// Cliente Cloudflare R2 para armazenamento de arquivos (XMLs fiscais, fotos, uploads)
import { S3Client, PutObjectCommand, GetObjectCommand, DeleteObjectCommand, ListObjectsV2Command } from '@aws-sdk/client-s3';
import { getSignedUrl } from '@aws-sdk/s3-request-presigner';

const R2_ACCOUNT_ID = process.env.R2_ACCOUNT_ID!;
const R2_ACCESS_KEY_ID = process.env.R2_ACCESS_KEY_ID!;
const R2_SECRET_ACCESS_KEY = process.env.R2_SECRET_ACCESS_KEY!;
const R2_BUCKET_NAME = process.env.R2_BUCKET_NAME ?? 'filitech-assets';
const R2_PUBLIC_URL = process.env.R2_PUBLIC_URL;

if (!R2_ACCOUNT_ID || !R2_ACCESS_KEY_ID || !R2_SECRET_ACCESS_KEY) {
  console.warn('[R2] Credenciais não configuradas: R2_ACCOUNT_ID, R2_ACCESS_KEY_ID, R2_SECRET_ACCESS_KEY');
}

export const r2Client = new S3Client({
  region: 'auto',
  endpoint: `https://${R2_ACCOUNT_ID}.r2.cloudflarestorage.com`,
  credentials: {
    accessKeyId: R2_ACCESS_KEY_ID,
    secretAccessKey: R2_SECRET_ACCESS_KEY,
  },
});

export interface UploadParams {
  tenantId: string;
  category: 'avatar' | 'os-photo' | 'fiscal-xml' | 'client-signature' | 'nfe-entry-xml' | 'backup' | 'contract' | 'product-image' | 'report';
  fileName: string;
  body: Buffer | Uint8Array | string;
  contentType: string;
  metadata?: Record<string, string>;
}

export interface UploadResult {
  key: string;
  publicUrl?: string;
  sizeBytes: number;
  etag: string;
}

/**
 * Faz upload de arquivo para o R2
 */
export async function uploadTenantAsset(params: UploadParams): Promise<UploadResult> {
  const { tenantId, category, fileName, body, contentType, metadata } = params;

  const key = `tenants/${tenantId}/${category}/${fileName}`;
  const buffer = Buffer.isBuffer(body) ? body : Buffer.from(body);

  const command = new PutObjectCommand({
    Bucket: R2_BUCKET_NAME,
    Key: key,
    Body: buffer,
    ContentType: contentType,
    Metadata: metadata,
    CacheControl: 'private, max-age=31536000', // 1 ano
  });

  const result = await r2Client.send(command);

  return {
    key,
    publicUrl: R2_PUBLIC_URL ? `${R2_PUBLIC_URL}/${key}` : undefined,
    sizeBytes: buffer.length,
    etag: result.ETag ?? '',
  };
}

/**
 * Gera URL assinada para download (expira em 15 min por padrão)
 */
export async function getSignedAssetUrl(key: string, expiresInSeconds = 900): Promise<string> {
  const command = new GetObjectCommand({ Bucket: R2_BUCKET_NAME, Key: key });
  return getSignedUrl(r2Client, command, { expiresIn: expiresInSeconds });
}

/**
 * Deleta arquivo do R2
 */
export async function deleteTenantAsset(key: string): Promise<void> {
  const command = new DeleteObjectCommand({ Bucket: R2_BUCKET_NAME, Key: key });
  await r2Client.send(command);
}

/**
 * Lista arquivos de um tenant/categoria
 */
export async function listTenantAssets(tenantId: string, category: string, prefix = ''): Promise<Array<{ key: string; size: number; lastModified: Date }>> {
  const command = new ListObjectsV2Command({
    Bucket: R2_BUCKET_NAME,
    Prefix: `tenants/${tenantId}/${category}/${prefix}`,
  });

  const result = await r2Client.send(command);
  return (result.Contents ?? []).map(obj => ({
    key: obj.Key!,
    size: obj.Size ?? 0,
    lastModified: obj.LastModified ?? new Date(),
  }));
}

/**
 * Upload de arquivo fiscal (NF-e/NFC-e XML) com validação
 */
export async function uploadFiscalXML(params: {
  tenantId: string;
  documentType: 'NFE' | 'NFCE' | 'NFE_ENTRADA' | 'CCE' | 'CANCELAMENTO';
  accessKey: string;
  xmlContent: string;
}): Promise<UploadResult> {
  const fileName = `${params.accessKey}.xml`;
  const category = params.documentType === 'NFE_ENTRADA' ? 'nfe-entry-xml' : 'fiscal-xml';

  return uploadTenantAsset({
    tenantId: params.tenantId,
    category,
    fileName,
    body: params.xmlContent,
    contentType: 'application/xml',
    metadata: {
      documentType: params.documentType,
      accessKey: params.accessKey,
      uploadedAt: new Date().toISOString(),
    },
  });
}

/**
 * Upload de foto de OS (ordem de serviço)
 */
export async function uploadOSPhoto(params: {
  tenantId: string;
  osId: string;
  fileName: string;
  body: Buffer;
  contentType: string;
}): Promise<UploadResult> {
  const safeName = fileName.replace(/[^a-zA-Z0-9.-]/g, '_');
  return uploadTenantAsset({
    tenantId: params.tenantId,
    category: 'os-photo',
    fileName: `${params.osId}/${safeName}`,
    body: params.body,
    contentType: params.contentType,
  });
}

/**
 * Upload de assinatura do cliente
 */
export async function uploadClientSignature(params: {
  tenantId: string;
  clientId: string;
  body: Buffer;
  contentType: string;
}): Promise<UploadResult> {
  return uploadTenantAsset({
    tenantId: params.tenantId,
    category: 'client-signature',
    fileName: `${params.clientId}.png`,
    body: params.body,
    contentType: params.contentType,
  });
}

/**
 * URL pública direta (se bucket for público)
 */
export function getPublicAssetUrl(key: string): string | null {
  if (!R2_PUBLIC_URL) return null;
  return `${R2_PUBLIC_URL}/${key}`;
}