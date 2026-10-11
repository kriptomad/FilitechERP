'use client';

import { useEffect, useState } from 'react';
import { Box, Card, CardContent, Grid, Typography, Chip, Table, TableBody, TableCell, TableContainer, TableHead, TableRow, TablePagination, CircularProgress } from '@mui/material';;;;;
import { apiAdmin, ApiError } from '../../api/apiAdmin';
import { brl } from '../../lib/brl';

interface RevenueData {
  mrr: { total: number; byPlan: Record<string, number>; byModule: Record<string, number> };
  churn: { rate: number; monthly: Array<{ month: string; churned: number; new: number }> };
  ltv: { average: number; byNiche: Record<string, number> };
  projection: Array<{ month: string; projectedMrr: number }>;
  tenants: Array<{
    id: string;
    tradeName: string;
    status: string;
    mrr: number;
    planCode: string;
    activeModules: string[];
    createdAt: string;
  }>;
  totalTenants: number;
}

export function RevenueDashboardPage() {
  const [data, setData] = useState<RevenueData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [page, setPage] = useState(0);
  const [pageSize, setPageSize] = useState(20);
  const [sortBy, setSortBy] = useState('mrr');
  const [sortOrder, setSortOrder] = useState<'asc' | 'desc'>('desc');

  const fetchData = async () => {
    setLoading(true);
    setError(null);
    try {
      const params = new URLSearchParams({
        page: String(page),
        pageSize: String(pageSize),
        sortBy,
        sortOrder,
      });
      const data = await apiAdmin<RevenueData>(`/platform-admin/billing/revenue?${params}`);
      setData(data);
    } catch (err: any) {
      setError(err instanceof ApiError ? err.message : 'Falha ao carregar dashboard');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { fetchData(); }, [page, pageSize, sortBy, sortOrder]);

  const handleSort = (field: string) => {
    if (sortBy === field) {
      setSortOrder(sortOrder === 'asc' ? 'desc' : 'asc');
    } else {
      setSortBy(field);
      setSortOrder('desc');
    }
  };

  if (loading) return <Box sx={{ display: 'flex', justifyContent: 'center', py: 8 }}><CircularProgress /></Box>;
  if (error) return <Typography color="error">{error}</Typography>;
  if (!data) return <Typography>Carregando...</Typography>;

  return (
    <Box sx={{ display: 'flex', flexDirection: 'column', gap: 3 }}>
      <Typography variant="h5" fontWeight={700}>Dashboard de Receita</Typography>

      <Grid container spacing={3}>
        <Grid item xs={12} sm={6} md={3}>
          <Card>
            <CardContent>
              <Typography variant="caption" color="text.secondary">MRR Total</Typography>
              <Typography variant="h4" fontWeight={700} fontFamily="monospace" sx={{ mt: 1 }}>{brl(data.mrr.total)}</Typography>
            </CardContent>
          </Card>
        </Grid>
        <Grid item xs={12} sm={6} md={3}>
          <Card>
            <CardContent>
              <Typography variant="caption" color="text.secondary">Churn Mensal</Typography>
              <Typography variant="h4" fontWeight={700} color={data.churn.rate > 5 ? 'error' : 'success'} sx={{ mt: 1 }}>
                {data.churn.rate.toFixed(1)}%
              </Typography>
            </CardContent>
          </Card>
        </Grid>
        <Grid item xs={12} sm={6} md={3}>
          <Card>
            <CardContent>
              <Typography variant="caption" color="text.secondary">LTV Médio</Typography>
              <Typography variant="h4" fontWeight={700} fontFamily="monospace" sx={{ mt: 1 }}>{brl(data.ltv.average)}</Typography>
            </CardContent>
          </Card>
        </Grid>
        <Grid item xs={12} sm={6} md={3}>
          <Card>
            <CardContent>
              <Typography variant="caption" color="text.secondary">Tenants Ativos</Typography>
              <Typography variant="h4" fontWeight={700} sx={{ mt: 1 }}>{data.totalTenants}</Typography>
            </CardContent>
          </Card>
        </Grid>
      </Grid>

      <Grid container spacing={3}>
        <Grid item xs={12} md={6}>
          <Card>
            <CardContent>
              <Typography variant="h6" fontWeight={600} gutterBottom>MRR por Plano</Typography>
              <Box sx={{ display: 'flex', flexDirection: 'column', gap: 1.5 }}>
                {Object.entries(data.mrr.byPlan).map(([plan, value]) => (
                  <Box key={plan} sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                    <Typography variant="body2">{plan}</Typography>
                    <Typography variant="body2" fontWeight={600} fontFamily="monospace">{brl(value)}</Typography>
                  </Box>
                ))}
              </Box>
            </CardContent>
          </Card>
        </Grid>
        <Grid item xs={12} md={6}>
          <Card>
            <CardContent>
              <Typography variant="h6" fontWeight={600} gutterBottom>MRR por Módulo</Typography>
              <Box sx={{ display: 'flex', flexDirection: 'column', gap: 1.5 }}>
                {Object.entries(data.mrr.byModule).map(([module, value]) => (
                  <Box key={module} sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                    <Typography variant="body2">{module}</Typography>
                    <Typography variant="body2" fontWeight={600} fontFamily="monospace">{brl(value)}</Typography>
                  </Box>
                ))}
              </Box>
            </CardContent>
          </Card>
        </Grid>
        <Grid item xs={12} md={6}>
          <Card>
            <CardContent>
              <Typography variant="h6" fontWeight={600} gutterBottom>Churn Mensal (últimos 12 meses)</Typography>
              <Box sx={{ height: 300 }}>
                {/* Gráfico seria aqui com Recharts */}
                <Typography variant="body2" color="text.secondary" sx={{ textAlign: 'center', mt: 4 }}>
                  Gráfico de churn (implementar com Recharts)
                </Typography>
              </Box>
            </CardContent>
          </Card>
        </Grid>
        <Grid item xs={12} md={6}>
          <Card>
            <CardContent>
              <Typography variant="h6" fontWeight={600} gutterBottom>Projeção MRR (3 meses)</Typography>
              <Box sx={{ height: 300 }}>
                {/* Gráfico de projeção */}
                <Typography variant="body2" color="text.secondary" sx={{ textAlign: 'center', mt: 4 }}>
                  Gráfico de projeção (implementar com Recharts)
                </Typography>
              </Box>
            </CardContent>
          </Card>
        </Grid>
        <Grid item xs={12} md={6}>
          <Card>
            <CardContent>
              <Typography variant="h6" fontWeight={600} gutterBottom>LTV por Nicho</Typography>
              <Box sx={{ display: 'flex', flexDirection: 'column', gap: 1.5 }}>
                {Object.entries(data.ltv.byNiche).map(([niche, value]) => (
                  <Box key={niche} sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                    <Typography variant="body2">{niche}</Typography>
                    <Typography variant="body2" fontWeight={600} fontFamily="monospace">{brl(value)}</Typography>
                  </Box>
                ))}
              </Box>
            </CardContent>
          </Card>
        </Grid>
        <Grid item xs={12} md={6}>
          <Card>
            <CardContent>
              <Typography variant="h6" fontWeight={600} gutterBottom>Top 20 Tenants por MRR</Typography>
              <TableContainer>
                <Table size="small">
                  <TableHead>
                    <TableRow>
                      <TableCell onClick={() => handleSort('tradeName')} style={{ cursor: 'pointer' }}>
                        Empresa {sortBy === 'tradeName' ? (sortOrder === 'asc' ? '↑' : '↓') : ''}
                      </TableCell>
                      <TableCell onClick={() => handleSort('mrr')} style={{ cursor: 'pointer' }} align="right">
                        MRR {sortBy === 'mrr' ? (sortOrder === 'asc' ? '↑' : '↓') : ''}
                      </TableCell>
                      <TableCell onClick={() => handleSort('planCode')} style={{ cursor: 'pointer' }}>
                        Plano {sortBy === 'planCode' ? (sortOrder === 'asc' ? '↑' : '↓') : ''}
                      </TableCell>
                      <TableCell>Módulos</TableCell>
                      <TableCell onClick={() => handleSort('status')} style={{ cursor: 'pointer' }}>
                        Status {sortBy === 'status' ? (sortOrder === 'asc' ? '↑' : '↓') : ''}
                      </TableCell>
                    </TableRow>
                  </TableHead>
                  <TableBody>
                    {data.tenants.map((t) => (
                      <TableRow key={t.id} hover>
                        <TableCell>{t.tradeName}</TableCell>
                        <TableCell align="right"sx={{ fontFamily: 'monospace' }}><Typography variant="body2" fontWeight={600}>{brl(t.mrr)}</Typography></TableCell>
                        <TableCell>{t.planCode}</TableCell>
                        <TableCell>
                          <Box sx={{ display: 'flex', flexWrap: 'wrap', gap: 1 }}>
                            {t.activeModules.slice(0, 3).map((m) => (
                              <Chip key={m} label={m} size="small" variant="outlined" sx={{ fontSize: 10, height: 20 }} />
                            ))}
                            {t.activeModules.length > 3 && <Chip label={`+${t.activeModules.length - 3}`} size="small" variant="outlined" sx={{ fontSize: 10, height: 20 }} />}
                          </Box>
                        </TableCell>
                        <TableCell><Chip label={t.status} size="small" variant="outlined" /></TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </TableContainer>
              <TablePagination
                component="div"
                count={data.totalTenants}
                rowsPerPage={pageSize}
                page={page}
                onPageChange={(_: unknown, newPage: number) => setPage(newPage)}
                onRowsPerPageChange={(e) => { setPageSize(Number(e.target.value)); setPage(0); }}
              />
            </CardContent>
          </Card>
        </Grid>
      </Grid>
    </Box>
  );
}