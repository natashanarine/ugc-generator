import { NextRequest, NextResponse } from 'next/server'
import { getVariantsByRecipe, getVariantById } from '@/lib/db'
import fs from 'fs'
import path from 'path'
import { Readable } from 'stream'

// eslint-disable-next-line @typescript-eslint/no-require-imports
const archiver = require('archiver') as (format: string, options?: object) => import('archiver').Archiver

export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url)
  const recipe_id = searchParams.get('recipe_id')
  const variant_id = searchParams.get('variant_id')

  let files: Array<{ filepath: string; filename: string }> = []

  if (variant_id) {
    const v = getVariantById(variant_id)
    if (!v?.output_filepath || !fs.existsSync(v.output_filepath)) {
      return NextResponse.json({ error: 'File not found' }, { status: 404 })
    }
    files = [{ filepath: v.output_filepath, filename: path.basename(v.output_filepath) }]
  } else if (recipe_id) {
    const variants = getVariantsByRecipe(recipe_id).filter(
      v => v.status === 'done' && v.output_filepath && fs.existsSync(v.output_filepath)
    )
    files = variants.map(v => ({
      filepath: v.output_filepath!,
      filename: path.basename(v.output_filepath!),
    }))
  }

  if (files.length === 0) {
    return NextResponse.json({ error: 'No files to zip' }, { status: 404 })
  }

  if (files.length === 1) {
    const { filepath, filename } = files[0]
    const stat = fs.statSync(filepath)
    const nodeStream = fs.createReadStream(filepath)
    const readable = Readable.toWeb(nodeStream) as ReadableStream
    return new NextResponse(readable, {
      headers: {
        'Content-Disposition': `attachment; filename="${filename}"`,
        'Content-Type': 'video/mp4',
        'Content-Length': String(stat.size),
      },
    })
  }

  // Multiple files — stream as zip (level 0 = no compression, fast for video)
  const archive = archiver('zip', { zlib: { level: 0 } })
  for (const { filepath, filename } of files) {
    archive.file(filepath, { name: filename })
  }
  archive.finalize()

  const readable = Readable.toWeb(archive as unknown as Readable) as ReadableStream
  const zipName = recipe_id ? `variants_${recipe_id.slice(0, 8)}.zip` : 'variants.zip'

  return new NextResponse(readable, {
    headers: {
      'Content-Disposition': `attachment; filename="${zipName}"`,
      'Content-Type': 'application/zip',
    },
  })
}
