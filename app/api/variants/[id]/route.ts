import { NextRequest, NextResponse } from 'next/server'
import { getVariantById, updateVariant, deleteVariant } from '@/lib/db'
import fs from 'fs'

export async function GET(_req: NextRequest, { params }: { params: { id: string } }) {
  const variant = getVariantById(params.id)
  if (!variant) return NextResponse.json({ error: 'Not found' }, { status: 404 })
  return NextResponse.json(variant)
}

export async function PATCH(req: NextRequest, { params }: { params: { id: string } }) {
  const body = await req.json()
  const variant = updateVariant(params.id, body)
  if (!variant) return NextResponse.json({ error: 'Not found' }, { status: 404 })
  return NextResponse.json(variant)
}

export async function DELETE(_req: NextRequest, { params }: { params: { id: string } }) {
  const variant = getVariantById(params.id)
  if (!variant) return NextResponse.json({ error: 'Not found' }, { status: 404 })

  if (variant.output_filepath) {
    try { fs.unlinkSync(variant.output_filepath) } catch { /* file already gone */ }
  }

  deleteVariant(params.id)
  return NextResponse.json({ ok: true })
}
