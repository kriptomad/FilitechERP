// src/services/scheduling/appointment.service.ts — Cap. 11.3 / 11.6 (agendamento)
import { PrismaClient } from "@prisma/client";

export class ProfessionalConflictError extends Error {}
export class PetNotRegisteredError extends Error {}

export class AppointmentService {
  constructor(private readonly prisma: PrismaClient) {}

  /**
   * Agenda serviço com bloqueio de conflito por profissional (Cap. 11.6):
   * `@@unique([tenantId, professionalId, scheduledAt])` garante no banco o
   * bloqueio de duplo agendamento — aqui devolvemos erro amigável.
   */
  async book(params: {
    tenantId: string;
    clientId: string;
    serviceId: string;
    professionalId: string;
    scheduledAt: Date;
    durationMinutes?: number;
    petId?: string;
    vehicleId?: string;
  }) {
    const service = await this.prisma.service.findFirst({
      where: { id: params.serviceId, tenantId: params.tenantId },
    });
    if (!service) throw new Error("SERVICE_NOT_FOUND");

    // Janela de conflito: mesmo profissional, horário sobreposto.
    const windowEnd = new Date(
      params.scheduledAt.getTime() +
        (params.durationMinutes ?? service.estimatedDurationMinutes) * 60_000,
    );
    const existing = await this.prisma.appointment.findFirst({
      where: {
        tenantId: params.tenantId,
        professionalId: params.professionalId,
        status: { notIn: ["CANCELLED", "NO_SHOW"] },
        scheduledAt: { lt: windowEnd },
        createdAt: { gt: new Date(0) },
      },
      include: { service: { select: { estimatedDurationMinutes: true } } },
    });

    if (existing) {
      const existingEnd = new Date(
        existing.scheduledAt.getTime() +
          existing.service.estimatedDurationMinutes * 60_000,
      );
      if (existingEnd > params.scheduledAt) {
        throw new ProfessionalConflictError(
          "Profissional já possui agendamento neste horário.",
        );
      }
    }

    try {
      return await this.prisma.appointment.create({
        data: {
          tenantId: params.tenantId,
          clientId: params.clientId,
          serviceId: params.serviceId,
          professionalId: params.professionalId,
          scheduledAt: params.scheduledAt,
          durationMinutes: params.durationMinutes ?? service.estimatedDurationMinutes,
          petId: params.petId,
          vehicleId: params.vehicleId,
          status: "SCHEDULED",
        },
      });
    } catch (err) {
      // Violação do @@unique composto — corrida entre duas reservas simultâneas.
      if ((err as { code?: string }).code === "P2002") {
        throw new ProfessionalConflictError(
          "Horário recém-ocupado por outra reserva.",
        );
      }
      throw err;
    }
  }

  /** Agenda por coluna (uma por profissional) — visão de salão/barbearia. */
  async dayBoard(tenantId: string, day: Date, professionalIds?: string[]) {
    const startOfDay = new Date(day);
    startOfDay.setHours(0, 0, 0, 0);
    const endOfDay = new Date(startOfDay.getTime() + 24 * 60 * 60 * 1000);

    return this.prisma.appointment.findMany({
      where: {
        tenantId,
        scheduledAt: { gte: startOfDay, lt: endOfDay },
        ...(professionalIds?.length
          ? { professionalId: { in: professionalIds } }
          : {}),
      },
      include: {
        client: { select: { id: true, name: true, phone: true } },
        service: { select: { name: true, basePrice: true, estimatedDurationMinutes: true } },
        pet: { select: { id: true, name: true } },
        vehicle: { select: { id: true, licensePlate: true, model: true } },
      },
      orderBy: { scheduledAt: "asc" },
    });
  }

  /** Débito de sessão de pacote pré-pago (Cap. 11.6/11.11). */
  async consumePackageSession(params: {
    tenantId: string;
    clientId: string;
    serviceId: string;
  }) {
    const pkg = await this.prisma.clientServicePackage.findFirst({
      where: {
        tenantId: params.tenantId,
        clientId: params.clientId,
        serviceId: params.serviceId,
        OR: [{ expiresAt: null }, { expiresAt: { gt: new Date() } }],
      },
      orderBy: { purchasedAt: "asc" },
    });

    if (!pkg) throw new Error("NO_ACTIVE_PACKAGE");
    if (pkg.sessionsUsed >= pkg.totalSessions) {
      throw new Error("PACKAGE_EXHAUSTED");
    }

    return this.prisma.clientServicePackage.update({
      where: { id: pkg.id },
      data: { sessionsUsed: { increment: 1 } },
    });
  }
}
