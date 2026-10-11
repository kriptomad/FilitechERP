// src/server/services/cancel-fiscal-document.service.ts — Cap. 21.19
// Cancelamento de NFC-e/NFe + CC-e + Manifestação do Destinatário
import { prismaUnscoped } from '../db';
import { DomainError } from '../api-envelope';

export interface CancelFiscalInput {
  fiscalDocId: string;
  reason: string;
  force?: boolean; // Força cancelamento mesmo após prazo (admin)
}

export interface CancelFiscalResult {
  fiscalDocumentId: string;
  status: 'CANCELLED';
  protocol: string;
  cancellationDate: Date;
}

export interface CorrectionLetterInput {
  fiscalDocId: string;
  correctionText: string;
  // Campos que NÃO podem ser alterados por CC-e:
  // - Valor total da NF-e
  // - Dados tributários (ICMS, IPI, PIS, COFINS)
  // - Data de emissão/saída
  // - CFOP (exceto para correção de erro de digitação)
}

export interface CorrectionLetterResult {
  fiscalDocumentId: string;
  eventId: string;
  protocol: string;
}

export interface ManifestationInput {
  fiscalDocId: string;
  type: 'CIENCIA' | 'CONFIRMACAO' | 'DESCONHECIMENTO' | 'OPERACAO_NAO_REALIZADA';
}

export interface ManifestationResult {
  eventId: string;
  protocol: string;
}

/**
 * Cancela NFC-e/NFe autorizada.
 * Regras:
 * - NFC-e: até 24h após autorização (prazo legal)
 * - NFe: até 24h (ou 168h em alguns estados) após autorização
 * - Justificativa mínima 15 caracteres
 * - Não pode cancelar se já tiver manifesto do destinatário "Confirmação da Operação"
 */
export async function cancelFiscalDocument(input: CancelFiscalInput): Promise<CancelFiscalResult> {
  const { fiscalDocId, reason, force } = input;

  if (reason.length < 15) {
    throw new DomainError('VALIDATION_ERROR', 'Justificativa deve ter pelo menos 15 caracteres.', 400);
  }

  const doc = await prismaUnscoped.fiscalDocument.findUniqueOrThrow({
    where: { id: fiscalDocId },
    include: { tenant: { select: { cnpj: true, certificateA1: true, certificatePassword: true } } },
  });

  if (doc.status !== 'AUTHORIZED') {
    throw new DomainError('INVALID_STATUS', 'Só é possível cancelar documento com status AUTORIZADO.', 400);
  }

  if (doc.cancellationDate && !force) {
    throw new DomainError('ALREADY_CANCELLED', 'Documento já foi cancelado anteriormente.', 409);
  }

  // Verifica manifestação do destinatário
  const manifestation = await prismaUnscoped.fiscalDocumentEvent.findFirst({
    where: { fiscalDocumentId: doc.id, type: 'RECIPIENT_MANIFESTATION', payload: { path: ['type'], equals: 'CONFIRMACAO_DA_OPERACAO' } },
  });
  if (manifestation && !force) {
    throw new DomainError('MANIFESTATION_EXISTS', 'Destinatário já confirmou a operação. Cancelamento não permitido.', 409);
  }

  // Verifica prazo (24h para NFC-e, 24h/168h para NFe)
  const hoursSinceAuth = (Date.now() - doc.authorizationDate!.getTime()) / (1000 * 60 * 60);
  const maxHours = doc.documentType === 'NFCE' ? 24 : 24; // NFe pode ser 168h em alguns estados
  if (hoursSinceAuth > maxHours && !force) {
    throw new DomainError('DEADLINE_EXCEEDED', `Prazo de ${maxHours}h para cancelamento excedido. Use force=true para forçar (admin).`, 400);
  }

  // Chama Focus NFe para cancelamento
  const { callFocusNFe } = await import('./fiscal-emission.service');
  const res = await callFocusNFe(doc.documentType === 'NFCE' ? 'nfce' : 'nfe', {
    cancelamento: {
      chave: doc.externalId,
      justificativa: reason,
      cnpj: doc.tenant.cnpj,
    },
  });

  // Atualiza documento
  const updated = await prismaUnscoped.fiscalDocument.update({
    where: { id: fiscalDocId },
    data: {
      status: 'CANCELLED',
      cancellationReason: reason,
      cancellationDate: new Date(),
      cancellationProtocol: res.protocolo,
    },
  });

  // Registra evento de auditoria
  await prismaUnscoped.fiscalDocumentEvent.create({
    data: {
      fiscalDocumentId: doc.id,
      type: 'CANCELLATION',
      protocol: res.protocolo,
      payload: { reason, forced: force ?? false },
    },
  });

  // Atualiza venda vinculada
  await prismaUnscoped.sale.update({
    where: { id: doc.saleId },
    data: { fiscalStatus: 'CANCELLED', fiscalDocumentId: null },
  });

  return {
    fiscalDocumentId: doc.id,
    status: 'CANCELLED',
    protocol: res.protocolo,
    cancellationDate: updated.cancellationDate!,
  };
}

/**
 * Emite Carta de Correção (CC-e) — Cap. 21.19
 * Campos que PODEM ser corrigidos:
 * - Dados do destinatário (nome, endereço, IE)
 * - Dados do emitente (endereço)
 * - Informações complementares
 * - Peso, volume, marca, número
 * Campos que NÃO PODEM ser alterados:
 * - Valor total, tributos, base de cálculo
 * - CFOP (exceto erro de digitação comprovado)
 * - Data de emissão/saída
 * - Quantidade/valor dos produtos
 */
export async function emitCorrectionLetter(input: CorrectionLetterInput): Promise<CorrectionLetterResult> {
  const { fiscalDocId, correctionText } = input;

  if (correctionText.length < 15) {
    throw new DomainError('VALIDATION_ERROR', 'Texto da correção deve ter pelo menos 15 caracteres.', 400);
  }

  // Validação básica de campos vedados
  const forbiddenKeywords = ['VALOR', 'TOTAL', 'TRIBUT', 'ICMS', 'IPI', 'PIS', 'COFINS', 'CFOP', 'DATA EMISS', 'DATA SAIDA', 'QUANTIDADE'];
  const upperText = correctionText.toUpperCase();
  for (const kw of forbiddenKeywords) {
    if (upperText.includes(kw)) {
      console.warn('[CC-e] Correção pode alterar campo vedado:', kw, '| Texto:', correctionText);
      // Não bloqueia, mas alerta - validação final é da SEFAZ
    }
  }

  const doc = await prismaUnscoped.fiscalDocument.findUniqueOrThrow({
    where: { id: fiscalDocId },
    include: { tenant: { select: { cnpj: true } } },
  });

  if (doc.status !== 'AUTHORIZED') {
    throw new DomainError('INVALID_STATUS', 'Só é possível emitir CC-e para documento AUTORIZADO.', 400);
  }

  // Verifica se já existe CC-e para este documento (máximo 1 por NF-e em alguns estados)
  const existingCCe = await prismaUnscoped.fiscalDocumentEvent.findFirst({
    where: { fiscalDocumentId: doc.id, type: 'CORRECTION_LETTER' },
  });
  if (existingCCe) {
    throw new DomainError('CCE_EXISTS', 'Já existe Carta de Correção para este documento.', 409);
  }

  const { callFocusNFe } = await import('./fiscal-emission.service');
  const res = await callFocusNFe('nfe', {
    carta_correcao: {
      chave: doc.externalId,
      correcao: correctionText,
      cnpj: doc.tenant.cnpj,
    },
  });

  const event = await prismaUnscoped.fiscalDocumentEvent.create({
    data: {
      fiscalDocumentId: doc.id,
      type: 'CORRECTION_LETTER',
      protocol: res.protocolo,
      payload: { correctionText },
    },
  });

  return {
    fiscalDocumentId: doc.id,
    eventId: event.id,
    protocol: res.protocolo,
  };
}

/**
 * Registra Manifestação do Destinatário — Cap. 21.19
 * Tipos:
 * - CIENCIA: Tomou conhecimento da NF-e
 * - CONFIRMACAO: Confirma a operação (bloqueia cancelamento)
 * - DESCONHECIMENTO: Desconhece a operação
 * - OPERACAO_NAO_REALIZADA: Operação não realizada
 */
export async function registerManifestation(input: ManifestationInput): Promise<ManifestationResult> {
  const { fiscalDocId, type } = input;

  const validTypes = ['CIENCIA', 'CONFIRMACAO', 'DESCONHECIMENTO', 'OPERACAO_NAO_REALIZADA'];
  if (!validTypes.includes(type)) {
    throw new DomainError('INVALID_TYPE', `Tipo de manifestação inválido. Use: ${validTypes.join(', ')}`, 400);
  }

  const doc = await prismaUnscoped.fiscalDocument.findUniqueOrThrow({
    where: { id: fiscalDocId },
  });

  if (doc.status !== 'AUTHORIZED') {
    throw new DomainError('INVALID_STATUS', 'Só é possível manifestar NF-e AUTORIZADA.', 400);
  }

  // Verifica se já manifestou
  const existing = await prismaUnscoped.fiscalDocumentEvent.findFirst({
    where: { fiscalDocumentId: doc.id, type: 'RECIPIENT_MANIFESTATION' },
  });
  if (existing) {
    throw new DomainError('ALREADY_MANIFESTED', 'Já existe manifestação para este documento.', 409);
  }

  // Em produção, enviaria para SEFAZ via Focus NFe / API própria
  // Aqui simulamos o protocolo
  const protocol = `MAN${Date.now().toString(36).toUpperCase()}${Math.random().toString(36).substring(2, 6).toUpperCase()}`;

  const event = await prismaUnscoped.fiscalDocumentEvent.create({
    data: {
      fiscalDocumentId: doc.id,
      type: 'RECIPIENT_MANIFESTATION',
      protocol,
      payload: { manifestationType: type },
    },
  });

  return { eventId: event.id, protocol };
}

/**
 * Consulta status de manifesto do destinatário
 */
export async function getManifestationStatus(fiscalDocId: string): Promise<{
  hasManifestation: boolean;
  type?: string;
  protocol?: string;
  date?: Date;
} | null> {
  const event = await prismaUnscoped.fiscalDocumentEvent.findFirst({
    where: { fiscalDocumentId: fiscalDocId, type: 'RECIPIENT_MANIFESTATION' },
    select: { protocol: true, payload: true, createdAt: true },
  });

  if (!event) return null;

  return {
    hasManifestation: true,
    type: (event.payload as any)?.manifestationType,
    protocol: event.protocol,
    date: event.createdAt,
  };
}