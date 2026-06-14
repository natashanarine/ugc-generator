import { NextRequest, NextResponse } from 'next/server'
import { getClipById, updateClip, deleteClip } from '@/lib/db'
import fs from 'fs'

export async function GET(_req: NextRequest, { params }: { params: { id: string } }) {
  const clip = getClipById(params.id)
  if (!clip) return NextResponse.json({ error: 'Not found' }, { status: 404 })
  return NextResponse.json(clip)
}

export async function PATCH(req: NextRequest, { params }: { params: { id: string } }) {
  const body = await req.json()
  const clip = updateClip(params.id, body)
  if (!clip) return NextResponse.json({ error: 'Not found' }, { status: 404 })
  return NextResponse.json(clip)
}

export async function DELETE(_req: NextRequest, { params }: { params: { id: string } }) {
  const clip = getClipById(params.id)
  if (!clip) return NextResponse.json({ error: 'Not found' }, { status: 404 })

  const deleted = deleteClip(params.id)
  if (deleted && clip.filepath) {
    try { fs.unlinkSync(clip.filepath) } catch { /* file already gone */ }
  }
  return NextResponse.json({ ok: true })
}
