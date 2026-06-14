import { NextRequest, NextResponse } from 'next/server'
import { v4 as uuidv4 } from 'uuid'
import path from 'path'
import fs from 'fs'
import { insertClip, probeAndUpdateClip } from '@/lib/db-helpers'
import type { ClipSection } from '@/lib/db'

const UPLOAD_DIR = path.join(process.cwd(), 'data', 'uploads')

export async function POST(req: NextRequest) {
  const formData = await req.formData()
  const file = formData.get('file') as File | null
  const section = formData.get('section') as ClipSection | null
  const topics = formData.get('topics') as string | null
  const format_style = formData.get('format_style') as string | null

  if (!file || !section) {
    return NextResponse.json({ error: 'file and section are required' }, { status: 400 })
  }

  const id = uuidv4()
  const ext = path.extname(file.name) || '.mp4'
  const filename = `${id}${ext}`
  const filepath = path.join(UPLOAD_DIR, filename)

  fs.mkdirSync(UPLOAD_DIR, { recursive: true })

  const buffer = Buffer.from(await file.arrayBuffer())
  fs.writeFileSync(filepath, buffer)

  const parsedTopics: string[] = topics ? JSON.parse(topics) : []

  const clip = insertClip({
    id,
    filename: file.name,
    filepath,
    section,
    topics: parsedTopics,
    format_style: format_style ?? '',
    duration: null,
    trim_in: null,
    trim_out: null,
  })

  // Probe duration in background (non-blocking)
  probeAndUpdateClip(id, filepath).catch(() => {})

  return NextResponse.json(clip, { status: 201 })
}
