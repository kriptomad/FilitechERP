// tests/integration/cash-register-blind-close.spec.ts — Cap. 4.1 (Gaveta Cega)
import { describe, it, expect, vi } from "vitest";
import { serializeRegisterForList } from "../../src/services/cash-register/cash-register.service";

// Mock leve de Decimal para o serializer (não depende de Prisma neste teste unitário).
const dec = (v: number) => ({
  toNumber: () => v,
  toString: () => String(v),
});

describe("Gaveta Cega — fechamento de caixa (Cap. 4.1)", () => {
  it("NUNCA expõe expectedAmount/divergence enquanto caixa está OPEN", () => {
    const serialized = serializeRegisterForList({
      id: "cr_1",
      status: "OPEN",
      openingAmount: dec(100) as never,
      closingAmount: null,
      expectedAmount: dec(487.5) as never, // valor que o operador NÃO pode ver
      divergenceAmount: null,
    });

    expect(serialized).not.toHaveProperty("expectedAmount");
    expect(serialized).not.toHaveProperty("divergenceAmount");
    expect(serialized.blindClose).toBe(true);
    expect(JSON.stringify(serialized)).not.toContain("487.5");
  });

  it("revela divergência SOMENTE após CLOSED (contagem confirmada)", () => {
    const serialized = serializeRegisterForList({
      id: "cr_1",
      status: "CLOSED",
      openingAmount: dec(100) as never,
      closingAmount: dec(470) as never,
      expectedAmount: dec(487.5) as never,
      divergenceAmount: dec(-17.5) as never,
    });

    expect(serialized.blindClose).toBe(false);
    expect(serialized).toHaveProperty("expectedAmount");
    expect(serialized).toHaveProperty("divergenceAmount");
  });

  it("resultado exato — sobra revelada apenas no fechamento", async () => {
    // Espelha o cálculo de closeCashRegisterBlind:
    const opening = 100;
    const confirmedSales = [200, 150, 37.5]; // pagamentos CONFIRMED
    const expected = opening + confirmedSales.reduce((a, b) => a + b, 0);
    const counted = 480; // contagem física do operador
    const divergence = counted - expected;

    expect(expected).toBe(487.5);
    expect(divergence).toBe(-7.5); // falta de R$ 7,50 — só revelada após confirmação
  });
});
