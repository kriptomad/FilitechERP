// src/jobs/encrypted-backup.job.ts — Cap. 10.3
import { spawn } from "node:child_process";
import { createCipheriv, randomBytes } from "node:crypto";
import { logger } from "../lib/logger.js";
import { uploadStreamToR2 } from "../infra/storage/r2-client.js";

const ENCRYPTION_ALGORITHM = "aes-256-gcm";

export async function runEncryptedDatabaseBackup() {
  const backupKey = Buffer.from(process.env.BACKUP_ENCRYPTION_KEY!, "hex");
  const iv = randomBytes(12);
  const cipher = createCipheriv(ENCRYPTION_ALGORITHM, backupKey, iv);

  const timestamp = new Date().toISOString().replace(/[:.]/g, "-");
  const objectKey = `backups/postgres/${timestamp}.sql.enc`;

  const pgDumpProcess = spawn("pg_dump", [
    "--format=custom",
    "--no-owner",
    "--dbname",
    process.env.DATABASE_URL!,
  ]);

  pgDumpProcess.stderr.on("data", (chunk) => {
    logger.warn(
      { job: "encrypted-backup", stderr: chunk.toString() },
      "pg_dump_stderr",
    );
  });

  try {
    const chunks: Buffer[] = [];

    // Pipe through cipher, collect chunks, then upload
    pgDumpProcess.stdout.pipe(cipher);

    for await (const chunk of cipher) {
      chunks.push(chunk as Buffer);
    }

    const encryptedBuffer = Buffer.concat(chunks);

    await uploadStreamToR2({
      objectKey,
      body: encryptedBuffer,
      metadata: {
        ivHex: iv.toString("hex"),
        algorithm: ENCRYPTION_ALGORITHM,
      },
    });

    const exitCode: number = await new Promise((resolve) =>
      pgDumpProcess.on("close", resolve),
    );
    if (exitCode !== 0) {
      throw new Error(`pg_dump encerrou com código de saída ${exitCode}.`);
    }

    logger.info({ job: "encrypted-backup", objectKey }, "backup_completed");
  } catch (error) {
    pgDumpProcess.kill();
    logger.error({ job: "encrypted-backup", error }, "backup_failed");
    throw error;
  }
}
