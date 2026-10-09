'use client';
// src/app/(portal)/painel/painel-view.tsx — sistema de administração completo:
// visão geral da assinatura, módulos (ligar/desligar), COBRANÇA (contas a
// receber dos clientes: gerar, baixar, cancelar), FATURAS (eventos da
// assinatura), CLIENTES (CRUD + limite de crédito), SERVIÇOS (CRUD multinicho),
// EQUIPE e EMPRESA — tudo com o mesmo breakdown que o checkout cobra.

import { useCallback, useEffect, useState } from 'react';
import { useSearchParams } from 'next/navigation';
import Link from 'next/link';
import {
  ApiError,
  ERP_APP_URL,
  api,
  brl,
  del,
  patch,
  post,
} from '../../../lib/api';
import {
  FALLBACK_CATALOG,
  type Catalog,
  type FreeLimit,
} from '../../../lib/catalog';
import { LoginCard } from '../../../components/login-card';

// ── Tipos dos envelopes da API ────────────────────────────────────────────
interface Me {
  userId: string;
  tenantId: string;
  role: string;
  activeModules: string[];
}

interface SubscriptionData {
  subscription: {
    id: string;
    status: string;
    provider: string;
    currentPeriodEnd: string | null;
    pastDueSince: string | null;
    createdAt: string;
  } | null;
  plan: {
    code: string;
    label: string;
    basePrice: number;
    includedModules: string[];
  } | null;
  tenant: {
    tradeName: string;
    legalName: string;
    status: string;
    slug: string;
    createdAt: string;
  } | null;
  activeModules: string[];
  breakdown: { code: string; label: string; price: number }[];
  mrr: number;
  billingEvents: { id: string; type: string; provider: string; createdAt: string }[];
}

interface UsageData {
  tier: string | null;
  usage: {
    sales: { current: number; limit: number };
    users: { current: number; limit: number };
    products: { current: number; limit: number };
  };
  limits: FreeLimit[];
}

interface Invoice {
  id: string;
  type: string;
  provider: string;
  createdAt: string;
  amount: number | null;
  cycle: string;
  description: string;
}

interface UserRow {
  id: string;
  name: string;
  email: string;
  role: string;
  active: boolean;
  createdAt: string;
}

interface ClientRow {
  id: string;
  name: string;
  document: string | null;
  phone: string | null;
  email: string | null;
  creditLimit: number;
  creditBalanceUsed: number;
  isBusinessAccount: boolean;
  openBalance: number;
  createdAt: string;
}

interface ServiceRow {
  id: string;
  name: string;
  nicheTag: string;
  basePrice: number;
  estimatedDurationMinutes: number;
  commissionPercentage: number;
  active: boolean;
  appointmentCount: number;
  packageCount: number;
}

interface ReceivableRow {
  id: string;
  clientId: string;
  clientName: string;
  description: string;
  amount: number;
  dueDate: string;
  status: string;
  isOverdue: boolean;
  paidAt: string | null;
  createdAt: string;
}

interface ContractRow {
  id: string;
  contractNumber: string;
  clientId: string;
  clientName: string;
  title: string;
  description: string | null;
  status: string;
  totalAmount: number;
  startDate: string;
  endDate: string | null;
  signedAt: string | null;
  pdfUrl: string | null;
  itemCount: number;
  createdAt: string;
}

type Tab =
  | 'visao'
  | 'modulos'
  | 'cobranca'
  | 'faturas'
  | 'clientes'
  | 'servicos'
  | 'contratos'
  | 'equipe'
  | 'empresa';

const TABS: { key: Tab; label: string }[] = [
  { key: 'visao', label: 'Visão geral' },
  { key: 'modulos', label: 'Módulos' },
  { key: 'cobranca', label: 'Cobrança' },
  { key: 'faturas', label: 'Faturas' },
  { key: 'clientes', label: 'Clientes' },
  { key: 'servicos', label: 'Serviços' },
  { key: 'contratos', label: 'Contratos' },
  { key: 'equipe', label: 'Equipe' },
  { key: 'empresa', label: 'Empresa' },
];

const ROLE_LABEL: Record<string, string> = {
  OWNER: 'Proprietário',
  MANAGER: 'Gerente',
  CASHIER: 'Caixa',
  TECH: 'Técnico',
  TECHNICIAN: 'Técnico',
};

const fmtDate = (value: string | null | undefined): string =>
  value ? new Date(value).toLocaleDateString('pt-BR') : '—';

const round2 = (value: number): number => Math.round(value * 100) / 100;

const NICHE_LABEL: Record<string, string> = {
  GERAL: 'Geral (multinicho)',
  PETSHOP: 'Petshop/Veterinária',
  BEAUTY_SALON: 'Salão/Barbearia',
  CAR_DETAILING: 'Estética automotiva',
  AUTOMOTIVE_WORKSHOP: 'Oficina/Assistência',
};

const RECEIVABLE_STATE: Record<string, { label: string; className: string }> = {
  PENDING: {
    label: 'Em aberto',
    className: 'border-amber-500/30 bg-amber-500/15 text-amber-400',
  },
  OVERDUE: {
    label: 'Vencida',
    className: 'border-rose-500/30 bg-rose-500/15 text-rose-400',
  },
  PAID: {
    label: 'Paga',
    className: 'border-emerald-500/30 bg-emerald-500/15 text-emerald-400',
  },
  CANCELLED: {
    label: 'Cancelada',
    className: 'border-white/10 bg-zinc-500/15 text-zinc-400',
  },
};

/** PENDING com vencimento no passado é exibida como "vencida". */
const receivableState = (row: ReceivableRow): string =>
  row.status === 'PENDING' && row.isOverdue ? 'OVERDUE' : row.status;

function ReceivableChip({ state }: { state: string }) {
  const cfg = RECEIVABLE_STATE[state] ?? RECEIVABLE_STATE.PENDING;
  return (
    <span
      className={`rounded-full border px-2.5 py-0.5 text-xs font-semibold ${cfg.className}`}
    >
      {cfg.label}
    </span>
  );
}

interface CobrancaKpis {
  aberto: number;
  abertoCount: number;
  vencido: number;
  vencidoCount: number;
  recebido: number;
  pagas: number;
  cancelado: number;
}

function cobrancaKpis(rows: ReceivableRow[]): CobrancaKpis {
  const now = new Date();
  const k: CobrancaKpis = {
    aberto: 0,
    abertoCount: 0,
    vencido: 0,
    vencidoCount: 0,
    recebido: 0,
    pagas: 0,
    cancelado: 0,
  };
  for (const row of rows) {
    const state = receivableState(row);
    if (state === 'PAID') {
      k.pagas += 1;
      const paid = row.paidAt ? new Date(row.paidAt) : null;
      if (
        paid &&
        paid.getMonth() === now.getMonth() &&
        paid.getFullYear() === now.getFullYear()
      ) {
        k.recebido += row.amount;
      }
    } else if (state === 'CANCELLED') {
      k.cancelado += row.amount;
    } else {
      k.aberto += row.amount;
      k.abertoCount += 1;
      if (state === 'OVERDUE') {
        k.vencido += row.amount;
        k.vencidoCount += 1;
      }
    }
  }
  return {
    ...k,
    aberto: round2(k.aberto),
    vencido: round2(k.vencido),
    recebido: round2(k.recebido),
    cancelado: round2(k.cancelado),
  };
}

const EMPTY_CLIENT_FORM = {
  name: '',
  document: '',
  phone: '',
  email: '',
  creditLimit: '',
  isBusinessAccount: false,
};

const EMPTY_SERVICE_FORM = {
  name: '',
  nicheTag: 'GERAL',
  basePrice: '',
  estimatedDurationMinutes: '',
  commissionPercentage: '',
  active: true,
};

const EMPTY_RECEIVABLE_FORM = { clientId: '', description: '', amount: '', dueDate: '' };

function Chip({ status }: { status: string }) {
  const style =
    status === 'ACTIVE'
      ? 'bg-emerald-500/15 text-emerald-400 border-emerald-500/30'
      : status === 'TRIAL'
        ? 'bg-sky-500/15 text-sky-400 border-sky-500/30'
        : status === 'SUSPENDED'
          ? 'bg-rose-500/15 text-rose-400 border-rose-500/30'
          : 'bg-amber-500/15 text-amber-400 border-amber-500/30';
  return (
    <span className={`rounded-full border px-2.5 py-0.5 text-xs font-semibold ${style}`}>
      {status}
    </span>
  );
}

function StatCard({
  label,
  value,
  sub,
}: {
  label: string;
  value: React.ReactNode;
  sub?: string;
}) {
  return (
    <div className="card-site p-5">
      <p className="text-xs font-medium uppercase tracking-wider text-zinc-500">
        {label}
      </p>
      <p className="mt-2 text-2xl font-bold text-zinc-100">{value}</p>
      {sub && <p className="mt-1 text-xs text-zinc-500">{sub}</p>}
    </div>
  );
}

function UsageBar({
  label,
  current,
  limit,
}: {
  label: string;
  current: number;
  limit: number;
}) {
  const pct = limit > 0 ? Math.min(100, Math.round((current / limit) * 100)) : 0;
  const almostFull = pct >= 80;
  return (
    <div>
      <div className="flex items-center justify-between text-sm">
        <span className="text-zinc-300">{label}</span>
        <span className={almostFull ? 'font-semibold text-amber-400' : 'text-zinc-400'}>
          {current} / {limit}
        </span>
      </div>
      <div className="mt-1.5 h-2 overflow-hidden rounded-full bg-zinc-800">
        <div
          className={`h-full rounded-full transition-all ${almostFull ? 'bg-amber-500' : 'bg-indigo-500'}`}
          style={{ width: `${pct}%` }}
        />
      </div>
    </div>
  );
}

export function PainelView() {
  const searchParams = useSearchParams();
  const checkoutOk = searchParams.get('checkout') === 'sucesso';
  const welcome = searchParams.get('boas-vindas') === '1';

  const [status, setStatus] = useState<'loading' | 'anon' | 'authed'>('loading');
  const [me, setMe] = useState<Me | null>(null);
  const [tab, setTab] = useState<Tab>('visao');

  const [sub, setSub] = useState<SubscriptionData | null>(null);
  const [usage, setUsage] = useState<UsageData | null>(null);
  const [invoices, setInvoices] = useState<Invoice[]>([]);
  const [users, setUsers] = useState<UserRow[]>([]);
  const [catalog, setCatalog] = useState<Catalog>(FALLBACK_CATALOG);

  const [loadingData, setLoadingData] = useState(true);
  const [toast, setToast] = useState<{ kind: 'ok' | 'err'; text: string } | null>(null);
  const [pendingModule, setPendingModule] = useState<string | null>(null);
  const [busyModule, setBusyModule] = useState<string | null>(null);

  // Convite de equipe
  const [invite, setInvite] = useState({ name: '', email: '', role: 'CASHIER' });
  const [inviteOpen, setInviteOpen] = useState(false);
  const [invitePassword, setInvitePassword] = useState<string | null>(null);
  const [inviteError, setInviteError] = useState<string | null>(null);
  const [inviteBusy, setInviteBusy] = useState(false);

  // Administração: clientes, serviços e cobranças
  const [clients, setClients] = useState<ClientRow[]>([]);
  const [services, setServices] = useState<ServiceRow[]>([]);
  const [receivables, setReceivables] = useState<ReceivableRow[]>([]);

  const [clientFormOpen, setClientFormOpen] = useState(false);
  const [clientEditId, setClientEditId] = useState<string | null>(null);
  const [clientForm, setClientForm] = useState({ ...EMPTY_CLIENT_FORM });
  const [clientQuery, setClientQuery] = useState('');
  const [clientBusy, setClientBusy] = useState(false);
  const [clientError, setClientError] = useState<string | null>(null);

  const [serviceFormOpen, setServiceFormOpen] = useState(false);
  const [serviceEditId, setServiceEditId] = useState<string | null>(null);
  const [serviceForm, setServiceForm] = useState({ ...EMPTY_SERVICE_FORM });
  const [serviceBusy, setServiceBusy] = useState(false);
  const [serviceError, setServiceError] = useState<string | null>(null);

  const [receivableFormOpen, setReceivableFormOpen] = useState(false);
  const [receivableForm, setReceivableForm] = useState({ ...EMPTY_RECEIVABLE_FORM });
  const [receivableBusy, setReceivableBusy] = useState(false);
  const [receivableError, setReceivableError] = useState<string | null>(null);
  const [receivableFilter, setReceivableFilter] = useState('todas');
  const [rowConfirm, setRowConfirm] = useState<string | null>(null);
  const [pendingDelete, setPendingDelete] = useState<{
    kind: 'cliente' | 'servico';
    id: string;
  } | null>(null);

  // Contratos de serviço
  const [contracts, setContracts] = useState<ContractRow[]>([]);
  const [contractFormOpen, setContractFormOpen] = useState(false);
  const [contractForm, setContractForm] = useState({
    clientId: '',
    title: '',
    description: '',
    startDate: '',
    endDate: '',
    items: [{ serviceId: '', description: '', quantity: '1', unitPrice: '' }],
  });
  const [contractBusy, setContractBusy] = useState(false);
  const [contractError, setContractError] = useState<string | null>(null);

  const notify = useCallback((kind: 'ok' | 'err', text: string) => {
    setToast({ kind, text });
    window.setTimeout(() => setToast(null), 4200);
  }, []);

  const loadAll = useCallback(async () => {
    setLoadingData(true);
    const results = await Promise.allSettled([
      api<SubscriptionData>('/api/billing/subscription'),
      api<UsageData>('/api/billing/usage'),
      api<{ invoices: Invoice[] }>('/api/billing/invoices'),
      api<UserRow[]>('/api/users'),
      api<Catalog>('/api/billing/catalog'),
      api<ClientRow[]>('/api/admin/clients'),
      api<ServiceRow[]>('/api/admin/services'),
      api<ReceivableRow[]>('/api/admin/receivables'),
      api<ContractRow[]>('/api/contracts'),
    ]);
    if (results[0].status === 'fulfilled') setSub(results[0].value);
    if (results[1].status === 'fulfilled') setUsage(results[1].value);
    if (results[2].status === 'fulfilled') setInvoices(results[2].value.invoices);
    if (results[3].status === 'fulfilled') setUsers(results[3].value);
    if (results[4].status === 'fulfilled') setCatalog(results[4].value);
    if (results[5].status === 'fulfilled') setClients(results[5].value);
    if (results[6].status === 'fulfilled') setServices(results[6].value);
    if (results[7].status === 'fulfilled') setReceivables(results[7].value);
    if (results[8].status === 'fulfilled') setContracts(results[8].value);
    setLoadingData(false);
  }, []);

  // Sessão: valida o token com /auth/me e só então carrega os dados do painel.
  // Usado tanto no mount (sessão já existente) quanto após o login embutido —
  // sem isso, quem entra pelo card de login ficaria preso em "Atualizando dados…".
  const refreshSession = useCallback(async () => {
    try {
      const data = await api<Me>('/api/auth/me');
      setMe(data);
      setStatus('authed');
      void loadAll();
    } catch {
      setStatus('anon');
    }
  }, [loadAll]);

  useEffect(() => {
    void refreshSession();
  }, [refreshSession]);

  async function toggleModule(code: string, activate: boolean) {
    setBusyModule(code);
    try {
      await post(`/api/billing/modules/${code}/${activate ? 'activate' : 'deactivate'}`, {});
      notify('ok', activate ? 'Módulo ativado — evento registrado em Faturas.' : 'Módulo desativado.');
      setPendingModule(null);
      await loadAll();
    } catch (err) {
      notify('err', err instanceof ApiError ? err.message : 'Falha ao alterar o módulo.');
    } finally {
      setBusyModule(null);
    }
  }

  async function sendInvite(e: React.FormEvent) {
    e.preventDefault();
    setInviteError(null);
    setInviteBusy(true);
    try {
      const data = await post<{ invitePassword: string }>('/api/users', invite);
      setInvitePassword(data.invitePassword);
      setInvite({ name: '', email: '', role: 'CASHIER' });
      notify('ok', 'Membro adicionado à equipe.');
      const list = await api<UserRow[]>('/api/users');
      setUsers(list);
    } catch (err) {
      setInviteError(err instanceof ApiError ? err.message : 'Falha ao convidar.');
    } finally {
      setInviteBusy(false);
    }
  }

  // ── Clientes ─────────────────────────────────────────────────────────
  function openClientForm(client?: ClientRow) {
    if (client) {
      setClientEditId(client.id);
      setClientForm({
        name: client.name,
        document: client.document ?? '',
        phone: client.phone ?? '',
        email: client.email ?? '',
        creditLimit: String(client.creditLimit),
        isBusinessAccount: client.isBusinessAccount,
      });
    } else {
      setClientEditId(null);
      setClientForm({ ...EMPTY_CLIENT_FORM });
    }
    setClientError(null);
    setClientFormOpen(true);
  }

  async function saveClient(e: React.FormEvent) {
    e.preventDefault();
    setClientBusy(true);
    setClientError(null);
    const payload = {
      name: clientForm.name.trim(),
      document: clientForm.document.trim() || null,
      phone: clientForm.phone.trim() || null,
      email: clientForm.email.trim() || null,
      creditLimit: Number(clientForm.creditLimit || 0),
      isBusinessAccount: clientForm.isBusinessAccount,
    };
    try {
      if (clientEditId) {
        await patch(`/api/admin/clients/${clientEditId}`, payload);
        notify('ok', 'Cliente atualizado.');
      } else {
        await post('/api/admin/clients', payload);
        notify('ok', 'Cliente cadastrado.');
      }
      setClientFormOpen(false);
      setClientEditId(null);
      await loadAll();
    } catch (err) {
      setClientError(err instanceof ApiError ? err.message : 'Falha ao salvar o cliente.');
    } finally {
      setClientBusy(false);
    }
  }

  async function removeClient(id: string) {
    try {
      await del(`/api/admin/clients/${id}`);
      notify('ok', 'Cliente excluído.');
    } catch (err) {
      notify('err', err instanceof ApiError ? err.message : 'Falha ao excluir o cliente.');
    } finally {
      setPendingDelete(null);
      await loadAll();
    }
  }

  // ── Serviços ─────────────────────────────────────────────────────────
  function openServiceForm(service?: ServiceRow) {
    if (service) {
      setServiceEditId(service.id);
      setServiceForm({
        name: service.name,
        nicheTag: service.nicheTag,
        basePrice: String(service.basePrice),
        estimatedDurationMinutes: String(service.estimatedDurationMinutes),
        commissionPercentage: String(service.commissionPercentage),
        active: service.active,
      });
    } else {
      setServiceEditId(null);
      setServiceForm({ ...EMPTY_SERVICE_FORM });
    }
    setServiceError(null);
    setServiceFormOpen(true);
  }

  async function saveService(e: React.FormEvent) {
    e.preventDefault();
    setServiceBusy(true);
    setServiceError(null);
    const payload = {
      name: serviceForm.name.trim(),
      nicheTag: serviceForm.nicheTag,
      basePrice: Number(serviceForm.basePrice || 0),
      estimatedDurationMinutes: Number(serviceForm.estimatedDurationMinutes || 0),
      commissionPercentage: Number(serviceForm.commissionPercentage || 0),
      active: serviceForm.active,
    };
    try {
      if (serviceEditId) {
        await patch(`/api/admin/services/${serviceEditId}`, payload);
        notify('ok', 'Serviço atualizado.');
      } else {
        await post('/api/admin/services', payload);
        notify('ok', 'Serviço cadastrado.');
      }
      setServiceFormOpen(false);
      setServiceEditId(null);
      await loadAll();
    } catch (err) {
      setServiceError(err instanceof ApiError ? err.message : 'Falha ao salvar o serviço.');
    } finally {
      setServiceBusy(false);
    }
  }

  async function toggleService(service: ServiceRow) {
    try {
      await patch(`/api/admin/services/${service.id}`, { active: !service.active });
      notify('ok', service.active ? 'Serviço desativado.' : 'Serviço ativado.');
      await loadAll();
    } catch (err) {
      notify('err', err instanceof ApiError ? err.message : 'Falha ao alterar o serviço.');
    }
  }

  async function removeService(id: string) {
    try {
      await del(`/api/admin/services/${id}`);
      notify('ok', 'Serviço excluído.');
    } catch (err) {
      notify('err', err instanceof ApiError ? err.message : 'Falha ao excluir o serviço.');
    } finally {
      setPendingDelete(null);
      await loadAll();
    }
  }

  // ── Cobranças ────────────────────────────────────────────────────────
  /** Atalho do painel de clientes: abre a aba Cobrança já com o cliente. */
  function draftReceivableFor(clientId: string) {
    setReceivableForm({ ...EMPTY_RECEIVABLE_FORM, clientId });
    setReceivableError(null);
    setReceivableFormOpen(true);
    setTab('cobranca');
  }

  async function saveReceivable(e: React.FormEvent) {
    e.preventDefault();
    setReceivableBusy(true);
    setReceivableError(null);
    try {
      if (!receivableForm.dueDate) {
        setReceivableError('Informe o vencimento.');
        return;
      }
      await post('/api/admin/receivables', {
        clientId: receivableForm.clientId,
        description: receivableForm.description.trim(),
        amount: Number(receivableForm.amount),
        // "yyyy-mm-dd" sem fuso é interpretado como UTC pelo Date; ancora em
        // meia-noite local do usuário para a data exibida não deslocar um dia.
        dueDate: new Date(`${receivableForm.dueDate}T00:00:00`).toISOString(),
      });
      notify('ok', 'Cobrança gerada.');
      setReceivableFormOpen(false);
      setReceivableForm({ ...EMPTY_RECEIVABLE_FORM });
      await loadAll();
    } catch (err) {
      setReceivableError(err instanceof ApiError ? err.message : 'Falha ao gerar a cobrança.');
    } finally {
      setReceivableBusy(false);
    }
  }

  async function runReceivableAction(id: string, action: 'pay' | 'cancel') {
    try {
      await post(`/api/admin/receivables/${id}/${action}`, {});
      notify('ok', action === 'pay' ? 'Pagamento registrado.' : 'Cobrança cancelada.');
      await loadAll();
    } catch (err) {
      notify(
        'err',
        err instanceof ApiError ? err.message : 'Falha ao processar a cobrança.',
      );
    } finally {
      setRowConfirm(null);
    }
  }

  // ── Contratos ────────────────────────────────────────────────────────
  function openContractForm() {
    setContractForm({
      clientId: '',
      title: '',
      description: '',
      startDate: '',
      endDate: '',
      items: [{ serviceId: '', description: '', quantity: '1', unitPrice: '' }],
    });
    setContractError(null);
    setContractFormOpen(true);
  }

  function addContractItem() {
    setContractForm((f) => ({
      ...f,
      items: [...f.items, { serviceId: '', description: '', quantity: '1', unitPrice: '' }],
    }));
  }

  function updateContractItem(index: number, field: string, value: string) {
    setContractForm((f) => ({
      ...f,
      items: f.items.map((item, i) => (i === index ? { ...item, [field]: value } : item)),
    }));
  }

  function removeContractItem(index: number) {
    setContractForm((f) => ({
      ...f,
      items: f.items.filter((_, i) => i !== index),
    }));
  }

  async function saveContract(e: React.FormEvent) {
    e.preventDefault();
    setContractBusy(true);
    setContractError(null);
    try {
      const payload = {
        clientId: contractForm.clientId,
        title: contractForm.title.trim(),
        description: contractForm.description.trim() || undefined,
        startDate: contractForm.startDate,
        endDate: contractForm.endDate || undefined,
        items: contractForm.items.map((item) => ({
          serviceId: item.serviceId || undefined,
          description: item.description.trim(),
          quantity: Number(item.quantity),
          unitPrice: Number(item.unitPrice),
        })),
      };
      await post('/api/contracts', payload);
      notify('ok', 'Contrato criado.');
      setContractFormOpen(false);
      await loadAll();
    } catch (err) {
      setContractError(err instanceof ApiError ? err.message : 'Falha ao criar o contrato.');
    } finally {
      setContractBusy(false);
    }
  }

  async function signContract(id: string) {
    try {
      await post(`/api/contracts/${id}/sign`, {});
      notify('ok', 'Contrato assinado e ativado.');
      await loadAll();
    } catch (err) {
      notify('err', err instanceof ApiError ? err.message : 'Falha ao assinar o contrato.');
    }
  }

  async function cancelContract(id: string) {
    try {
      await post(`/api/contracts/${id}/cancel`, {});
      notify('ok', 'Contrato cancelado.');
      await loadAll();
    } catch (err) {
      notify('err', err instanceof ApiError ? err.message : 'Falha ao cancelar o contrato.');
    }
  }

  async function generateContractPdf(id: string) {
    try {
      const data = await post<{ pdfUrl: string }>(`/api/contracts/${id}/pdf`, {});
      notify('ok', 'PDF gerado.');
      if (data.pdfUrl) window.open(data.pdfUrl, '_blank');
      await loadAll();
    } catch (err) {
      notify('err', err instanceof ApiError ? err.message : 'Falha ao gerar o PDF.');
    }
  }

  // ── Anônimo ────────────────────────────────────────────────────────────
  if (status === 'loading') {
    return (
      <div className="grid min-h-[60vh] place-items-center text-zinc-500">
        Verificando sessão…
      </div>
    );
  }

  if (status === 'anon') {
    return (
      <main className="mx-auto grid max-w-5xl gap-10 px-5 py-14 lg:grid-cols-2 lg:items-center">
        <div>
          <p className="text-sm font-semibold uppercase tracking-[0.2em] text-indigo-400">
            Painel de administração
          </p>
          <h1 className="mt-3 text-3xl font-bold tracking-tight sm:text-4xl">
            Entre para gerenciar sua assinatura
          </h1>
          <p className="mt-4 text-zinc-400">
            Plano, módulos, cobranças, clientes, serviços e equipe — tudo em um
            lugar, com o preço sempre visível.
          </p>
          <div className="mt-6 card-site p-5 text-sm text-zinc-400">
            <p className="font-medium text-zinc-200">Ainda não tem conta?</p>
            <p className="mt-1">
              Crie a sua grátis (Tier Free, sem cartão) e comece a operar hoje.
            </p>
            <Link
              href="/cadastro"
              className="mt-3 inline-block rounded-lg bg-indigo-500 px-4 py-2 text-sm font-medium text-white hover:bg-indigo-400"
            >
              Criar conta grátis
            </Link>
          </div>
        </div>
        <div className="card-site p-7">
          <LoginCard
            onSuccess={() => {
              setStatus('authed');
              void refreshSession();
            }}
          />
        </div>
      </main>
    );
  }

  const tenantName = sub?.tenant?.tradeName ?? 'Sua empresa';
  const isFreeTier = sub?.plan?.code === 'FREE' || sub?.plan == null;
  const kpis = cobrancaKpis(receivables);

  const filteredReceivables = receivables.filter((row) => {
    const state = receivableState(row);
    if (receivableFilter === 'todas') return true;
    if (receivableFilter === 'abertas') return state === 'PENDING' || state === 'OVERDUE';
    if (receivableFilter === 'vencidas') return state === 'OVERDUE';
    if (receivableFilter === 'pagas') return state === 'PAID';
    return state === 'CANCELLED';
  });

  const filteredClients = clients.filter((client) => {
    const q = clientQuery.trim().toLowerCase();
    if (!q) return true;
    return [client.name, client.document ?? '', client.email ?? '', client.phone ?? '']
      .join(' ')
      .toLowerCase()
      .includes(q);
  });

  // ── Autenticado ────────────────────────────────────────────────────────
  return (
    <main className="mx-auto max-w-7xl px-5 py-10">
      {/* Cabeçalho do tenant */}
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div>
          <p className="text-xs font-semibold uppercase tracking-wider text-indigo-400">
            Painel de administração
          </p>
          <h1 className="mt-1 text-2xl font-bold tracking-tight sm:text-3xl">
            {tenantName}
          </h1>
        </div>
        <div className="flex items-center gap-3">
          <a
            href={ERP_APP_URL}
            className="rounded-xl border border-white/15 px-4 py-2.5 text-sm text-zinc-200 transition hover:bg-white/5"
          >
            Abrir o ERP
          </a>
          <button
            type="button"
            onClick={async () => {
              try {
                await fetch('/api/auth/logout', { method: 'POST', credentials: 'include' });
              } finally {
                setStatus('anon');
                setMe(null);
                setSub(null);
              }
            }}
            className="rounded-xl border border-white/10 px-4 py-2.5 text-sm text-zinc-400 transition hover:border-rose-500/40 hover:text-rose-300"
          >
            Sair
          </button>
        </div>
      </div>

      {/* Banners de retorno */}
      {checkoutOk && (
        <div className="mt-6 rounded-xl border border-emerald-500/30 bg-emerald-500/10 px-5 py-4 text-sm text-emerald-200">
          ✓ Contratação confirmada! Sua assinatura está ativa e os módulos
          contratados já aparecem em <strong>Módulos</strong>.
        </div>
      )}
      {welcome && !checkoutOk && (
        <div className="mt-6 rounded-xl border border-indigo-500/30 bg-indigo-500/10 px-5 py-4 text-sm text-indigo-200">
          ✓ Bem-vindo ao Filitech! Sua conta grátis está no ar. Explore o painel
          e, quando quiser, evolue para um plano pago em{' '}
          <Link href="/planos" className="underline">
            Planos
          </Link>
          .
        </div>
      )}

      <div className="mt-8 grid gap-8 lg:grid-cols-[210px_1fr]">
        {/* Sidebar de abas */}
        <nav
          className="flex gap-1 overflow-x-auto lg:flex-col"
          aria-label="Seções do painel"
        >
          {TABS.map((t) => (
            <button
              key={t.key}
              type="button"
              onClick={() => setTab(t.key)}
              aria-current={tab === t.key ? 'page' : undefined}
              className={`whitespace-nowrap rounded-xl px-4 py-2.5 text-sm font-medium transition ${
                tab === t.key
                  ? 'bg-indigo-500/15 text-indigo-200'
                  : 'text-zinc-400 hover:bg-white/5 hover:text-zinc-200'
              }`}
            >
              {t.label}
            </button>
          ))}
        </nav>

        <section>
          {loadingData && (
            <p className="mb-4 text-sm text-zinc-500">Atualizando dados…</p>
          )}

          {/* ── VISÃO GERAL ── */}
          {tab === 'visao' && (
            <div className="space-y-6">
              <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
                <StatCard
                  label="Plano atual"
                  value={sub?.plan?.label ?? 'Sem plano'}
                  sub={sub?.subscription ? `Status ${sub.subscription.status}` : 'Nenhuma assinatura registrada'}
                />
                <StatCard
                  label="Total mensal"
                  value={brl(sub?.mrr ?? 0)}
                  sub="breakdown idêntico ao checkout"
                />
                <StatCard
                  label="Próxima cobrança"
                  value={fmtDate(sub?.subscription?.currentPeriodEnd)}
                  sub={`ciclo ${sub?.subscription ? 'mensal' : '—'}`}
                />
                <StatCard
                  label="Módulos ativos"
                  value={sub?.activeModules.length ?? 0}
                  sub={`${catalog.modules.filter((m) => m.monthlyPrice > 0).length} add-ons disponíveis`}
                />
              </div>

              {/* Breakdown transparente */}
              <div className="card-site p-6">
                <div className="flex items-center justify-between">
                  <h2 className="font-semibold text-zinc-100">
                    Composição da cobrança
                  </h2>
                  <Chip status={sub?.subscription?.status ?? (sub?.plan ? 'TRIAL' : 'SEM ASSINATURA')} />
                </div>
                {sub && sub.breakdown.length > 0 ? (
                  <>
                    <div className="mt-4 space-y-2.5 text-sm">
                      {sub.breakdown.map((line) => (
                        <div
                          key={line.code}
                          className="flex items-center justify-between border-b border-white/5 pb-2.5"
                        >
                          <span className="text-zinc-300">{line.label}</span>
                          <span className="font-medium text-zinc-100">
                            {brl(line.price)}
                          </span>
                        </div>
                      ))}
                    </div>
                    <div className="mt-4 flex items-center justify-between">
                      <span className="text-sm text-zinc-400">Total mensal</span>
                      <span className="text-xl font-bold">{brl(sub.mrr)}</span>
                    </div>
                  </>
                ) : (
                  <div className="mt-4 rounded-xl border border-white/10 bg-zinc-950/50 p-5 text-sm text-zinc-400">
                    Nenhuma cobrança registrada para este tenant.{' '}
                    <Link href="/planos" className="text-indigo-400 underline">
                      Contrate um plano
                    </Link>{' '}
                    para ver o breakdown aqui.
                  </div>
                )}
              </div>

              {/* Uso do Tier Free */}
              <div className="card-site p-6">
                <h2 className="font-semibold text-zinc-100">
                  Uso da conta {isFreeTier ? '(Tier Free)' : ''}
                </h2>
                {usage ? (
                  <div className="mt-4 grid gap-5 sm:grid-cols-3">
                    <UsageBar
                      label="Vendas no mês"
                      current={usage.usage.sales.current}
                      limit={usage.usage.sales.limit}
                    />
                    <UsageBar
                      label="Usuários"
                      current={usage.usage.users.current}
                      limit={usage.usage.users.limit}
                    />
                    <UsageBar
                      label="Produtos (SKUs)"
                      current={usage.usage.products.current}
                      limit={usage.usage.products.limit}
                    />
                  </div>
                ) : (
                  <p className="mt-3 text-sm text-zinc-500">Carregando uso…</p>
                )}
                {!isFreeTier && usage && (
                  <p className="mt-4 text-xs text-zinc-500">
                    Os limites acima são do Tier Free; no seu plano pagos eles não
                    se aplicam — os valores servem para acompanhamento.
                  </p>
                )}
              </div>

              {/* Resumo da operação (atalhos para as abas de administração) */}
              <div className="grid gap-4 sm:grid-cols-3">
                <button
                  type="button"
                  onClick={() => setTab('clientes')}
                  className="card-site p-5 text-left transition hover:border-indigo-500/40"
                >
                  <p className="text-xs font-medium uppercase tracking-wider text-zinc-500">
                    Clientes
                  </p>
                  <p className="mt-2 text-2xl font-bold text-zinc-100">{clients.length}</p>
                  <p className="mt-1 text-xs text-indigo-400">Cadastrar e gerenciar →</p>
                </button>
                <button
                  type="button"
                  onClick={() => setTab('servicos')}
                  className="card-site p-5 text-left transition hover:border-indigo-500/40"
                >
                  <p className="text-xs font-medium uppercase tracking-wider text-zinc-500">
                    Serviços
                  </p>
                  <p className="mt-2 text-2xl font-bold text-zinc-100">{services.length}</p>
                  <p className="mt-1 text-xs text-indigo-400">Catálogo e preços →</p>
                </button>
                <button
                  type="button"
                  onClick={() => setTab('cobranca')}
                  className="card-site p-5 text-left transition hover:border-indigo-500/40"
                >
                  <p className="text-xs font-medium uppercase tracking-wider text-zinc-500">
                    A receber
                  </p>
                  <p className="mt-2 text-2xl font-bold text-zinc-100">{brl(kpis.aberto)}</p>
                  <p className="mt-1 text-xs text-indigo-400">
                    {kpis.abertoCount} fatura(s) em aberto →
                  </p>
                </button>
              </div>

              {/* Ações rápidas */}
              <div className="grid gap-4 sm:grid-cols-3">
                <Link href="/planos" className="card-site p-5 transition hover:border-indigo-500/40">
                  <p className="font-medium text-zinc-100">Gerenciar plano</p>
                  <p className="mt-1 text-sm text-zinc-500">
                    Comparar, subir de plano ou adicionar combos.
                  </p>
                </Link>
                <button
                  type="button"
                  onClick={() => setTab('modulos')}
                  className="card-site p-5 text-left transition hover:border-indigo-500/40"
                >
                  <p className="font-medium text-zinc-100">Ativar módulos</p>
                  <p className="mt-1 text-sm text-zinc-500">
                    Liga/desliga add-ons com preço visível.
                  </p>
                </button>
                <a
                  href={ERP_APP_URL}
                  className="card-site p-5 transition hover:border-indigo-500/40"
                >
                  <p className="font-medium text-zinc-100">Abrir o sistema</p>
                  <p className="mt-1 text-sm text-zinc-500">
                    Acessar o ERP e o PDV da operação.
                  </p>
                </a>
              </div>
            </div>
          )}

          {/* ── MÓDULOS ── */}
          {tab === 'modulos' && (
            <div className="space-y-4">
              <div>
                <h2 className="text-lg font-semibold">Módulos e add-ons</h2>
                <p className="mt-1 text-sm text-zinc-500">
                  Cada ativação é gravada como evento de cobrança — sem surpresa
                  no faturamento.
                </p>
              </div>

              <div className="grid gap-3 sm:grid-cols-2">
                {catalog.modules.map((mod) => {
                  const isIncluded = sub?.plan?.includedModules.includes(mod.code) ?? false;
                  const isActive = sub?.activeModules.includes(mod.code) ?? false;
                  const confirming = pendingModule === mod.code;
                  const busy = busyModule === mod.code;

                  return (
                    <div
                      key={mod.code}
                      className={`rounded-xl border p-4 transition ${
                        isActive
                          ? 'border-emerald-500/30 bg-emerald-500/[0.05]'
                          : 'border-white/10 bg-zinc-900/40'
                      }`}
                    >
                      <div className="flex items-start justify-between gap-3">
                        <div>
                          <p className="text-sm font-medium text-zinc-100">
                            {mod.label}
                          </p>
                          <p className="mt-1 text-xs text-zinc-500">
                            {mod.description}
                          </p>
                        </div>
                        <span
                          className={`shrink-0 rounded-lg px-2 py-1 text-xs font-semibold ${
                            mod.monthlyPrice > 0
                              ? 'bg-white/5 text-zinc-300'
                              : 'bg-emerald-500/15 text-emerald-400'
                          }`}
                        >
                          {mod.monthlyPrice > 0 ? `+${brl(mod.monthlyPrice)}` : 'incluso'}
                        </span>
                      </div>

                      <div className="mt-3 flex items-center justify-between">
                        <span className="text-xs font-semibold uppercase tracking-wide">
                          {isActive ? (
                            <span className="text-emerald-400">● ativo</span>
                          ) : (
                            <span className="text-zinc-600">○ inativo</span>
                          )}
                        </span>

                        {isIncluded ? (
                          <span className="text-xs text-zinc-500">
                            incluído no plano {sub?.plan?.label}
                          </span>
                        ) : confirming ? (
                          <span className="flex items-center gap-2 text-xs">
                            <span className="text-zinc-400">
                              {isActive
                                ? 'Desativar?'
                                : `${brl(mod.monthlyPrice)}/mês`}
                            </span>
                            <button
                              type="button"
                              disabled={busy}
                              onClick={() => toggleModule(mod.code, !isActive)}
                              className="rounded-lg bg-indigo-500 px-2.5 py-1 font-medium text-white disabled:opacity-60"
                            >
                              {busy ? '…' : 'Confirmar'}
                            </button>
                            <button
                              type="button"
                              onClick={() => setPendingModule(null)}
                              className="rounded-lg border border-white/15 px-2.5 py-1 text-zinc-400"
                            >
                              Cancelar
                            </button>
                          </span>
                        ) : (
                          <button
                            type="button"
                            onClick={() =>
                              isActive
                                ? setPendingModule(mod.code)
                                : mod.monthlyPrice > 0
                                  ? setPendingModule(mod.code)
                                  : void toggleModule(mod.code, true)
                            }
                            className={`rounded-lg px-3 py-1.5 text-xs font-medium transition ${
                              isActive
                                ? 'border border-white/15 text-zinc-400 hover:text-zinc-200'
                                : 'bg-indigo-500 text-white hover:bg-indigo-400'
                            }`}
                          >
                            {isActive ? 'Desativar' : 'Ativar'}
                          </button>
                        )}
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          )}

          {/* ── COBRANÇA ── */}
          {tab === 'cobranca' && (
            <div className="space-y-5">
              <div className="flex flex-wrap items-center justify-between gap-3">
                <div>
                  <h2 className="text-lg font-semibold">Cobrança dos clientes</h2>
                  <p className="mt-1 text-sm text-zinc-500">
                    Contas a receber: gere cobranças, registre pagamentos e
                    acompanhe vencimentos — com transparência total.
                  </p>
                </div>
                <div className="flex items-center gap-2">
                  <button
                    type="button"
                    onClick={() => setTab('faturas')}
                    className="rounded-xl border border-white/15 px-4 py-2.5 text-sm text-zinc-300 transition hover:bg-white/5"
                  >
                    Faturas da assinatura
                  </button>
                  <button
                    type="button"
                    onClick={() => {
                      setReceivableFormOpen((v) => !v);
                      setReceivableError(null);
                    }}
                    className="rounded-xl bg-indigo-500 px-4 py-2.5 text-sm font-medium text-white transition hover:bg-indigo-400"
                  >
                    {receivableFormOpen ? 'Fechar' : '+ Gerar cobrança'}
                  </button>
                </div>
              </div>

              {/* Indicadores */}
              <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
                <StatCard
                  label="A receber"
                  value={brl(kpis.aberto)}
                  sub={`${kpis.abertoCount} fatura(s) em aberto`}
                />
                <StatCard
                  label="Em atraso"
                  value={brl(kpis.vencido)}
                  sub={`${kpis.vencidoCount} vencida(s)`}
                />
                <StatCard
                  label="Recebido no mês"
                  value={brl(kpis.recebido)}
                  sub={`${kpis.pagas} paga(s) no total`}
                />
                <StatCard
                  label="Canceladas"
                  value={brl(kpis.cancelado)}
                  sub="cobranças canceladas"
                />
              </div>

              {/* Gerador de cobrança */}
              {receivableFormOpen && (
                <form
                  onSubmit={saveReceivable}
                  className="card-site grid gap-3 p-5 sm:grid-cols-2 lg:grid-cols-[1.3fr_1.5fr_130px_150px_auto]"
                >
                  <select
                    required
                    value={receivableForm.clientId}
                    onChange={(e) =>
                      setReceivableForm((f) => ({ ...f, clientId: e.target.value }))
                    }
                    aria-label="Cliente"
                    className="rounded-xl border border-white/10 bg-zinc-900/60 px-4 py-2.5 text-sm outline-none focus:border-indigo-500/70"
                  >
                    <option value="">Cliente *</option>
                    {clients.map((c) => (
                      <option key={c.id} value={c.id}>
                        {c.name}
                      </option>
                    ))}
                  </select>
                  <input
                    required
                    value={receivableForm.description}
                    onChange={(e) =>
                      setReceivableForm((f) => ({ ...f, description: e.target.value }))
                    }
                    placeholder="Descrição *"
                    aria-label="Descrição da cobrança"
                    className="rounded-xl border border-white/10 bg-zinc-900/60 px-4 py-2.5 text-sm outline-none focus:border-indigo-500/70"
                  />
                  <input
                    required
                    type="number"
                    min="0.01"
                    step="0.01"
                    value={receivableForm.amount}
                    onChange={(e) =>
                      setReceivableForm((f) => ({ ...f, amount: e.target.value }))
                    }
                    placeholder="Valor *"
                    aria-label="Valor"
                    className="rounded-xl border border-white/10 bg-zinc-900/60 px-4 py-2.5 text-sm outline-none focus:border-indigo-500/70"
                  />
                  <input
                    required
                    type="date"
                    value={receivableForm.dueDate}
                    onChange={(e) =>
                      setReceivableForm((f) => ({ ...f, dueDate: e.target.value }))
                    }
                    aria-label="Vencimento"
                    className="rounded-xl border border-white/10 bg-zinc-900/60 px-4 py-2.5 text-sm outline-none focus:border-indigo-500/70"
                  />
                  <button
                    type="submit"
                    disabled={receivableBusy}
                    className="rounded-xl bg-indigo-500 px-5 py-2.5 text-sm font-medium text-white transition hover:bg-indigo-400 disabled:opacity-60"
                  >
                    {receivableBusy ? '…' : 'Gerar'}
                  </button>
                  {receivableError && (
                    <p className="text-xs text-rose-400 lg:col-span-5">
                      {receivableError}
                    </p>
                  )}
                </form>
              )}

              {/* Filtro por situação */}
              <div className="flex flex-wrap items-center gap-3">
                <select
                  value={receivableFilter}
                  onChange={(e) => setReceivableFilter(e.target.value)}
                  aria-label="Filtrar cobranças"
                  className="rounded-xl border border-white/10 bg-zinc-900/60 px-3 py-2 text-sm outline-none focus:border-indigo-500/70"
                >
                  <option value="todas">Todas</option>
                  <option value="abertas">Em aberto</option>
                  <option value="vencidas">Vencidas</option>
                  <option value="pagas">Pagas</option>
                  <option value="canceladas">Canceladas</option>
                </select>
                <span className="text-xs text-zinc-500">
                  {filteredReceivables.length} de {receivables.length} cobrança(s)
                </span>
              </div>

              {/* Extrato */}
              {receivables.length === 0 ? (
                <div className="rounded-xl border border-white/10 bg-zinc-900/40 p-8 text-center text-sm text-zinc-500">
                  Nenhuma cobrança ainda. Cadastre clientes em{' '}
                  <button
                    type="button"
                    onClick={() => setTab('clientes')}
                    className="text-indigo-400 underline"
                  >
                    Clientes
                  </button>{' '}
                  e gere a primeira cobrança.
                </div>
              ) : filteredReceivables.length === 0 ? (
                <div className="rounded-xl border border-white/10 bg-zinc-900/40 p-8 text-center text-sm text-zinc-500">
                  Nenhuma cobrança neste filtro.
                </div>
              ) : (
                <div className="overflow-x-auto rounded-xl border border-white/10">
                  <table className="w-full text-left text-sm">
                    <thead className="bg-zinc-900/70 text-xs uppercase tracking-wider text-zinc-500">
                      <tr>
                        <th className="px-4 py-3 font-medium">Cliente</th>
                        <th className="px-4 py-3 font-medium">Descrição</th>
                        <th className="px-4 py-3 font-medium">Vencimento</th>
                        <th className="px-4 py-3 font-medium">Valor</th>
                        <th className="px-4 py-3 font-medium">Situação</th>
                        <th className="px-4 py-3 font-medium">Ações</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-white/5">
                      {filteredReceivables.map((row) => {
                        const state = receivableState(row);
                        const isOpen = state === 'PENDING' || state === 'OVERDUE';
                        const confirmPay = rowConfirm === `${row.id}|pay`;
                        const confirmCancel = rowConfirm === `${row.id}|cancel`;
                        return (
                          <tr key={row.id} className="bg-zinc-950/40">
                            <td className="px-4 py-3 font-medium text-zinc-200">
                              {row.clientName}
                            </td>
                            <td className="px-4 py-3 text-zinc-300">{row.description}</td>
                            <td
                              className={`whitespace-nowrap px-4 py-3 ${
                                state === 'OVERDUE' ? 'text-rose-400' : 'text-zinc-400'
                              }`}
                            >
                              {fmtDate(row.dueDate)}
                            </td>
                            <td className="whitespace-nowrap px-4 py-3 font-medium text-zinc-100">
                              {brl(row.amount)}
                            </td>
                            <td className="px-4 py-3">
                              <ReceivableChip state={state} />
                            </td>
                            <td className="px-4 py-3">
                              {!isOpen ? (
                                <span className="text-xs text-zinc-600">—</span>
                              ) : confirmPay ? (
                                <span className="flex items-center gap-2 text-xs">
                                  <span className="text-zinc-400">Baixar pagamento?</span>
                                  <button
                                    type="button"
                                    onClick={() => void runReceivableAction(row.id, 'pay')}
                                    className="rounded-lg bg-emerald-500 px-2.5 py-1 font-medium text-white"
                                  >
                                    Sim, receber
                                  </button>
                                  <button
                                    type="button"
                                    onClick={() => setRowConfirm(null)}
                                    className="rounded-lg border border-white/15 px-2.5 py-1 text-zinc-400"
                                  >
                                    Voltar
                                  </button>
                                </span>
                              ) : confirmCancel ? (
                                <span className="flex items-center gap-2 text-xs">
                                  <span className="text-zinc-400">Cancelar cobrança?</span>
                                  <button
                                    type="button"
                                    onClick={() => void runReceivableAction(row.id, 'cancel')}
                                    className="rounded-lg bg-rose-500/80 px-2.5 py-1 font-medium text-white"
                                  >
                                    Sim, cancelar
                                  </button>
                                  <button
                                    type="button"
                                    onClick={() => setRowConfirm(null)}
                                    className="rounded-lg border border-white/15 px-2.5 py-1 text-zinc-400"
                                  >
                                    Voltar
                                  </button>
                                </span>
                              ) : (
                                <span className="flex items-center gap-2">
                                  <button
                                    type="button"
                                    onClick={() => setRowConfirm(`${row.id}|pay`)}
                                    className="rounded-lg bg-indigo-500 px-3 py-1.5 text-xs font-medium text-white transition hover:bg-indigo-400"
                                  >
                                    Receber
                                  </button>
                                  <button
                                    type="button"
                                    onClick={() => setRowConfirm(`${row.id}|cancel`)}
                                    className="rounded-lg border border-white/15 px-3 py-1.5 text-xs text-zinc-400 transition hover:text-zinc-200"
                                  >
                                    Cancelar
                                  </button>
                                </span>
                              )}
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              )}
            </div>
          )}

          {/* ── FATURAS ── */}
          {tab === 'faturas' && (
            <div>
              <h2 className="text-lg font-semibold">Faturas e eventos de cobrança</h2>
              <p className="mt-1 text-sm text-zinc-500">
                Extrato completo da sua assinatura Filitech — tudo que afetou (ou
                afetará) o seu valor mensal. Para cobrar seus clientes, use a aba{' '}
                <button
                  type="button"
                  onClick={() => setTab('cobranca')}
                  className="text-indigo-400 underline"
                >
                  Cobrança
                </button>
                .
              </p>

              {invoices.length === 0 ? (
                <div className="mt-5 rounded-xl border border-white/10 bg-zinc-900/40 p-8 text-center text-sm text-zinc-500">
                  Nenhuma fatura ainda. Eventos de cobrança — contratação,
                  ativação/desativação de módulo — aparecem aqui assim que
                  ocorrerem.
                </div>
              ) : (
                <div className="mt-5 overflow-x-auto rounded-xl border border-white/10">
                  <table className="w-full text-left text-sm">
                    <thead className="bg-zinc-900/70 text-xs uppercase tracking-wider text-zinc-500">
                      <tr>
                        <th className="px-4 py-3 font-medium">Data</th>
                        <th className="px-4 py-3 font-medium">Descrição</th>
                        <th className="px-4 py-3 font-medium">Valor</th>
                        <th className="px-4 py-3 font-medium">Origem</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-white/5">
                      {invoices.map((inv) => (
                        <tr key={inv.id} className="bg-zinc-950/40">
                          <td className="whitespace-nowrap px-4 py-3 text-zinc-400">
                            {fmtDate(inv.createdAt)}
                          </td>
                          <td className="px-4 py-3 text-zinc-200">
                            {inv.description}
                          </td>
                          <td className="whitespace-nowrap px-4 py-3 font-medium text-zinc-100">
                            {inv.amount === null ? '—' : brl(inv.amount)}
                          </td>
                          <td className="px-4 py-3 text-xs uppercase text-zinc-500">
                            {inv.provider}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </div>
          )}

          {/* ── CLIENTES ── */}
          {tab === 'clientes' && (
            <div className="space-y-5">
              <div className="flex flex-wrap items-center justify-between gap-3">
                <div>
                  <h2 className="text-lg font-semibold">Clientes</h2>
                  <p className="mt-1 text-sm text-zinc-500">
                    Cadastro único para venda, O.S., agenda e crediário — com
                    limite de crédito e faturas em aberto.
                  </p>
                </div>
                <button
                  type="button"
                  onClick={() => openClientForm()}
                  className="rounded-xl bg-indigo-500 px-4 py-2.5 text-sm font-medium text-white transition hover:bg-indigo-400"
                >
                  {clientFormOpen && !clientEditId ? 'Fechar' : '+ Novo cliente'}
                </button>
              </div>

              {clientFormOpen && (
                <form
                  onSubmit={saveClient}
                  className="card-site grid gap-3 p-5 sm:grid-cols-2 lg:grid-cols-3"
                >
                  <input
                    required
                    value={clientForm.name}
                    onChange={(e) => setClientForm((f) => ({ ...f, name: e.target.value }))}
                    placeholder="Nome *"
                    aria-label="Nome do cliente"
                    className="rounded-xl border border-white/10 bg-zinc-900/60 px-4 py-2.5 text-sm outline-none focus:border-indigo-500/70"
                  />
                  <input
                    value={clientForm.document}
                    onChange={(e) => setClientForm((f) => ({ ...f, document: e.target.value }))}
                    placeholder="Documento (CPF/CNPJ)"
                    aria-label="Documento"
                    className="rounded-xl border border-white/10 bg-zinc-900/60 px-4 py-2.5 text-sm outline-none focus:border-indigo-500/70"
                  />
                  <input
                    value={clientForm.phone}
                    onChange={(e) => setClientForm((f) => ({ ...f, phone: e.target.value }))}
                    placeholder="Telefone"
                    aria-label="Telefone"
                    className="rounded-xl border border-white/10 bg-zinc-900/60 px-4 py-2.5 text-sm outline-none focus:border-indigo-500/70"
                  />
                  <input
                    type="email"
                    value={clientForm.email}
                    onChange={(e) => setClientForm((f) => ({ ...f, email: e.target.value }))}
                    placeholder="E-mail"
                    aria-label="E-mail"
                    className="rounded-xl border border-white/10 bg-zinc-900/60 px-4 py-2.5 text-sm outline-none focus:border-indigo-500/70"
                  />
                  <input
                    type="number"
                    min="0"
                    step="0.01"
                    value={clientForm.creditLimit}
                    onChange={(e) => setClientForm((f) => ({ ...f, creditLimit: e.target.value }))}
                    placeholder="Limite de crédito (R$)"
                    aria-label="Limite de crédito"
                    className="rounded-xl border border-white/10 bg-zinc-900/60 px-4 py-2.5 text-sm outline-none focus:border-indigo-500/70"
                  />
                  <label className="flex items-center gap-2 text-sm text-zinc-300">
                    <input
                      type="checkbox"
                      checked={clientForm.isBusinessAccount}
                      onChange={(e) =>
                        setClientForm((f) => ({ ...f, isBusinessAccount: e.target.checked }))
                      }
                      className="h-4 w-4 accent-indigo-500"
                    />
                    Conta empresa (B2B)
                  </label>
                  <div className="flex items-center gap-2 lg:col-span-3">
                    <button
                      type="submit"
                      disabled={clientBusy}
                      className="rounded-xl bg-indigo-500 px-5 py-2.5 text-sm font-medium text-white transition hover:bg-indigo-400 disabled:opacity-60"
                    >
                      {clientBusy ? '…' : clientEditId ? 'Salvar alterações' : 'Cadastrar cliente'}
                    </button>
                    {clientEditId && (
                      <button
                        type="button"
                        onClick={() => {
                          setClientFormOpen(false);
                          setClientEditId(null);
                        }}
                        className="rounded-xl border border-white/15 px-4 py-2.5 text-sm text-zinc-400"
                      >
                        Cancelar
                      </button>
                    )}
                  </div>
                  {clientError && (
                    <p className="text-xs text-rose-400 lg:col-span-3">{clientError}</p>
                  )}
                </form>
              )}

              {/* Busca */}
              <div className="flex flex-wrap items-center gap-3">
                <input
                  value={clientQuery}
                  onChange={(e) => setClientQuery(e.target.value)}
                  placeholder="Buscar por nome, documento, e-mail ou telefone…"
                  aria-label="Buscar clientes"
                  className="w-full max-w-md rounded-xl border border-white/10 bg-zinc-900/60 px-4 py-2.5 text-sm outline-none focus:border-indigo-500/70"
                />
                <span className="text-xs text-zinc-500">
                  {filteredClients.length} de {clients.length}
                </span>
              </div>

              {clients.length === 0 ? (
                <div className="rounded-xl border border-white/10 bg-zinc-900/40 p-8 text-center text-sm text-zinc-500">
                  Nenhum cliente cadastrado. Clique em{' '}
                  <strong className="text-zinc-300">+ Novo cliente</strong> para
                  começar.
                </div>
              ) : filteredClients.length === 0 ? (
                <div className="rounded-xl border border-white/10 bg-zinc-900/40 p-8 text-center text-sm text-zinc-500">
                  Nenhum cliente encontrado para “{clientQuery}”.
                </div>
              ) : (
                <div className="overflow-x-auto rounded-xl border border-white/10">
                  <table className="w-full text-left text-sm">
                    <thead className="bg-zinc-900/70 text-xs uppercase tracking-wider text-zinc-500">
                      <tr>
                        <th className="px-4 py-3 font-medium">Cliente</th>
                        <th className="px-4 py-3 font-medium">Documento</th>
                        <th className="px-4 py-3 font-medium">Contato</th>
                        <th className="px-4 py-3 font-medium">Limite de crédito</th>
                        <th className="px-4 py-3 font-medium">Em aberto</th>
                        <th className="px-4 py-3 font-medium">Ações</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-white/5">
                      {filteredClients.map((client) => {
                        const deleteConfirm =
                          pendingDelete?.kind === 'cliente' && pendingDelete.id === client.id;
                        return (
                          <tr key={client.id} className="bg-zinc-950/40">
                            <td className="px-4 py-3">
                              <span className="font-medium text-zinc-200">{client.name}</span>
                              {client.isBusinessAccount && (
                                <span className="ml-2 rounded-md border border-sky-500/30 bg-sky-500/10 px-1.5 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-sky-400">
                                  B2B
                                </span>
                              )}
                            </td>
                            <td className="whitespace-nowrap px-4 py-3 text-zinc-400">
                              {client.document ?? '—'}
                            </td>
                            <td className="px-4 py-3 text-zinc-400">
                              <span className="block">{client.phone ?? '—'}</span>
                              {client.email && (
                                <span className="block text-xs text-zinc-600">{client.email}</span>
                              )}
                            </td>
                            <td className="whitespace-nowrap px-4 py-3 text-zinc-300">
                              {client.creditLimit > 0 ? brl(client.creditLimit) : 'sem limite'}
                            </td>
                            <td
                              className={`whitespace-nowrap px-4 py-3 font-medium ${
                                client.openBalance > 0 ? 'text-amber-400' : 'text-zinc-500'
                              }`}
                            >
                              {brl(client.openBalance)}
                            </td>
                            <td className="px-4 py-3">
                              {deleteConfirm ? (
                                <span className="flex items-center gap-2 text-xs">
                                  <span className="text-zinc-400">Excluir?</span>
                                  <button
                                    type="button"
                                    onClick={() => void removeClient(client.id)}
                                    className="rounded-lg bg-rose-500/80 px-2.5 py-1 font-medium text-white"
                                  >
                                    Sim, excluir
                                  </button>
                                  <button
                                    type="button"
                                    onClick={() => setPendingDelete(null)}
                                    className="rounded-lg border border-white/15 px-2.5 py-1 text-zinc-400"
                                  >
                                    Voltar
                                  </button>
                                </span>
                              ) : (
                                <span className="flex items-center gap-2">
                                  <button
                                    type="button"
                                    onClick={() => draftReceivableFor(client.id)}
                                    className="rounded-lg border border-indigo-500/40 bg-indigo-500/10 px-3 py-1.5 text-xs font-medium text-indigo-300 transition hover:bg-indigo-500/20"
                                  >
                                    Cobrar
                                  </button>
                                  <button
                                    type="button"
                                    onClick={() => openClientForm(client)}
                                    className="rounded-lg border border-white/15 px-3 py-1.5 text-xs text-zinc-400 transition hover:text-zinc-200"
                                  >
                                    Editar
                                  </button>
                                  <button
                                    type="button"
                                    onClick={() => setPendingDelete({ kind: 'cliente', id: client.id })}
                                    className="rounded-lg border border-white/15 px-3 py-1.5 text-xs text-zinc-500 transition hover:border-rose-500/40 hover:text-rose-300"
                                  >
                                    Excluir
                                  </button>
                                </span>
                              )}
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              )}
            </div>
          )}

          {/* ── SERVIÇOS ── */}
          {tab === 'servicos' && (
            <div className="space-y-5">
              <div className="flex flex-wrap items-center justify-between gap-3">
                <div>
                  <h2 className="text-lg font-semibold">Serviços</h2>
                  <p className="mt-1 text-sm text-zinc-500">
                    Catálogo de serviços por nicho: preço base, duração,
                    comissionamento e disponibilidade para a agenda.
                  </p>
                </div>
                <button
                  type="button"
                  onClick={() => openServiceForm()}
                  className="rounded-xl bg-indigo-500 px-4 py-2.5 text-sm font-medium text-white transition hover:bg-indigo-400"
                >
                  {serviceFormOpen && !serviceEditId ? 'Fechar' : '+ Novo serviço'}
                </button>
              </div>

              {serviceFormOpen && (
                <form
                  onSubmit={saveService}
                  className="card-site grid gap-3 p-5 sm:grid-cols-2 lg:grid-cols-3"
                >
                  <input
                    required
                    value={serviceForm.name}
                    onChange={(e) => setServiceForm((f) => ({ ...f, name: e.target.value }))}
                    placeholder="Nome do serviço *"
                    aria-label="Nome do serviço"
                    className="rounded-xl border border-white/10 bg-zinc-900/60 px-4 py-2.5 text-sm outline-none focus:border-indigo-500/70"
                  />
                  <select
                    value={serviceForm.nicheTag}
                    onChange={(e) => setServiceForm((f) => ({ ...f, nicheTag: e.target.value }))}
                    aria-label="Nicho"
                    className="rounded-xl border border-white/10 bg-zinc-900/60 px-4 py-2.5 text-sm outline-none focus:border-indigo-500/70"
                  >
                    {Object.entries(NICHE_LABEL).map(([value, label]) => (
                      <option key={value} value={value}>
                        {label}
                      </option>
                    ))}
                  </select>
                  <input
                    type="number"
                    min="0"
                    step="0.01"
                    required
                    value={serviceForm.basePrice}
                    onChange={(e) => setServiceForm((f) => ({ ...f, basePrice: e.target.value }))}
                    placeholder="Preço base (R$) *"
                    aria-label="Preço base"
                    className="rounded-xl border border-white/10 bg-zinc-900/60 px-4 py-2.5 text-sm outline-none focus:border-indigo-500/70"
                  />
                  <input
                    type="number"
                    min="1"
                    max="1440"
                    step="1"
                    required
                    value={serviceForm.estimatedDurationMinutes}
                    onChange={(e) =>
                      setServiceForm((f) => ({ ...f, estimatedDurationMinutes: e.target.value }))
                    }
                    placeholder="Duração (min) *"
                    aria-label="Duração em minutos"
                    className="rounded-xl border border-white/10 bg-zinc-900/60 px-4 py-2.5 text-sm outline-none focus:border-indigo-500/70"
                  />
                  <input
                    type="number"
                    min="0"
                    max="100"
                    step="0.5"
                    value={serviceForm.commissionPercentage}
                    onChange={(e) =>
                      setServiceForm((f) => ({ ...f, commissionPercentage: e.target.value }))
                    }
                    placeholder="Comissão (%)"
                    aria-label="Comissão"
                    className="rounded-xl border border-white/10 bg-zinc-900/60 px-4 py-2.5 text-sm outline-none focus:border-indigo-500/70"
                  />
                  <label className="flex items-center gap-2 text-sm text-zinc-300">
                    <input
                      type="checkbox"
                      checked={serviceForm.active}
                      onChange={(e) =>
                        setServiceForm((f) => ({ ...f, active: e.target.checked }))
                      }
                      className="h-4 w-4 accent-indigo-500"
                    />
                    Disponível (ativo)
                  </label>
                  <div className="flex items-center gap-2 lg:col-span-3">
                    <button
                      type="submit"
                      disabled={serviceBusy}
                      className="rounded-xl bg-indigo-500 px-5 py-2.5 text-sm font-medium text-white transition hover:bg-indigo-400 disabled:opacity-60"
                    >
                      {serviceBusy ? '…' : serviceEditId ? 'Salvar alterações' : 'Cadastrar serviço'}
                    </button>
                    {serviceEditId && (
                      <button
                        type="button"
                        onClick={() => {
                          setServiceFormOpen(false);
                          setServiceEditId(null);
                        }}
                        className="rounded-xl border border-white/15 px-4 py-2.5 text-sm text-zinc-400"
                      >
                        Cancelar
                      </button>
                    )}
                  </div>
                  {serviceError && (
                    <p className="text-xs text-rose-400 lg:col-span-3">{serviceError}</p>
                  )}
                </form>
              )}

              {services.length === 0 ? (
                <div className="rounded-xl border border-white/10 bg-zinc-900/40 p-8 text-center text-sm text-zinc-500">
                  Nenhum serviço cadastrado. Clique em{' '}
                  <strong className="text-zinc-300">+ Novo serviço</strong> para
                  montar seu catálogo.
                </div>
              ) : (
                <div className="overflow-x-auto rounded-xl border border-white/10">
                  <table className="w-full text-left text-sm">
                    <thead className="bg-zinc-900/70 text-xs uppercase tracking-wider text-zinc-500">
                      <tr>
                        <th className="px-4 py-3 font-medium">Serviço</th>
                        <th className="px-4 py-3 font-medium">Nicho</th>
                        <th className="px-4 py-3 font-medium">Preço base</th>
                        <th className="px-4 py-3 font-medium">Duração</th>
                        <th className="px-4 py-3 font-medium">Comissão</th>
                        <th className="px-4 py-3 font-medium">Situação</th>
                        <th className="px-4 py-3 font-medium">Ações</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-white/5">
                      {services.map((service) => {
                        const deleteConfirm =
                          pendingDelete?.kind === 'servico' && pendingDelete.id === service.id;
                        return (
                          <tr key={service.id} className="bg-zinc-950/40">
                            <td className="px-4 py-3">
                              <span className="font-medium text-zinc-200">{service.name}</span>
                              {service.appointmentCount > 0 && (
                                <span className="block text-xs text-zinc-600">
                                  {service.appointmentCount} agendamento(s)
                                </span>
                              )}
                            </td>
                            <td className="px-4 py-3 text-zinc-400">
                              {NICHE_LABEL[service.nicheTag] ?? service.nicheTag}
                            </td>
                            <td className="whitespace-nowrap px-4 py-3 font-medium text-zinc-100">
                              {brl(service.basePrice)}
                            </td>
                            <td className="whitespace-nowrap px-4 py-3 text-zinc-400">
                              {service.estimatedDurationMinutes} min
                            </td>
                            <td className="px-4 py-3 text-zinc-400">
                              {service.commissionPercentage}%
                            </td>
                            <td className="px-4 py-3">
                              {service.active ? (
                                <span className="text-xs font-semibold text-emerald-400">
                                  ● ativo
                                </span>
                              ) : (
                                <span className="text-xs font-semibold text-zinc-600">
                                  ○ inativo
                                </span>
                              )}
                            </td>
                            <td className="px-4 py-3">
                              {deleteConfirm ? (
                                <span className="flex items-center gap-2 text-xs">
                                  <span className="text-zinc-400">Excluir?</span>
                                  <button
                                    type="button"
                                    onClick={() => void removeService(service.id)}
                                    className="rounded-lg bg-rose-500/80 px-2.5 py-1 font-medium text-white"
                                  >
                                    Sim, excluir
                                  </button>
                                  <button
                                    type="button"
                                    onClick={() => setPendingDelete(null)}
                                    className="rounded-lg border border-white/15 px-2.5 py-1 text-zinc-400"
                                  >
                                    Voltar
                                  </button>
                                </span>
                              ) : (
                                <span className="flex items-center gap-2">
                                  <button
                                    type="button"
                                    onClick={() => void toggleService(service)}
                                    className={`rounded-lg px-3 py-1.5 text-xs font-medium transition ${
                                      service.active
                                        ? 'border border-white/15 text-zinc-400 hover:text-zinc-200'
                                        : 'bg-emerald-500/15 text-emerald-400 hover:bg-emerald-500/25'
                                    }`}
                                  >
                                    {service.active ? 'Desativar' : 'Ativar'}
                                  </button>
                                  <button
                                    type="button"
                                    onClick={() => openServiceForm(service)}
                                    className="rounded-lg border border-white/15 px-3 py-1.5 text-xs text-zinc-400 transition hover:text-zinc-200"
                                  >
                                    Editar
                                  </button>
                                  <button
                                    type="button"
                                    onClick={() => setPendingDelete({ kind: 'servico', id: service.id })}
                                    className="rounded-lg border border-white/15 px-3 py-1.5 text-xs text-zinc-500 transition hover:border-rose-500/40 hover:text-rose-300"
                                  >
                                    Excluir
                                  </button>
                                </span>
                              )}
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              )}
            </div>
          )}

          {/* ── CONTRATOS ── */}
          {tab === 'contratos' && (
            <div className="space-y-5">
              <div className="flex flex-wrap items-center justify-between gap-3">
                <div>
                  <h2 className="text-lg font-semibold">Contratos de serviço</h2>
                  <p className="mt-1 text-sm text-zinc-500">
                    Emita contratos formais com seus clientes — assine, gere PDF e
                    acompanhe o status.
                  </p>
                </div>
                <button
                  type="button"
                  onClick={() => openContractForm()}
                  className="rounded-xl bg-indigo-500 px-4 py-2.5 text-sm font-medium text-white transition hover:bg-indigo-400"
                >
                  {contractFormOpen ? 'Fechar' : '+ Novo contrato'}
                </button>
              </div>

              {contractFormOpen && (
                <form
                  onSubmit={saveContract}
                  className="card-site space-y-4 p-5"
                >
                  <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
                    <select
                      required
                      value={contractForm.clientId}
                      onChange={(e) =>
                        setContractForm((f) => ({ ...f, clientId: e.target.value }))
                      }
                      aria-label="Cliente"
                      className="rounded-xl border border-white/10 bg-zinc-900/60 px-4 py-2.5 text-sm outline-none focus:border-indigo-500/70"
                    >
                      <option value="">Cliente *</option>
                      {clients.map((c) => (
                        <option key={c.id} value={c.id}>
                          {c.name}
                        </option>
                      ))}
                    </select>
                    <input
                      required
                      value={contractForm.title}
                      onChange={(e) =>
                        setContractForm((f) => ({ ...f, title: e.target.value }))
                      }
                      placeholder="Título do contrato *"
                      aria-label="Título"
                      className="rounded-xl border border-white/10 bg-zinc-900/60 px-4 py-2.5 text-sm outline-none focus:border-indigo-500/70"
                    />
                    <input
                      type="date"
                      required
                      value={contractForm.startDate}
                      onChange={(e) =>
                        setContractForm((f) => ({ ...f, startDate: e.target.value }))
                      }
                      aria-label="Data de início"
                      className="rounded-xl border border-white/10 bg-zinc-900/60 px-4 py-2.5 text-sm outline-none focus:border-indigo-500/70"
                    />
                    <input
                      type="date"
                      value={contractForm.endDate}
                      onChange={(e) =>
                        setContractForm((f) => ({ ...f, endDate: e.target.value }))
                      }
                      aria-label="Data de término"
                      className="rounded-xl border border-white/10 bg-zinc-900/60 px-4 py-2.5 text-sm outline-none focus:border-indigo-500/70"
                    />
                    <input
                      value={contractForm.description}
                      onChange={(e) =>
                        setContractForm((f) => ({ ...f, description: e.target.value }))
                      }
                      placeholder="Descrição (opcional)"
                      aria-label="Descrição"
                      className="rounded-xl border border-white/10 bg-zinc-900/60 px-4 py-2.5 text-sm outline-none focus:border-indigo-500/70"
                    />
                  </div>

                  <div className="space-y-3">
                    <div className="flex items-center justify-between">
                      <p className="text-sm font-medium text-zinc-300">Itens do contrato</p>
                      <button
                        type="button"
                        onClick={addContractItem}
                        className="rounded-lg border border-white/15 px-3 py-1.5 text-xs text-zinc-400 transition hover:text-zinc-200"
                      >
                        + Adicionar item
                      </button>
                    </div>
                    {contractForm.items.map((item, index) => (
                      <div key={index} className="grid gap-2 sm:grid-cols-[1fr_2fr_100px_120px_40px]">
                        <select
                          value={item.serviceId}
                          onChange={(e) => updateContractItem(index, 'serviceId', e.target.value)}
                          aria-label="Serviço"
                          className="rounded-xl border border-white/10 bg-zinc-900/60 px-3 py-2 text-sm outline-none focus:border-indigo-500/70"
                        >
                          <option value="">Serviço (opcional)</option>
                          {services.map((s) => (
                            <option key={s.id} value={s.id}>
                              {s.name}
                            </option>
                          ))}
                        </select>
                        <input
                          required
                          value={item.description}
                          onChange={(e) => updateContractItem(index, 'description', e.target.value)}
                          placeholder="Descrição do item *"
                          aria-label="Descrição do item"
                          className="rounded-xl border border-white/10 bg-zinc-900/60 px-3 py-2 text-sm outline-none focus:border-indigo-500/70"
                        />
                        <input
                          required
                          type="number"
                          min="1"
                          step="1"
                          value={item.quantity}
                          onChange={(e) => updateContractItem(index, 'quantity', e.target.value)}
                          placeholder="Qtd"
                          aria-label="Quantidade"
                          className="rounded-xl border border-white/10 bg-zinc-900/60 px-3 py-2 text-sm outline-none focus:border-indigo-500/70"
                        />
                        <input
                          required
                          type="number"
                          min="0"
                          step="0.01"
                          value={item.unitPrice}
                          onChange={(e) => updateContractItem(index, 'unitPrice', e.target.value)}
                          placeholder="Preço"
                          aria-label="Preço unitário"
                          className="rounded-xl border border-white/10 bg-zinc-900/60 px-3 py-2 text-sm outline-none focus:border-indigo-500/70"
                        />
                        <button
                          type="button"
                          onClick={() => removeContractItem(index)}
                          className="rounded-lg border border-white/10 text-zinc-500 transition hover:border-rose-500/40 hover:text-rose-300"
                          aria-label="Remover item"
                        >
                          ×
                        </button>
                      </div>
                    ))}
                  </div>

                  <div className="flex items-center gap-2">
                    <button
                      type="submit"
                      disabled={contractBusy}
                      className="rounded-xl bg-indigo-500 px-5 py-2.5 text-sm font-medium text-white transition hover:bg-indigo-400 disabled:opacity-60"
                    >
                      {contractBusy ? '…' : 'Criar contrato'}
                    </button>
                    <button
                      type="button"
                      onClick={() => setContractFormOpen(false)}
                      className="rounded-xl border border-white/15 px-4 py-2.5 text-sm text-zinc-400"
                    >
                      Cancelar
                    </button>
                  </div>
                  {contractError && (
                    <p className="text-xs text-rose-400">{contractError}</p>
                  )}
                </form>
              )}

              {contracts.length === 0 ? (
                <div className="rounded-xl border border-white/10 bg-zinc-900/40 p-8 text-center text-sm text-zinc-500">
                  Nenhum contrato emitido. Clique em <strong className="text-zinc-300">+ Novo contrato</strong> para começar.
                </div>
              ) : (
                <div className="overflow-x-auto rounded-xl border border-white/10">
                  <table className="w-full text-left text-sm">
                    <thead className="bg-zinc-900/70 text-xs uppercase tracking-wider text-zinc-500">
                      <tr>
                        <th className="px-4 py-3 font-medium">Nº</th>
                        <th className="px-4 py-3 font-medium">Cliente</th>
                        <th className="px-4 py-3 font-medium">Título</th>
                        <th className="px-4 py-3 font-medium">Valor</th>
                        <th className="px-4 py-3 font-medium">Status</th>
                        <th className="px-4 py-3 font-medium">Ações</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-white/5">
                      {contracts.map((contract) => (
                        <tr key={contract.id} className="bg-zinc-950/40">
                          <td className="whitespace-nowrap px-4 py-3 font-mono text-xs text-zinc-400">
                            {contract.contractNumber}
                          </td>
                          <td className="px-4 py-3 font-medium text-zinc-200">
                            {contract.clientName}
                          </td>
                          <td className="px-4 py-3 text-zinc-300">{contract.title}</td>
                          <td className="whitespace-nowrap px-4 py-3 font-medium text-zinc-100">
                            {brl(contract.totalAmount)}
                          </td>
                          <td className="px-4 py-3">
                            <span
                              className={`rounded-full border px-2.5 py-0.5 text-xs font-semibold ${
                                contract.status === 'ACTIVE'
                                  ? 'border-emerald-500/30 bg-emerald-500/15 text-emerald-400'
                                  : contract.status === 'SIGNED'
                                    ? 'border-sky-500/30 bg-sky-500/15 text-sky-400'
                                    : contract.status === 'CANCELLED'
                                      ? 'border-white/10 bg-zinc-500/15 text-zinc-400'
                                      : 'border-amber-500/30 bg-amber-500/15 text-amber-400'
                              }`}
                            >
                              {contract.status === 'DRAFT'
                                ? 'Rascunho'
                                : contract.status === 'ACTIVE'
                                  ? 'Ativo'
                                  : contract.status === 'SIGNED'
                                    ? 'Assinado'
                                    : contract.status === 'CANCELLED'
                                      ? 'Cancelado'
                                      : contract.status}
                            </span>
                          </td>
                          <td className="px-4 py-3">
                            <span className="flex items-center gap-2">
                              {contract.status === 'DRAFT' && (
                                <button
                                  type="button"
                                  onClick={() => signContract(contract.id)}
                                  className="rounded-lg bg-emerald-500 px-2.5 py-1 text-xs font-medium text-white"
                                >
                                  Assinar
                                </button>
                              )}
                              <button
                                type="button"
                                onClick={() => generateContractPdf(contract.id)}
                                className="rounded-lg border border-indigo-500/40 bg-indigo-500/10 px-2.5 py-1 text-xs font-medium text-indigo-300 transition hover:bg-indigo-500/20"
                              >
                                PDF
                              </button>
                              {(contract.status === 'DRAFT' || contract.status === 'ACTIVE') && (
                                <button
                                  type="button"
                                  onClick={() => cancelContract(contract.id)}
                                  className="rounded-lg border border-white/15 px-2.5 py-1 text-xs text-zinc-400 transition hover:text-zinc-200"
                                >
                                  Cancelar
                                </button>
                              )}
                            </span>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </div>
          )}

          {/* ── EQUIPE ── */}
          {tab === 'equipe' && (
            <div>
              <div className="flex flex-wrap items-center justify-between gap-3">
                <div>
                  <h2 className="text-lg font-semibold">Equipe</h2>
                  <p className="mt-1 text-sm text-zinc-500">
                    Usuários com acesso à empresa. Cada acesso tem papel e
                    permissões próprias.
                  </p>
                </div>
                <button
                  type="button"
                  onClick={() => {
                    setInviteOpen((v) => !v);
                    setInvitePassword(null);
                    setInviteError(null);
                  }}
                  className="rounded-xl bg-indigo-500 px-4 py-2.5 text-sm font-medium text-white transition hover:bg-indigo-400"
                >
                  {inviteOpen ? 'Fechar' : '+ Convidar membro'}
                </button>
              </div>

              {inviteOpen && (
                <form
                  onSubmit={sendInvite}
                  className="card-site mt-5 grid gap-3 p-5 sm:grid-cols-[1fr_1fr_150px_auto]"
                >
                  <input
                    required
                    value={invite.name}
                    onChange={(e) => setInvite((f) => ({ ...f, name: e.target.value }))}
                    placeholder="Nome *"
                    aria-label="Nome do membro"
                    className="rounded-xl border border-white/10 bg-zinc-900/60 px-4 py-2.5 text-sm outline-none focus:border-indigo-500/70"
                  />
                  <input
                    required
                    type="email"
                    value={invite.email}
                    onChange={(e) => setInvite((f) => ({ ...f, email: e.target.value }))}
                    placeholder="E-mail *"
                    aria-label="E-mail do membro"
                    className="rounded-xl border border-white/10 bg-zinc-900/60 px-4 py-2.5 text-sm outline-none focus:border-indigo-500/70"
                  />
                  <select
                    value={invite.role}
                    onChange={(e) => setInvite((f) => ({ ...f, role: e.target.value }))}
                    aria-label="Papel"
                    className="rounded-xl border border-white/10 bg-zinc-900/60 px-3 py-2.5 text-sm outline-none focus:border-indigo-500/70"
                  >
                    <option value="MANAGER">Gerente</option>
                    <option value="CASHIER">Caixa</option>
                    <option value="TECH">Técnico</option>
                  </select>
                  <button
                    type="submit"
                    disabled={inviteBusy}
                    className="rounded-xl bg-indigo-500 px-5 py-2.5 text-sm font-medium text-white transition hover:bg-indigo-400 disabled:opacity-60"
                  >
                    {inviteBusy ? '…' : 'Adicionar'}
                  </button>
                  {inviteError && (
                    <p className="text-xs text-rose-400 sm:col-span-4">{inviteError}</p>
                  )}
                  {invitePassword && (
                    <p className="rounded-lg border border-amber-500/30 bg-amber-500/10 px-3 py-2 text-xs text-amber-200 sm:col-span-4">
                      ✓ Membro criado. Senha provisória (demonstração — em
                      produção viria por e-mail):{' '}
                      <code className="font-mono font-semibold">{invitePassword}</code>
                    </p>
                  )}
                </form>
              )}

              <div className="mt-5 overflow-x-auto rounded-xl border border-white/10">
                <table className="w-full text-left text-sm">
                  <thead className="bg-zinc-900/70 text-xs uppercase tracking-wider text-zinc-500">
                    <tr>
                      <th className="px-4 py-3 font-medium">Nome</th>
                      <th className="px-4 py-3 font-medium">E-mail</th>
                      <th className="px-4 py-3 font-medium">Papel</th>
                      <th className="px-4 py-3 font-medium">Situação</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-white/5">
                    {users.map((u) => (
                      <tr key={u.id} className="bg-zinc-950/40">
                        <td className="px-4 py-3 font-medium text-zinc-200">
                          {u.name}
                        </td>
                        <td className="px-4 py-3 text-zinc-400">{u.email}</td>
                        <td className="px-4 py-3 text-zinc-400">
                          {ROLE_LABEL[u.role] ?? u.role}
                        </td>
                        <td className="px-4 py-3">
                          {u.active ? (
                            <span className="text-emerald-400">● ativo</span>
                          ) : (
                            <span className="text-zinc-600">○ inativo</span>
                          )}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}

          {/* ── EMPRESA ── */}
          {tab === 'empresa' && (
            <div>
              <h2 className="text-lg font-semibold">Dados da empresa</h2>
              <p className="mt-1 text-sm text-zinc-500">
                Identificação cadastral usada em documentos fiscais e faturas.
              </p>

              <dl className="mt-5 grid gap-4 sm:grid-cols-2">
                <div className="card-site p-5">
                  <dt className="text-xs font-semibold uppercase tracking-wider text-zinc-500">
                    Nome fantasia
                  </dt>
                  <dd className="mt-1.5 font-medium text-zinc-100">
                    {sub?.tenant?.tradeName ?? '—'}
                  </dd>
                </div>
                <div className="card-site p-5">
                  <dt className="text-xs font-semibold uppercase tracking-wider text-zinc-500">
                    Razão social
                  </dt>
                  <dd className="mt-1.5 font-medium text-zinc-100">
                    {sub?.tenant?.legalName ?? '—'}
                  </dd>
                </div>
                <div className="card-site p-5">
                  <dt className="text-xs font-semibold uppercase tracking-wider text-zinc-500">
                    Subdomínio
                  </dt>
                  <dd className="mt-1.5 font-mono text-sm text-indigo-300">
                    {sub?.tenant?.slug ?? '—'}.filitech.app
                  </dd>
                </div>
                <div className="card-site p-5">
                  <dt className="text-xs font-semibold uppercase tracking-wider text-zinc-500">
                    Situação
                  </dt>
                  <dd className="mt-1.5">
                    <Chip status={sub?.tenant?.status ?? '—'} />
                  </dd>
                </div>
                <div className="card-site p-5">
                  <dt className="text-xs font-semibold uppercase tracking-wider text-zinc-500">
                    Cliente desde
                  </dt>
                  <dd className="mt-1.5 font-medium text-zinc-100">
                    {fmtDate(sub?.tenant?.createdAt)}
                  </dd>
                </div>
                <div className="card-site p-5">
                  <dt className="text-xs font-semibold uppercase tracking-wider text-zinc-500">
                    Responsável (sessão)
                  </dt>
                  <dd className="mt-1.5 font-medium text-zinc-100">
                    {me ? `${ROLE_LABEL[me.role] ?? me.role} · ${me.tenantId.slice(0, 8)}…` : '—'}
                  </dd>
                </div>
              </dl>

              <div className="card-site mt-5 p-5 text-sm text-zinc-400">
                <p className="font-medium text-zinc-200">Privacidade e seus dados</p>
                <p className="mt-1">
                  Seus dados pertencem a você: exportação total (CSV/XML) está
                  disponível a qualquer momento e o isolamento multi-tenant é
                  garantido por escopo estrutural em cada consulta. Veja a{' '}
                  <Link href="/privacidade" className="text-indigo-400 underline">
                    Política de Privacidade
                  </Link>
                  .
                </p>
              </div>
            </div>
          )}
        </section>
      </div>

      {/* Toast */}
      {toast && (
        <div
          role="status"
          className={`fixed bottom-6 right-6 z-50 max-w-sm rounded-xl border px-4 py-3 text-sm shadow-2xl backdrop-blur-xl ${
            toast.kind === 'ok'
              ? 'border-emerald-500/40 bg-emerald-950/80 text-emerald-100'
              : 'border-rose-500/40 bg-rose-950/80 text-rose-100'
          }`}
        >
          {toast.text}
        </div>
      )}
    </main>
  );
}
