// src/app/app/pessoal/page.tsx — Cap. 22 (Filitech Pessoal - Dashboard doméstico)
'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { api, ApiError } from '@/lib/api';
import { Card, CardContent, Grid, Typography, Box, Alert, Button, Skeleton } from '@mui/material';
import { AccountBalanceWallet, TrendingUp, TrendingDown, AccountBalance, Flag, Savings, CreditCard, PieChart, CalendarMonth } from '@mui/icons-material';

interface DashboardData {
  netWorth: number;
  totalAssets: number;
  totalLiabilities: number;
  monthlyIncome: number;
  monthlyExpenses: number;
  monthlyBalance: number;
  budgetAlerts: number;
  overdueBills: number;
  upcomingBills: number;
  accountsSummary: Array<{ name: string; type: string; balance: number; color: string }>;
  categorySpending: Array<{ category: string; amount: number; color: string }>;
  netWorthHistory: Array<{ date: string; netWorth: number }>;
  recentTransactions: Array<{ id: string; date: string; description: string; amount: number; type: 'INCOME' | 'EXPENSE'; category: string }>;
}

export default function PessoalDashboard() {
  const [data, setData] = useState<DashboardData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    api<DashboardData>('/api/pessoal/dashboard')
      .then((json) => { if (!cancelled) { setData(json.data); setError(null); } })
      .catch((err) => { if (!cancelled) { setError(err instanceof ApiError ? err.message : 'Falha ao carregar dashboard'); } })
      .finally(() => { if (!cancelled) setLoading(false); });
    return () => { cancelled = true; };
  }, []);

  if (loading) {
    return (
      <Box sx={{ flexGrow: 1, p: 3 }}>
        <Grid container spacing={3}>
          {[1,2,3,4].map((i) => (
            <Grid item xs={12} sm={6} md={3} key={i}>
              <Skeleton variant="rectangular" height={120} />
            </Grid>
          ))}
        </Grid>
      </Box>
    );
  }

  if (error) {
    return <Alert severity="error">{error}</Alert>;
  }

  if (!data) return null;

  const formatBRL = (value: number) => value.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
  const formatDate = (date: string) => new Date(date).toLocaleDateString('pt-BR');

  return (
    <Box sx={{ flexGrow: 1, p: 3 }}>
      {/* Header */}
      <Box sx={{ mb: 4, display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: 2 }}>
        <Box>
          <Typography variant="h4" sx={{ fontWeight: 700, color: '#4F46E5' }}>Filitech Pessoal</Typography>
          <Typography variant="body1" color="text.secondary">Seu controle financeiro doméstico inteligente</Typography>
        </Box>
        <Box sx={{ display: 'flex', gap: 2 }}>
          <Link href="/app/pessoal/transacoes/nova">
            <Button startIcon={<Flag />} variant="contained" size="large">Nova Transação</Button>
          </Link>
          <Link href="/app/pessoal/open-finance">
            <Button startIcon={<AccountBalance />} variant="outlined" size="large">Conectar Banco</Button>
          </Link>
        </Box>
      </Box>

      {/* Alertas */}
      {(data.budgetAlerts > 0 || data.overdueBills > 0) && (
        <Alert severity={data.overdueBills > 0 ? 'error' : 'warning'} sx={{ mb: 3 }}>
          {data.overdueBills > 0 && <Typography>{data.overdueBills} conta(s) vencida(s) — regularize agora</Typography>}
          {data.budgetAlerts > 0 && <Typography>{data.budgetAlerts} orçamento(s) próximo(s) do limite</Typography>}
        </Alert>
      )}

      {/* Cards principais */}
      <Grid container spacing={3} sx={{ mb: 4 }}>
        <Grid item xs={12} sm={6} md={3}>
          <Card sx={{ background: 'linear-gradient(135deg, #4F46E5 0%, #7C3AED 100%)', color: 'white' }}>
            <CardContent>
              <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
                <Box>
                  <Typography variant="caption" sx={{ opacity: 0.9 }}>Patrimônio Líquido</Typography>
                  <Typography variant="h3" sx={{ fontWeight: 800, mt: 1 }}>{formatBRL(data.netWorth)}</Typography>
                  <Typography variant="caption" sx={{ opacity: 0.8, mt: 1 }}>
                    {data.netWorth >= 0 ? <TrendingUp sx={{ fontSize: 16, mr: 1 }} /> : <TrendingDown sx={{ fontSize: 16, mr: 1 }} />}
                    {data.netWorth >= 0 ? 'Positivo' : 'Negativo'}
                  </Typography>
                </Box>
                <AccountBalanceWallet sx={{ fontSize: 48, opacity: 0.3 }} />
              </Box>
            </CardContent>
          </Card>
        </Grid>

        <Grid item xs={12} sm={6} md={3}>
          <Card sx={{ background: 'linear-gradient(135deg, #10B981 0%, #059669 100%)', color: 'white' }}>
            <CardContent>
              <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
                <Box>
                  <Typography variant="caption" sx={{ opacity: 0.9 }}>Receitas do Mês</Typography>
                  <Typography variant="h3" sx={{ fontWeight: 800, mt: 1 }}>{formatBRL(data.monthlyIncome)}</Typography>
                  <Typography variant="caption" sx={{ opacity: 0.8, mt: 1 }}>
                    <TrendingUp sx={{ fontSize: 16, mr: 1 }} /> +{formatBRL(data.monthlyBalance)} saldo
                  </Typography>
                </Box>
                <TrendingUp sx={{ fontSize: 48, opacity: 0.3 }} />
              </Box>
            </CardContent>
          </Card>
        </Grid>

        <Grid item xs={12} sm={6} md={3}>
          <Card sx={{ background: 'linear-gradient(135deg, #EF4444 0%, #DC2626 100%)', color: 'white' }}>
            <CardContent>
              <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
                <Box>
                  <Typography variant="caption" sx={{ opacity: 0.9 }}>Despesas do Mês</Typography>
                  <Typography variant="h3" sx={{ fontWeight: 800, mt: 1 }}>{formatBRL(data.monthlyExpenses)}</Typography>
                  <Typography variant="caption" sx={{ opacity: 0.8, mt: 1 }}>
                    <TrendingDown sx={{ fontSize: 16, mr: 1 }} /> {((data.monthlyExpenses / data.monthlyIncome) * 100).toFixed(0)}% da receita
                  </Typography>
                </Box>
                <TrendingDown sx={{ fontSize: 48, opacity: 0.3 }} />
              </Box>
            </CardContent>
          </Card>
        </Grid>

        <Grid item xs={12} sm={6} md={3}>
          <Card sx={{ background: 'linear-gradient(135deg, #F59E0B 0%, #D97706 100%)', color: 'white' }}>
            <CardContent>
              <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
                <Box>
                  <Typography variant="caption" sx={{ opacity: 0.9 }}>Contas a Pagar</Typography>
                  <Typography variant="h3" sx={{ fontWeight: 800, mt: 1 }}>{data.upcomingBills + data.overdueBills}</Typography>
                  <Typography variant="caption" sx={{ opacity: 0.8, mt: 1 }}>
                    {data.overdueBills > 0 ? <span style={{ color: '#FECACA' }}>{data.overdueBills} vencidas</span> : 'Em dia'}
                    {data.upcomingBills > 0 && <span style={{ marginLeft: 8 }}>• {data.upcomingBills} a vencer</span>}
                  </Typography>
                </Box>
                <Flag sx={{ fontSize: 48, opacity: 0.3 }} />
              </Box>
            </CardContent>
          </Card>
        </Grid>
      </Grid>

      {/* Segunda linha: Gráficos e Resumo */}
      <Grid container spacing={3} sx={{ mb: 4 }}>
        {/* Evolução Patrimonial */}
        <Grid item xs={12} md={7}>
          <Card>
            <CardContent>
              <Typography variant="h6" sx={{ mb: 3, fontWeight: 600 }}>Evolução do Patrimônio (últimos 12 meses)</Typography>
              <div style={{ height: 300 }}>
                {/* Aqui entraria um gráfico real (Recharts/Chart.js) */}
                <Box sx={{ display: 'flex', alignItems: 'flex-end', justifyContent: 'space-around', height: '100%', px: 2, pb: 2 }}>
                  {data.netWorthHistory.slice(-12).map((point, i) => (
                    <Box
                      key={i}
                      sx={{
                        width: '6%',
                        height: `${Math.max(10, ((point.netWorth + Math.abs(Math.min(...data.netWorthHistory.map(p => p.netWorth)))) / (Math.max(...data.netWorthHistory.map(p => p.netWorth)) - Math.min(...data.netWorthHistory.map(p => p.netWorth))) * 90))}%`,
                        background: point.netWorth >= 0 ? 'linear-gradient(to top, #10B981, #34D399)' : 'linear-gradient(to top, #EF4444, #F87171)',
                        borderRadius: '4px 4px 0 0',
                        transition: 'height 0.3s',
                        position: 'relative',
                        '&::after': {
                          content: `"${formatDate(point.date).slice(3)}"`,
                          position: 'absolute',
                          bottom: '-24px',
                          left: '50%',
                          transform: 'translateX(-50%)',
                          fontSize: '10px',
                          color: '#9CA3AF',
                          whiteSpace: 'nowrap',
                        },
                      }}
                    />
                  ))}
                </Box>
              </div>
            </CardContent>
          </Card>
        </Grid>

        {/* Resumo de Contas */}
        <Grid item xs={12} md={5}>
          <Card>
            <CardContent>
              <Typography variant="h6" sx={{ mb: 3, fontWeight: 600 }}>Suas Contas</Typography>
              {data.accountsSummary.map((acc) => (
                <Box key={acc.name} sx={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', py: 2, borderBottom: '1px solid #E5E7EB' }}>
                  <Box sx={{ display: 'flex', alignItems: 'center', gap: 2 }}>
                    <Box sx={{ width: 40, height: 40, borderRadius: '50%', backgroundColor: acc.color, display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'white' }}>
                      {acc.type === 'CHECKING' ? <AccountBalance /> : acc.type === 'SAVINGS' ? <Savings /> : <CreditCard />}
                    </Box>
                    <Box>
                      <Typography variant="body2" fontWeight={500}>{acc.name}</Typography>
                      <Typography variant="caption" color="text.secondary">{acc.type}</Typography>
                    </Box>
                  </Box>
                  <Typography variant="body2" fontWeight={600} sx={{ color: acc.balance >= 0 ? '#10B981' : '#EF4444' }}>
                    {formatBRL(acc.balance)}
                  </Typography>
                </Box>
              ))}
            </CardContent>
          </Card>
        </Grid>

        {/* Gastos por Categoria */}
        <Grid item xs={12} md={7}>
          <Card>
            <CardContent>
              <Typography variant="h6" sx={{ mb: 3, fontWeight: 600 }}>Gastos por Categoria (mês atual)</Typography>
              <Box sx={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
                {data.categorySpending.slice(0, 8).map((cat, i) => {
                  const total = data.categorySpending.reduce((s, c) => s + c.amount, 0);
                  const pct = total > 0 ? (cat.amount / total) * 100 : 0;
                  return (
                    <Box key={i} sx={{ display: 'flex', alignItems: 'center', gap: 2 }}>
                      <Box sx={{ width: 12, height: 12, borderRadius: 2, backgroundColor: cat.color, flexShrink: 0 }} />
                      <Box sx={{ flex: 1, minWidth: 0 }}>
                        <Typography variant="body2" sx={{ whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{cat.category}</Typography>
                        <Box sx={{ height: 6, backgroundColor: '#E5E7EB', borderRadius: 3, mt: 1 }}>
                          <Box sx={{ height: '100%', width: `${pct}%`, backgroundColor: cat.color, borderRadius: 3, transition: 'width 0.3s' }} />
                        </Box>
                      </Box>
                      <Typography variant="body2" fontWeight={500} sx={{ minWidth: 80, textAlign: 'right' }}>{formatBRL(cat.amount)}</Typography>
                    </Box>
                  );
                })}
              </Box>
            </CardContent>
          </Card>
        </Grid>

        {/* Transações Recentes */}
        <Grid item xs={12} md={5}>
          <Card>
            <CardContent>
              <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', mb: 2 }}>
                <Typography variant="h6" fontWeight={600}>Transações Recentes</Typography>
                <Link href="/app/pessoal/transacoes" style={{ textDecoration: 'none' }}>
                  <Typography variant="caption" color="primary">Ver todas</Typography>
                </Link>
              </Box>
              <Box sx={{ maxHeight: 400, overflow: 'auto' }}>
                {data.recentTransactions.slice(0, 10).map((tx) => (
                  <Box key={tx.id} sx={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', py: 1.5, borderBottom: '1px solid #F3F4F6' }}>
                    <Box sx={{ flex: 1, minWidth: 0 }}>
                      <Typography variant="body2" fontWeight={500} sx={{ whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{tx.description}</Typography>
                      <Typography variant="caption" color="text.secondary">{formatDate(tx.date)} • {tx.category}</Typography>
                    </Box>
                    <Typography variant="body2" fontWeight={600} sx={{ color: tx.type === 'INCOME' ? '#10B981' : '#EF4444', ml: 2 }}>
                      {tx.type === 'INCOME' ? '+' : '-'}{formatBRL(tx.amount)}
                    </Typography>
                  </Box>
                ))}
              </Box>
            </CardContent>
          </Card>
        </Grid>

        {/* Ações Rápidas */}
        <Grid item xs={12}>
          <Card>
            <CardContent>
              <Typography variant="h6" sx={{ mb: 3, fontWeight: 600 }}>Ações Rápidas</Typography>
              <Grid container spacing={2}>
                <Grid item xs={12} sm={3}>
                  <Link href="/app/pessoal/orcamentos/novo">
                    <Card sx={{ cursor: 'pointer', transition: 'transform 0.2s', '&:hover': { transform: 'translateY(-2px)' } }}>
                      <CardContent sx={{ textAlign: 'center', py: 3 }}>
                        <PieChart sx={{ fontSize: 32, color: '#4F46E5', mx: 'auto', mb: 1 }} />
                        <Typography variant="subtitle1" fontWeight={600}>Novo Orçamento</Typography>
                        <Typography variant="caption" color="text.secondary">Defina limites por categoria</Typography>
                      </CardContent>
                    </Card>
                  </Link>
                </Grid>
                <Grid item xs={12} sm={3}>
                  <Link href="/app/pessoal/metas/nova">
                    <Card sx={{ cursor: 'pointer', transition: 'transform 0.2s', '&:hover': { transform: 'translateY(-2px)' } }}>
                      <CardContent sx={{ textAlign: 'center', py: 3 }}>
                        <Flag sx={{ fontSize: 32, color: '#10B981', mx: 'auto', mb: 1 }} />
                        <Typography variant="subtitle1" fontWeight={600}>Nova Meta</Typography>
                        <Typography variant="caption" color="text.secondary">Objetivo financeiro com prazo</Typography>
                      </CardContent>
                    </Card>
                  </Link>
                </Grid>
                <Grid item xs={12} sm={3}>
                  <Link href="/app/pessoal/dividas/nova">
                    <Card sx={{ cursor: 'pointer', transition: 'transform 0.2s', '&:hover': { transform: 'translateY(-2px)' } }}>
                      <CardContent sx={{ textAlign: 'center', py: 3 }}>
                        <CreditCard sx={{ fontSize: 32, color: '#EF4444', mx: 'auto', mb: 1 }} />
                        <Typography variant="subtitle1" fontWeight={600}>Cadastrar Dívida</Typography>
                        <Typography variant="caption" color="text.secondary">Cartão, empréstimo, financiamento</Typography>
                      </CardContent>
                    </Card>
                  </Link>
                </Grid>
                <Grid item xs={12} sm={3}>
                  <Link href="/app/pessoal/patrimonio">
                    <Card sx={{ cursor: 'pointer', transition: 'transform 0.2s', '&:hover': { transform: 'translateY(-2px)' } }}>
                      <CardContent sx={{ textAlign: 'center', py: 3 }}>
                        <AccountBalance sx={{ fontSize: 32, color: '#F59E0B', mx: 'auto', mb: 1 }} />
                        <Typography variant="subtitle1" fontWeight={600}>Patrimônio</Typography>
                        <Typography variant="caption" color="text.secondary">Histórico e projeções</Typography>
                      </CardContent>
                    </Card>
                  </Link>
                </Grid>
              </Grid>
            </CardContent>
          </Card>
        </Grid>
      </Grid>
    </Box>
  );
}