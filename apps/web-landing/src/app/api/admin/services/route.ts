import { NextRequest, NextResponse } from 'next/server';

const DEMO_SERVICES = [
  { id: '1', name: 'Troca de Óleo', nicheTag: 'AUTOMOTIVE_WORKSHOP', basePrice: 89.9, estimatedDurationMinutes: 30, commissionPercentage: 10, active: true, appointmentCount: 45, packageCount: 12 },
  { id: '2', name: 'Alinhamento e Balanceamento', nicheTag: 'AUTOMOTIVE_WORKSHOP', basePrice: 120.0, estimatedDurationMinutes: 45, commissionPercentage: 15, active: true, appointmentCount: 23, packageCount: 8 },
];

export async function GET() {
  return NextResponse.json({ success: true, data: DEMO_SERVICES });
}

export async function POST(request: Request) {
  const body = await request.json();
  const newService = { id: String(Date.now()), ...body, appointmentCount: 0, packageCount: 0, createdAt: new Date().toISOString() };
  return NextResponse.json({ success: true, data: newService }, { status: 201 });
}