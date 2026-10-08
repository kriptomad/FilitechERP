// src/lib/circuit-breaker.ts — Cap. 10.2
type CircuitState = "CLOSED" | "OPEN" | "HALF_OPEN";

interface CircuitBreakerOptions {
  failureThreshold: number;
  openStateDurationMs: number;
  name: string;
}

export class CircuitOpenError extends Error {}

export class CircuitBreaker {
  private state: CircuitState = "CLOSED";
  private consecutiveFailures = 0;
  private openedAt: number | null = null;

  constructor(private readonly options: CircuitBreakerOptions) {}

  async execute<T>(operation: () => Promise<T>): Promise<T> {
    if (this.state === "OPEN") {
      const elapsed = Date.now() - (this.openedAt ?? 0);
      if (elapsed < this.options.openStateDurationMs) {
        throw new CircuitOpenError(
          `Circuito "${this.options.name}" está aberto — falhando rápido.`,
        );
      }
      this.state = "HALF_OPEN";
    }

    try {
      const result = await operation();
      this.onSuccess();
      return result;
    } catch (error) {
      this.onFailure();
      throw error;
    }
  }

  private onSuccess() {
    this.consecutiveFailures = 0;
    this.state = "CLOSED";
  }

  private onFailure() {
    this.consecutiveFailures += 1;
    if (
      this.state === "HALF_OPEN" ||
      this.consecutiveFailures >= this.options.failureThreshold
    ) {
      this.state = "OPEN";
      this.openedAt = Date.now();
    }
  }
}

export const sefazCircuitBreaker = new CircuitBreaker({
  name: "sefaz-nfce-authorization",
  failureThreshold: 5,
  openStateDurationMs: 30_000,
});

export const whatsappCircuitBreaker = new CircuitBreaker({
  name: "whatsapp-business-api",
  failureThreshold: 8,
  openStateDurationMs: 60_000,
});
