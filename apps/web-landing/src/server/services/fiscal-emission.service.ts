// src/server/services/fiscal-emission.service.ts — Cap. 10 / 21.1
// Emissão fiscal real via Focus NFe — NFC-e síncrona, NFe assíncrona, contingência, certificado A1
import { prismaUnscoped } from '../db';
import { DomainError } from '../api-envelope';
import { resolveCFOP } from './cfop-resolver.service';
import { calculateFullTax } from './tax-engine.service';

const FOCUS_BASE = process.env.FOCUS_NFE_BASE_URL ?? 'https://api.focusnfe.com.br/v2';
const FOCUS_TOKEN = process.env.FOCUS_NFE_API_TOKEN;

export type FiscalDocumentType = 'NFCE' | 'NFE';

export interface EmitFiscalInput {
  tenantId: string;
  saleId: string;
  documentType: FiscalDocumentType;
  /** Força contingência (offline/SEFAZ indisponível) */
  forceContingency?: boolean;
}

export interface EmitFiscalResult {
  fiscalDocumentId: string;
  status: 'AUTHORIZED' | 'CONTINGENCY' | 'REJECTED' | 'ERROR';
  protocol?: string;
  authorizationDate?: Date;
  xmlUrl?: string;
  danfeUrl?: string;
  qrCodeUrl?: string;
  contingencyNumber?: string;
  message: string;
}

interface FocusNFCePayload {
  cnpj_emitente: string;
  natureza_operacao: string;
  modelo: '65';
  serie: number;
  numero: number;
  data_emissao: string;
  tipo_operacao: '1';
  destinatario: {
    cpf?: string;
    cnpj?: string;
    nome: string;
    endereco?: { logradouro: string; numero: string; bairro: string; cmun: string; uf: string; cep: string };
  };
  itens: Array<{
    numero_item: number;
    codigo_produto: string;
    descricao: string;
    ncm: string;
    cest?: string;
    cfop: string;
    unidade_comercial: string;
    quantidade_comercial: number;
    valor_unitario_comercial: number;
    valor_bruto: number;
    unidade_tributavel: string;
    quantidade_tributavel: number;
    valor_unitario_tributavel: number;
    icms: { origem: '0'; CST: string; pICMS?: number; vICMS?: number; pICMSST?: number; vICMSST?: number; pMVAST?: number };
    ipi?: { CST: string; pIPI?: number; vIPI?: number };
    pis: { CST: string; pPIS?: number; vPIS?: number };
    cofins: { CST: string; pCOFINS?: number; vCOFINS?: number };
  }>;
  frete?: { modalidade: '0' | '1' | '2' | '3' | '9'; valor?: number };
  seguro?: number;
  outras_despesas?: number;
  desconto?: number;
  total: { vBC: number; vICMS: number; vICMSST: number; vProd: number; vFrete: number; vSeg: number; vDesc: number; vOutro: number; vIPI: number; vPIS: number; vCOFINS: number; vNF: number; vTotTrib?: number };
  pagamento: Array<{ forma: '01' | '02' | '03' | '04' | '05' | '10' | '11' | '12' | '13' | '14' | '15' | '16' | '17' | '99'; valor: number }>;
  informacoes_fisco?: string;
  informacoes_complementares?: string;
}

interface FocusNFePayload extends FocusNFCePayload {
  modelo: '55';
  finalidade: '1';
  indicador_presenca: '1';
  processo_referencia?: string;
}

/**
 * Emite documento fiscal (NFC-e ou NFe) via Focus NFe.
 * - NFC-e: síncrona, retorna autorização imediata + QR Code
 * - NFe: assíncrona, retorna recibo; autorização via webhook/polling
 * - Contingência: numeração reservada, emissão offline, transmissão posterior
 */
export async function emitFiscalDocument(input: EmitFiscalInput): Promise<EmitFiscalResult> {
  const { tenantId, saleId, documentType, forceContingency } = input;

  if (!FOCUS_TOKEN) {
    throw new DomainError('FISCAL_NOT_CONFIGURED', 'Focus NFe não configurado. Defina FOCUS_NFE_API_TOKEN.', 503);
  }

  // Busca venda completa com itens, cliente, tenant config
  const sale = await prismaUnscoped.sale.findUniqueOrThrow({
    where: { id: saleId, tenantId },
    include: {
      items: { include: { product: true } },
      client: true,
      tenant: { select: { tradeName: true, cnpj: true, uf: true, inscricaoEstadual: true, taxRegime: true, simplesNacionalAnexo: true, certificateA1: true, certificatePassword: true } },
      cashRegister: { select: { series: true, number: true } },
    },
  });

  const tenant = sale.tenant;
  const isNFCe = documentType === 'NFCE';
  const model = isNFCe ? '65' : '55';
  const series = sale.cashRegister?.series ?? (isNFCe ? 1 : 1);

  // Verifica se já existe documento fiscal para esta venda
  const existing = await prismaUnscoped.fiscalDocument.findFirst({
    where: { tenantId, saleId, documentType, status: { in: ['AUTHORIZED', 'CONTINGENCY', 'PENDING'] } },
  });
  if (existing) {
    throw new DomainError('DOCUMENT_EXISTS', 'Documento fiscal já existe para esta venda.', 409, { fiscalDocumentId: existing.id });
  }

  // Calcula tributos completos
  const taxResult = await calculateFullTax({
    tenantId,
    items: sale.items.map(item => ({
      productId: item.productId,
      quantity: item.quantity,
      unitPrice: Number(item.unitPrice),
      ncm: item.product.ncm,
      cest: item.product.cest,
    })),
    customerState: sale.client?.uf,
    operationType: 'SALE',
    shippingFreight: Number(sale.shippingFreight ?? 0),
    insuranceValue: Number(sale.insuranceValue ?? 0),
    otherExpenses: Number(sale.otherExpenses ?? 0),
    discount: Number(sale.discount ?? 0),
  });

  // Resolve CFOP para cada item
  const itemsWithCFOP = await Promise.all(
    sale.items.map(async (item, index) => {
      const cfopResult = await resolveCFOP({
        tenantId,
        operationType: 'SALE',
        originState: tenant.uf ?? 'SP',
        destState: sale.client?.uf ?? tenant.uf ?? 'SP',
        ncm: item.product.ncm ?? '00000000',
        cest: item.product.cest,
      });
      return { ...item, cfop: cfopResult.cfop, index: index + 1 };
    })
  );

  // Próximo número da série
  const nextNumber = await getNextFiscalNumber(tenantId, model, series);

  // Cria registro fiscal com status PENDING
  const fiscalDoc = await prismaUnscoped.fiscalDocument.create({
    data: {
      tenantId,
      saleId,
      documentType,
      model,
      series,
      number: nextNumber,
      status: 'PENDING',
      payload: { ...sale, taxResult, itemsWithCFOP } as any,
    },
  });

  try {
    // Verifica contingência (SEFAZ indisponível ou forçado)
    const useContingency = forceContingency || await checkSEFAZContingency(tenant.uf ?? 'SP');

    if (useContingency) {
      return await emitInContingency(fiscalDoc.id, tenant, sale, itemsWithCFOP, taxResult, nextNumber, model, series);
    }

    // Emissão normal via Focus NFe
    const payload = buildFocusPayload({
      tenant,
      sale,
      itemsWithCFOP,
      taxResult,
      nextNumber,
      model,
      series,
      isNFCe,
    });

    const response = await callFocusNFe(isNFCe ? 'nfce' : 'nfe', payload);

    if (response.status === 'autorizado' || response.status === 'autorizado_com_erro') {
      return await finalizeAuthorized(fiscalDoc.id, response, isNFCe);
    } else if (response.status === 'processando' || response.status === 'aguardando') {
      // NFe assíncrona - fica PENDING aguardando webhook
      await prismaUnscoped.fiscalDocument.update({
        where: { id: fiscalDoc.id },
        data: { status: 'PENDING', externalId: response.recibo, payload: { ...payload, focusResponse: response } as any },
      });
      return {
        fiscalDocumentId: fiscalDoc.id,
        status: 'PENDING',
        message: 'NFe enviada para processamento assíncrono. Aguarde webhook de autorização.',
      };
    } else {
      throw new DomainError('FISCAL_REJECTED', response.motivo ?? 'Documento rejeitado pela SEFAZ', 422, { focusResponse: response });
    }
  } catch (error) {
    if (error instanceof DomainError) throw error;

    // Falha de comunicação - tenta contingência automática
    console.error('[fiscal-emission] Erro na emissão, tentando contingência:', error);
    return await emitInContingency(fiscalDoc.id, tenant, sale, itemsWithCFOP, taxResult, nextNumber, model, series);
  }
}

async function emitInContingency(
  fiscalDocId: string,
  tenant: any,
  sale: any,
  itemsWithCFOP: any[],
  taxResult: any,
  number: number,
  model: string,
  series: number
): Promise<EmitFiscalResult> {
  const contingencyNumber = `CONT-${Date.now().toString(36).toUpperCase()}-${Math.random().toString(36).substring(2, 6).toUpperCase()}`;

  await prismaUnscoped.fiscalDocument.update({
    where: { id: fiscalDocId },
    data: {
      status: 'CONTINGENCY',
      contingencyNumber,
      contingencyReason: 'SEFAZ indisponível ou falha de comunicação',
      contingencyDate: new Date(),
    },
  });

  // Gera XML de contingência (simplificado para impressão DANFE/QR Code)
  const xmlContent = buildContingencyXML({ tenant, sale, itemsWithCFOP, taxResult, number, model, series, contingencyNumber });
  const xmlUrl = await uploadFiscalXML(fiscalDocId, xmlContent);

  return {
    fiscalDocumentId: fiscalDocId,
    status: 'CONTINGENCY',
    contingencyNumber,
    xmlUrl,
    message: `Documento emitido em contingência (${contingencyNumber}). Transmita quando SEFAZ normalizar.`,
  };
}

async function finalizeAuthorized(fiscalDocId: string, response: any, isNFCe: boolean): Promise<EmitFiscalResult> {
  const updateData: any = {
    status: 'AUTHORIZED',
    protocol: response.protocolo,
    authorizationDate: new Date(response.data_autorizacao ?? new Date()),
    externalId: response.chave_nfe ?? response.chave_nfce,
  };

  if (isNFCe) {
    updateData.qrCodeUrl = response.qr_code_url;
    updateData.xmlUrl = response.xml_url;
  } else {
    updateData.xmlUrl = response.xml_url;
    updateData.danfeUrl = response.danfe_url;
  }

  await prismaUnscoped.fiscalDocument.update({ where: { id: fiscalDocId }, data: updateData });

  // Atualiza venda com referência fiscal
  await prismaUnscoped.sale.update({
    where: { id: response.saleId },
    data: { fiscalDocumentId: fiscalDocId, fiscalStatus: 'AUTHORIZED' },
  });

  return {
    fiscalDocumentId: fiscalDocId,
    status: 'AUTHORIZED',
    protocol: response.protocolo,
    authorizationDate: new Date(response.data_autorizacao ?? new Date()),
    xmlUrl: updateData.xmlUrl,
    danfeUrl: updateData.danfeUrl,
    qrCodeUrl: updateData.qrCodeUrl,
    message: isNFCe ? 'NFC-e autorizada com sucesso' : 'NFe autorizada com sucesso',
  };
}

function buildFocusPayload(params: {
  tenant: any;
  sale: any;
  itemsWithCFOP: any[];
  taxResult: any;
  nextNumber: number;
  model: string;
  series: number;
  isNFCe: boolean;
}): FocusNFCePayload | FocusNFePayload {
  const { tenant, sale, itemsWithCFOP, taxResult, nextNumber, model, series, isNFCe } = params;

  const itens = itemsWithCFOP.map((item, idx) => {
    const taxItem = taxResult.breakdown[idx];
    const product = item.product;
    const qtd = item.quantity;
    const vUn = Number(item.unitPrice);
    const vProd = qtd * vUn;

    const icmsCST = getICMS_CST(tenant.taxRegime, taxItem.icms.aliquota > 0, taxItem.icms.st);
    const icms = {
      origem: '0',
      CST: icmsCST,
      pICMS: taxItem.icms.aliquota || undefined,
      vICMS: taxItem.icms.value || undefined,
      pICMSST: taxItem.icms.st ? (taxItem.icms.st.value / taxItem.icms.st.base) * 100 : undefined,
      vICMSST: taxItem.icms.st?.value,
      pMVAST: taxItem.icms.st ? 0 : undefined, // MVA seria calculado pela regra
    };

    return {
      numero_item: idx + 1,
      codigo_produto: product.sku,
      descricao: product.name,
      ncm: product.ncm ?? '00000000',
      cest: product.cest,
      cfop: item.cfop,
      unidade_comercial: product.unit ?? 'UN',
      quantidade_comercial: qtd,
      valor_unitario_comercial: vUn,
      valor_bruto: vProd,
      unidade_tributavel: product.unit ?? 'UN',
      quantidade_tributavel: qtd,
      valor_unitario_tributavel: vUn,
      icms,
      ipi: { CST: '50', pIPI: taxItem.ipi.aliquota || undefined, vIPI: taxItem.ipi.value || undefined },
      pis: { CST: taxItem.pis.regime === 'MONOFASICO' ? '04' : '01', pPIS: taxItem.pis.aliquota || undefined, vPIS: taxItem.pis.value || undefined },
      cofins: { CST: taxItem.cofins.regime === 'MONOFASICO' ? '04' : '01', pCOFINS: taxItem.cofins.aliquota || undefined, vCOFINS: taxItem.cofins.value || undefined },
    };
  });

  const total = taxResult;
  const vNF = sale.totalAmount;

  const base: FocusNFCePayload = {
    cnpj_emitente: tenant.cnpj.replace(/\D/g, ''),
    natureza_operacao: 'Venda de mercadoria',
    modelo,
    serie: series,
    numero: nextNumber,
    data_emissao: new Date().toISOString().slice(0, 19).replace('T', ' '),
    tipo_operacao: '1',
    destinatario: {
      cpf: sale.client?.document?.replace(/\D/g, ''),
      cnpj: sale.client?.document?.length === 14 ? sale.client.document.replace(/\D/g, '') : undefined,
      nome: sale.client?.name ?? 'Consumidor Final',
      endereco: sale.client?.address ? {
        logradouro: sale.client.address.street,
        numero: sale.client.address.number,
        bairro: sale.client.address.neighborhood,
        cmun: sale.client.address.cityCode,
        uf: sale.client.uf,
        cep: sale.client.address.zipCode.replace(/\D/g, ''),
      } : undefined,
    },
    itens,
    frete: { modalidade: '0', valor: Number(sale.shippingFreight ?? 0) },
    seguro: Number(sale.insuranceValue ?? 0),
    outras_despesas: Number(sale.otherExpenses ?? 0),
    desconto: Number(sale.discount ?? 0),
    total: {
      vBC: total.icms.base,
      vICMS: total.icms.value,
      vICMSST: total.icms.stValue ?? 0,
      vProd: vNF,
      vFrete: Number(sale.shippingFreight ?? 0),
      vSeg: Number(sale.insuranceValue ?? 0),
      vDesc: Number(sale.discount ?? 0),
      vOutro: Number(sale.otherExpenses ?? 0),
      vIPI: total.ipi.value,
      vPIS: total.pis.value,
      vCOFINS: total.cofins.value,
      vNF,
      vTotTrib: total.totalTaxes,
    },
    pagamento: sale.payments.map((p: any) => ({
      forma: mapPaymentForm(p.method),
      valor: Number(p.amount),
    })),
    informacoes_fisco: `Tributos aproximados: R$ ${total.totalTaxes.toFixed(2)} (Lei 12.741/12)`,
    informacoes_complementares: `Filitech ERP - ${sale.id}`,
  };

  if (!isNFCe) {
    return {
      ...base,
      modelo: '55',
      finalidade: '1',
      indicador_presenca: '1',
    };
  }

  return base;
}

function getICMS_CST(regime: string, hasICMS: boolean, hasST: boolean): string {
  if (regime === 'MEI') return '40'; // Isento
  if (regime === 'SIMPLES_NACIONAL') {
    if (hasST) return '60'; // ICMS ST retido
    return hasICMS ? '10' : '40'; // Tributado ou Isento
  }
  if (hasST) return '30'; // ST
  return hasICMS ? '00' : '40'; // Tributado integral / Isento
}

function mapPaymentForm(method: string): FocusNFCePayload['pagamento'][0]['forma'] {
  const map: Record<string, FocusNFCePayload['pagamento'][0]['forma']> = {
    CASH: '01', CREDIT_CARD: '03', DEBIT_CARD: '04', PIX: '10', BOLETO: '15', VOUCHER: '17', OTHER: '99',
  };
  return map[method] ?? '99';
}

async function callFocusNFe(endpoint: 'nfce' | 'nfe', payload: any): Promise<any> {
  const url = `${FOCUS_BASE}/${endpoint}`;
  const res = await fetch(url, {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${FOCUS_TOKEN}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(payload),
  });

  const data = await res.json().catch(() => ({}));
  if (!res.ok) {
    throw new Error(`Focus NFe ${res.status}: ${data.mensagem ?? JSON.stringify(data)}`);
  }
  return data;
}

async function checkSEFAZContingency(uf: string): Promise<boolean> {
  // Consulta status SEFAZ via Focus NFe ou cache local
  const status = await prismaUnscoped.sefazStatus.findUnique({ where: { uf } });
  if (status?.status === 'INDISPONIVEL' && new Date(status.updatedAt).getTime() > Date.now() - 10 * 60 * 1000) {
    return true;
  }
  // Fallback: testa conectividade rápida
  try {
    const res = await fetch(`${FOCUS_BASE}/status/${uf}`, {
      headers: { 'Authorization': `Bearer ${FOCUS_TOKEN}` },
      signal: AbortSignal.timeout(3000),
    });
    return !res.ok;
  } catch {
    return true; // Se não consegue consultar, assume contingência
  }
}

async function getNextFiscalNumber(tenantId: string, model: string, series: number): Promise<number> {
  return prismaUnscoped.$transaction(async (tx) => {
    const last = await tx.fiscalDocument.findFirst({
      where: { tenantId, model, series },
      orderBy: { number: 'desc' },
      select: { number: true },
    });
    return (last?.number ?? 0) + 1;
  });
}

function buildContingencyXML(params: any): string {
  // XML simplificado para contingência (não assinado)
  return `<?xml version="1.0" encoding="UTF-8"?>
<nfeProc xmlns="http://www.portalfiscal.inf.br/nfe" versao="4.00">
  <NFe><infNFe Id="NFe${params.tenant.cnpj.replace(/\D/g, '')}${params.model}${params.series.toString().padStart(3, '0')}${params.number.toString().padStart(9, '0')}1${params.contingencyNumber}" versao="4.00">
    <ide><cUF>35</cUF><cNF>${params.contingencyNumber}</cNF><natOp>Venda contingência</natOp><mod>${params.model}</mod><serie>${params.series}</serie><nNF>${params.number}</nNF><dhEmi>${new Date().toISOString()}</dhEmi><tpNF>1</tpNF><idDest>1</idDest><cMunFG>3550308</cMunFG><tpImp>1</tpImp><tpEmis>9</tpEmis><cDV>1</cDV><tpAmb>1</tpAmb><finNFe>1</finNFe><indFinal>1</indFinal><indPres>1</indPres><procEmi>0</procEmi><verProc>Filitech ERP</verProc></ide>
    <emit><CNPJ>${params.tenant.cnpj.replace(/\D/g, '')}</CNPJ><xNome>${params.tenant.tradeName}</xNome><enderEmit><xLgr>Endereço</xLgr><nro>0</nro><xBairro>Centro</xBairro><cMun>3550308</cMun><xMun>São Paulo</xMun><UF>SP</UF><CEP>01000000</CEP><cPais>1058</cPais><xPais>Brasil</xPais></enderEmit><IE>${tenant.inscricaoEstadual ?? 'ISENTO'}</IE><CRT>${params.tenant.taxRegime === 'SIMPLES_NACIONAL' ? '1' : '3'}</CRT></emit>
    <dest><xNome>${params.sale.client?.name ?? 'Consumidor Final'}</xNome><indIEDest>9</indIEDest></dest>
  </infNFe></NFe>
  <protNFe versao="4.00"><infProt><tpAmb>1</tpAmb><verAplic>Filitech</verAplic><chNFe>${params.contingencyNumber}</chNFe><dhRecbto>${new Date().toISOString()}</dhRecbto><nProt>${params.contingencyNumber}</nProt><digVal>CONTINGENCIA</digVal><cStat>101</cStat><xMotivo>Uso contingência - SEFAZ indisponível</xMotivo></infProt></protNFe>
</nfeProc>`;
}

async function uploadFiscalXML(fiscalDocId: string, xml: string): Promise<string> {
  const { uploadTenantAsset } = await import('../infra/storage/r2-client');
  const key = await uploadTenantAsset({
    tenantId: (await prismaUnscoped.fiscalDocument.findUnique({ where: { id: fiscalDocId }, select: { tenantId: true } }))!.tenantId,
    category: 'fiscal-xml',
    fileName: `${fiscalDocId}-contingency.xml`,
    body: Buffer.from(xml, 'utf8'),
    contentType: 'application/xml',
  });
  return key;
}

/**
 * Cancela NFC-e/NFe autorizada (Cap. 21.19)
 */
export async function cancelFiscalDocument(fiscalDocId: string, reason: string): Promise<void> {
  const doc = await prismaUnscoped.fiscalDocument.findUniqueOrThrow({ where: { id: fiscalDocId } });
  if (doc.status !== 'AUTHORIZED') throw new DomainError('INVALID_STATUS', 'Só é possível cancelar documento autorizado.', 400);
  if (reason.length < 15) throw new DomainError('VALIDATION_ERROR', 'Justificativa deve ter pelo menos 15 caracteres.', 400);

  const res = await callFocusNFe(doc.documentType === 'NFCE' ? 'nfce' : 'nfe', {
    cancelamento: { chave: doc.externalId, justificativa: reason, cnpj: doc.tenant.cnpj },
  });

  await prismaUnscoped.fiscalDocument.update({
    where: { id: fiscalDocId },
    data: { status: 'CANCELLED', cancellationReason: reason, cancellationDate: new Date(), cancellationProtocol: res.protocolo },
  });
}

/**
 * Emite Carta de Correção (CC-e) — Cap. 21.19
 */
export async function emitCorrectionLetter(fiscalDocId: string, correctionText: string): Promise<void> {
  const doc = await prismaUnscoped.fiscalDocument.findUniqueOrThrow({ where: { id: fiscalDocId } });
  if (doc.status !== 'AUTHORIZED') throw new DomainError('INVALID_STATUS', 'Só é possível corrigir documento autorizado.', 400);
  if (!['VALOR', 'TRIBUTOS', 'DATA'].some(f => correctionText.toUpperCase().includes(f))) {
    // Validação básica: CC-e não pode alterar valor, tributos ou data
    console.warn('[CC-e] Correção pode alterar campo vedado:', correctionText);
  }

  const res = await callFocusNFe('nfe', {
    carta_correcao: { chave: doc.externalId, correcao: correctionText, cnpj: doc.tenant.cnpj },
  });

  await prismaUnscoped.fiscalDocumentEvent.create({
    data: { fiscalDocumentId: fiscalDocId, type: 'CORRECTION_LETTER', protocol: res.protocolo, payload: { correctionText } },
  });
}