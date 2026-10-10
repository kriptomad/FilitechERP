'use client';
// src/app/app/pdv/page.tsx — PDV (frente de caixa) — Cap. 4.1 / 8.1

import { useEffect, useMemo, useState } from 'react';
import { api, post, ApiError } from '@/lib/api';

interface Product {
  id: string;
  sku: string;
  barcode: string | null;
  name: string;
  unitPrice: number;
  stockQuantity: number | string;
  active: boolean;
}

interface CartItem {
  product: Product;
  quantity: number;
  unitPrice: number;
}

interface OpenRegister {
  id: string;
  openingAmount: number;
}

const bzl = (value: number) =>
  `R$ ${Number(value || 0).toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

export default function PdvPage() {
  const [products, setProducts] = useState<Product[]>([]);
  const [search, setSearch] = useState('');
  const [cart, setCart] = useState<CartItem[]>([]);
  const [register, setRegister] = useState<OpenRegister | null>(null);
  const [registerLoading, setRegisterLoading] = useState(false);
  const [openingAmount, setOpeningAmount] = useState('');
  const [paymentMethod, setPaymentMethod] = useState('PIX');
  const [amountTendered, setAmountTendered] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;

    async function load() {
      try {
        const [productList, openReg] = await Promise.all([
          api<Product[]>('/api/products'),
          api<OpenRegister | null>('/api/cash-register?open=1'),
        ]);
        if (cancelled) return;
        setProducts(productList);
        setRegister(openReg);
      } catch (err) {
        if (!cancelled) setError(err instanceof ApiError ? err.message : 'Falha ao carregar.');
      } finally {
        if (!cancelled) setLoading(false);
      }
    }

    void load();
    return () => {
      cancelled = true;
    };
  }, []);

  const filtered = useMemo(() => {
    const term = search.trim().toLowerCase();
    if (!term) return products;
    return products.filter(
      (p) =>
        p.name.toLowerCase().includes(term) ||
        p.sku.toLowerCase().includes(term) ||
        (p.barcode && p.barcode.includes(term)),
    );
  }, [products, search]);

  const total = cart.reduce((sum, i) => sum + i.unitPrice * i.quantity, 0);
  const tendered = Number(amountTendered.replace(',', '.')) || 0;
  const change = Math.max(0, tendered - total);

  function addToCart(product: Product) {
    if (!register) return;
    setCart((prev) => {
      const existing = prev.find((i) => i.product.id === product.id);
      if (existing) {
        return prev.map((i) =>
          i.product.id === product.id ? { ...i, quantity: i.quantity + 1 } : i,
        );
      }
      return [...prev, { product, quantity: 1, unitPrice: product.unitPrice }];
    });
  }

  function updateQuantity(productId: string, delta: number) {
    setCart((prev) =>
      prev
        .map((i) =>
          i.product.id === productId ? { ...i, quantity: i.quantity + delta } : i,
        )
        .filter((i) => i.quantity > 0),
    );
  }

  function removeItem(productId: string) {
    setCart((prev) => prev.filter((i) => i.product.id !== productId));
  }

  async function openRegisterAction(event: React.FormEvent) {
    event.preventDefault();
    setRegisterLoading(true);
    setError(null);
    try {
      const created = await post<OpenRegister>('/api/cash-register', {
        openingAmount: Number(openingAmount.replace(',', '.')) || 0,
      });
      setRegister(created);
      setOpeningAmount('');
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Não foi possível abrir o caixa.');
    } finally {
      setRegisterLoading(false);
    }
  }

  async function closeRegisterAction() {
    if (!register) return;
    setBusy(true);
    setError(null);
    try {
      await post(`/api/cash-register`, {
        registerId: register.id,
        countedAmount: total,
      });
      setRegister(null);
      setCart([]);
      setSuccess('Caixa fechado com sucesso.');
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Falha ao fechar o caixa.');
    } finally {
      setBusy(false);
    }
  }

  async function finalizeSale() {
    if (!register) return;
    setBusy(true);
    setError(null);
    setSuccess(null);
    try {
      await post('/api/sales', {
        idempotencyKey: `pdv-${register.id}-${Date.now()}`,
        cashRegisterId: register.id,
        items: cart.map((i) => ({
          productId: i.product.id,
          quantity: i.quantity,
          unitPrice: i.unitPrice,
        })),
        paymentMethod,
        amountTendered: paymentMethod === 'CASH' ? tendered : undefined,
      });
      setCart([]);
      setAmountTendered('');
      setSuccess('Venda registrada com sucesso.');
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Falha ao registrar a venda.');
    } finally {
      setBusy(false);
    }
  }

  if (loading) {
    return (
      <div className="grid min-h-[60vh] place-items-center text-zinc-500">
        Carregando PDV…
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold tracking-tight">PDV</h1>
        <p className="mt-1 text-sm text-zinc-500">Frente de caixa</p>
      </div>

      {error && (
        <p role="alert" className="rounded-lg border border-rose-500/30 bg-rose-500/10 px-3 py-2 text-sm text-rose-300">
          {error}
        </p>
      )}
      {success && (
        <p role="status" className="rounded-lg border border-emerald-500/30 bg-emerald-500/10 px-3 py-2 text-sm text-emerald-300">
          {success}
        </p>
      )}

      {!register ? (
        <section className="rounded-2xl border border-white/10 bg-zinc-900/40 p-6">
          <h2 className="text-lg font-semibold">Abrir caixa</h2>
          <p className="mt-1 text-sm text-zinc-500">
            Informe o fundo de troco para iniciar as vendas.
          </p>
          <form onSubmit={openRegisterAction} className="mt-6 max-w-sm space-y-4">
            <label className="block space-y-1.5">
              <span className="text-xs font-medium uppercase tracking-wide text-zinc-400">
                Fundo de troco
              </span>
              <input
                required
                type="number"
                step="0.01"
                min="0"
                value={openingAmount}
                onChange={(e) => setOpeningAmount(e.target.value)}
                className="w-full rounded-xl border border-white/10 bg-zinc-900/60 px-4 py-3 text-sm text-zinc-100 outline-none transition focus:border-indigo-500/70"
                placeholder="0,00"
              />
            </label>
            <button
              type="submit"
              disabled={registerLoading}
              className="w-full rounded-xl bg-indigo-600 py-3 font-medium text-white transition hover:bg-indigo-500 disabled:opacity-60"
            >
              {registerLoading ? 'Abrindo…' : 'Abrir caixa'}
            </button>
          </form>
        </section>
      ) : (
        <div className="grid gap-6 lg:grid-cols-[1fr_360px]">
          <section className="rounded-2xl border border-white/10 bg-zinc-900/40 p-6">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <div>
                <p className="text-sm font-semibold uppercase tracking-[0.15em] text-emerald-400">
                  Caixa aberto
                </p>
                <p className="mt-1 text-sm text-zinc-500">
                  Fundo inicial {bzl(register.openingAmount)}
                </p>
              </div>
              <button
                type="button"
                onClick={closeRegisterAction}
                disabled={busy}
                className="rounded-xl border border-white/15 px-4 py-2.5 text-sm text-zinc-300 transition hover:bg-white/5 disabled:opacity-60"
              >
                {busy ? 'Fechando…' : 'Fechar caixa'}
              </button>
            </div>

            <div className="mt-6">
              <label htmlFor="pdv-search" className="mb-1.5 block text-sm text-zinc-400">
                Buscar produto
              </label>
              <input
                id="pdv-search"
                type="search"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder="Nome, SKU ou código de barras"
                className="w-full rounded-xl border border-white/10 bg-zinc-900/60 px-4 py-3 text-sm text-zinc-100 outline-none transition focus:border-indigo-500/70"
              />
            </div>

            <div className="mt-4 grid grid-cols-2 gap-3 sm:grid-cols-3 md:grid-cols-4">
              {filtered.map((product) => (
                <button
                  key={product.id}
                  type="button"
                  onClick={() => addToCart(product)}
                  className="rounded-xl border border-white/10 bg-zinc-900/60 p-4 text-left transition hover:border-indigo-500/50 hover:bg-indigo-500/5"
                >
                  <p className="font-medium text-zinc-200 line-clamp-2">{product.name}</p>
                  <p className="mt-2 text-sm text-zinc-500">{product.sku}</p>
                  <p className="mt-1 text-sm font-semibold text-indigo-300">{bzl(Number(product.unitPrice))}</p>
                </button>
              ))}
            </div>
          </section>

          <aside className="h-fit rounded-2xl border border-white/10 bg-zinc-900/40 p-6 lg:sticky lg:top-24">
            <h2 className="text-lg font-semibold">Carrinho</h2>

            {cart.length === 0 ? (
              <p className="mt-3 text-sm text-zinc-500">Nenhum item adicionado.</p>
            ) : (
              <ul className="mt-4 space-y-3">
                {cart.map((item) => (
                  <li key={item.product.id} className="rounded-xl border border-white/10 bg-black/20 p-3">
                    <div className="flex items-start justify-between gap-3">
                      <p className="text-sm font-medium text-zinc-200">{item.product.name}</p>
                      <button
                        type="button"
                        onClick={() => removeItem(item.product.id)}
                        aria-label={`Remover ${item.product.name}`}
                        className="text-xs text-zinc-500 hover:text-rose-300"
                      >
                        Remover
                      </button>
                    </div>
                    <div className="mt-2 flex items-center justify-between">
                      <div className="flex items-center gap-2">
                        <button
                          type="button"
                          onClick={() => updateQuantity(item.product.id, -1)}
                          aria-label="Diminuir quantidade"
                          className="grid h-8 w-8 place-items-center rounded-lg border border-white/10 text-zinc-300"
                        >
                          −
                        </button>
                        <span className="w-8 text-center text-sm">{item.quantity}</span>
                        <button
                          type="button"
                          onClick={() => updateQuantity(item.product.id, 1)}
                          aria-label="Aumentar quantidade"
                          className="grid h-8 w-8 place-items-center rounded-lg border border-white/10 text-zinc-300"
                        >
                          +
                        </button>
                      </div>
                      <p className="text-sm font-semibold text-zinc-100">
                        {bzl(item.unitPrice * item.quantity)}
                      </p>
                    </div>
                  </li>
                ))}
              </ul>
            )}

            <div className="mt-6 space-y-3">
              <div className="flex items-center justify-between">
                <span className="text-sm text-zinc-400">Total</span>
                <span className="text-xl font-bold">{bzl(total)}</span>
              </div>

              <label htmlFor="payment-method" className="block text-sm text-zinc-400">
                Forma de pagamento
              </label>
              <select
                id="payment-method"
                value={paymentMethod}
                onChange={(e) => setPaymentMethod(e.target.value)}
                className="w-full rounded-xl border border-white/10 bg-zinc-900/60 px-4 py-3 text-sm text-zinc-100 outline-none transition focus:border-indigo-500/70"
              >
                <option value="PIX">Pix</option>
                <option value="CREDIT_CARD">Cartão de crédito</option>
                <option value="CASH">Dinheiro</option>
              </select>

              {paymentMethod === 'CASH' && (
                <label className="block space-y-1.5">
                  <span className="text-sm text-zinc-400">Valor recebido</span>
                  <input
                    type="number"
                    step="0.01"
                    min="0"
                    value={amountTendered}
                    onChange={(e) => setAmountTendered(e.target.value)}
                    className="w-full rounded-xl border border-white/10 bg-zinc-900/60 px-4 py-3 text-sm text-zinc-100 outline-none transition focus:border-indigo-500/70"
                  />
                  {change > 0 && (
                    <p className="text-sm text-emerald-400">Troco: {bzl(change)}</p>
                  )}
                </label>
              )}

              <button
                type="button"
                onClick={finalizeSale}
                disabled={busy || cart.length === 0 || total <= 0}
                className="w-full rounded-xl bg-indigo-600 py-4 font-semibold text-white transition hover:bg-indigo-500 disabled:opacity-60"
              >
                {busy ? 'Processando…' : `Finalizar venda — ${bzl(total)}`}
              </button>
            </div>
          </aside>
        </div>
      )}
    </div>
  );
}
