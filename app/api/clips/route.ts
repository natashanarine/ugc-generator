import { NextRequest, NextResponse } from 'next/server'
import { getAllClips } from '@/lib/db'

export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url)
  const section = searchParams.get('section')
  const topic = searchParams.get('topic')
  const style = searchParams.get('style')

  let clips = getAllClips()

  if (section) clips = clips.filter(c => c.section === section)
  if (topic) clips = clips.filter(c => c.topics.includes(topic))
  if (style) clips = clips.filter(c => c.format_style === style)

  return NextResponse.json(clips)
}
