import { NextRequest, NextResponse } from 'next/server'
import { getOverlayById, updateOverlay, deleteOverlay } from '@/lib/db'

export async function GET(_req: NextRequest, { params }: { params: { id: string } }) {
  const overlay = getOverlayById(params.id)
  if (!overlay) return NextResponse.json({ error: 'Not found' }, { status: 404 })
  return NextResponse.json(overlay)
}

export async function PATCH(req: NextRequest, { params }: { params: { id: string } }) {
  const body = await req.json()
  const overlay = updateOverlay(params.id, body)
  if (!overlay) return NextResponse.json({ error: 'Not found' }, { status: 404 })
  return NextResponse.json(overlay)
}

export async function DELETE(_req: NextRequest, { params }: { params: { id: string } }) {
  const ok = deleteOverlay(params.id)
  if (!ok) return NextResponse.json({ error: 'Not found' }, { status: 404 })
  return NextResponse.json({ ok: true })
}
