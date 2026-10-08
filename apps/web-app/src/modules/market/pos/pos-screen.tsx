// src/modules/market/pos/pos-screen.tsx — Cap. 8.3 (PDV offline-first)
import { useState, useEffect } from "react";
import { closeSaleOffline } from "./close-sale-offline";
import { offlineDb, CachedProduct } from "../../../shared/offline/db";
import { useOfflineStatus } from "../../../shared/offline/use-offline-status";
import { apiFetch } from "../../../shared/auth/session";

interface CartItem {
  productId: string;
  name: string;
  quantity: number;
  unitPrice: number;
}

export default function PosScreen() {
  const [products, setProducts] = useState<CachedProduct[]>([]);
  const [cart, setCart] = useState<CartItem[]>([]);
  const [amountTendered, setAmountTendered] = useState("");
  const [lastSale, setLastSale] = useState<{
    localId: string;
    totalAmount: number;
    changeDue: number;
  } | null>(null);
  const [search, setSearch] = useState("");
  const online = useOfflineStatus();

  useEffect(() => {
    // Offline-first (Cap. 8.3): renderiza o cache local imediatamente…
    let cancelled = false;
    offlineDb.products.toArray().then((cached) => {
      if (!cancelled) setProducts(cached);
    });

    // …e se estiver online, hidrata o snapshot com o catálogo da API.
    if (navigator.onLine) {
      apiFetch("/api/products")
        .then((r) => r.json())
        .then((json) => {
          const rows: {
            id: string;
            sku: string;
            barcode: string | null;
            name: string;
            unitPrice: string | number;
            stockQuantity: string | number;
          }[] = json?.data ?? [];
          if (rows.length === 0) return;
          const cached: CachedProduct[] = rows.map((p) => ({
            id: p.id,
            sku: p.sku,
            barcode: p.barcode,
            name: p.name,
            unitPrice: Number(p.unitPrice),
            stockQuantitySnapshot: Number(p.stockQuantity),
          }));
          return offlineDb.products
            .bulkPut(cached)
            .then(() => offlineDb.products.toArray())
            .then((all) => {
              if (!cancelled) setProducts(all);
            });
        })
        .catch(() => {
          // offline ou API fora — mantém o cache local (comportamento esperado)
        });
    }

    return () => {
      cancelled = true;
    };
  }, []);

  const filtered = products.filter(
    (p) =>
      p.name.toLowerCase().includes(search.toLowerCase()) ||
      p.sku.toLowerCase().includes(search.toLowerCase()) ||
      p.barcode?.includes(search),
  );

  const total = cart.reduce((sum, item) => sum + item.quantity * item.unitPrice, 0);

  function addToCart(product: CachedProduct) {
    setCart((prev) => {
      const existing = prev.find((i) => i.productId === product.id);
      if (existing) {
        return prev.map((i) =>
          i.productId === product.id ? { ...i, quantity: i.quantity + 1 } : i,
        );
      }
      return [
        ...prev,
        { productId: product.id, name: product.name, quantity: 1, unitPrice: Number(product.unitPrice) },
      ];
    });
  }

  async function handleFinishSale() {
    if (cart.length === 0) return;
    const result = await closeSaleOffline({
      items: cart.map(({ productId, quantity, unitPrice }) => ({
        productId,
        quantity,
        unitPrice,
      })),
      paymentMethod: "CASH",
      amountTendered: amountTendered ? Number(amountTendered) : undefined,
    });
    setLastSale(result);
    setCart([]);
    setAmountTendered("");
    offlineDb.products.toArray().then(setProducts); // recarrega snapshot já descontado
  }

  return (
    <div className="flex h-screen bg-zinc-950 text-zinc-100">
      {/* Coluna produtos */}
      <div className="flex-1 flex flex-col border-r border-zinc-800">
        <div className="p-4 border-b border-zinc-800 flex items-center gap-3">
          <input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Buscar por nome, SKU ou código de barras…"
            className="flex-1 rounded-lg bg-zinc-900 border border-zinc-800 px-4 py-3 focus:border-indigo-500 outline-none"
            autoFocus
          />
          <span
            className={`rounded-full px-3 py-1 text-xs font-semibold ${
              online ? "bg-emerald-500/15 text-emerald-400" : "bg-amber-500/15 text-amber-400"
            }`}
          >
            {online ? "ONLINE" : "OFFLINE — vendas serão sincronizadas"}
          </span>
        </div>
        <div className="flex-1 overflow-y-auto p-4 grid grid-cols-2 lg:grid-cols-3 content-start gap-3">
          {filtered.map((p) => (
            <button
              key={p.id}
              onClick={() => addToCart(p)}
              disabled={p.stockQuantitySnapshot <= 0}
              className="rounded-xl border border-zinc-800 bg-zinc-900/60 p-4 text-left
                         hover:border-indigo-500 transition-colors disabled:opacity-40"
            >
              <p className="font-medium truncate">{p.name}</p>
              <p className="text-sm text-zinc-400 mt-1">
                R$ {Number(p.unitPrice).toFixed(2).replace(".", ",")}
              </p>
              <p className="text-xs text-zinc-500 mt-1">
                Estoque: {p.stockQuantitySnapshot}
              </p>
            </button>
          ))}
        </div>
      </div>

      {/* Coluna carrinho */}
      <div className="w-96 flex flex-col border-l border-zinc-800">
        <div className="p-4 border-b border-zinc-800">
          <h2 className="font-semibold">Venda atual</h2>
        </div>
        <div className="flex-1 overflow-y-auto p-4 space-y-2">
          {cart.length === 0 && (
            <p className="text-zinc-500 text-sm">Escaneie ou toque em um produto.</p>
          )}
          {cart.map((item) => (
            <div
              key={item.productId}
              className="flex justify-between items-center rounded-lg bg-zinc-900 px-3 py-2"
            >
              <div>
                <p className="text-sm font-medium">{item.name}</p>
                <p className="text-xs text-zinc-500">
                  {item.quantity} × R$ {item.unitPrice.toFixed(2).replace(".", ",")}
                </p>
              </div>
              <button
                onClick={() =>
                  setCart((prev) =>
                    prev
                      .map((i) =>
                        i.productId === item.productId
                          ? { ...i, quantity: i.quantity - 1 }
                          : i,
                      )
                      .filter((i) => i.quantity > 0),
                  )
                }
                className="text-zinc-500 hover:text-red-400"
              >
                −
              </button>
            </div>
          ))}
        </div>

        <div className="border-t border-zinc-800 p-4 space-y-3">
          <div className="flex justify-between text-2xl font-bold">
            <span>Total</span>
            <span>R$ {total.toFixed(2).replace(".", ",")}</span>
          </div>
          <input
            value={amountTendered}
            onChange={(e) => setAmountTendered(e.target.value)}
            placeholder="Valor recebido (dinheiro)"
            inputMode="decimal"
            className="w-full rounded-lg bg-zinc-900 border border-zinc-800 px-4 py-3 focus:border-indigo-500 outline-none"
          />
          {amountTendered && Number(amountTendered) >= total && (
            <p className="text-emerald-400 text-sm">
              Troco: R$ {(Number(amountTendered) - total).toFixed(2).replace(".", ",")}
            </p>
          )}
          <button
            onClick={handleFinishSale}
            disabled={cart.length === 0}
            className="w-full rounded-xl bg-indigo-600 py-4 font-semibold hover:bg-indigo-500
                       transition-colors disabled:opacity-40"
          >
            Finalizar venda {online ? "" : "(offline)"}
          </button>
          {lastSale && (
            <div className="rounded-lg bg-emerald-500/10 border border-emerald-500/30 p-3 text-sm">
              <p className="text-emerald-400 font-semibold">
                Venda registrada — R$ {lastSale.totalAmount.toFixed(2).replace(".", ",")}
              </p>
              <p className="text-zinc-400 text-xs mt-1">
                {online ? "Sincronizando…" : "Na fila de sincronização (ID " + lastSale.localId.slice(0, 8) + "…)"}
              </p>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
