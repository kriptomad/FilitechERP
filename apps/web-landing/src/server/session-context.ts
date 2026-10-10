// src/server/session-context.ts — Cap. 9.2
//
// Sessão + contexto do tenant para componentes de servidor.
//
// Centraliza a leitura de sessão em page/layout, para que cada página do ERP
// não repita o mesmo try/catch de cookie. Retorna `null` (não lança) porque o
// chamador decide o que fazer: layout redireciona, API devolve 401.

import { cookies } from 'next/headers';
import { prismaUnscoped } from './db';
import { getActiveModuleCodes } from './cache';
import { SESSION_COOKIE } from './session';
import { verifySessionToken, type SessionClaims } from './jwt';

export interface SessionContext {
  session: SessionClaims;
  user: { id: string; name: string; email: string; role: string };
  activeModules: string[];
  tenant: {
    id: string;
    slug: string;
    tradeName: string;
    legalName: string;
    cnpj: string;
    status: string;
    nicheCode: string | null;
    taxRegime: string;
    simplesNacionalAnexo: string | null;
    inscricaoEstadual: string | null;
    uf: string | null;
  };
  niche: { code: string; label: string; tagline: string } | null;
  subscription: {
    planCode: string;
    planLabel: string;
    status: string;
    currentPeriodEnd: string | null;
  } | null;
}

export async function getSessionContext(): Promise<SessionContext | null> {
  const token = cookies().get(SESSION_COOKIE)?.value;
  if (!token) return null;

  let claims: SessionClaims;
  try {
    claims = await verifySessionToken(token);
  } catch {
    return null;
  }

  const [user, tenant, subscription, activeModules] = await Promise.all([
    prismaUnscoped.user.findUnique({
      where: { id: claims.userId },
      select: { id: true, name: true, email: true, role: true, active: true },
    }),
    prismaUnscoped.tenant.findUnique({
      where: { id: claims.tenantId },
      select: {
        id: true,
        slug: true,
        tradeName: true,
        legalName: true,
        cnpj: true,
        status: true,
        nicheCode: true,
        taxRegime: true,
        simplesNacionalAnexo: true,
        inscricaoEstadual: true,
        uf: true,
      },
    }),
    prismaUnscoped.subscription.findFirst({
      where: { tenantId: claims.tenantId },
      include: { plan: true },
      orderBy: { createdAt: 'desc' },
    }),
    getActiveModuleCodes(claims.tenantId),
  ]);

  if (!user || !user.active || !tenant) return null;

  const niche = tenant.nicheCode
    ? await prismaUnscoped.niche.findUnique({
        where: { code: tenant.nicheCode },
        select: { code: true, label: true, tagline: true },
      })
    : null;

  return {
    session: claims,
    user: { id: user.id, name: user.name, email: user.email, role: user.role },
    activeModules,
    tenant: {
      id: tenant.id,
      slug: tenant.slug,
      tradeName: tenant.tradeName,
      legalName: tenant.legalName,
      cnpj: tenant.cnpj,
      status: tenant.status,
      nicheCode: tenant.nicheCode,
      taxRegime: tenant.taxRegime,
      simplesNacionalAnexo: tenant.simplesNacionalAnexo,
      inscricaoEstadual: tenant.inscricaoEstadual,
      uf: tenant.uf,
    },
    niche,
    subscription: subscription
      ? {
          planCode: subscription.plan.code,
          planLabel: subscription.plan.label,
          status: subscription.status,
          currentPeriodEnd: subscription.currentPeriodEnd?.toISOString() ?? null,
        }
      : null,
  };
}