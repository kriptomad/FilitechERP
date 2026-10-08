// src/middlewares/request-logger.middleware.ts — Cap. 10.1
import { randomUUID } from "node:crypto";
import { Request, Response, NextFunction } from "express";
import { logger } from "../lib/logger.js";

export function requestLoggerMiddleware(
  req: Request,
  res: Response,
  next: NextFunction,
) {
  const requestId = randomUUID();
  const startedAt = process.hrtime.bigint();
  req.requestId = requestId;

  res.on("finish", () => {
    const durationMs = Number(process.hrtime.bigint() - startedAt) / 1_000_000;
    logger.info(
      {
        requestId,
        tenantId: req.session?.tenantId,
        method: req.method,
        path: req.path,
        statusCode: res.statusCode,
        durationMs,
      },
      "request_completed",
    );
  });

  next();
}
