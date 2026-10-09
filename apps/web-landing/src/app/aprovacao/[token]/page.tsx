// src/app/aprovacao/[token]/page.tsx — Cap. 4.2 / 6.4
//
// Página pública de aprovação de orçamento.
//
// O cliente não tem conta no sistema: a autorização vem do token de uso único
// que o Filitech enviou por WhatsApp. Por isso esta rota NÃO usa o shell
// autenticado do ERP — é renderizada fora de `/app`.

import type { Metadata } from 'next';
import { ApprovalView } from './approval-view';

export const metadata: Metadata = {
  title: 'Aprovar orçamento',
  robots: { index: false, follow: false },
};

export const dynamic = 'force-dynamic';

export default function AprovacaoPage({ params }: { params: { token: string } }) {
  return <ApprovalView token={params.token} />;
}