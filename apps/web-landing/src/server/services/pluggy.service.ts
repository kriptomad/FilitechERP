// apps/web-landing/src/server/services/pluggy.service.ts
import { PluggyClient } from 'pluggy-sdk';
import { prismaUnscoped } from '../db';
import { PersonalAccountType } from '@prisma/client';
// findReconciliationCandidate será importado dinamicamente quando necessário

const PLUGGY_BASE_URL = 'https://api.pluggy.ai';

let cachedApiKey: { value: string; expiresAt: number } | null = null;

async function getPluggyApiKey(): Promise<string> {
  if (cachedApiKey && cachedApiKey.expiresAt > Date.now() + 5 * 60 * 1000) {
    return cachedApiKey.value;
  }

  const auth = Buffer.from(
    `${process.env.PLUGGY_CLIENT_ID}:${process.env.PLUGGY_CLIENT_SECRET}`
  ).toString('base64');

  const res = await fetch(`${PLUGGY_BASE_URL}/auth`, {
    method: 'POST',
    headers: { Authorization: `Basic ${auth}`, 'Content-Type': 'application/json' },
  });

  if (!res.ok) {
    throw new Error(`Pluggy auth failed: ${res.status}`);
  }

  const { apiKey } = await res.json();
  cachedApiKey = { value: apiKey, expiresAt: Date.now() + 2 * 60 * 60 * 1000 };
  return apiKey;
}

export async function createConnectToken(tenantId: string): Promise<string> {
  const pluggy = new PluggyClient({
    clientId: process.env.PLUGGY_CLIENT_ID!,
    clientSecret: process.env.PLUGGY_CLIENT_SECRET!,
  });

  const { accessToken } = await pluggy.createConnectToken(tenantId);

  return accessToken;
}

export async function fetchPluggyAccounts(itemId: string) {
  const apiKey = await getPluggyApiKey();
  const res = await fetch(`${PLUGGY_BASE_URL}/accounts?itemId=${itemId}`, {
    headers: { 'X-API-KEY': apiKey },
  });
  if (!res.ok) throw new Error(`Pluggy accounts fetch failed: ${res.status}`);
  const { results } = await res.json();
  return results;
}

export async function fetchPluggyTransactions(accountId: string, from: string) {
  const apiKey = await getPluggyApiKey();
  const res = await fetch(
    `${PLUGGY_BASE_URL}/v2/transactions?accountId=${accountId}&from=${from}&pageSize=500`,
    { headers: { 'X-API-KEY': await getPluggyApiKey() } }
  );
  if (!res.ok) throw new Error(`Pluggy transactions fetch failed: ${res.status}`);
  const { results } = await res.json();
  return results;
}

export async function fetchPluggyInvestments(itemId: string) {
  const apiKey = await getPluggyApiKey();
  const res = await fetch(`${PLUGGY_BASE_URL}/investments?itemId=${itemId}`, {
    headers: { 'X-API-KEY': await getPluggyApiKey() },
  });
  if (!res.ok) throw new Error(`Pluggy investments fetch failed: ${res.status}`);
  const { results } = await res.json();
  return results;
}

// Sincroniza item (contas + transações + investimentos)
export async function syncPluggyItem(itemId: string) {
  const consent = await prismaUnscoped.openFinanceConsent.findUnique({
    where: { itemId },
    include: { tenant: true },
  });
  if (!consent) throw new Error(`Consent not found for item ${itemId}`);

  const isBusiness = consent.tenant.tenantType === 'BUSINESS';

  // 1. Contas
  const pluggyAccounts = await fetchPluggyAccounts(itemId);
  for (const pa of pluggyAccounts) {
    if (isBusiness) {
      await prismaUnscoped.bankAccount.upsert({
        where: {
          openFinanceConsentId_openFinanceExternalAccountId: {
            openFinanceConsentId: consent.id,
            openFinanceExternalAccountId: pa.id,
          },
        },
        create: {
          tenantId: consent.tenantId,
          bankName: pa.name,
          agencyNumber: pa.bankData?.agency ?? '',
          accountNumber: pa.bankData?.account ?? '',
          currentBalance: pa.balance,
          openFinanceConsentId: consent.id,
          openFinanceExternalAccountId: pa.id,
        },
        update: { currentBalance: pa.balance },
      });
    } else {
      await prismaUnscoped.personalAccount.upsert({
        where: {
          openFinanceConsentId_institutionName: {
            openFinanceConsentId: consent.id,
            institutionName: pa.name,
          },
        },
        create: {
          tenantId: consent.tenantId,
          name: pa.name,
          type: mapPluggyAccountType(pa.type),
          currentBalance: pa.balance,
          openFinanceConsentId: consent.id,
        },
        update: { currentBalance: pa.balance },
      });
    }
  }

  await prismaUnscoped.openFinanceConsent.update({
    where: { itemId },
    data: { status: 'UPDATED', lastSyncedAt: new Date() },
  });

  return { accountsSynced: pluggyAccounts.length };
}

export async function syncPluggyTransactions(itemId: string) {
  const consent = await prismaUnscoped.openFinanceConsent.findUnique({
    where: { itemId },
    include: { tenant: true },
  });
  if (!consent) throw new Error(`Consent not found for item ${itemId}`);

  const isBusiness = consent.tenant.tenantType === 'BUSINESS';

  const accounts = isBusiness
    ? await prismaUnscoped.bankAccount.findMany({ where: { openFinanceConsentId: consent.id } })
    : await prismaUnscoped.personalAccount.findMany({ where: { openFinanceConsentId: consent.id } });

  const since = consent.lastSyncedAt?.toISOString().slice(0, 10) ?? '2020-01-01';

  for (const account of accounts) {
    const pluggyTransactions = await fetchPluggyTransactions(account.id, since);

    for (const pt of pluggyTransactions) {
      if (isBusiness) {
        // BankTransaction (ERP)
        await prismaUnscoped.$transaction(async (tx) => {
          const transaction = await tx.bankTransaction.upsert({
            where: {
              tenantId_bankAccountId_externalFitId: {
                tenantId: consent.tenantId,
                bankAccountId: account.id,
                externalFitId: pt.id,
              },
            },
            update: { description: pt.description },
            create: {
              tenantId: consent.tenantId,
              bankAccountId: account.id,
              externalFitId: pt.id,
              description: pt.description,
              amount: pt.amount,
              transactionDate: new Date(pt.date),
            },
          });

          const suggestedMatch = await (async () => {
              const { findReconciliationCandidate } = await import('./reconcile-bank-statement');
              return findReconciliationCandidate(tx, consent.tenantId, pt.amount, new Date(pt.date));
            })();
          if (suggestedMatch) {
            await tx.bankTransaction.update({
              where: { id: transaction.id },
              data: {
                reconciliationStatus: 'SUGGESTED',
                [suggestedMatch.type === 'PAYABLE' ? 'matchedAccountPayableId' : 'matchedAccountReceivableId']: suggestedMatch.id,
              },
            });
          }
        });
      } else {
        // PersonalTransaction (B2C)
        await prismaUnscoped.personalTransaction.upsert({
          where: { openFinanceExternalId: pt.id },
          create: {
            tenantId: consent.tenantId,
            accountId: account.id,
            createdByUserId: (await getOwnerUserId(consent.tenantId)),
            type: pt.amount >= 0 ? 'INCOME' : 'EXPENSE',
            amount: Math.abs(pt.amount),
            transactionDate: new Date(pt.date),
            description: pt.description,
            merchantName: pt.merchant?.name ?? null,
            openFinanceExternalId: pt.id,
          },
          update: { description: pt.description },
        });
      }
    }
  }

  await prismaUnscoped.openFinanceConsent.update({
    where: { itemId },
    data: { lastSyncedAt: new Date() },
  });
}

export async function syncPluggyInvestments(itemId: string) {
  const consent = await prismaUnscoped.openFinanceConsent.findUnique({
    where: { itemId },
    include: { tenant: true },
  });
  if (!consent || consent.tenant.tenantType !== 'PERSONAL') return;

  const pluggyInvestments = await fetchPluggyInvestments(itemId);

  for (const pi of pluggyInvestments) {
    await prismaUnscoped.personalInvestment.upsert({
      where: { openFinanceExternalId: pi.id },
      create: {
        tenantId: consent.tenantId,
        accountId: (await getPersonalAccountIdForInvestment(consent.tenantId, pi)),
        assetType: mapPluggyInvestmentType(pi.type),
        assetName: pi.name,
        ticker: pi.ticker ?? null,
        quantity: pi.quantity,
        averagePrice: pi.averagePrice,
        currentPrice: pi.currentPrice,
        openFinanceExternalId: pi.id,
      },
      update: { currentPrice: pi.currentPrice, quantity: pi.quantity },
    });
  }
}

function mapPluggyAccountType(pluggyType: string): PersonalAccountType {
  if (pluggyType === 'BANK') return 'CHECKING';
  if (pluggyType === 'CREDIT') return 'CREDIT_CARD';
  return 'WALLET_CASH';
}

function mapPluggyInvestmentType(pluggyType: string): 'TESOURO_DIRETO' | 'CDB' | 'LCI_LCA' | 'ACOES' | 'FII' | 'CRIPTO' | 'PREVIDENCIA_PRIVADA' | 'POUPANCA' {
  const map: Record<string, any> = {
    'TESOURO': 'TESOURO_DIRETO',
    'CDB': 'CDB',
    'LCI_LCA': 'LCI_LCA',
    'STOCK': 'ACOES',
    'FUND': 'FII',
    'CRYPTO': 'CRIPTO',
    'PENSION': 'PREVIDENCIA_PRIVADA',
    'SAVINGS': 'POUPANCA',
  };
  return map[pluggyType] ?? 'CDB';
}

async function getOwnerUserId(tenantId: string) {
  const owner = await prismaUnscoped.user.findFirstOrThrow({ where: { tenantId, role: 'OWNER' } });
  return owner.id;
}

async function getPersonalAccountIdForInvestment(tenantId: string, pi: any) {
  // Busca ou cria conta de investimento padrão
  let acc = await prismaUnscoped.personalAccount.findFirst({
    where: { tenantId, type: 'INVESTMENT_BROKERAGE' },
  });
  if (!acc) {
    acc = await prismaUnscoped.personalAccount.create({
      data: { tenantId, name: 'Investimentos (Pluggy)', type: 'INVESTMENT_BROKERAGE', currentBalance: 0 },
    });
  }
  return acc.id;
}