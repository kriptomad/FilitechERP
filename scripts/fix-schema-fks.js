// one-off: completa FKs para as relações unidirecionais do plano contábil
const fs = require('fs');
const path = 'packages/db/prisma/schema.prisma';
let text = fs.readFileSync(path, 'utf8');

const edits = [
  // Sale → ChartOfAccount
  {
    from: '  updatedAt     DateTime    @updatedAt\n\n  tenant          Tenant       @relation(fields: [tenantId], references: [id], onDelete: Cascade)\n  client          Client?      @relation(fields: [clientId], references: [id])',
    to:
      '  updatedAt     DateTime    @updatedAt\n  chartOfAccountId String?\n\n' +
      '  tenant          Tenant       @relation(fields: [tenantId], references: [id], onDelete: Cascade)\n' +
      '  client          Client?      @relation(fields: [clientId], references: [id])',
  },
  {
    from: '  account                    ChartOfAccount?\n  @@unique([tenantId, idempotencyKey])',
    to:
      '  account                    ChartOfAccount? @relation(fields: [chartOfAccountId], references: [id], map: "sales_chart_of_account_fkey")\n' +
      '  @@index([chartOfAccountId])\n' +
      '  @@unique([tenantId, idempotencyKey])',
  },
  // AccountPayable → ChartOfAccount / CostCenter / PurchaseOrder
  {
    from:
      '  account                    ChartOfAccount?\n  costCenter                 CostCenter?\n  purchaseOrder              PurchaseOrder?\n  @@index([tenantId, status, dueDate])',
    to:
      '  account                    ChartOfAccount? @relation(fields: [accountId], references: [id], map: "accounts_payable_account_fkey")\n' +
      '  costCenter                 CostCenter? @relation(fields: [costCenterId], references: [id], map: "accounts_payable_cost_center_fkey")\n' +
      '  purchaseOrder              PurchaseOrder? @relation(fields: [purchaseOrderId], references: [id], map: "accounts_payable_purchase_order_fkey")\n' +
      '  @@index([accountId])\n' +
      '  @@index([costCenterId])\n' +
      '  @@index([purchaseOrderId])\n' +
      '  @@index([tenantId, status, dueDate])',
  },
  {
    from: '  sourceNfeKey  String?\n  createdAt     DateTime      @default(now())',
    to:
      '  sourceNfeKey  String?\n' +
      '  accountId     String?\n' +
      '  costCenterId  String?\n' +
      '  purchaseOrderId String?\n' +
      '  createdAt     DateTime      @default(now())',
  },
  // AccountReceivable → ChartOfAccount
  {
    from: '  account                    ChartOfAccount?\n  @@index([tenantId, status, dueDate])',
    to:
      '  account                    ChartOfAccount? @relation(fields: [accountId], references: [id], map: "accounts_receivable_account_fkey")\n' +
      '  @@index([accountId])\n' +
      '  @@index([tenantId, status, dueDate])',
  },
  {
    from: '  paidAt        DateTime?\n  createdAt   DateTime         @default(now())',
    to: '  paidAt        DateTime?\n  accountId     String?\n  createdAt   DateTime         @default(now())',
  },
];

for (const e of edits) {
  const idx = text.indexOf(e.from);
  if (idx === -1) {
    console.error('NOT FOUND:\n' + e.from.slice(0, 120));
    process.exit(1);
  }
  if (text.indexOf(e.from, idx + 1) !== -1) {
    console.error('AMBIGUOUS:\n' + e.from.slice(0, 120));
    process.exit(1);
  }
  text = text.slice(0, idx) + e.to + text.slice(idx + e.from.length);
}

fs.writeFileSync(path, text);
console.log('ok');
