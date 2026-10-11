// src/app/api/pessoal/dashboard/route.ts — Cap. 22
// Dashboard do Filitech Pessoal (B2C)
import { prismaUnscoped } from '@/server/db';
import { jsonSuccess } from '@/server/api-envelope';
import { requireSession } from '@/server/session';
import { handle } from '@/server/handler';

export const dynamic = 'force-dynamic';

export const GET = handle(async (request: Request) => {
  const session = await requireSession(request);
  const tenantId = session.tenantId;

  // Verifica se é tenant PERSONAL
  const tenant = await prismaUnscoped.tenant.findUnique({
    where: { id: tenantId },
    select: { tenantType: true },
  });

  if (tenant?.tenantType !== 'PERSONAL') {
    return jsonSuccess({
      netWorth: 0,
      totalAssets: 0,
      totalLiabilities: 0,
      monthlyIncome: 0,
      monthlyExpenses: 0,
      monthlyBalance: 0,
      budgetAlerts: 0,
      overdueBills: 0,
      upcomingBills: 0,
      accountsSummary: [],
      categorySpending: [],
      netWorthHistory: [],
      recentTransactions: [],
    });
  }

  const now = new Date();
  const startOfMonth = new Date(now.getFullYear(), now.getMonth(), 1);
  const endOfMonth = new Date(now.getFullYear(), now.getMonth() + 1, 0, 23, 59, 59);
  const startOfYear = new Date(now.getFullYear(), 0, 1);

  // Busca dados em paralelo
  const [
    accounts,
    transactions,
    budgets,
    bills,
    debts,
    investments,
    netWorthSnapshots,
  ] = await Promise.all([
    prismaUnscoped.personalAccount.findMany({
      where: { tenantId },
      select: { id: true, name: true, type: true, currentBalance: true },
    }),
    prismaUnscoped.personalTransaction.findMany({
      where: { tenantId, transactionDate: { gte: startOfMonth, lte: endOfMonth } },
      orderBy: { transactionDate: 'desc' },
      select: { id: true, type: true, amount: true, transactionDate: true, description: true, category: { select: { name: true } } },
    }),
    prismaUnscoped.personalBudget.findMany({
      where: { tenantId, active: true, alertThreshold: { gt: 0 } },
      include: { category: true },
    }),
    prismaUnscoped.personalBill.findMany({
      where: { tenantId, status: 'PENDING' },
      select: { id: true, description: true, amount: true, dueDate: true, status: true },
    }),
    prismaUnscoped.personalDebt.findMany({
      where: { tenantId, status: 'ACTIVE' },
      select: { id: true, name: true, remainingBalance: true, originalAmount: true, interestRate: true, dueDate: true },
    }),
    prismaUnscoped.personalInvestment.findMany({
      where: { tenantId },
      select: { id: true, assetName: true, assetType: true, currentPrice: true, quantity: true, averagePrice: true },
    }),
    prismaUnscoped.netWorthSnapshot.findMany({
      where: { tenantId, date: { gte: startOfYear } },
      orderBy: { date: 'asc' },
      select: { date: true, netWorth: true, totalAssets: true, totalLiabilities: true },
    }),
  ]);

  // Cálculos
  const totalAssets = accounts.reduce((s, a) => s + Number(a.currentBalance), 0) +
    investments.reduce((s, i) => s + Number(i.currentPrice) * Number(i.quantity), 0);

  const totalLiabilities = debts.reduce((s, d) => s + Number(d.remainingBalance), 0);
  const netWorth = totalAssets - totalLiabilities;

  const monthlyIncome = transactions
    .filter(t => t.type === 'INCOME')
    .reduce((s, t) => s + Number(t.amount), 0);

  const monthlyExpenses = transactions
    .filter(t => t.type === 'EXPENSE')
    .reduce((s, t) => s + Number(t.amount), 0);

  const monthlyBalance = monthlyIncome - monthlyExpenses;

  // Alertas de orçamento
  let budgetAlerts = 0;
  for (const budget of budgets) {
    const spent = transactions
      .filter(t => t.type === 'EXPENSE' && t.category?.name === budget.category.name)
      .reduce((s, t) => s + Number(t.amount), 0);
    const percentage = Number(budget.amount) > 0 ? (spent / Number(budget.amount)) * 100 : 0;
    if (percentage >= Number(budget.alertThreshold)) budgetAlerts++;
  }

  // Contas a pagar
  const nowDate = new Date();
  const in7Days = new Date(nowDate.getTime() + 7 * 24 * 60 * 60 * 1000);
  const overdueBills = bills.filter(b => new Date(b.dueDate) < nowDate).length;
  const upcomingBills = bills.filter(b => new Date(b.dueDate) >= nowDate && new Date(b.dueDate) <= in7Days).length;

  // Resumo de contas
  const accountColors: Record<string, string> = {
    CHECKING: '#4F46E5',
    SAVINGS: '#10B981',
    CREDIT_CARD: '#EF4444',
    INVESTMENT_BROKERAGE: '#F59E0B',
    CASH: '#6B7280',
    WALLET_CASH: '#8B5CF6',
  };

  const accountsSummary = accounts.map(a => ({
    name: a.name,
    type: a.type,
    balance: Number(a.currentBalance),
    color: accountColors[a.type] ?? '#6B7280',
  }));

  // Gastos por categoria
  const categoryMap = new Map<string, { amount: number; color: string }>();
  const categoryColors = ['#EF4444', '#F59E0B', '#4F46E5', '#10B981', '#8B5CF6', '#EC4899', '#06B6D4', '#F97316'];
  let colorIndex = 0;

  for (const t of transactions.filter(t => t.type === 'EXPENSE')) {
    const catName = t.category?.name ?? 'Outros';
    const existing = categoryMap.get(catName) ?? { amount: 0, color: categoryColors[colorIndex % categoryColors.length] };
    if (!categoryMap.has(catName)) colorIndex++;
    existing.amount += Number(t.amount);
    categoryMap.set(catName, existing);
  }

  const categorySpending = Array.from(categoryMap.entries())
    .map(([category, { amount, color }]) => ({ category, amount, color }))
    .sort((a, b) => b.amount - a.amount);

  // Histórico de patrimônio (últimos 12 meses)
  const netWorthHistory = netWorthSnapshots.map(s => ({
    date: s.date.toISOString(),
    netWorth: Number(s.netWorth),
    totalAssets: Number(s.totalAssets),
    totalLiabilities: Number(s.totalLiabilities),
  }));

  // Transações recentes (últimas 20)
  const recentTransactions = transactions.slice(0, 20).map(t => ({
    id: t.id,
    date: t.transactionDate.toISOString(),
    description: t.description,
    amount: Number(t.amount),
    type: t.type,
    category: t.category?.name ?? 'Outros',
  }));

  return jsonSuccess({
    netWorth,
    totalAssets,
    totalLiabilities,
    monthlyIncome,
    monthlyExpenses,
    monthlyBalance,
    budgetAlerts,
    overdueBills,
    upcomingBills,
    accountsSummary,
    categorySpending,
    netWorthHistory,
    recentTransactions,
  });
});