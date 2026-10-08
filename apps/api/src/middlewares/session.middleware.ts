// src/middlewares/session.middleware.ts — Cap. 3.5 / 9.2
import { Request, Response, NextFunction } from "express";
import { verifySessionToken, SessionClaims } from "../auth/jwt.service.js";

declare global {
  // eslint-disable-next-line @typescript-eslint/no-namespace
  namespace Express {
    interface Request {
      session?: SessionClaims;
      requestId?: string;
    }
  }
}

export function sessionMiddleware(
  req: Request,
  res: Response,
  next: NextFunction,
) {
  const authHeader = req.headers.authorization;
  let token: string | undefined;
  if (authHeader?.startsWith("Bearer ")) {
    token = authHeader.slice(7);
  } else if (
    typeof req.query.token === "string" &&
    req.query.token.length > 0
  ) {
    // EventSource (SSE, Cap. 8.2) não envia headers — aceita ?token=.
    token = req.query.token;
  }

  if (!token) {
    return next(); // rotas públicas
  }

  try {
    req.session = verifySessionToken(token);
  } catch {
    // Token inválido/expirado — deixa req.session undefined;
    // middlewares posteriores (gatekeeper) respondem 401.
  }

  next();
}

/** Exige sessão autenticada — para rotas privadas. */
export function requireSession(
  req: Request,
  res: Response,
  next: NextFunction,
) {
  if (!req.session?.tenantId) {
    return res.status(401).json({
      success: false,
      data: null,
      error: { code: "UNAUTHENTICATED", message: "Sessão ausente ou expirada." },
    });
  }
  next();
}
