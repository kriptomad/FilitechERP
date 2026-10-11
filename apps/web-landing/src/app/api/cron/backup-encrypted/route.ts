// src/app/api/cron/backup-encrypted/route.ts
// Backup criptografado pg_dump → Cloudflare R2 (Cap. 10.3)
import { NextResponse } from 'next/server';
import { env } from '@/server/env';
import { prismaUnscoped } from '@/server/db';
import { createCipheriv, randomBytes } from 'node:crypto';
import { execSync } from 'node:child_process';
import { uploadTenantAsset } from '@/server/infra/storage/r2-client';

export const dynamic = 'force-dynamic';

function authorize(request: Request): boolean {
  const secret = env.cronSecret;
  if (!secret) return false;
  return request.headers.get('authorization') === `Bearer ${secret}`;
}

const ENCRYPTION_ALGO = 'aes-256-gcm';
const KEY_HEX = env.backupEncryptionKey;

export async function GET(request: Request) {
  if (!authorize(request)) {
    return NextResponse.json({ success: false, error: { code: 'UNAUTHORIZED', message: 'Não autorizado.' } }, { status: 401 });
  }

  if (!KEY_HEX || KEY_HEX.length !== 64) {
    return NextResponse.json({ success: false, error: { code: 'CONFIG_MISSING', message: 'Chave de criptografia de backup não configurada.' } }, { status: 500 });
  }

  try {
    const databaseUrl = process.env.DATABASE_URL;
    if (!databaseUrl) {
      throw new Error('DATABASE_URL não configurada');
    }

    const url = new URL(databaseUrl);
    const host = url.hostname;
    const port = url.port || '5432';
    const database = url.pathname.slice(1);
    const user = url.username;
    const password = url.password;

    const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
    const dumpFile = `/tmp/filitech-backup-${timestamp}.sql`;

    // Executa pg_dump
    const pgDumpCmd = `PGPASSWORD="${password}" pg_dump -h ${host} -p ${port} -U ${user} -d ${database} --no-owner --no-privileges --clean --if-exists > ${dumpFile}`;
    execSync(pgDumpCmd, { stdio: 'pipe', timeout: 300000 });

    // Criptografa o dump
    const key = Buffer.from(KEY_HEX, 'hex');
    const iv = randomBytes(12);
    const cipher = createCipheriv(ENCRYPTION_ALGO, key, iv);

    const fs = await import('node:fs/promises');
    const dumpContent = await fs.readFile(dumpFile);
    
    const encrypted = Buffer.concat([cipher.update(dumpContent), cipher.final()]);
    const authTag = cipher.getAuthTag();
    
    const finalBuffer = Buffer.concat([iv, authTag, encrypted]);

    // Upload para R2
    const uploadResult = await uploadTenantAsset({
      tenantId: 'system',
      category: 'backup',
      fileName: `filitech-backup-${timestamp}.sql.enc`,
      body: finalBuffer,
      contentType: 'application/octet-stream',
    });

    // Limpa arquivo temporário
    await fs.unlink(dumpFile).catch(() => {});

    // Registra no banco
    await prismaUnscoped.backupRecord.create({
      data: {
        tenantId: 'system',
        fileName: `filitech-backup-${timestamp}.sql.enc`,
        r2Key: uploadResult.key,
        sizeBytes: finalBuffer.length,
        encryptionAlgo: ENCRYPTION_ALGO,
        status: 'COMPLETED',
      },
    });

    return NextResponse.json({
      success: true,
      data: { fileName: `filitech-backup-${timestamp}.sql.enc`, r2Key: uploadResult.key, sizeBytes: finalBuffer.length },
    });
  } catch (err) {
    console.error('[cron:backup-encrypted] erro:', err);
    return NextResponse.json({ success: false, error: { code: 'CRON_FAILED', message: 'Falha no backup criptografado.' } }, { status: 500 });
  }
}