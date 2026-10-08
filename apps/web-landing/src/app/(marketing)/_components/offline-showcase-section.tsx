'use client';
// src/app/(marketing)/_components/offline-showcase-section.tsx
// Transparência de arquitetura: como o PDV vende sem internet (Cap. 8.3).

import { motion } from 'framer-motion';

const LAYERS = [
  {
    stack: 'IndexedDB (Dexie)',
    title: 'Espelho local da operação',
    text: 'Produtos, clientes e o lote atual de vendas vivem no navegador. O caixa abre, lê e escreve tudo localmente — nenhuma tela espera rede.',
  },
  {
    stack: 'Service Worker + fila',
    title: 'Background Sync',
    text: 'Vendas offline entram numa fila durável com Idempotency-Key. Quando a conexão volta, o SW drena a fila — repetir um envio nunca duplica venda.',
  },
  {
    stack: 'API + Redis',
    title: 'Reconciliação idempotente',
    text: 'O servidor deduplica pela chave, grava no Postgres transacionalmente e publica o evento por SSE para as demais telas em tempo real.',
  },
];

export function OfflineShowcaseSection() {
  return (
    <section id="arquitetura" className="relative px-5 py-24 lg:px-8">
      <div className="mx-auto grid max-w-7xl items-center gap-12 lg:grid-cols-2">
        <div>
          <p className="text-sm font-semibold uppercase tracking-[0.2em] text-indigo-400">
            Transparência de arquitetura
          </p>
          <h2 className="mt-3 text-3xl font-bold tracking-tight sm:text-5xl">
            A internet cai.{' '}
            <span className="bg-gradient-to-r from-emerald-400 to-teal-400 bg-clip-text text-transparent">
              A fila não.
            </span>
          </h2>
          <p className="mt-4 text-lg leading-relaxed text-zinc-400">
            Nada de promessa vaga de “funciona offline”. Estas são as três
            camadas que sustentam o PDV sem conexão — a mesma engenharia que
            grandes redes usam nos seus caixas.
          </p>

          <div className="mt-8 space-y-4">
            {LAYERS.map((layer, i) => (
              <motion.div
                key={layer.stack}
                initial={{ opacity: 0, x: -24 }}
                whileInView={{ opacity: 1, x: 0 }}
                viewport={{ once: true }}
                transition={{ delay: i * 0.12, duration: 0.5, ease: [0.22, 1, 0.36, 1] }}
                className="card-site p-5"
              >
                <span className="inline-block rounded-md bg-indigo-500/15 px-2 py-0.5 font-mono text-xs text-indigo-300">
                  {layer.stack}
                </span>
                <h3 className="mt-3 font-semibold text-zinc-100">{layer.title}</h3>
                <p className="mt-1.5 text-sm leading-relaxed text-zinc-400">
                  {layer.text}
                </p>
              </motion.div>
            ))}
          </div>
        </div>

        <motion.div
          initial={{ opacity: 0, y: 32 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true }}
          transition={{ duration: 0.6, ease: [0.22, 1, 0.36, 1] }}
          className="card-site overflow-hidden"
        >
          <div className="flex items-center gap-2 border-b border-white/10 px-4 py-3">
            <span className="h-3 w-3 rounded-full bg-rose-500/80" />
            <span className="h-3 w-3 rounded-full bg-amber-500/80" />
            <span className="h-3 w-3 rounded-full bg-emerald-500/80" />
            <span className="ml-2 text-xs text-zinc-500">
              pdv · fluxo offline → sync
            </span>
          </div>
          <pre className="overflow-x-auto p-5 font-mono text-[13px] leading-relaxed text-zinc-300">
{`1. caixa 01 → venda criada localmente
   { id: "venda_local_9f2", total: 47.9,
     status: "PENDENTE_SYNC",
     idempotencyKey: "a41c…e9" }

2. rede indisponível → fila IndexedDB
   queue.push(venda_local_9f2)   ✓ não bloqueia

3. conexão volta → Background Sync
   POST /api/sales  Idempotency-Key: a41c…e9
   → 201  (primeira vez)

4. retry automático do SW reenvia…
   POST /api/sales  Idempotency-Key: a41c…e9
   → 200  { "duplicated": true }   ← não duplica

5. estoque, caixa e fiscal atualizados
   e publicados por SSE para as outras telas.`}
          </pre>
        </motion.div>
      </div>
    </section>
  );
}
