// prisma/seed-niches.ts — Cap. 1.2.2 / 11
//
// Catálogo de nichos, suas funcionalidades e o template de produtos que o
// tenant recebe ao se cadastrar. Tudo em BANCO — a vitrine e o onboarding leem
// daqui, nunca de um array hardcoded no componente.
import { PrismaClient, NicheCode } from '@prisma/client';

const prisma = new PrismaClient();

type FeatureSeed = {
  title: string;
  description: string;
  chapterRef: string;
};

type NicheSeed = {
  code: NicheCode;
  label: string;
  tagline: string;
  description: string;
  suggestedModules: string[];
  colorHex: string;
  icon: string;
  features: FeatureSeed[];
  templates: { name: string; category: string; unitPrice: number }[];
};

const NICHES: NicheSeed[] = [
  {
    code: 'MERCADO',
    label: 'Mercado / Conveniência',
    tagline: 'Frente de caixa que nunca para e giro de estoque sob controle',
    description:
      'Sugestão automática de compra por curva ABC, inventário rotativo por categoria e fechamento de caixa em gaveta cega — o operador não vê o valor esperado antes de contar, então não há como "ajustar" a contagem para fechar a diferença.',
    suggestedModules: ['pdv', 'estoque', 'financeiro', 'crm'],
    colorHex: '#6366F1',
    icon: 'shopping-cart',
    features: [
      { title: 'Gaveta cega no fechamento', description: 'A contagem física vem antes do valor esperado. A divergência só aparece depois que o operador fecha a gaveta — isso mascara furto?', chapterRef: '4.1', icon: 'lock' },
      { title: 'Sugestão de compra por giro', description: 'Média móvel de 30 dias cruza com o estoque mínimo e gera o pedido de compra pronto para enviar ao fornecedor.', chapterRef: '4.1', icon: 'trending-up' },
      { title: 'Curva ABC de produtos', description: '80% do faturamento vem de poucos itens. A curva mostra exatamente onde concentrar reposição e margem.', chapterRef: '1.2.4', icon: 'bar-chart' },
      { title: 'Inventário rotativo', description: 'Contagem por categoria em vez de unfairly parar a loja inteira para conferir o estoque.', chapterRef: '4.1', icon: 'clipboard-check' },
      { title: 'Fidelidade por pontos', description: 'Acúmulo por valor gasto e resgate em desconto, com expiração rolante para o cliente não acumular pontos que nunca valem.', chapterRef: '4.1.1', icon: 'gift' },
      { title: 'Crediário com limite', description: 'Venda a prazo bloqueada automaticamente quando o cliente atinge o limite — sem discussão no balcão.', chapterRef: '4.6', icon: 'credit-card' },
    ],
    templates: [
      { name: 'Arroz agulhinha tipo 1 — 5kg', category: 'Mercearia', unitPrice: 28.9 },
      { name: 'Feijão carioca 1kg', category: 'Merceoria', unitPrice: 9.49 },
      { name: 'Leite integral 1L', category: 'Laticínios', unitPrice: 5.89 },
      { name: 'Café torrado e moído 500g', category: 'Mercearia', unitPrice: 14.9 },
      { name: 'Açúcar refinado 1kg', category: 'Merceoria', unitPrice: 4.79 },
      { name: 'Refrigerante lata 350ml', category: 'Bebidas', unitPrice: 3.99 },
      { name: 'Pão francês (kg)', category: 'Padaria', unitPrice: 18.9 },
      { name: 'Detergente neutro 500ml', category: 'Limpeza', unitPrice: 2.29 },
    ],
  },
  {
    code: 'ASSISTENCIA_TECNICA',
    label: 'Assistência Técnica',
    tagline: 'Do checklist de entrada assinado ao comissionamento na entrega',
    description:
      'O ciclo completo da ordem de serviço com checklist assinado digitalmente na entrada, orçamento com validade — eliminando disputa de reajuste — e aprovação remota por WhatsApp, para o cliente não precisar voltar à loja só para autorizar o reparo.',
    suggestedModules: ['pdv', 'estoque', 'financeiro', 'work-order', 'whatsapp'],
    colorHex: '#06B6D4',
    icon: 'wrench',
    features: [
      { title: 'Checklist de entrada assinado', description: 'O cliente assina digitalmente o estado do equipamento na recepção. Sem isso, não há como contestar depois o que já estava quebrado.', chapterRef: '4.2', icon: 'file-signature' },
      { title: 'Orçamento com validade', description: 'O preço da peça é congelado por N dias. Passou do prazo, o orçamento precisa ser refeito — sem isso, qualquer reajuste vira disputa.', chapterRef: '4.2', icon: 'calendar-clock' },
      { title: 'Aprovação por WhatsApp', description: 'Link assinado de uso único com 72h de validade. O cliente aprova do celular e o técnico segue o serviço.', chapterRef: '4.2', icon: 'message-circle' },
      { title: 'Comissionamento do técnico que executou', description: 'A comissão é do técnico que fez o reparo, não de quem abriu a O.S., e só libera quando a O.S. chega a DELIVERED.', chapterRef: '4.2', icon: 'award' },
      { title: 'Histórico por IMEI/serial', description: 'Chegou de volta o mesmo aparelho? O histórico de OS por serial mostra em segundos se está na garantia.', chapterRef: '4.2', icon: 'history' },
      { title: 'Controle de garantia por tipo de serviço', description: '90 dias para peça, 30 para software, com as exclusões registradas no termo entregue ao cliente.', chapterRef: '4.2', icon: 'shield-check' },
    ],
    templates: [
      { name: 'Mão de obra — diagnóstico', category: 'Serviço', unitPrice: 80 },
      { name: 'Mão de obra — troca de tela', category: 'Serviço', unitPrice: 150 },
      { name: 'Limpeza chemically completa de notebook', category: 'Serviço', unitPrice: 120 },
      { name: 'Bateria compatível — modelo A', category: 'Peça', unitPrice: 189.9 },
      { name: 'Fonte 19V 3.42A', category: 'Peça', unitPrice: 145 },
      { name: 'Teclado ABNT2 universal', category: 'Peça', unitPrice: 89.9 },
      { name: 'SSD 480GB SATA 2.5"', category: 'Peça', unitPrice: 259 },
      { name: 'Cabo de rede Cat6 (m)', category: 'Consumível', unitPrice: 12.9 },
    ],
  },
  {
    code: 'ADEGA',
    label: 'Adega / Bebidas',
    tagline: 'Conta-corrente de cascos separada da conta financeira',
    description:
      'O vasilhame é patrimônio da distribuidora, não do cliente — por isso tem uma conta-corrente própria que rastreia a posse física do casco por cliente e permite cobrar o valor de reposição quando ele não volta.',
    suggestedModules: ['pdv', 'estoque', 'financeiro', 'liquor-ledger'],
    colorHex: '#A855F7',
    icon: 'wine',
    features: [
      { title: 'Conta-corrente de cascos', description: 'Separada da conta financeira: ela rastreia posse física, não dinheiro. Cliente que ficou com 4 garrafas aparece com 4 pendências.', chapterRef: '4.3', icon: 'package' },
      { title: 'Cobrança de reposição automática', description: 'Passou 30 dias sem devolver o casco, o sistema sugere cobrar o valor de reposição como item avulso na próxima venda.', chapterRef: '4.3', icon: 'receipt' },
      { title: 'Precificação em cascata', description: 'Preço de unidade, de caixa fechada e de revendedor — selecionados por quantidade E perfil do cliente, sem o caixa precisar decidir.', chapterRef: '4.3', icon: 'layers' },
      { title: 'Entrada de NF-e credita produto e casco', description: 'Quando a compra inclui vasilhame do fornecedor, os dois entram no estoque juntos, sem lançamento manual duplicado.', chapterRef: '4.3', icon: 'file-text' },
      { title: 'Margem por caixa fechada', description: 'O relatório mostra a margem real do atacado versus a do varejo — o que Many dealers Associate clássico deixa invisível.', chapterRef: '17.2', icon: 'percent' },
    ],
    templates: [
      { name: 'Cerveja Pilsen long neck 355ml', category: 'Cerveja', unitPrice: 7.9 },
      { name: 'Vinho tinto tinto seco 750ml', category: 'Vinho', unitPrice: 49.9 },
      { name: 'Gin destilado 750ml', category: 'Destilado', unitPrice: 89.9 },
      { name: 'Whisky 12 anos 750ml', category: 'Destilado', unitPrice: 219.9 },
      { name: 'Água mineral 500ml', category: 'Sem álcool', unitPrice: 2.5 },
      { name: 'Refrigerante guaraná 2L', category: 'Sem álcool', unitPrice: 9.9 },
      { name: 'Gelo 5kg (saco)', category: 'Insumo', unitPrice: 14.9 },
      { name: 'Cascão retornável 750ml (vasilhame)', category: 'Vasilhame', unitPrice: 0 },
    ],
  },
  {
    code: 'PADARIA',
    label: 'Padaria / Confeitaria',
    tagline: 'Ficha técnica que alimenta o custo real e perda de produção',
    description:
      'A ficha técnica não é uma lista de ingredientes — ela alimenta o custo real de produção e o controle de perdas, porque produção que não virou venda consumiu insumo do mesmo jeito.',
    suggestedModules: ['pdv', 'estoque', 'financeiro', 'recipe-bom'],
    colorHex: '#F59E0B',
    icon: 'croissant',
    features: [
      { title: 'Custo real por unidade produzida', description: 'Uma fornada de 10kg de massa que rende 120 pães: o custo por pão é calculado a partir do rendimento real, não da receita cheia.', chapterRef: '4.4', icon: 'calculator' },
      { title: 'Custo recalcula sozinho', description: 'Subiu o preço da farinha? O CMV de todos os produtos que usam ela se atualiza — o custo nunca fica defasado na planilha.', chapterRef: '4.4', icon: 'refresh-cw' },
      { title: 'Baixa de insumo na produção', description: 'O insumo é baixado no momento da produção, não no momento da venda. Nem tudo que é produzido é vendido no mesmo dia.', chapterRef: '4.4', icon: 'package-minus' },
      { title: 'Perdas e quebras desmarcadas', description: 'Pão que sobrou e não vendeu até o fim do dia vira perda com insumo consumido. Sem isso a margem real é ficção.', chapterRef: '4.4', icon: 'alert-triangle' },
      { title: 'CMV por produto', description: 'Margem por produto considerando o custo real da ficha técnica, não o preço de compra tableado.', chapterRef: '17.2', icon: 'trending-up' },
    ],
    templates: [
      { name: 'Pão francês (kg)', category: 'Pães', unitPrice: 18.9 },
      { name: 'Pão de forma integral', category: 'Pães', unitPrice: 24.9 },
      { name: 'Croissant manteiga', category: 'Pães', unitPrice: 12.5 },
      { name: 'Bolo de chocolate (kg)', category: 'Doces', unitPrice: 69.9 },
      { name: 'Torta de limão', category: 'Doces', unitPrice: 45 },
      { name: 'Farinha de trigo (kg)', category: 'Insumo', unitPrice: 6.49 },
      { name: 'Manteiga de mesa 500g', category: 'Insumo', unitPrice: 32.9 },
      { name: 'Açúcar cristal (kg)', category: 'Insumo', unitPrice: 4.79 },
    ],
  },
  {
    code: 'FARMACIA',
    label: 'Farmácia / Drogaria',
    tagline: 'FEFO, retenção de receita e escrituração de controlados',
    description:
      'Lote e validade com baixa FEFO de verdade, retenção obrigatória de receita para controlados e estrutura pronta para o SNGPC/SNCR — porque tarja preta não é só um campo de texto no cadastro do produto.',
    suggestedModules: ['pdv', 'estoque', 'financeiro', 'pharmacy-sngpc', 'fiscal'],
    colorHex: '#10B981',
    icon: 'pill',
    features: [
      { title: 'FEFO real, não só aviso', description: 'A venda consome o lote de menor validade primeiro. E lote vencido bloqueia a venda na hora — não vira depois um problema de auditoria.', chapterRef: '4.5', icon: 'calendar' },
      { title: 'Retenção de receita obrigatória', description: 'Produto controlado exige registro da receita antes de concluir a venda. Sem o registro, o caixa não fecha o item.', chapterRef: '4.5', icon: 'file-lock' },
      { title: 'Escrituração de controlados', description: 'Estrutura de movimentação pronta para o SNGPC e para o SNCR com numeração única de receita eletrônica.', chapterRef: '4.5', icon: 'clipboard-list' },
      { title: 'Alerta de validade 30/60 dias', description: 'Aviso antecipado para liquidar antes da perda total. Descontar no tempo certo vale mais do que descartar depois.', chapterRef: '4.1', icon: 'bell' },
      { title: 'Generic x genérico', description: 'Comparação de preço entre marca e genérico na tela de venda — quem compra genérico escolhe pelo preço.', chapterRef: '8.1', icon: 'git-compare' },
      { title: 'Venda por receita bloqueada sem CPF', description: 'Produto que exige retenção não fecha sem o CPF do paciente — proteção legal e sanitária.', chapterRef: '4.5', icon: 'shield-alert' },
    ],
    templates: [
      { name: 'Dipirona 500mg — 20 cp', category: 'Genéricos', unitPrice: 9.9 },
      { name: 'Paracetamol 750mg — 20 cp', category: 'Genéricos', unitPrice: 12.5 },
      { name: 'Vitamina C 1g — 30 cp', category: 'Vitaminas', unitPrice: 34.9 },
      { name: 'Creme dental 90g', category: 'Higiene', unitPrice: 16.9 },
      { name: 'Fralda infantil M — 20un', category: 'Infantil', unitPrice: 49.9 },
      { name: 'Antisséptico 200ml', category: 'Higiene', unitPrice: 11.9 },
      { name: 'Lorazepam 1mg — 30 cp (tarja preta)', category: 'Controlados', unitPrice: 18.9 },
      { name: 'Tônicoaminadoinal 60ml', category: 'Injetáveis', unitPrice: 8.5 },
    ],
  },
  {
    code: 'VAREJO_GERAL',
    label: 'Varejo Geral',
    tagline: 'Grade de variações, crediário e devolução com reentrada',
    description:
      'Varejo de roupa e calçado com grade de cor e tamanho real, crediário com limite de crédito e devolução que devolve o estoque sozinho quando o produto permite.',
    suggestedModules: ['pdv', 'estoque', 'financeiro', 'crm'],
    colorHex: '#F43F5E',
    icon: 'shopping-bag',
    features: [
      { title: 'Grade de cor e tamanho', description: 'Cada variação tem código de barras e saldo próprios, mas o relatório agregado por produto-pai continua respondendo.', chapterRef: '4.6', icon: 'grid' },
      { title: 'Crediário com limite', description: 'Conta-corrente do cliente com limite, histórico de pagamento e bloqueio automático de venda a prazo quando estoura.', chapterRef: '4.6', icon: 'wallet' },
      { title: 'Devolução com reentrada de estoque', description: 'Estorno proporcional e o item volta ao estoque sozinho — exceto o que é marked como não retornável por higiene.', chapterRef: '4.6', icon: 'undo' },
      { title: 'Preço de cascata no varejo', description: 'Preço de peça avulsa, de caixa e de revendedor, selecionado por quantidade e perfil do cliente.', chapterRef: '4.3', icon: 'tags' },
      { title: 'Ficha de cliente por CPF', description: 'Histórico de compras e fidelidade atrelado ao documento, não ao telefone — o cliente troca de número e não perde o histórico.', chapterRef: '4.1', icon: 'contact' },
    ],
    templates: [
      { name: 'Camiseta algodão (grade P)', category: 'Roupas', unitPrice: 39.9 },
      { name: 'Camiseta algodão (grade M)', category: 'Roupas', unitPrice: 39.9 },
      { name: 'Calça jeans (grade 40)', category: 'Roupas', unitPrice: 129.9 },
      { name: 'Tênis urbano (grade 40)', category: 'Calçados', unitPrice: 219.9 },
      { name: 'Bolsa de couro sintético', category: 'Acessórios', unitPrice: 89.9 },
      { name: 'Meia sports (pack 3)', category: 'Acessórios', unitPrice: 24.9 },
      { name: 'Boné trucker', category: 'Acessórios', unitPrice: 34.9 },
      { name: 'Cinto de couro', category: 'Acessórios', unitPrice: 59.9 },
    ],
  },
  {
    code: 'RESTAURANTE',
    label: 'Restaurante / Lanchonete',
    tagline: 'Comanda eletrônica, KDS e iFood no mesmo caixa',
    description:
      'Comanda digital que vira venda no fechamento, com division de conta, delivery pelo iFood e KDS de produção — tudo convergent para um único caixa.',
    suggestedModules: ['pdv', 'estoque', 'financeiro', 'restaurant-pos', 'whatsapp'],
    colorHex: '#EF4444',
    icon: 'utensils',
    features: [
      { title: 'Comanda eletrônica', description: 'O garçom launches o pedido, a cozinha recebe na hora e o fechamento vira venda com baixa de estoque.', chapterRef: '11.1', icon: 'clipboard' },
      { title: 'Divisão de conta', description: 'Fechamento parcial por pessoa, deixando a comanda aberta enquanto ainda houver item — sem obrigar a mesa a pedir tudo de uma vez.', chapterRef: '11.1', icon: 'users' },
      { title: 'KDS de produção', description: 'A cozinha vê os pedidos pendentes por tempo de preparo. Nada de tela de pedido impresso esquecida na bancada.', chapterRef: '8.2', icon: 'monitor' },
      { title: 'Delivery pelo iFood', description: 'Pedido do iFood entra pelo webhook, mapeia produto por EAN e já baixa estoque com FEFO.', chapterRef: '11.1', icon: 'bike' },
      { title: 'Ficha técnica de prato', description: 'Custo real de cada prato considerando o yield real da receita — o food cost fica visível.', chapterRef: '4.4', icon: 'calculator' },
    ],
    templates: [
      { name: 'X-burger', category: 'Lanches', unitPrice: 24.9 },
      { name: 'X-tudo', category: 'Lanches', unitPrice: 32.9 },
      { name: 'Batata frita pequena', category: 'Acompanhamentos', unitPrice: 12.9 },
      { name: 'Refrigerante lata', category: 'Bebidas', unitPrice: 6.5 },
      { name: 'Suco natural 400ml', category: 'Bebidas', unitPrice: 9.9 },
      { name: 'Pizza média (fatia)', category: 'Pizzas', unitPrice: 42 },
      { name: 'Pão de alho (fatia)', category: 'Entradas', unitPrice: 8.9 },
      { name: 'Cerveja long neck', category: 'Cerveja', unitPrice: 7.9 },
    ],
  },
  {
    code: 'PETSHOP',
    label: 'Petshop / Veterinária',
    tagline: 'Prontuário do pet, agenda por profissional e controle de vacinas',
    description:
      'Prontuário completo do animal com histórico de vacinas, agenda por profissional com bloqueio de conflito de horário e pacotes de banho consumidos corretamente.',
    suggestedModules: ['pdv', 'estoque', 'financeiro', 'crm', 'petshop'],
    colorHex: '#8B5CF6',
    icon: 'paw',
    features: [
      { title: 'Prontuário por animal', description: 'Histórico de consultas, invariably de weigh-in e Owner tudo atrelado ao pet, não ao cliente.', chapterRef: '11.2', icon: 'clipboard-list' },
      { title: 'Agenda por profissional', description: 'Bloqueio de conflito de horário na hora da marcação — duas reservas no mesmo slot não acontecem por engano.', chapterRef: '11.2', icon: 'calendar' },
      { title: 'Controle de vacinas', description: 'Alerta de próxima dose com 7 dias de antecedência e disparo de mensagem de lembret.', chapterRef: '11.2', icon: 'syringe' },
      { title: 'Pacotes de banho com expiração', description: 'Sessões do pacote são consumidas FIFO e expiram com aviso — o pacote não vira crédito eterno.', chapterRef: '11.2', icon: 'package' },
      { title: 'Ração e venda por peso', description: 'Venda fracionada de ração com conversão de unidade e controle de custo por kg.', chapterRef: '11.5', icon: 'scale' },
    ],
    templates: [
      { name: 'Ração Premium 15kg', category: 'Rações', unitPrice: 189.9 },
      { name: 'Banho e tosa — porte médio', category: 'Serviços', unitPrice: 65 },
      { name: 'Banho — porte grande', category: 'Serviços', unitPrice: 95 },
      { name: 'Tosa higiênica', category: 'Serviços', unitPrice: 45 },
      { name: 'Consulta veterinária', category: 'Serviços', unitPrice: 150 },
      { name: 'Vacina V10', category: 'Vacinas', unitPrice: 80 },
      { name: 'Vermífugo 10kg', category: 'Medicamentos', unitPrice: 42.9 },
      { name: 'Areia sanitária 4kg', category: 'Higiene', unitPrice: 18.9 },
    ],
  },
  {
    code: 'SALAO_BELARIA',
    label: 'Salão / Barbearia',
    tagline: 'Agenda por profissional com comissionamento real',
    description:
      'Agenda por profissional com comissionamento por serviço realizado, pacotes de sessão e confirmação por WhatsApp — o salão que enche a agenda e sabe onde está o faturamento.',
    suggestedModules: ['pdv', 'estoque', 'financeiro', 'crm', 'beauty-salon'],
    colorHex: '#EC4899',
    icon: 'scissors',
    features: [
      { title: 'Comissionamento por serviço', description: 'Cada profissional tem seu percentual, calculado sobre o serviço realmente executado e não sobre o pacote.', chapterRef: '11.6', icon: 'percent' },
      { title: 'Agenda com visual de dia', description: 'Quadro do dia por profissional, com horário ocupado e disponível visível de relance.', chapterRef: '11.6', icon: 'calendar-days' },
      { title: 'Confirmação por WhatsApp', description: 'Lembrete antes do horário reduz falta; o cliente confirma pelo celular em um toque.', chapterRef: '20.2', icon: 'message-circle' },
      { title: 'Pacote de sessões', description: 'Cliente compra 10 sessões, usa 3 e o saldo acompanha com expiração visível para ele.', chapterRef: '11.6', icon: 'ticket' },
      { title: 'Comanda de produtos', description: 'Cosmético vendido junto com o serviço entra na mesma venda e baixa estoque junto.', chapterRef: '11.6', icon: 'shopping-bag' },
    ],
    templates: [
      { name: 'Corte masculino', category: 'Cabelo', unitPrice: 45 },
      { name: 'Corte + barba', category: 'Cabelo', unitPrice: 65 },
      { name: 'Barba completa', category: 'Barba', unitPrice: 35 },
      { name: 'Pigmentação', category: 'Coloração', unitPrice: 120 },
      { name: 'Escova progressiva', category: 'Químico', unitPrice: 220 },
      { name: 'Manicure', category: 'Unhas', unitPrice: 35 },
      { name: 'Shampoo profissional 500ml', category: 'Produtos', unitPrice: 69.9 },
      { name: 'Pacote 10 cortes', category: 'Pacotes', unitPrice: 400 },
    ],
  },
  {
    code: 'AUTOMOTIVA',
    label: 'Automotiva',
    tagline: 'OS automotiva com peças, veículo e seguro de garantia',
    description:
      'Ordem de serviço automotiva com cadastro do veículo, histórico por placa eAPEAPE de garantia — oficina que atende vários veículos e não se perde em qual revisão está qual carro.',
    suggestedModules: ['pdv', 'estoque', 'financeiro', 'work-order', 'automotive'],
    colorHex: '#0EA5E9',
    icon: 'car',
    features: [
      { title: 'Cadastro por veículo', description: 'Modelo, placa, ano e quilometragem. O histórico de serviço segue o carro, não o dono — ele vende o carro e o histórico continua.', chapterRef: '11.9', icon: 'car' },
      { title: 'Revisão por quilometragem', description: 'Alerta de troca de óleo e filtros por km percorrido ou por tempo, o que vier primeiro.', chapterRef: '11.9', icon: 'gauge' },
      { title: 'Peças com estoque reservado', description: 'A peça fica reservada na OS e volta ao estoque automaticamente se o serviço for cancelado.', chapterRef: '4.2', icon: 'package' },
      { title: 'Orçamento com validade', description: 'O preço da peça fica congelado por N dias — sem isso, a oficina absorve o reajuste do fornecedor sempode ver.', chapterRef: '4.2', icon: 'file-text' },
      { title: 'Comissionamento do mecânico', description: 'Comissão sobre mão de obra do técnico que executou, liberada só na entrega.', chapterRef: '4.2', icon: 'award' },
    ],
    templates: [
      { name: 'Óleo motor 5W30 (1L)', category: 'Lubrificantes', unitPrice: 39.9 },
      { name: 'Filtro de óleo universal', category: 'Filtros', unitPrice: 34.9 },
      { name: 'Filtro de ar', category: 'Filtros', unitPrice: 89.9 },
      { name: 'Bateria 60Ah', category: 'Elétrica', unitPrice: 649 },
      { name: 'Mão de obra — troca de óleo', category: 'Serviço', unitPrice: 60 },
      { name: 'Alinhamento e balanceamento', category: 'Serviço', unitPrice: 120 },
      { name: 'Pastilha de freio (par dianteiro)', category: 'Freio', unitPrice: 189.9 },
      { name: 'Palheta limpador (par)', category: 'Periféricos', unitPrice: 79.9 },
    ],
  },
  {
    code: 'OTICA',
    label: 'Ótica',
    tagline: 'Receita de grau, laboratório e consignação',
    description:
      'Receita de grau com medidas completas, acompanhamento de produção no laboratório e consignação de armação — ótica que vende rápido precisa saber onde a ordem parou.',
    suggestedModules: ['pdv', 'estoque', 'financeiro', 'crm', 'optical'],
    colorHex: '#06B6D4',
    icon: 'glasses',
    features: [
      { title: 'Receita de grau completa', description: 'Grau, cilindro, eixo, adição, PD e DNP. A receita que chega ao laboratório precisa estar completa de primeira.', chapterRef: '11.3', icon: 'eye' },
      { title: 'Acompanhamento no laboratório', description: 'Acompanhamento de produção, montagem e entrega — o cliente pergunta e o sistema responde sem adivinhação.', chapterRef: '11.3', icon: 'search' },
      { title: 'Consignação de armação', description: 'Consignação com regra de prazo e comissão por venda, sem travar o caixa.', chapterRef: '11.3', icon: 'repeat' },
      { title: 'Lentes com faixa de preço', description: 'Faixa por material e índice, com margem por tipo de lente — Blue-light e fotocromática não valem o preço de uma comum.', chapterRef: '17.2', icon: 'layers' },
      { title: 'Venda parcelada no orçamento', description: 'Parcelamento direto na venda da armação, com entrada e saldo.', chapterRef: '17.5', icon: 'credit-card' },
    ],
    templates: [
      { name: 'Armação acetato com grau', category: 'Armações', unitPrice: 189 },
      { name: 'Armação metal premium', category: 'Armações', unitPrice: 429 },
      { name: 'Lente monofocal CR-39', category: 'Lentes', unitPrice: 149 },
      { name: 'Lente fotocromática', category: 'Lentes', unitPrice: 389 },
      { name: 'Lente blue-light', category: 'Lentes', unitPrice: 299 },
      { name: 'Lente progressiva', category: 'Lentes', unitPrice: 899 },
      { name: 'Solução para lente (un)', category: 'Acessórios', unitPrice: 15 },
      { name: 'Estojo de óculos', category: 'Acessórios', unitPrice: 29.9 },
    ],
  },
  {
    code: 'MODA_CALCADOS',
    label: 'Moda / Calçados',
    tagline: 'Curva ABC por variação e tamanho que vende primeiro',
    description:
      'Grade com cor, tamanho e numeração reais, curva ABC por variação para saber qual tamanho está saturado e qual está encalhado — o problema clássico de calçados.',
    suggestedModules: ['pdv', 'estoque', 'financeiro', 'crm', 'fashion-grid'],
    colorHex: '#A855F7',
    icon: 'shirt',
    features: [
      { title: 'Grade completa de variações', description: 'Cor, tamanho e numeração como variações reais, cada uma com EAN e estoque próprios.', chapterRef: '4.6', icon: 'grid' },
      { title: 'Curva ABC por variação', description: 'Saboroa de quando a curva é por produto-pai, você vê o tamanho 40 saturando enquanto o 43 encalha.', chapterRef: '4.1', icon: 'bar-chart' },
      { title: 'Preço por variação', description: 'Preço de venda pode divergir por tamanho — é comum e o sistema permite.', chapterRef: '4.6', icon: 'tags' },
      { title: 'Ficha por modelo-pai', description: 'Fornecedor, custo e curva agregam por modelo, e o detalhe fica por variação.', chapterRef: '17.8', icon: 'layers' },
      { title: 'Consignação de loja', description: 'Peça de consignação separa do estoque próprio, com repasse na venda.', chapterRef: '11.12', icon: 'truck' },
    ],
    templates: [
      { name: 'Tênis urbano', category: 'Calçados', unitPrice: 219.9 },
      { name: 'Tênis esportivo', category: 'Calçados', unitPrice: 289.9 },
      { name: 'Camisa polo algodão', category: 'Roupas', unitPrice: 129.9 },
      { name: 'Camiseta estampada', category: 'Roupas', unitPrice: 69.9 },
      { name: 'Calça jeans premium', category: 'Roupas', unitPrice: 249.9 },
      { name: 'Bolsa transbordinho', category: 'Acessórios', unitPrice: 149.9 },
      { name: 'Meia de algodão (pack 3)', category: 'Acessórios', unitPrice: 29.9 },
      { name: 'Boné esports', category: 'Acessórios', unitPrice: 49.9 },
    ],
  },
  {
    code: 'PAPELARIA',
    label: 'Papelaria / Presentes',
    tagline: 'Sazonalidade, kits compostos e venda fracionada',
    description:
      'Janelas sazonais que mudam o sortimento ao longo do ano, kits compostos que quebram estoque corretamente e material escolar vendido por fração.',
    suggestedModules: ['pdv', 'estoque', 'financeiro', 'crm', 'stationery-seasonal'],
    colorHex: '#F59E0B',
    icon: 'pencil',
    features: [
      { title: 'Sazonalidade por calendário', description: 'Datas comemorativas mudam o sortimento sugestãodo — o sistema sabe quedia 12 de outubro é outra coisa.', chapterRef: '11.5', icon: 'calendar' },
      { title: 'Kits compostos', description: 'Kit de presentes que explode nos componentes e baixa o estoque de cada item real.', chapterRef: '11.5', icon: 'gift' },
      { title: 'Venda fracionada', description: 'Venda por fração de um item maior — o meio quilo de papel, o metro de fita.', chapterRef: '11.5', icon: 'scale' },
      { title: 'Preço por fração', description: 'Preço de venda por unidade de compra convertido corretamente, com CMV real.', chapterRef: '17.8', icon: 'calculator' },
      { title: 'Lista de compras escolar', description: 'O cliente school compra a lista inteira de uma vez — itens viram venda de uma transação só.', chapterRef: '11.5', icon: 'list' },
    ],
    templates: [
      { name: 'Caderno 96 folhas', category: 'Papelaria', unitPrice: 12.9 },
      { name: 'Caneta esferográfica (un)', category: 'Escrita', unitPrice: 2.5 },
      { name: 'Kit 6 canetas', category: 'Escrita', unitPrice: 12.9 },
      { name: 'Estojo simples', category: 'Estojo', unitPrice: 24.9 },
      { name: 'Mochila escolar', category: 'Mochilas', unitPrice: 189.9 },
      { name: 'Papel crepom (rolo)', category: 'Papel', unitPrice: 8.9 },
      { name: 'Fita adesiva (rolo)', category: 'Adesivos', unitPrice: 5.9 },
      { name: 'Cartão de presente', category: 'Presentes', unitPrice: 4.9 },
    ],
  },
  {
    code: 'CONSTRUCAO',
    label: 'Construção / Material',
    tagline: 'Venda fracionada, conversão de unidade e desconto progressivo',
    description:
      'Material de construção vendido por fração, metro ou caixa, com conversão de unidade e desconto progressivo por volume — a diferença entre margem real e margem aparente.',
    suggestedModules: ['pdv', 'estoque', 'financeiro', 'crm', 'construction-fractional'],
    colorHex: '#78716C',
    icon: 'hard-hat',
    features: [
      { title: 'Conversão de unidade', description: 'Venda por metro quando comprou por caixa, com o fator de conversão real — não estimativa.', chapterRef: '11.8', icon: 'repeat' },
      { title: 'Desconto progressivo', description: 'Preço cai por volume comprado, encadeado automaticamente pelo PDV.', chapterRef: '4.3', icon: 'trending-down' },
      { title: 'Perfil de construtora', description: 'Cliente com CNPJ e regime especial de compra, com limite de crédito próprio.', chapterRef: '4.6', icon: 'building' },
      { title: 'Custo por m²', description: 'O relatório mostra o custo por metro quadrado do material considerando perdas.', chapterRef: '17.2', icon: 'grid' },
      { title: 'Separação entre compra e venda', description: 'Compra e venda de material em unidades diferentes com CMV correto — o erro que mais corrói margem na construção.', chapterRef: '17.8', icon: 'calculator' },
    ],
    templates: [
      { name: 'Cimento CP II 50kg (saco)', category: 'Estrutura', unitPrice: 32.9 },
      { name: 'Areia lavada (m³)', category: 'Agregados', unitPrice: 189.9 },
      { name: 'Brita graduada (m³)', category: 'Agregados', unitPrice: 219.9 },
      { name: 'Tijolo baiano (un)', category: 'Alvenaria', unitPrice: 0.79 },
      { name: 'Tubo PVC 100mm (barra 6m)', category: 'Hidráulica', unitPrice: 89.9 },
      { name: 'Tubo PVC 50mm (barra 6m)', category: 'Hidráulica', unitPrice: 52.9 },
      { name: 'Ferro 10mm (barra 12m)', category: 'Estrutura', unitPrice: 189.9 },
      { name: 'Tinta acrílica 18L', category: 'Pintura', unitPrice: 389.9 },
    ],
  },
  {
    code: 'ESCRITORIO_CONTABILIDADE',
    label: 'Escritório de Contabilidade',
    tagline: 'Escritório virtual que assina, gera e transmite pelo cliente',
    description:
      'Um escritório de contabilidade dentro da plataforma: assina procuração eletrônica dos clientes, gera ECD/ECF, SPED e DARF, e comercializa esse serviço no marketplace — com tudo atrelado ao mesmo banco de clientes do ERP.',
    suggestedModules: ['pdv', 'estoque', 'financeiro', 'crm', 'accounting-integration'],
    colorHex: '#1D4ED8',
    icon: 'calculator',
    features: [
      { title: 'Procuração eletrônica assinada', description: 'O cliente assina a procuração digitalmente e o escritório assume o bloco de obrigações com validade auditável.', chapterRef: '21.18.3', icon: 'file-signature' },
      { title: 'Geração de ECD e ECF', description: 'Blocos oficiais gerados a partir do próprio plano de contas do ERP — nada de planilha paralela.', chapterRef: '21.18.5', icon: 'file-text' },
      { title: 'SPED e EFD-Reinf', description: 'Geração e transmissão dos arquivos com controle de rejeição e protocolo.', chapterRef: '21.18.10', icon: 'send' },
      { title: 'Tarefas recorrentes por competência', description: 'DAS, DCTF, ECF e ECD aparecem como tarefas com prazo e responsável — o escritório não perde prazo.', chapterRef: '21.18.4', icon: 'calendar-clock' },
      { title: 'Honorário como conta a receber', description: 'O honorário mensal vira conta a receber do cliente e entra no fluxo do próprio ERP.', chapterRef: '21.18.8', icon: 'wallet' },
      { title: 'Marketplace de contadores', description: 'Contador autônomo se cadastra, é avaliado por clientes e contrata pelo próprio sistema.', chapterRef: '21.18.6', icon: 'users' },
    ],
    templates: [
      { name: 'Honorário mensal — Simples Nacional', category: 'Honorários', unitPrice: 450 },
      { name: 'Honorário mensal — Lucro Real', category: 'Honorários', unitPrice: 1200 },
      { name: 'Declaração anual de IRPF', category: 'Obrigações', unitPrice: 180 },
      { name: 'DAS — emissão e-guided', category: 'Obrigações', unitPrice: 90 },
      { name: 'ECF/ECD — geração e transmissão', category: 'Obrigações', unitPrice: 350 },
      { name: 'SPED ICMS — geração', category: 'Obrigações', unitPrice: 280 },
      { name: 'Consultoria mensal (hora)', category: 'Consultoria', unitPrice: 180 },
      { name: 'Balanço patrimonial', category: 'Obrigações', unitPrice: 890 },
    ],
  },
  {
    code: 'PERSONAL',
    label: 'Filitech Pessoal',
    tagline: 'Gestão financeira doméstica sem CNPJ e sem fiscal',
    description:
      'Contas, orçamento, metas e investimentos para a casa — reaproveitando 100% da infraestrutura multi-tenant, sem CNPJ, sem documento fiscal e sem nada de obrigatório que o lojista tem.',
    suggestedModules: ['pdv', 'financeiro'],
    colorHex: '#10B981',
    icon: 'home',
    features: [
      { title: 'Contas e orçamento mensal', description: 'Contas a pagar e a receber da casa, com orçamento por categoria e alerta de estouro.', chapterRef: '22', icon: 'wallet' },
      { title: 'Metas de poupança', description: 'Meta com prazo e valor, e acompanhamento do quanto já foi guardado.', chapterRef: '22', icon: 'target' },
      { title: 'Patrimônio consolidado', description: 'Contas, investimentos e dívidas num único número — o patrimônio líquido real.', chapterRef: '22', icon: 'trending-up' },
      { title: 'Open Finance (conexão bancária)', description: 'Conexão de conta bancária para importar transações sem digitação manual.', chapterRef: '22', icon: 'link' },
      { title: 'Membros da casa', description: 'Conjuge ou parceiro convidado com acesso às contas — sem poder excluir o dono.', chapterRef: '22', icon: 'users' },
    ],
    templates: [],
  },
];

async function main() {
  for (const [index, niche] of NICHES.entries()) {
    await prisma.niche.upsert({
      where: { code: niche.code },
      create: {
        code: niche.code,
        label: niche.label,
        tagline: niche.tagline,
        description: niche.description,
        suggestedModules: niche.suggestedModules,
        colorHex: niche.colorHex,
        icon: niche.icon,
        sortOrder: index,
        active: true,
        selectableOnSignup: true,
      },
      update: {
        label: niche.label,
        tagline: niche.tagline,
        description: niche.description,
        suggestedModules: niche.suggestedModules,
        colorHex: niche.colorHex,
        icon: niche.icon,
        sortOrder: index,
        active: true,
      },
    });

    // Funcionalidades e template são recriados por completo: o catálogo é
    // editorial e sempre deve refletir a versão atual do documento.
    await prisma.nicheFeature.deleteMany({ where: { nicheCode: niche.code } });
    await prisma.nicheTemplateProduct.deleteMany({ where: { nicheCode: niche.code } });

    if (niche.features.length > 0) {
      await prisma.nicheFeature.createMany({
        data: niche.features.map((f, i) => ({
          nicheCode: niche.code,
          title: f.title,
          description: f.description,
          chapterRef: f.chapterRef,
          icon: f.icon,
          sortOrder: i,
        })),
      });
    }

    if (niche.templates.length > 0) {
      await prisma.nicheTemplateProduct.createMany({
        data: niche.templates.map((t, i) => ({
          nicheCode: niche.code,
          name: t.name,
          category: t.category,
          unitPrice: t.unitPrice,
          sortOrder: i,
        })),
      });
    }
  }

  console.log(`✅ ${NICHES.length} nichos semeados com features e templates.`);
}

main()
  .catch((err) => {
    console.error(err);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());