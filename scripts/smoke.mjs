// Smoke test end-to-end contra o servidor em execução.
// Uso: node scripts/smoke.mjs [baseUrl]
//
// Existe porque o build e o `tsc` passarem não provam que o sistema funciona:
// rotas de auth, cobrança e gate dependem de cookie, banco e webhook. Este
// script exercita o fluxo real e falha alto quando algo está quebrado.

const base = process.argv[2] ?? 'http://localhost:3000';

let passed = 0;
let failed = 0;
const failures = [];

function log(ok, label, detail = '') {
  if (ok) {
    passed++;
    console.log(`  \u2713 ${label}${detail ? ` — ${detail}` : ''}`);
  } else {
    failed++;
    failures.push(`${label}${detail ? `: ${detail}` : ''}`);
    console.log(`  \u2717 ${label}${detail ? ` — ${detail}` : ''}`);
  }
}

function section(title) {
  console.log(`\n${title}`);
}

/** Requisição com cookie jar manual — o sistema usa cookie HttpOnly. */
async function call(path, { method = 'GET', body, cookie } = {}) {
  const headers = {};
  if (body) headers['Content-Type'] = 'application/json';
  if (cookie) headers.Cookie = cookie;

  const res = await fetch(`${base}${path}`, {
    method,
    headers,
    body: body ? JSON.stringify(body) : undefined,
    redirect: 'manual',
  });

  const setCookie = res.headers.get('set-cookie');
  let json = null;
  try {
    json = await res.json();
  } catch {
    /* resposta não-JSON (ex.: PDF) */
  }

  return { status: res.status, json, setCookie };
}

function cookieValue(setCookieHeader, name) {
  if (!setCookieHeader) return null;
  const match = setCookieHeader.match(new RegExp(`${name}=([^;]+)`));
  return match ? `${name}=${match[1]}` : null;
}

const uniqueEmail = `smoke${Date.now()}@filitech.dev`;

// ─────────────────────────────────────────────────────────────────────────────
section('1. Health e catálogo público');

{
  const health = await call('/api/health');
  const checks = Object.fromEntries(
    (health.json?.checks ?? []).map((c) => [c.name, c.ok]),
  );
  log(checks.database === true, 'banco conectado', health.json?.status);
  log(checks.jwt_keys === true, 'chaves RS256 carregadas');
  // O gateway ausente é um estado legítimo de dev — o que NÃO pode ser é 500.
  log(
    health.status === 200 || health.status === 503,
    'health responde com diagnóstico (não 500)',
    String(health.status),
  );

  const catalog = await call('/api/billing/catalog');
  const plans = catalog.json?.data?.plans ?? [];
  const modules = catalog.json?.data?.modules ?? [];
  log(catalog.status === 200 && plans.length > 0, 'catálogo de planos do banco', `${plans.length} planos`);
  log(modules.length > 0, 'catálogo de módulos do banco', `${modules.length} módulos`);

  const combos = catalog.json?.data?.combos ?? [];
  log(combos.length > 0, 'combos com desconto calculados', `${combos.length} combos`);

  const niches = await call('/api/niches');
  const nicheList = niches.json?.data?.niches ?? [];
  log(nicheList.length >= 16, 'nichos com funcionalidades', `${nicheList.length} nichos`);

  const withFeatures = nicheList.filter((n) => n.features.length > 0);
  log(withFeatures.length === nicheList.length, 'todo nicho tem features', `${withFeatures.length}/${nicheList.length}`);

  const withTemplate = nicheList.filter((n) => n.templateItems.length > 0);
  log(withTemplate.length >= 10, 'nichos têm catálogo inicial', `${withTemplate.length} com template`);

  const contabilidade = nicheList.find((n) => n.code === 'ESCRITORIO_CONTABILIDADE');
  log(
    Boolean(contabilidade?.features?.length),
    'escritório de contabilidade tem funcionalidades',
    `${contabilidade?.features?.length ?? 0} features`,
  );
}

// ─────────────────────────────────────────────────────────────────────────────
section('2. Cadastro (com nicho e aceite legal)');

let sessionCookie = null;
let tenantId = null;

{
  // Sem aceite: deve ser rejeitado (Cap. 1.2.1).
  const rejected = await call('/api/auth/signup', {
    method: 'POST',
    body: {
      tradeName: 'Empresa Sem Aceite',
      name: 'Teste',
      email: `noaceite${Date.now()}@filitech.dev`,
      password: 'Senha@12345',
      nicheCode: 'MERCADO',
    },
  });
  log(rejected.status === 400, 'cadastro sem aceite de termos é rejeitado', String(rejected.status));

  // Nicho inválido: deve ser rejeitado.
  const badNiche = await call('/api/auth/signup', {
    method: 'POST',
    body: {
      tradeName: 'Empresa Nicho Ruim',
      name: 'Teste',
      email: `badniche${Date.now()}@filitech.dev`,
      password: 'Senha@12345',
      nicheCode: 'NAO_EXISTE',
      termsAccepted: true,
      privacyPolicyAccepted: true,
    },
  });
  log(badNiche.status === 400, 'cadastro com nicho inválido é rejeitado', String(badNiche.status));

  // Senha curta: deve ser rejeitado.
  const shortPass = await call('/api/auth/signup', {
    method: 'POST',
    body: {
      tradeName: 'Empresa Senha Curta',
      name: 'Teste',
      email: `short${Date.now()}@filitech.dev`,
      password: '123',
      termsAccepted: true,
      privacyPolicyAccepted: true,
    },
  });
  log(shortPass.status === 400, 'senha curta é rejeitada', String(shortPass.status));

  // Cadastro válido.
  const signup = await call('/api/auth/signup', {
    method: 'POST',
    body: {
      tradeName: 'Padaria Smoke Test',
      legalName: 'Padaria Smoke Test LTDA',
      name: 'Maria Teste',
      email: uniqueEmail,
      password: 'Senha@12345',
      nicheCode: 'PADARIA',
      termsAccepted: true,
      privacyPolicyAccepted: true,
    },
  });

  log(signup.status === 201, 'cadastro criado', String(signup.status));
  sessionCookie = cookieValue(signup.setCookie, 'filitech.session');
  log(Boolean(sessionCookie), 'cookie de sessão emitido (HttpOnly)');

  const data = signup.json?.data;
  tenantId = data?.user?.tenantId;
  log(data?.user?.role === 'OWNER', 'primeiro usuário é OWNER', data?.user?.role);
  log(data?.niche?.code === 'PADARIA', 'nicho gravado no tenant', data?.niche?.label);
  log(
    Array.isArray(data?.activeModules) && data.activeModules.includes('recipe-bom'),
    'módulos sugeridos pelo nicho ativados',
    (data?.activeModules ?? []).join(', '),
  );
  log(Boolean(data?.onboarding?.message), 'onboarding informa o próximo passo');

  // Template de catálogo do nicho.
  const products = await call('/api/products', { cookie: sessionCookie });
  const productList = products.json?.data ?? [];
  log(
    products.status === 200 && productList.length > 0,
    'catálogo inicial do nicho carregado',
    `${productList.length} produtos`,
  );
  log(
    productList.some((p) => p.category === 'Pães'),
    'template contém produtos do nicho (Padaria)',
  );

  // E-mail duplicado.
  const duplicate = await call('/api/auth/signup', {
    method: 'POST',
    body: {
      tradeName: 'Outra',
      name: 'Outra',
      email: uniqueEmail,
      password: 'Senha@12345',
      termsAccepted: true,
      privacyPolicyAccepted: true,
    },
  });
  log(duplicate.status === 409, 'e-mail duplicado é rejeitado', String(duplicate.status));
}

// ─────────────────────────────────────────────────────────────────────────────
section('3. Sessão e autorização');

{
  const me = await call('/api/auth/me', { cookie: sessionCookie });
  log(me.status === 200, '/auth/me com cookie válido', String(me.status));
  log(me.json?.data?.tenantId === tenantId, '/auth/me devolve o tenant correto');

  const anon = await call('/api/auth/me');
  log(anon.status === 401, '/auth/me sem sessão retorna 401', String(anon.status));

  const anonProducts = await call('/api/products');
  log(anonProducts.status === 401, 'rota protegida sem sessão retorna 401', String(anonProducts.status));

  const login = await call('/api/auth/login', {
    method: 'POST',
    body: { email: uniqueEmail, password: 'Senha@12345' },
  });
  log(login.status === 200, 'login com credenciais corretas', String(login.status));

  const wrongPass = await call('/api/auth/login', {
    method: 'POST',
    body: { email: uniqueEmail, password: 'Errada@123' },
  });
  log(wrongPass.status === 401, 'login com senha errada retorna 401', String(wrongPass.status));

  const unknownUser = await call('/api/auth/login', {
    method: 'POST',
    body: { email: 'naoexiste@filitech.dev', password: 'Qualquer@123' },
  });
  // Mesma mensagem e mesmo status: não revela se o e-mail existe.
  log(
    unknownUser.status === 401 && unknownUser.json?.error?.code === 'INVALID_CREDENTIALS',
    'login com e-mail inexistente é indistinguível (anti-enumeração)',
  );
}

// ─────────────────────────────────────────────────────────────────────────────
section('4. Cobrança — checkout NÃO ativa sem pagamento');

{
  const gateway = await call('/api/gateway');
  log(gateway.status === 200, 'status do gateway disponível', String(gateway.status));

  const configured = gateway.json?.data?.configured === true;

  const checkout = await call('/api/billing/checkout', {
    method: 'POST',
    cookie: sessionCookie,
    body: { planCode: 'PRO', paymentMethod: 'PIX' },
  });

  if (!configured) {
    log(
      checkout.status === 503 && checkout.json?.error?.code === 'GATEWAY_NOT_CONFIGURED',
      'plano pago sem gateway responde 503 (não ativa nada)',
      String(checkout.status),
    );
  } else {
    log(
      checkout.status === 200 && checkout.json?.data?.status === 'AWAITING_PAYMENT',
      'checkout cria cobrança pendente',
      checkout.json?.data?.payment?.method,
    );
    log(
      Boolean(checkout.json?.data?.payment?.pixQrCodePayload || checkout.json?.data?.payment?.pixQrCodeBase64),
      'cobrança PIX retorna QR Code / copia-e-cola',
    );
  }

  // Ponto mais importante do teste: a assinatura NÃO pode estar ativa.
  const sub = await call('/api/billing/subscription', { cookie: sessionCookie });
  const subStatus = sub.json?.data?.subscription?.status ?? null;
  log(
    subStatus !== 'ACTIVE' || !configured,
    'checkout NÃO ativou a assinatura sem confirmação',
    `status=${subStatus}`,
  );

  const anonQuote = await call('/api/billing/checkout', {
    method: 'POST',
    body: { planCode: 'PRO' },
  });
  log(
    anonQuote.status === 200 && anonQuote.json?.data?.mode === 'quote',
    'sem sessão o checkout só simula (mode=quote)',
  );

  const invalidMethod = await call('/api/billing/checkout', {
    method: 'POST',
    cookie: sessionCookie,
    body: { planCode: 'PRO', paymentMethod: 'BITCOIN' },
  });
  log(invalidMethod.status === 400, 'método de pagamento inválido é rejeitado', String(invalidMethod.status));

  const invalidPlan = await call('/api/billing/checkout', {
    method: 'POST',
    cookie: sessionCookie,
    body: { planCode: 'PLAN_INEXISTENTE' },
  });
  log(invalidPlan.status === 400, 'plano inexistente é rejeitado', String(invalidPlan.status));
}

// ─────────────────────────────────────────────────────────────────────────────
section('5. Plano Free — ativação imediata (legítimo)');

{
  const free = await call('/api/billing/checkout', {
    method: 'POST',
    cookie: sessionCookie,
    body: { planCode: 'FREE', paymentMethod: 'PIX' },
  });

  log(free.status === 200, 'checkout do plano Free', String(free.status));
  log(free.json?.data?.mode === 'free', 'Free retorna mode=free (sem cobrança)');
  log(
    free.json?.data?.subscriptionId?.startsWith('free_') ?? free.json?.data?.subscriptionId != null,
    'assinatura Free criada',
  );

  const sub = await call('/api/billing/subscription', { cookie: sessionCookie });
  log(
    sub.json?.data?.subscription?.status === 'TRIAL' ||
      sub.json?.data?.subscription?.status === 'ACTIVE',
    'Free ativa sem gateway (correto: não há o que cobrar)',
    sub.json?.data?.subscription?.status,
  );
}

// ─────────────────────────────────────────────────────────────────────────────
section('6. Operação: caixa, venda, estorno, cliente, serviço');

{
  // Caixa
  const closed = await call('/api/cash-register', { cookie: sessionCookie });
  log(
    Array.isArray(closed.json?.data),
    'caixa lista registros reais (não objeto fixo CLOSED)',
    `${closed.json?.data?.length ?? 0} registros`,
  );

  const open = await call('/api/cash-register', {
    method: 'POST',
    cookie: sessionCookie,
    body: { openingAmount: 100 },
  });
  log(open.status === 201 && open.json?.data?.status === 'OPEN', 'caixa aberto', String(open.status));
  const registerId = open.json?.data?.id;

  const doubleOpen = await call('/api/cash-register', {
    method: 'POST',
    cookie: sessionCookie,
    body: { openingAmount: 50 },
  });
  log(doubleOpen.status === 409, 'segundo caixa aberto é bloqueado', String(doubleOpen.status));

  // Produto
  const created = await call('/api/products', {
    method: 'POST',
    cookie: sessionCookie,
    body: {
      name: 'Pão de teste',
      category: 'Pães',
      unitPrice: 10,
      stockQuantity: 50,
    },
  });
  log(created.status === 201, 'produto criado', String(created.status));
  const productId = created.json?.data?.id;

  // Venda
  const sale = await call('/api/sales', {
    method: 'POST',
    cookie: sessionCookie,
    body: {
      idempotencyKey: `smoke-${Date.now()}`,
      cashRegisterId: registerId,
      items: [{ productId, quantity: 3 }],
      payments: [{ method: 'CASH', amount: 30 }],
    },
  });
  log(sale.status === 201, 'venda registrada', String(sale.status));
  log(sale.json?.data?.totalAmount === 30, 'total da venda correto', String(sale.json?.data?.totalAmount));
  const saleId = sale.json?.data?.id;

  // Idempotência
  const replayKey = `smoke-replay-${Date.now()}`;
  const first = await call('/api/sales', {
    method: 'POST',
    cookie: sessionCookie,
    body: {
      idempotencyKey: replayKey,
      cashRegisterId: registerId,
      items: [{ productId, quantity: 1 }],
      payments: [{ method: 'CASH', amount: 10 }],
    },
  });
  const second = await call('/api/sales', {
    method: 'POST',
    cookie: sessionCookie,
    body: {
      idempotencyKey: replayKey,
      cashRegisterId: registerId,
      items: [{ productId, quantity: 1 }],
      payments: [{ method: 'CASH', amount: 10 }],
    },
  });
  log(
    first.json?.data?.id === second.json?.data?.id,
    'idempotência: reenvio não duplica venda',
    `${first.json?.data?.id?.slice(0, 8)} == ${second.json?.data?.id?.slice(0, 8)}`,
  );

  // Estoque baixou?
  const productsAfter = await call('/api/products', { cookie: sessionCookie });
  const productAfter = (productsAfter.json?.data ?? []).find((p) => p.id === productId);
  log(
    productAfter?.stockQuantity === 46,
    'estoque baixou (50 - 3 - 1)',
    String(productAfter?.stockQuantity),
  );

  // Estoque insuficiente
  const oversell = await call('/api/sales', {
    method: 'POST',
    cookie: sessionCookie,
    body: {
      idempotencyKey: `smoke-over-${Date.now()}`,
      cashRegisterId: registerId,
      items: [{ productId, quantity: 9999 }],
      payments: [{ method: 'CASH', amount: 99999 }],
    },
  });
  log(
    oversell.status === 422 && oversell.json?.error?.code === 'INSUFFICIENT_STOCK',
    'venda acima do estoque é bloqueada (422)',
    String(oversell.status),
  );

  // Venda sem caixa aberto
  const noRegister = await call('/api/sales', {
    method: 'POST',
    cookie: sessionCookie,
    body: {
      idempotencyKey: `smoke-noreg-${Date.now()}`,
      cashRegisterId: 'inexistente',
      items: [{ productId, quantity: 1 }],
      payments: [{ method: 'CASH', amount: 10 }],
    },
  });
  log(noRegister.status === 409, 'venda sem caixa aberto é bloqueada', String(noRegister.status));

  // Estorno
  const refund = await call(`/api/sales/${saleId}/refund`, {
    method: 'POST',
    cookie: sessionCookie,
    body: {},
  });
  log(refund.status === 200 && refund.json?.data?.refunded === true, 'estorno processado', String(refund.status));

  const productsAfterRefund = await call('/api/products', { cookie: sessionCookie });
  const restored = (productsAfterRefund.json?.data ?? []).find((p) => p.id === productId);
  log(restored?.stockQuantity === 49, 'estoque reentrou no estorno', String(restored?.stockQuantity));

  // Fechar caixa (gaveta cega)
  const close = await call('/api/cash-register', {
    method: 'PATCH',
    cookie: sessionCookie,
    body: { registerId, countedAmount: 130 },
  });
  log(close.status === 200 && close.json?.data?.status === 'CLOSED', 'caixa fechado', String(close.status));
  log(
    typeof close.json?.data?.divergenceAmount === 'number',
    'divergência calculada após a contagem',
    `esperado=${close.json?.data?.expectedAmount} contado=${close.json?.data?.closingAmount} diff=${close.json?.data?.divergenceAmount}`,
  );

  // Cliente
  const client = await call('/api/admin/clients', {
    method: 'POST',
    cookie: sessionCookie,
    body: { name: 'Cliente Smoke', document: '12345678900', creditLimit: 100 },
  });
  log(client.status === 201, 'cliente criado', String(client.status));
  const clientId = client.json?.data?.id;

  // Recebível acima do limite
  const overLimit = await call('/api/admin/receivables', {
    method: 'POST',
    cookie: sessionCookie,
    body: {
      clientId,
      description: 'Teste de limite',
      amount: 500,
      dueDate: new Date(Date.now() + 7 * 86400000).toISOString(),
    },
  });
  log(
    overLimit.status === 422 && overLimit.json?.error?.code === 'CREDIT_LIMIT_EXCEEDED',
    'recebível acima do limite de crédito é bloqueado',
    String(overLimit.status),
  );

  // Recebível válido + baixa
  const receivable = await call('/api/admin/receivables', {
    method: 'POST',
    cookie: sessionCookie,
    body: {
      clientId,
      description: 'Venda a prazo',
      amount: 50,
      dueDate: new Date(Date.now() + 7 * 86400000).toISOString(),
    },
  });
  log(receivable.status === 201, 'recebível criado', String(receivable.status));
  const receivableId = receivable.json?.data?.id;

  const paid = await call(`/api/admin/receivables/${receivableId}/pay`, {
    method: 'POST',
    cookie: sessionCookie,
    body: {},
  });
  log(
    paid.status === 200 && paid.json?.data?.status === 'PAID',
    'dar baixa MUDA o status no banco',
    paid.json?.data?.status,
  );

  const paidTwice = await call(`/api/admin/receivables/${receivableId}/pay`, {
    method: 'POST',
    cookie: sessionCookie,
    body: {},
  });
  log(paidTwice.status === 409, 'dar baixa duas vezes é bloqueado', String(paidTwice.status));

  // Serviço
  const service = await call('/api/admin/services', {
    method: 'POST',
    cookie: sessionCookie,
    body: {
      name: 'Corte de cabelo',
      nicheTag: 'SALAO_BELARIA',
      basePrice: 45,
      estimatedDurationMinutes: 30,
    },
  });
  log(service.status === 201, 'serviço criado', String(service.status));

  // Contrato + PDF
  const contract = await call('/api/contracts', {
    method: 'POST',
    cookie: sessionCookie,
    body: {
      clientId,
      title: 'Contrato de manutenção mensal',
      startDate: new Date().toISOString(),
      items: [{ description: 'Serviço mensal', quantity: 1, unitPrice: 200 }],
    },
  });
  log(contract.status === 201, 'contrato criado', contract.json?.data?.contractNumber);
  const contractId = contract.json?.data?.id;

  const signed = await call(`/api/contracts/${contractId}/sign`, {
    method: 'POST',
    cookie: sessionCookie,
    body: {},
  });
  log(signed.json?.data?.status === 'ACTIVE', 'contrato assinado muda status', signed.json?.data?.status);

  const editSigned = await call(`/api/contracts/${contractId}`, {
    method: 'PATCH',
    cookie: sessionCookie,
    body: { title: 'Tentativa de alterar' },
  });
  log(editSigned.status === 409, 'contrato assinado não pode ser alterado', String(editSigned.status));

  const pdf = await fetch(`${base}/api/contracts/${contractId}/pdf`, {
    headers: { Cookie: sessionCookie },
  });
  const pdfBuffer = Buffer.from(await pdf.arrayBuffer());
  const isPdf = pdfBuffer.subarray(0, 5).toString() === '%PDF-';
  log(pdf.status === 200 && isPdf, 'PDF do contrato é um PDF válido', `${pdfBuffer.length} bytes`);

  // O.S.
  const workOrder = await call('/api/work-order', {
    method: 'POST',
    cookie: sessionCookie,
    body: {
      clientId,
      equipmentDescription: 'Notebook Dell',
      reportedIssue: 'Não liga',
    },
  });
  log(workOrder.status === 201, 'ordem de serviço criada', workOrder.json?.data?.status);
  const workOrderId = workOrder.json?.data?.id;

  const budget = await call(`/api/work-order/${workOrderId}/budget`, {
    method: 'POST',
    cookie: sessionCookie,
    body: {
      items: [
        { description: 'Mão de obra', itemType: 'LABOR', quantity: 1, unitPrice: 150, commissionable: true },
      ],
    },
  });
  log(budget.status === 200 && budget.json?.data?.approvalUrl, 'orçamento gera link de aprovação', String(budget.status));

  const token = budget.json?.data?.approvalUrl?.split('/').pop();
  const publicView = await call(`/api/work-order/public/${token}`);
  log(publicView.status === 200 && publicView.json?.data?.total === 150, 'cliente vê o orçamento público', String(publicView.json?.data?.total));

  const approve1 = await call('/api/work-order/approve', { method: 'POST', body: { token } });
  log(approve1.status === 200, 'aprovação pública funciona', String(approve1.status));

  const approve2 = await call('/api/work-order/approve', { method: 'POST', body: { token } });
  log(approve2.status === 409, 'aprovação em duplicidade é bloqueada', String(approve2.status));
}

// ─────────────────────────────────────────────────────────────────────────────
section('7. Nicho, auditoria, equipe, faturas, uso');

{
  const tenantMe = await call('/api/tenant/me', { cookie: sessionCookie });
  log(tenantMe.status === 200 && tenantMe.json?.data?.tenant?.nicheCode === 'PADARIA', 'tenant expõe o nicho', tenantMe.json?.data?.tenant?.nicheCode);
  log(Array.isArray(tenantMe.json?.data?.categories) && tenantMe.json.data.categories.length > 0, 'categorias do catálogo inicial', (tenantMe.json?.data?.categories ?? []).join(', '));

  const changeNiche = await call('/api/auth/niche', {
    method: 'PATCH',
    cookie: sessionCookie,
    body: { nicheCode: 'ADEGA' },
  });
  log(changeNiche.status === 200 && changeNiche.json?.data?.tenant?.nicheCode === 'ADEGA', 'troca de nicho funciona', changeNiche.json?.data?.niche?.label);

  const audit = await call('/api/audit-log', { cookie: sessionCookie });
  const entries = audit.json?.data?.entries ?? [];
  log(entries.length > 0, 'auditoria registra ações reais', `${entries.length} entradas`);
  log(
    entries.some((e) => e.action === 'CLIENT_CREATED'),
    'auditoria contém criação de cliente',
  );

  const anonAudit = await call('/api/audit-log');
  log(anonAudit.status === 401, 'auditoria exige sessão', String(anonAudit.status));

  const users = await call('/api/users', { cookie: sessionCookie });
  log(users.status === 200 && users.json?.data?.length >= 1, 'lista da equipe do banco', `${users.json?.data?.length} membros`);

  // Tier Free permite 1 usuário — convite deve falhar com upsell.
  const invite = await call('/api/users', {
    method: 'POST',
    cookie: sessionCookie,
    body: { name: 'Segundo Usuário', email: `membro${Date.now()}@filitech.dev`, role: 'CASHIER' },
  });
  log(
    invite.status === 402 && invite.json?.error?.code === 'FREE_TIER_LIMIT',
    'Tier Free bloqueia 2º usuário com upsell',
    String(invite.status),
  );
  log(Boolean(invite.json?.upsell?.checkoutUrl), 'resposta de upsell traz destino de checkout');

  const invoices = await call('/api/billing/invoices', { cookie: sessionCookie });
  log(Array.isArray(invoices.json?.data?.invoices), 'extrato de faturas responde', `${invoices.json?.data?.invoices?.length ?? 0} faturas`);

  const usage = await call('/api/billing/usage', { cookie: sessionCookie });
  log(usage.status === 200 && typeof usage.json?.data?.usage?.sales?.current === 'number', 'uso calculado do banco', `vendas=${usage.json?.data?.usage?.sales?.current}`);
  log(usage.json?.data?.usage?.sales?.current > 0, 'uso reflete as vendas do smoke test');
}

// ─────────────────────────────────────────────────────────────────────────────
section('8. Webhook de cobrança (segurança)');

{
  const noSig = await call('/api/webhooks/billing?provider=mercadopago', {
    method: 'POST',
    body: { type: 'payment', action: 'approved', data: { id: 1 } },
  });
  log(noSig.status === 401, 'webhook sem assinatura é rejeitado', String(noSig.status));

  const noToken = await call('/api/webhooks/billing', {
    method: 'POST',
    body: { event: 'PAYMENT_CONFIRMED' },
  });
  log(noToken.status === 401, 'webhook Asaas sem token é rejeitado', String(noToken.status));

  const crons = await call('/api/cron/dunning');
  log(crons.status === 401, 'cron sem CRON_SECRET é rejeitado', String(crons.status));
}

// ─────────────────────────────────────────────────────────────────────────────
console.log(`\n${'─'.repeat(60)}`);
console.log(`\n${passed} passaram, ${failed} falharam`);
if (failures.length > 0) {
  console.log('\nFalhas:');
  for (const f of failures) console.log(`  • ${f}`);
}
process.exit(failed > 0 ? 1 : 0);