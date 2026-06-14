import { NextRequest, NextResponse } from 'next/server'
import { v4 as uuidv4 } from 'uuid'
import { getAllOverlays, insertOverlay } from '@/lib/db'

export async function GET() {
  return NextResponse.json(getAllOverlays())
}

export async function POST(req: NextRequest) {
  const body = await req.json()
  const { text, section, style_preset = 'default', topic = '' } = body

  if (!text || !section) {
    return NextResponse.json({ error: 'text and section required' }, { status: 400 })
  }

  const overlay = insertOverlay({ id: uuidv4(), text, section, style_preset, topic })
  return NextResponse.json(overlay, { status: 201 })
}
