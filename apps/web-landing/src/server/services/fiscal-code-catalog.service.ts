// src/server/services/fiscal-code-catalog.service.ts — Cap. 21.1
// Catálogo de códigos fiscais versionado — NCM, NBS, CEST, CFOP, CNAE, CST/CSOSN
import { prismaUnscoped } from '../db';
import { DomainError } from '../api-envelope';

export interface NCMCode {
  code: string;
  description: string;
  aliquotaNacional: number;
  aliquotaImportacao: number;
  cest?: string;
  unidade: string;
  excecao?: string;
  vigenciaInicio: Date;
  vigenciaFim?: Date;
  version: string;
}

export interface NBSCode {
  code: string;
  description: string;
  aliquotaIss: number;
  cnaeReferencia: string;
  vigenciaInicio: Date;
  vigenciaFim?: Date;
  version: string;
}

export interface CESTCode {
  code: string;
  description: string;
  ncm: string;
  segmento: string;
  vigenciaInicio: Date;
  vigenciaFim?: Date;
  version: string;
}

export interface CFOPCode {
  code: string;
  description: string;
  tipoOperacao: 'ENTRADA' | 'SAIDA' | 'AMBAS';
  tipo: 'ESTADUAL' | 'INTERESTADUAL' | 'EXTERIOR' | 'AMBAS';
  permiteCredito: boolean;
  vigenciaInicio: Date;
  vigenciaFim?: Date;
  version: string;
}

export interface CNAECode {
  code: string;
  description: string;
  anexoSimples: 'I' | 'II' | 'III' | 'IV' | 'V';
  fatorR: number;
  aliquotaIss: number;
  vigenciaInicio: Date;
  vigenciaFim?: Date;
  version: string;
}

export interface CSTCSOSNCode {
  code: string;
  regime: 'SIMPLES_NACIONAL' | 'NORMAL';
  description: string;
  icms: { tipo: 'TRIBUTADO' | 'ISENTO' | 'NAO_INCIDE' | 'ST' | 'ISENTO_ST' | 'OUTROS'; aliquota?: number };
  pisCofins: { regime: 'MONOFASICO' | 'NAO_CUMULATIVO' | 'CUMULATIVO' | 'ISENTO' };
  vigenciaInicio: Date;
  vigenciaFim?: Date;
  version: string;
}

export interface CatalogImportResult {
  ncm: { imported: number; updated: number; errors: number };
  nbs: { imported: number; updated: number; errors: number };
  cest: { imported: number; updated: number; errors: number };
  cfop: { imported: number; updated: number; errors: number };
  cnae: { imported: number; updated: number; errors: number };
  cstCsosn: { imported: number; updated: number; errors: number };
  version: string;
  importedAt: Date;
}

/**
 * Importa catálogo de códigos fiscais de arquivos oficiais (CSV/JSON/XLSX).
 * Versão: cada importação cria nova versão, mantendo histórico para auditoria.
 */
export async function importFiscalCodeCatalog(
  files: {
    ncm?: Buffer;
    nbs?: Buffer;
    cest?: Buffer;
    cfop?: Buffer;
    cnae?: Buffer;
    cstCsosn?: Buffer;
  },
  version?: string
): Promise<CatalogImportResult> {
  const importVersion = version ?? `v${new Date().toISOString().slice(0, 10).replace(/-/g, '')}`;
  const importedAt = new Date();

  const results = {
    ncm: { imported: 0, updated: 0, errors: 0 },
    nbs: { imported: 0, updated: 0, errors: 0 },
    cest: { imported: 0, updated: 0, errors: 0 },
    cfop: { imported: 0, updated: 0, errors: 0 },
    cnae: { imported: 0, updated: 0, errors: 0 },
    cstCsosn: { imported: 0, updated: 0, errors: 0 },
    version: importVersion,
    importedAt,
  };

  // Processa cada arquivo
  if (files.ncm) {
    const ncmResult = await importNCM(files.ncm, importVersion);
    results.ncm = ncmResult;
  }

  if (files.nbs) {
    const nbsResult = await importNBS(files.nbs, importVersion);
    results.nbs = nbsResult;
  }

  if (files.cest) {
    const cestResult = await importCEST(files.cest, importVersion);
    results.cest = cestResult;
  }

  if (files.cfop) {
    const cfopResult = await importCFOP(files.cfop, importVersion);
    results.cfop = cfopResult;
  }

  if (files.cnae) {
    const cnaeResult = await importCNAE(files.cnae, importVersion);
    results.cnae = cnaeResult;
  }

  if (files.cstCsosn) {
    const cstResult = await importCSTCSOSN(files.cstCsosn, importVersion);
    results.cstCsosn = cstResult;
  }

  // Registra versão importada
  await prismaUnscoped.fiscalCodeCatalogImport.create({
    data: {
      version: importVersion,
      importedAt,
      results: results as any,
      fileSizes: {
        ncm: files.ncm?.length ?? 0,
        nbs: files.nbs?.length ?? 0,
        cest: files.cest?.length ?? 0,
        cfop: files.cfop?.length ?? 0,
        cnae: files.cnae?.length ?? 0,
        cstCsosn: files.cstCsosn?.length ?? 0,
      },
    },
  });

  return results;
}

async function importNCM(buffer: Buffer, version: string): Promise<{ imported: number; updated: number; errors: number }> {
  const lines = parseCSV(buffer);
  let imported = 0, updated = 0, errors = 0;

  for (const line of lines) {
    try {
      const [code, description, aliquotaNacional, aliquotaImportacao, cest, unidade, excecao, vigenciaInicio, vigenciaFim] = line;
      if (!code || code.length !== 8) { errors++; continue; }

      await prismaUnscoped.ncmCode.upsert({
        where: { code_version: { code, version } },
        create: {
          code,
          description,
          aliquotaNacional: parseFloat(aliquotaNacional) || 0,
          aliquotaImportacao: parseFloat(aliquotaImportacao) || 0,
          cest: cest || null,
          unidade: unidade || 'UN',
          excecao: excecao || null,
          vigenciaInicio: new Date(vigenciaInicio),
          vigenciaFim: vigenciaFim ? new Date(vigenciaFim) : null,
          version,
        },
        update: {
          description,
          aliquotaNacional: parseFloat(aliquotaNacional) || 0,
          aliquotaImportacao: parseFloat(aliquotaImportacao) || 0,
          cest: cest || null,
          unidade: unidade || 'UN',
          excecao: excecao || null,
          vigenciaInicio: new Date(vigenciaInicio),
          vigenciaFim: vigenciaFim ? new Date(vigenciaFim) : null,
        },
      });
      imported++;
    } catch {
      errors++;
    }
  }
  return { imported, updated, errors };
}

async function importNBS(buffer: Buffer, version: string): Promise<{ imported: number; updated: number; errors: number }> {
  const lines = parseCSV(buffer);
  let imported = 0, updated = 0, errors = 0;

  for (const line of lines) {
    try {
      const [code, description, aliquotaIss, cnaeReferencia, vigenciaInicio, vigenciaFim] = line;
      if (!code) { errors++; continue; }

      await prismaUnscoped.nbsCode.upsert({
        where: { code_version: { code, version } },
        create: {
          code,
          description,
          aliquotaIss: parseFloat(aliquotaIss) || 0,
          cnaeReferencia,
          vigenciaInicio: new Date(vigenciaInicio),
          vigenciaFim: vigenciaFim ? new Date(vigenciaFim) : null,
          version,
        },
        update: {
          description,
          aliquotaIss: parseFloat(aliquotaIss) || 0,
          cnaeReferencia,
          vigenciaInicio: new Date(vigenciaInicio),
          vigenciaFim: vigenciaFim ? new Date(vigenciaFim) : null,
        },
      });
      imported++;
    } catch {
      errors++;
    }
  }
  return { imported, updated, errors };
}

async function importCEST(buffer: Buffer, version: string): Promise<{ imported: number; updated: number; errors: number }> {
  const lines = parseCSV(buffer);
  let imported = 0, updated = 0, errors = 0;

  for (const line of lines) {
    try {
      const [code, description, ncm, segmento, vigenciaInicio, vigenciaFim] = line;
      if (!code || code.length !== 7) { errors++; continue; }

      await prismaUnscoped.cestCode.upsert({
        where: { code_version: { code, version } },
        create: {
          code,
          description,
          ncm,
          segmento,
          vigenciaInicio: new Date(vigenciaInicio),
          vigenciaFim: vigenciaFim ? new Date(vigenciaFim) : null,
          version,
        },
        update: {
          description,
          ncm,
          segmento,
          vigenciaInicio: new Date(vigenciaInicio),
          vigenciaFim: vigenciaFim ? new Date(vigenciaFim) : null,
        },
      });
      imported++;
    } catch {
      errors++;
    }
  }
  return { imported, updated, errors };
}

async function importCFOP(buffer: Buffer, version: string): Promise<{ imported: number; updated: number; errors: number }> {
  const lines = parseCSV(buffer);
  let imported = 0, updated = 0, errors = 0;

  for (const line of lines) {
    try {
      const [code, description, tipoOperacao, tipo, permiteCredito, vigenciaInicio, vigenciaFim] = line;
      if (!code || code.length < 4) { errors++; continue; }

      await prismaUnscoped.cfopCode.upsert({
        where: { code_version: { code, version } },
        create: {
          code,
          description,
          tipoOperacao: tipoOperacao as any,
          tipo: tipo as any,
          permiteCredito: permiteCredito === 'true' || permiteCredito === '1',
          vigenciaInicio: new Date(vigenciaInicio),
          vigenciaFim: vigenciaFim ? new Date(vigenciaFim) : null,
          version,
        },
        update: {
          description,
          tipoOperacao: tipoOperacao as any,
          tipo: tipo as any,
          permiteCredito: permiteCredito === 'true' || permiteCredito === '1',
          vigenciaInicio: new Date(vigenciaInicio),
          vigenciaFim: vigenciaFim ? new Date(vigenciaFim) : null,
        },
      });
      imported++;
    } catch {
      errors++;
    }
  }
  return { imported, updated, errors };
}

async function importCNAE(buffer: Buffer, version: string): Promise<{ imported: number; updated: number; errors: number }> {
  const lines = parseCSV(buffer);
  let imported = 0, updated = 0, errors = 0;

  for (const line of lines) {
    try {
      const [code, description, anexoSimples, fatorR, aliquotaIss, vigenciaInicio, vigenciaFim] = line;
      if (!code || code.length !== 7) { errors++; continue; }

      await prismaUnscoped.cnaeCode.upsert({
        where: { code_version: { code, version } },
        create: {
          code,
          description,
          anexoSimples: anexoSimples as any,
          fatorR: parseFloat(fatorR) || 0,
          aliquotaIss: parseFloat(aliquotaIss) || 0,
          vigenciaInicio: new Date(vigenciaInicio),
          vigenciaFim: vigenciaFim ? new Date(vigenciaFim) : null,
          version,
        },
        update: {
          description,
          anexoSimples: anexoSimples as any,
          fatorR: parseFloat(fatorR) || 0,
          aliquotaIss: parseFloat(aliquotaIss) || 0,
          vigenciaInicio: new Date(vigenciaInicio),
          vigenciaFim: vigenciaFim ? new Date(vigenciaFim) : null,
        },
      });
      imported++;
    } catch {
      errors++;
    }
  }
  return { imported, updated, errors };
}

async function importCSTCSOSN(buffer: Buffer, version: string): Promise<{ imported: number; updated: number; errors: number }> {
  const lines = parseCSV(buffer);
  let imported = 0, updated = 0, errors = 0;

  for (const line of lines) {
    try {
      const [code, regime, description, icmsTipo, icmsAliquota, pisCofinsRegime, vigenciaInicio, vigenciaFim] = line;
      if (!code || (code.length !== 2 && code.length !== 3)) { errors++; continue; }

      await prismaUnscoped.cstCsosnCode.upsert({
        where: { code_version: { code, version } },
        create: {
          code,
          regime: regime as any,
          description,
          icmsTipo: icmsTipo as any,
          icmsAliquota: parseFloat(icmsAliquota) || undefined,
          pisCofinsRegime: pisCofinsRegime as any,
          vigenciaInicio: new Date(vigenciaInicio),
          vigenciaFim: vigenciaFim ? new Date(vigenciaFim) : null,
          version,
        },
        update: {
          description,
          regime: regime as any,
          icmsTipo: icmsTipo as any,
          icmsAliquota: parseFloat(icmsAliquota) || undefined,
          pisCofinsRegime: pisCofinsRegime as any,
          vigenciaInicio: new Date(vigenciaInicio),
          vigenciaFim: vigenciaFim ? new Date(vigenciaFim) : null,
        },
      });
      imported++;
    } catch {
      errors++;
    }
  }
  return { imported, updated, errors };
}

function parseCSV(buffer: Buffer): string[][] {
  const content = buffer.toString('utf-8');
  const lines = content.split('\n').filter(l => l.trim() && !l.startsWith('#'));
  return lines.map(line => {
    // CSV simples - em produção usar lib robusta (ex: csv-parse)
    return line.split(',').map(f => f.trim().replace(/^"|"$/g, ''));
  });
}

/**
 * Busca código vigente na data especificada
 */
export async function getNCMAtDate(code: string, date: Date = new Date()): Promise<NCMCode | null> {
  return prismaUnscoped.ncmCode.findFirst({
    where: { code, vigenciaInicio: { lte: date }, OR: [{ vigenciaFim: null }, { vigenciaFim: { gte: date } }] },
    orderBy: { vigenciaInicio: 'desc' },
  });
}

export async function getNBSAtDate(code: string, date: Date = new Date()): Promise<NBSCode | null> {
  return prismaUnscoped.nbsCode.findFirst({
    where: { code, vigenciaInicio: { lte: date }, OR: [{ vigenciaFim: null }, { vigenciaFim: { gte: date } }] },
    orderBy: { vigenciaInicio: 'desc' },
  });
}

export async function getCESTAtDate(code: string, date: Date = new Date()): Promise<CESTCode | null> {
  return prismaUnscoped.cestCode.findFirst({
    where: { code, vigenciaInicio: { lte: date }, OR: [{ vigenciaFim: null }, { vigenciaFim: { gte: date } }] },
    orderBy: { vigenciaInicio: 'desc' },
  });
}

export async function getCFOPAtDate(code: string, date: Date = new Date()): Promise<CFOPCode | null> {
  return prismaUnscoped.cfopCode.findFirst({
    where: { code, vigenciaInicio: { lte: date }, OR: [{ vigenciaFim: null }, { vigenciaFim: { gte: date } }] },
    orderBy: { vigenciaInicio: 'desc' },
  });
}

export async function getCNAEAtDate(code: string, date: Date = new Date()): Promise<CNAECode | null> {
  return prismaUnscoped.cnaeCode.findFirst({
    where: { code, vigenciaInicio: { lte: date }, OR: [{ vigenciaFim: null }, { vigenciaFim: { gte: date } }] },
    orderBy: { vigenciaInicio: 'desc' },
  });
}

export async function getCSTCSOSNAtDate(code: string, date: Date = new Date()): Promise<CSTCSOSNCode | null> {
  return prismaUnscoped.cstCsosnCode.findFirst({
    where: { code, vigenciaInicio: { lte: date }, OR: [{ vigenciaFim: null }, { vigenciaFim: { gte: date } }] },
    orderBy: { vigenciaInicio: 'desc' },
  });
}

/**
 * Sincronização automática diária com fontes oficiais (Receita Federal, IBGE, Confaz)
 */
export async function syncFiscalCodeCatalog(): Promise<CatalogImportResult> {
  const urls = {
    ncm: 'https://www.gov.br/receitafederal/pt-br/assuntos/aduanas/importacao-e-exportacao/ncm/ncm.csv',
    nbs: 'https://www.gov.br/receitafederal/pt-br/assuntos/orientacao-tributaria/cadastros/nbs/nbs.csv',
    cest: 'https://www.confaz.fazenda.gov.br/legislacao/convenios/2022/cest.csv',
    cfop: 'https://www.confaz.fazenda.gov.br/legislacao/convenios/cfop.csv',
    cnae: 'https://www.ibge.gov.br/estatisticas/multidomain/classificacoes/9173-cnae.html?=&t=downloads',
    cstCsosn: 'https://www.confaz.fazenda.gov.br/legislacao/convenios/cst-csosn.csv',
  };

  // Em produção, fazer download real dos arquivos
  // Aqui simula com dados vazios para estrutura
  return importFiscalCodeCatalog({});
}