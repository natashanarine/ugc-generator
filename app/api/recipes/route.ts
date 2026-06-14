import { NextRequest, NextResponse } from 'next/server'
import { v4 as uuidv4 } from 'uuid'
import { getAllRecipes, insertRecipe } from '@/lib/db'

export async function GET() {
  return NextResponse.json(getAllRecipes())
}

export async function POST(req: NextRequest) {
  const body = await req.json()
  const {
    name,
    sections = ['hook', 'problem', 'solution', 'demo', 'cta'],
    clip_pool = {},
    overlay_pool = { hook: [], cta: [] },
    speed_options = [1],
    speed_sections = [],
    edit_presets = ['hard_cut'],
    topic_axis = [],
    target_count = 20,
  } = body

  if (!name) return NextResponse.json({ error: 'name required' }, { status: 400 })

  const recipe = insertRecipe({
    id: uuidv4(),
    name,
    sections,
    clip_pool,
    overlay_pool,
    speed_options,
    speed_sections,
    edit_presets,
    topic_axis,
    target_count,
  })
  return NextResponse.json(recipe, { status: 201 })
}
