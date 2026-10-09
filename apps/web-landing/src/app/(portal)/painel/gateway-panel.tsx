// src/app/(portal)/painel/gateway-panel.tsx — Cap. 20.4 / 2.7
//
// Painel de configuração do provedor de pagamento.
//
// Gap que este painel fecha: não havia NENHUMA forma de ver ou testar a
// integração de pagamento. A pessoa relatava que "não consegue colocar a API do
// Mercado Pago" — porque não existia interface para isso. Aqui ela vê o que
// está faltando, testa a conexão de verdade e recebe a URL exata do webhook.
//
// A chave NÃO é digitada aqui de propósito: credencial de PSP é segredo de
// infraestrutura e vive no ambiente da Vercel. Aceitá-la por aqui permitiria que
// qualquer usuário logado redirecionasse as cobranças da plataforma.

'use client';

import { useCallback, useEffect, useState } from 'react';
import { api, post, ApiError } from '@/lib/api';

interface GatewayStatus {
  configured: boolean;
  provider: string | null;
  providerLabel: string | null;
  requiredEnv: string[];
  message: string;
}

interface TestResult {
  provider: string;
  providerLabel: string | null;
  ok: boolean;
  message: string;
  latencyMs: number;
  testedAt: string;
}

interface WebhookInfo {
  provider: string | null;
  url: string;
  events: string[];
  secretConfigured: boolean;
  instructions: string[];
}

export function GatewayPanel() {
  const [status, setStatus] = useState<GatewayStatus | null>(null);
  const [webhook, setWebhook] = useState<WebhookInfo | null>(null);
  const [test, setTest] = useState<TestResult | null>(null);
  const [testing, setTesting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    try {
      const [statusData, webhookData] = await Promise.all([
        api<GatewayStatus>('/api/gateway'),
        api<WebhookInfo>('/api/gateway/webhook-url'),
      ]);
      setStatus(statusData);
      setWebhook(webhookData);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Falha ao carregar a configuração.');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  async function runTest() {
    setTesting(true);
    setError(null);
    setTest(null);

    try {
      const result = await post<TestResult>('/api/gateway', {});
      setTest(result);
    } catch (err) {
      // Um teste que falha NÃO é erro da aplicação: é informação útil.
      if (err instanceof ApiError) {
        setTest({
          provider: status?.provider ?? 'desconhecido',
          providerLabel: status?.providerLabel ?? null,
          ok: false,
          message: err.message,
          latencyMs: 0,
          testedAt: new Date().toISOString(),
        });
      } else {
        setError('Não foi possível executar o teste.');
      }
    } finally {
      setTesting(false);
    }
  }

  if (loading) {
    return <div className="text-sm text-zinc-500">Carregando configuração…</div>;
  }

  return (
    <div className="space-y-6">
      <div
        className={`rounded-xl border p-5 ${
          status?.configured
            ? 'border-emerald-500/30 bg-emerald-500/5'
            : 'border-amber-500/30 bg-amber-500/5'
        }`}
      >
        <p className="text-sm font-semibold">
          {status?.configured
            ? `Cobrança habilitada via ${status.providerLabel}`
            : 'Cobrança não configurada'}
        </p>
        <p className="mt-1 text-sm text-zinc-400">{status?.message}</p>
      </div>

      {error && (
        <p role="alert" className="rounded-lg border border-rose-500/30 bg-rose-500/10 px-3 py-2 text-sm text-rose-300">
          {error}
        </p>
      )}

      {!status?.configured && (
        <div className="rounded-xl border border-white/10 bg-zinc-900/40 p-5">
          <p className="text-sm font-medium text-zinc-200">
            Configure estas variáveis no painel da Vercel
          </p>
          <p className="mt-1 text-xs text-zinc-500">
            Settings → Environment Variables. Depois, redeploy e teste a conexão aqui.
          </p>

          <ul className="mt-4 space-y-1.5 font-mono text-xs text-zinc-400">
            {status?.requiredEnv.map((variable) => (
              <li key={variable} className="rounded bg-black/30 px-3 py-2">
                {variable}
              </li>
            ))}
          </ul>

          <p className="mt-4 text-xs text-zinc-600">
            A chave é gerada no painel do Mercado Pago
            (Configurações → Suas credenciais →_ACCESS Token) ou da Asaas
            (Integrações → Chave de acesso).
          </p>
        </div>
      )}

      {status?.configured && (
        <div className="flex flex-wrap items-center gap-3">
          <button
            type="button"
            onClick={runTest}
            disabled={testing}
            className="rounded-xl bg-indigo-600 px-5 py-2.5 font-medium text-white transition hover:bg-indigo-500 disabled:opacity-60"
          >
            {testing ? 'Testando…' : 'Testar conexão'}
          </button>
          <button
            type="button"
            onClick={load}
            className="rounded-xl border border-white/15 px-5 py-2.5 text-zinc-300 transition hover:bg-white/5"
          >
            Atualizar
          </button>
        </div>
      )}

      {test && (
        <div
          className={`rounded-xl border p-5 ${
            test.ok
              ? 'border-emerald-500/30 bg-emerald-500/5'
              : 'border-rose-500/30 bg-rose-500/5'
          }`}
          role="status"
        >
          <p className="text-sm font-medium">
            {test.ok ? 'Conexão bem-sucedida' : 'Falha na conexão'}
          </p>
          <p className="mt-1 text-sm text-zinc-400">{test.message}</p>
          <p className="mt-1 text-xs text-zinc-600">
            Latência {test.latencyMs}ms ·{' '}
            {new Date(test.testedAt).toLocaleString('pt-BR')}
          </p>
        </div>
      )}

      {webhook && (
        <div className="rounded-xl border border-white/10 bg-zinc-900/40 p-5">
          <p className="text-sm font-medium text-zinc-200">URL de webhook</p>
          <p className="mt-1 text-xs text-zinc-500">
            Cadastre esta URL no painel do {webhook.provider ?? 'provedor'}. É ela que
            confirma o pagamento e ativa a assinatura.
          </p>

          <code className="mt-3 block break-all rounded-lg bg-black/40 px-3 py-2 font-mono text-xs text-indigo-300">
            {webhook.url}
          </code>

          <div className="mt-4">
            <p className="text-xs font-semibold uppercase tracking-wider text-zinc-500">
              Como configurar
            </p>
            <ol className="mt-2 list-decimal space-y-1 pl-5 text-xs text-zinc-400">
              {webhook.instructions.map((step) => (
                <li key={step}>{step}</li>
              ))}
            </ol>
          </div>

          <div className="mt-4">
            <p className="text-xs font-semibold uppercase tracking-wider text-zinc-500">
              Eventos mínimos
            </p>
            <div className="mt-2 flex flex-wrap gap-1.5">
              {webhook.events.map((event) => (
                <code key={event} className="rounded bg-black/30 px-2 py-1 text-[11px] text-zinc-400">
                  {event}
                </code>
              ))}
            </div>
          </div>

          <p
            className={`mt-4 text-xs ${
              webhook.secretConfigured ? 'text-emerald-400' : 'text-amber-400'
            }`}
          >
            {webhook.secretConfigured
              ? 'Segredo do webhook configurado — as notificações serão validadas.'
              : 'Segredo do webhook NÃO configurado. Sem ele, notificações do provedor são rejeitadas por segurança.'}
          </p>
        </div>
      )}
    </div>
  );
}