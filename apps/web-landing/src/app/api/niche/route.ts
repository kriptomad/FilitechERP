import { NextResponse } from 'next/server';

export async function GET() {
  return NextResponse.json({ success: true, data: { niches: ['GERAL', 'PETSHOP', 'BEAUTY_SALON', 'CAR_DETAILING', 'AUTOMOTIVE_WORKSHOP'] } });
}