import { NextResponse } from 'next/server';

const FALLBACK_CATALOG = {
  plans: [
    { code: 'FREE', label: 'Free', basePrice: 0, includedModules: ['pdv', 'estoque', 'financeiro'] },
    { code: 'BASIC', label: 'Essencial', basePrice: 89.9, includedModules: ['pdv', 'estoque', 'financeiro'] },
    { code: 'PRO', label: 'Profissional', basePrice: 169.9, includedModules: ['pdv', 'estoque', 'financeiro', 'crm'] },
  ],
  modules: [
    { code: 'fiscal', label: 'Emissão Fiscal (NFC-e/NFe)', monthlyPrice: 49.9, description: 'Emissão ilimitada de documentos fiscais com contingência automática.' },
    { code: 'whatsapp', label: 'Integração WhatsApp', monthlyPrice: 39.9, description: 'Orçamentos, cobranças e notificações de O.S. via WhatsApp.' },
    { code: 'multi-filial', label: 'Multi-Filial', monthlyPrice: 59.9, description: 'Dashboard consolidado para múltiplas lojas.' },
    { code: 'work-order', label: 'Assistência Técnica (O.S.)', monthlyPrice: 69.9, description: 'Ordens de serviço, checklist, laudo e IMEI/Serial.' },
    { code: 'liquor-ledger', label: 'Adega — Conta-Corrente de Cascos', monthlyPrice: 29.9, description: 'Controle de vasilhames retornáveis por cliente.' },
    { code: 'recipe-bom', label: 'Ficha Técnica (Padaria/Confeitaria)', monthlyPrice: 44.9, description: 'Receitas, custo de produção e baixa automática.' },
    { code: 'pharmacy-sngpc', label: 'Farmácia — SNGPC/Controlados', monthlyPrice: 79.9, description: 'Escrituração eletrônica e retenção digital de receituário.' },
    { code: 'restaurant-pos', label: 'Restaurante (Comanda + KDS)', monthlyPrice: 74.9, description: 'Comanda eletrônica, KDS e iFood.' },
    { code: 'petshop', label: 'Petshop/Veterinária', monthlyPrice: 54.9, description: 'Prontuário do pet, vacinas e agendamento.' },
    { code: 'beauty-salon', label: 'Salão/Barbearia', monthlyPrice: 54.9, description: 'Agenda por profissional e comissionamento.' },
    { code: 'automotive', label: 'Setor Automotivo', monthlyPrice: 64.9, description: 'Veículos, O.S. automotiva e peças.' },
    { code: 'optical', label: 'Ótica', monthlyPrice: 49.9, description: 'Receita de grau, laboratório e consignação.' },
    { code: 'fashion-grid', label: 'Moda/Calçados (Grade)', monthlyPrice: 39.9, description: 'Grade cor/tamanho/numeração e curva ABC por variante.' },
    { code: 'stationery-seasonal', label: 'Papelaria (Sazonalidade/Kits)', monthlyPrice: 34.9, description: 'Janelas sazonais e kits compostos.' },
    { code: 'construction-fractional', label: 'Construção (Venda Fracionada)', monthlyPrice: 44.9, description: 'Compra vs venda, conversão de unidade e desconto progressivo.' },
  ],
  combos: [],
  freeLimits: [
    { key: 'sales', label: 'Vendas (PDV)', limit: 100, unit: 'vendas/mês', rationale: 'Suficiente para testar a operação real por semanas.' },
    { key: 'users', label: 'Usuários', limit: 1, unit: 'usuário (Owner)', rationale: 'Upgrade natural assim que o lojista contrata o primeiro funcionário.' },
    { key: 'products', label: 'Produtos cadastrados', limit: 200, unit: 'SKUs', rationale: 'Cobre um pequeno comércio completo.' },
    { key: 'fiscal', label: 'Emissão fiscal', limit: 0, unit: 'não incluída', rationale: "Módulo pago 'fiscal' — exigência legal, ponto de conversão natural." },
    { key: 'storage', label: 'Armazenamento de fotos/XML', limit: 500, unit: 'MB', rationale: 'Operação inicial sem custo de infraestrutura relevante.' },
    { key: 'support', label: 'Suporte', limit: null, unit: 'Comunidade/FAQ', rationale: 'Suporte prioritário é um upsell dos planos pagos.' },
  ],
};

export async function GET() {
  return NextResponse.json({ success: true, data: FALLBACK_CATALOG });
}