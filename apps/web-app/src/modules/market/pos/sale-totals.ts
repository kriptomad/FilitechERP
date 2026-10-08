// src/modules/market/pos/sale-totals.ts — Cap. 8.3 (cálculos puros do PDV)
// Separado de close-sale-offline.ts para ser testável sem IndexedDB/navigator.

export interface SaleItemInput {
  productId: string;
  quantity: number;
  unitPrice: number;
}

export type OfflinePaymentMethod =
  | "CASH"
  | "DEBIT_CARD"
  | "CREDIT_CARD"
  | "PIX";

/**
 * Total da venda e troco. Regras do Cap. 8.3:
 * - troco só existe em dinheiro (CASH) e nunca é negativo
 *   (se o cliente entregou menos, o PDV valida antes — aqui não expõe saldo negativo);
 * - cartão/pix não têm troco (changeDue = 0).
 */
export function computeSaleTotals(
  items: SaleItemInput[],
  paymentMethod: OfflinePaymentMethod,
  amountTendered?: number,
): { totalAmount: number; changeDue: number } {
  const totalAmount = items.reduce(
    (sum, item) => sum + item.quantity * item.unitPrice,
    0,
  );

  const changeDue =
    paymentMethod === "CASH" && amountTendered
      ? Math.max(0, amountTendered - totalAmount)
      : 0;

  return { totalAmount, changeDue };
}

/** Item é válido se quantidade > 0 e preço >= 0 (entrada do operador). */
export function isValidSaleItem(item: SaleItemInput): boolean {
  return item.quantity > 0 && item.unitPrice >= 0 && !!item.productId;
}
