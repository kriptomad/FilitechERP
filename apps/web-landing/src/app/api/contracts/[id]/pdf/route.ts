import { NextRequest, NextResponse } from 'next/server';

export async function POST(
  request: NextRequest,
  { params }: { params: { id: string } }
) {
  return NextResponse.json({ success: true, data: { pdfUrl: `https://filitecherp.vercel.app/api/contracts/${params.id}/download.pdf` } });
}