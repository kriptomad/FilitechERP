// src/main.ts — servidor Express (Cap. 3, 9)
import "./env.js"; // PRIMEIRO: carrega .env antes de jwt.service ler process.env
import "express-async-errors"; // Express 4: rejeições assíncronas vão ao error handler
import express from "express";
import cors from "cors";
import helmet from "helmet";
import { sessionMiddleware } from "./middlewares/session.middleware.js";
import { tenantContextMiddleware } from "./middlewares/tenant-context.middleware.js";
import { requestLoggerMiddleware } from "./middlewares/request-logger.middleware.js";
import { authRouter } from "./routes/auth.routes.js";
import { auth2faRouter } from "./routes/auth-2fa.routes.js";
import { passwordResetRouter } from "./routes/password-reset.routes.js";
import { userRouter } from "./routes/user.routes.js";
import { salesRouter } from "./routes/sales.routes.js";
import { workOrderRouter } from "./routes/work-order.routes.js";
import { billingRouter } from "./routes/billing.routes.js";
import { adminRouter } from "./routes/admin.routes.js";
import { contractRouter } from "./routes/contract.routes.js";
import { cashRegisterRouter } from "./routes/cash-register.routes.js";
import { nicheRouter } from "./routes/niche.routes.js";
import { ifoodRouter } from "./webhooks/ifood-webhook.js";
import { billingWebhookRouter } from "./webhooks/billing-webhook.js";
import { auditLogRouter } from "./routes/audit-log.routes.js";
import { subscribeRedisFanout } from "./gateways/sse.gateway.js";
import { createScheduler } from "./jobs/scheduler.js";
import { prismaUnscoped } from "./lib/prisma.js";
import { logger } from "./lib/logger.js";

const app = express();

app.use(helmet());
app.use(cors({ origin: process.env.NEXT_PUBLIC_APP_URL, credentials: true }));
app.use(express.json({ limit: "2mb" }));
app.use(requestLoggerMiddleware);
app.use(sessionMiddleware);
app.use(tenantContextMiddleware); // Cap. 7 — contexto implícito por request

// Rotas
app.use("/api", authRouter);
app.use("/api", auth2faRouter);
app.use("/api", passwordResetRouter);
app.use("/api", userRouter);
app.use("/api", salesRouter);
app.use("/api", workOrderRouter);
app.use("/api", billingRouter);
app.use("/api", adminRouter); // administração do portal: clientes/serviços/cobranças
app.use("/api", contractRouter); // emissão de contrato de serviço
app.use("/api", cashRegisterRouter); // abertura de caixa (Cap. 4.1)
app.use("/api", nicheRouter);
app.use("/api", ifoodRouter);
app.use("/api", billingWebhookRouter); // webhook de billing (Asaas/Stripe)
app.use("/api", auditLogRouter); // audit log

// Health (Cap. 10.1)
app.get("/health", (_req, res) => res.json({ status: "ok" }));
app.get("/ready", async (_req, res) => {
  try {
    await prismaUnscoped.$queryRaw`SELECT 1`;
    res.json({ status: "ready" });
  } catch {
    res.status(503).json({ status: "not_ready" });
  }
});

// Handler global de erro — envelope padrão (Cap. 9.1)
app.use(
  (err: Error, _req: express.Request, res: express.Response, _next: express.NextFunction) => {
    logger.error({ err }, "unhandled_error");
    res.status(500).json({
      success: false,
      data: null,
      error: { code: "INTERNAL_ERROR", message: "Erro interno do servidor." },
    });
  },
);

// Export para Vercel Serverless Functions
export default app;

// Inicialização local (não executa no Vercel)
if (process.env.VERCEL !== "1") {
  const PORT = Number(process.env.PORT ?? 3001);

  app.listen(PORT, () => {
    subscribeRedisFanout(); // fanout SSE entre nós (Cap. 8.2)
    const scheduler = createScheduler();
    scheduler.start(); // jobs agendados (Cap. 3.4/10.3)
    logger.info({ port: PORT }, "api_started");
  });
}
