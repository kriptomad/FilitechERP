// one-off: insere back-relations faltantes no schema.prisma
const fs = require('fs');
const path = 'packages/db/prisma/schema.prisma';
const lines = fs.readFileSync(path, 'utf8').split(/\r?\n/);

const ADD = {
  Tenant: [
    '  onlineStoreSettings        OnlineStoreSettings?',
    '  fiscalDocumentEvents       FiscalDocumentEvent[]',
    '  chartOfAccounts            ChartOfAccount[]',
    '  costCenters                CostCenter[]',
    '  purchaseOrders             PurchaseOrder[]',
    '  inventoryCounts            InventoryCount[]',
    '  reportDefinitions          ReportDefinition[]',
    '  scheduledReports           ScheduledReport[]',
    '  dashboardLayouts           DashboardLayout[]',
    '  dataImportJobs             DataImportJob[]',
    '  taxRules                   TaxRule[]',
    '  ibsCbsRegimeElections      TenantIbsCbsRegimeElection[]',
    '  accountingFirmProfile      AccountingFirmProfile?',
    '  engagementsAsFirm          AccountingEngagement[] @relation("EngagementsAsFirm")',
    '  engagementsAsClient        AccountingEngagement[] @relation("EngagementsAsClient")',
    '  accountingTasksAsFirm      AccountingTask[] @relation("AccountingTasksAsFirm")',
    '  accountingTasksAsClient    AccountingTask[] @relation("AccountingTasksAsClient")',
    '  officialTaxDocuments       OfficialTaxDocument[] @relation("OfficialTaxDocumentsOfTenant")',
    '  officialTaxDocumentsGenerated OfficialTaxDocument[] @relation("OfficialTaxDocumentsGeneratedByFirm")',
  ],
  User: [
    '  cashRegisterMovements      CashRegisterMovement[]',
    '  purchaseOrdersCreated      PurchaseOrder[]',
    '  inventoryCountsStarted     InventoryCount[] @relation("InventoryCountStartedBy")',
    '  inventoryCountsApproved    InventoryCount[] @relation("InventoryCountApprovedBy")',
    '  inventoryCountItems        InventoryCountItem[]',
    '  reportDefinitionsCreated   ReportDefinition[]',
    '  dashboardLayout            DashboardLayout?',
    '  dataImportJobsCreated      DataImportJob[]',
    '  ibsCbsRegimeElections      TenantIbsCbsRegimeElection[]',
  ],
  Sale: ['  account                    ChartOfAccount?'],
  AccountPayable: [
    '  account                    ChartOfAccount?',
    '  costCenter                 CostCenter?',
    '  purchaseOrder              PurchaseOrder?',
  ],
  AccountReceivable: ['  account                    ChartOfAccount?'],
  Product: [
    '  purchaseOrderItems         PurchaseOrderItem[]',
    '  inventoryCountItems        InventoryCountItem[]',
  ],
  ProductBatch: ['  inventoryCountItems        InventoryCountItem[]'],
  Supplier: ['  purchaseOrders             PurchaseOrder[]'],
  CashRegister: ['  movements                  CashRegisterMovement[]'],
  FiscalDocument: ['  events                     FiscalDocumentEvent[]'],
};

// localiza blocos de modelo
const bounds = [];
for (let i = 0; i < lines.length; i++) {
  const m = lines[i].match(/^model\s+(\w+)\s*\{/);
  if (m) {
    let j = i + 1;
    while (j < lines.length && !/^\}/.test(lines[j])) j++;
    bounds.push({ name: m[1], start: i, end: j });
  }
}

const inserts = [];
for (const b of bounds) {
  const add = ADD[b.name];
  if (!add) continue;
  // já existentes?
  const body = lines.slice(b.start + 1, b.end);
  const fresh = add.filter((l) => {
    const field = l.trim().split(/\s+/)[0];
    return !body.some((x) => x.trim().startsWith(field + ' '));
  });
  if (!fresh.length) continue;
  // insere antes do primeiro atributo @@, senão antes de }
  let at = b.end;
  for (let k = b.start + 1; k < b.end; k++) {
    if (/^\s*@@/.test(lines[k])) {
      at = k;
      break;
    }
  }
  inserts.push({ at, lines: fresh });
}

inserts.sort((a, b) => b.at - a.at);
for (const ins of inserts) lines.splice(ins.at, 0, ...ins.lines);

fs.writeFileSync(path, lines.join('\n'));
console.log('inserted', inserts.reduce((n, i) => n + i.lines.length, 0), 'fields into', inserts.length, 'models');
