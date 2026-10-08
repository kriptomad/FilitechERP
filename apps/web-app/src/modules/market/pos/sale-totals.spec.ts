// src/modules/market/pos/sale-totals.spec.ts — Cap. 8.3 (regras do PDV offline)
import { describe, it, expect } from "vitest";
import { computeSaleTotals, isValidSaleItem } from "./sale-totals";

describe("computeSaleTotals — PDV offline (Cap. 8.3)", () => {
  const items = [
    { productId: "p1", quantity: 2, unitPrice: 10.5 }, // 21.00
    { productId: "p2", quantity: 1, unitPrice: 4.9 }, // 4.90
  ];

  it("soma o total de todos os itens", () => {
    expect(computeSaleTotals(items, "PIX").totalAmount).toBeCloseTo(25.9);
  });

  it("calcula troco em dinheiro sem nunca ficar negativo", () => {
    const { changeDue } = computeSaleTotals(items, "CASH", 50);
    expect(changeDue).toBeCloseTo(24.1);
  });

  it("pagamento menos que o total não gera troco negativo", () => {
    const { changeDue } = computeSaleTotals(items, "CASH", 10);
    expect(changeDue).toBe(0);
  });

  it("cartão e pix nunca têm troco", () => {
    expect(computeSaleTotals(items, "CREDIT_CARD", 100).changeDue).toBe(0);
    expect(computeSaleTotals(items, "DEBIT_CARD", 100).changeDue).toBe(0);
    expect(computeSaleTotals(items, "PIX", 100).changeDue).toBe(0);
  });

  it("venda sem itens tem total zero", () => {
    expect(computeSaleTotals([], "CASH", 10)).toEqual({
      totalAmount: 0,
      changeDue: 10,
    });
  });
});

describe("isValidSaleItem — validação de entrada do operador", () => {
  it("aceita item válido", () => {
    expect(
      isValidSaleItem({ productId: "p1", quantity: 1, unitPrice: 9.9 }),
    ).toBe(true);
  });

  it("rejeita quantidade zero/negativa e preço negativo", () => {
    expect(
      isValidSaleItem({ productId: "p1", quantity: 0, unitPrice: 9.9 }),
    ).toBe(false);
    expect(
      isValidSaleItem({ productId: "p1", quantity: -1, unitPrice: 9.9 }),
    ).toBe(false);
    expect(
      isValidSaleItem({ productId: "p1", quantity: 1, unitPrice: -0.01 }),
    ).toBe(false);
    expect(
      isValidSaleItem({ productId: "", quantity: 1, unitPrice: 1 }),
    ).toBe(false);
  });
});
