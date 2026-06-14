import { NextRequest, NextResponse } from 'next/server'
import fs from 'fs'
import path from 'path'
import { Readable } from 'stream'

// Serves video files from /data/uploads or /data/output with range support
export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url)
  const filepath = searchParams.get('path')

  if (!filepath) return NextResponse.json({ error: 'path required' }, { status: 400 })

  // Security: only allow files under /data/
  const dataRoot = path.join(process.cwd(), 'data')
  const resolved = path.resolve(filepath)
  if (!resolved.startsWith(dataRoot)) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  }

  if (!fs.existsSync(resolved)) {
    return NextResponse.json({ error: 'Not found' }, { status: 404 })
  }

  const stat = fs.statSync(resolved)
  const fileSize = stat.size
  const rangeHeader = req.headers.get('range')

  if (rangeHeader) {
    const parts = rangeHeader.replace(/bytes=/, '').split('-')
    const start = parseInt(parts[0], 10)
    const end = parts[1] ? parseInt(parts[1], 10) : fileSize - 1
    const chunkSize = end - start + 1

    const nodeStream = fs.createReadStream(resolved, { start, end })
    const readable = Readable.toWeb(nodeStream) as ReadableStream

    return new NextResponse(readable, {
      status: 206,
      headers: {
        'Content-Range': `bytes ${start}-${end}/${fileSize}`,
        'Accept-Ranges': 'bytes',
        'Content-Length': String(chunkSize),
        'Content-Type': 'video/mp4',
      },
    })
  }

  const nodeStream = fs.createReadStream(resolved)
  const readable = Readable.toWeb(nodeStream) as ReadableStream

  return new NextResponse(readable, {
    status: 200,
    headers: {
      'Content-Length': String(fileSize),
      'Content-Type': 'video/mp4',
      'Accept-Ranges': 'bytes',
    },
  })
}
