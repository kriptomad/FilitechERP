// src/auth/jwt.service.ts — Cap. 3.5
import { readFileSync } from "fs";
import jwt from "jsonwebtoken";

const PRIVATE_KEY = readFileSync(process.env.JWT_PRIVATE_KEY_PATH!, "utf8");
const PUBLIC_KEY = readFileSync(process.env.JWT_PUBLIC_KEY_PATH!, "utf8");

export interface SessionClaims {
  userId: string;
  tenantId: string;
  role: "OWNER" | "MANAGER" | "TECHNICIAN" | "CASHIER";
  temp2faSecret?: string;
  temp2faBackupCodes?: string[];
  sessionId: string;
}

export function signSessionToken(claims: SessionClaims): string {
  return jwt.sign(claims, PRIVATE_KEY, {
    algorithm: "RS256",
    expiresIn: "8h",
    issuer: "filitech-erp",
  });
}

export function verifySessionToken(token: string): SessionClaims {
  return jwt.verify(token, PUBLIC_KEY, {
    algorithms: ["RS256"],
    issuer: "filitech-erp",
  }) as SessionClaims;
}
