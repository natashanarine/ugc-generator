import { NextRequest, NextResponse } from 'next/server'
import { v4 as uuidv4 } from 'uuid'
import path from 'path'
import fs from 'fs'
import {
  getRecipeById,
  getClipById,
  getOverlayById,
  insertVariant,
  updateVariant,
  deleteVariantsByRecipe,
  type VariantCombo,
  type ClipSection,
} from '@/lib/db'
import { buildVariantCombos, buildOutputFilename } from '@/lib/variant-generator'
import { renderVariant, isFfmpegAvailable, type SectionInput } from '@/lib/ffmpeg'

const OUTPUT_BASE = path.join(process.cwd(), 'data', 'output')

// In-memory queue state (single-server local tool — no need for Redis etc.)
// Maps recipeId → { running, queue }
const renderQueues: Map<string, { running: number; total: number; done: number; failed: number }> = new Map()

export async function POST(req: NextRequest) {
  const body = await req.json()
  const { recipe_id, replace = false } = body

  if (!recipe_id) return NextResponse.json({ error: 'recipe_id required' }, { status: 400 })

  const recipe = getRecipeById(recipe_id)
  if (!recipe) return NextResponse.json({ error: 'Recipe not found' }, { status: 404 })

  if (replace) {
    deleteVariantsByRecipe(recipe_id)
  }

  // Build combos and insert as pending
  const entries = buildVariantCombos(recipe, recipe_id)
  const variants = entries.map((e, i) => {
    const filename = buildOutputFilename(recipe.name, i + 1, e.combo)
    return insertVariant({ ...e, output_filepath: null })
  })

  const recipeOutputDir = path.join(OUTPUT_BASE, recipe_id)
  fs.mkdirSync(recipeOutputDir, { recursive: true })

  // Fire off background processing (no await — returns immediately)
  processQueue(recipe_id, recipeOutputDir, recipe.name).catch(console.error)

  return NextResponse.json({ enqueued: variants.length, recipe_id }, { status: 202 })
}

export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url)
  const recipe_id = searchParams.get('recipe_id')

  if (!recipe_id) return NextResponse.json({ error: 'recipe_id required' }, { status: 400 })

  const state = renderQueues.get(recipe_id)
  return NextResponse.json(state ?? { running: 0, total: 0, done: 0, failed: 0 })
}

const CONCURRENCY = 2

async function processQueue(recipe_id: string, outputDir: string, recipeName: string) {
  const { getDb } = await import('@/lib/db')
  const db = getDb()

  const pendingVariants = () =>
    db.prepare("SELECT id, combo FROM generated_variants WHERE recipe_id = ? AND status = 'pending'")
      .all(recipe_id) as Array<{ id: string; combo: string }>

  const total = (db.prepare("SELECT COUNT(*) as n FROM generated_variants WHERE recipe_id = ?").get(recipe_id) as { n: number }).n
  renderQueues.set(recipe_id, { running: 0, total, done: 0, failed: 0 })

  async function runOne(id: string, combo: VariantCombo, index: number) {
    const state = renderQueues.get(recipe_id)!
    state.running++
    renderQueues.set(recipe_id, state)

    updateVariant(id, { status: 'rendering' })

    try {
      const filename = buildOutputFilename(recipeName, index, combo)
      const outputPath = path.join(outputDir, filename)
      const sections = await buildSectionInputs(combo)

      await renderVariant({
        sections,
        editPreset: combo.edit_preset as 'hard_cut' | 'crossfade' | 'zoom_punch',
        outputPath,
      })

      updateVariant(id, { status: 'done', output_filepath: outputPath })
      state.done++
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err)
      updateVariant(id, { status: 'failed', error: msg })
      state.failed++
    } finally {
      state.running--
      renderQueues.set(recipe_id, state)
    }
  }

  let index = 1
  const activePromises: Promise<void>[] = []

  while (true) {
    const pending = pendingVariants()
    if (pending.length === 0 && activePromises.length === 0) break

    while (pending.length > 0 && activePromises.length < CONCURRENCY) {
      const { id, combo: comboStr } = pending.shift()!
      const combo: VariantCombo = JSON.parse(comboStr)
      const p = runOne(id, combo, index++).then(() => {
        const idx = activePromises.indexOf(p)
        if (idx !== -1) activePromises.splice(idx, 1)
      })
      activePromises.push(p)
    }

    if (activePromises.length > 0) {
      await Promise.race(activePromises)
    } else if (pending.length === 0) {
      break
    }
  }

  await Promise.all(activePromises)
}

async function buildSectionInputs(combo: VariantCombo): Promise<SectionInput[]> {
  const inputs: SectionInput[] = []
  const sections: ClipSection[] = ['hook', 'problem', 'solution', 'demo', 'cta']

  const hookOverlay = combo.hook_overlay_id ? getOverlayById(combo.hook_overlay_id) : null
  const ctaOverlay = combo.cta_overlay_id ? getOverlayById(combo.cta_overlay_id) : null

  for (const section of sections) {
    const clipIdOrIds = combo.clips[section]
    if (!clipIdOrIds) continue

    const clipIds = Array.isArray(clipIdOrIds) ? clipIdOrIds : [clipIdOrIds]

    for (const clipId of clipIds) {
      if (!clipId) continue
      const clip = getClipById(clipId)
      if (!clip) continue

      let overlay = undefined
      if (section === 'hook' && hookOverlay) {
        overlay = { preset: hookOverlay.style_preset as 'default' | 'bold' | 'subtle', text: hookOverlay.text }
      }
      if (section === 'cta' && ctaOverlay) {
        overlay = { preset: ctaOverlay.style_preset as 'default' | 'bold' | 'subtle', text: ctaOverlay.text }
      }

      inputs.push({
        filepath: clip.filepath,
        trim_in: clip.trim_in,
        trim_out: clip.trim_out,
        speed: combo.speed,
        overlay,
      })
    }
  }

  return inputs
}
