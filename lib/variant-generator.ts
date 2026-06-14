import { v4 as uuidv4 } from 'uuid'
import type { VariantRecipe, ClipSection, VariantCombo } from './db'

// All possible combos: hook_clip × hook_overlay × topic × [middle clips per section] × cta_clip × cta_overlay × speed × edit_preset
// Constrained so that topic stays coherent (hook_clip, hook_overlay, cta_overlay are matched to topic axis)

export interface ComboSeed {
  topic: string
  edit_preset: string
  speed: number
  clips: Record<ClipSection, string | string[]>
  hook_overlay_id?: string
  cta_overlay_id?: string
}

export function countPossibleCombos(recipe: VariantRecipe): number {
  const { clip_pool, overlay_pool, speed_options, edit_presets, topic_axis, sections } = recipe

  // Per-section clip counts
  let perSectionProduct = 1
  for (const section of sections) {
    const pool = clip_pool[section] ?? []
    if (pool.length > 0) perSectionProduct *= pool.length
  }

  const hookOverlays = overlay_pool.hook?.length ?? 0
  const ctaOverlays = overlay_pool.cta?.length ?? 0

  const overlayFactor = Math.max(hookOverlays, 1) * Math.max(ctaOverlays, 1)
  const speedFactor = Math.max(speed_options.length, 1)
  const editFactor = Math.max(edit_presets.length, 1)
  const topicFactor = Math.max(topic_axis.length, 1)

  return perSectionProduct * overlayFactor * speedFactor * editFactor * topicFactor
}

// Build the full cartesian product (or as much as we need)
// Returns an array of VariantCombo objects, sampled to targetCount
export function buildVariantCombos(
  recipe: VariantRecipe,
  recipeId: string,
): Array<{ id: string; recipe_id: string; combo: VariantCombo; status: 'pending'; error: null; notes: string; output_filepath: null }> {
  const { clip_pool, overlay_pool, speed_options, edit_presets, topic_axis, sections, target_count, name } = recipe

  // Enumerate axes
  const topics = topic_axis.length > 0 ? topic_axis : ['general']
  const speeds = speed_options.length > 0 ? speed_options : [1]
  const edits = edit_presets.length > 0 ? edit_presets : ['hard_cut']
  const hookOverlays = overlay_pool.hook?.length > 0 ? overlay_pool.hook : [undefined]
  const ctaOverlays = overlay_pool.cta?.length > 0 ? overlay_pool.cta : [undefined]

  // Get per-section clip arrays (non-empty only)
  const sectionPools: Record<string, string[]> = {}
  for (const section of sections) {
    const pool = clip_pool[section] ?? []
    sectionPools[section] = pool.length > 0 ? pool : ['__none__']
  }

  // Enumerate all combos lazily up to a cap to avoid memory explosion
  // Strategy: if space > target_count * 5, randomly sample instead
  const possibleCount = countPossibleCombos(recipe)
  const shouldSample = possibleCount > target_count * 5

  const combos: ComboSeed[] = []

  if (shouldSample) {
    // Random sampling with even spread across topics
    const perTopic = Math.ceil(target_count / topics.length)
    for (const topic of topics) {
      for (let t = 0; t < perTopic && combos.length < target_count; t++) {
        combos.push(randomCombo(topic, speeds, edits, hookOverlays, ctaOverlays, sectionPools, sections))
      }
    }
    // Fill remaining if any
    while (combos.length < target_count) {
      const topic = topics[combos.length % topics.length]
      combos.push(randomCombo(topic, speeds, edits, hookOverlays, ctaOverlays, sectionPools, sections))
    }
  } else {
    // Full enumeration then sample
    const allCombos = enumerateAll(topics, speeds, edits, hookOverlays, ctaOverlays, sectionPools, sections)
    const sampled = sample(allCombos, target_count)
    combos.push(...sampled)
  }

  // Deduplicate by JSON signature
  const seen = new Set<string>()
  const unique = combos.filter(c => {
    const sig = JSON.stringify({ ...c })
    if (seen.has(sig)) return false
    seen.add(sig)
    return true
  })

  const safeName = name.toLowerCase().replace(/[^a-z0-9]+/g, '_')

  return unique.slice(0, target_count).map((combo, i) => ({
    id: uuidv4(),
    recipe_id: recipeId,
    combo: combo as VariantCombo,
    status: 'pending' as const,
    error: null,
    notes: '',
    output_filepath: null,
  }))
}

function randomCombo(
  topic: string,
  speeds: number[],
  edits: string[],
  hookOverlays: (string | undefined)[],
  ctaOverlays: (string | undefined)[],
  sectionPools: Record<string, string[]>,
  sections: ClipSection[],
): ComboSeed {
  const clips: Record<string, string | string[]> = {}
  for (const section of sections) {
    const pool = sectionPools[section]
    const pick = pool[Math.floor(Math.random() * pool.length)]
    clips[section] = pick === '__none__' ? '' : pick
  }
  return {
    topic,
    edit_preset: edits[Math.floor(Math.random() * edits.length)],
    speed: speeds[Math.floor(Math.random() * speeds.length)],
    clips: clips as Record<ClipSection, string | string[]>,
    hook_overlay_id: hookOverlays[Math.floor(Math.random() * hookOverlays.length)] as string | undefined,
    cta_overlay_id: ctaOverlays[Math.floor(Math.random() * ctaOverlays.length)] as string | undefined,
  }
}

function enumerateAll(
  topics: string[],
  speeds: number[],
  edits: string[],
  hookOverlays: (string | undefined)[],
  ctaOverlays: (string | undefined)[],
  sectionPools: Record<string, string[]>,
  sections: ClipSection[],
): ComboSeed[] {
  const all: ComboSeed[] = []

  function recurse(sectionIdx: number, current: Record<string, string>) {
    if (sectionIdx === sections.length) {
      for (const topic of topics) {
        for (const speed of speeds) {
          for (const edit_preset of edits) {
            for (const ho of hookOverlays) {
              for (const co of ctaOverlays) {
                all.push({
                  topic,
                  speed,
                  edit_preset,
                  clips: { ...current } as Record<ClipSection, string | string[]>,
                  hook_overlay_id: ho as string | undefined,
                  cta_overlay_id: co as string | undefined,
                })
              }
            }
          }
        }
      }
      return
    }
    const section = sections[sectionIdx]
    const pool = sectionPools[section]
    for (const clip of pool) {
      recurse(sectionIdx + 1, { ...current, [section]: clip === '__none__' ? '' : clip })
    }
  }

  recurse(0, {})
  return all
}

function sample<T>(arr: T[], n: number): T[] {
  if (arr.length <= n) return [...arr]
  const result: T[] = []
  const used = new Set<number>()
  while (result.length < n) {
    const idx = Math.floor(Math.random() * arr.length)
    if (!used.has(idx)) {
      used.add(idx)
      result.push(arr[idx])
    }
  }
  return result
}

// Build a human-readable output filename
export function buildOutputFilename(
  recipeName: string,
  variantIndex: number,
  combo: VariantCombo,
): string {
  const safe = (s: string) => String(s ?? '').toLowerCase().replace(/[^a-z0-9]+/g, '-').slice(0, 20)
  const hookId = Array.isArray(combo.clips.hook)
    ? combo.clips.hook[0]
    : combo.clips.hook ?? ''
  const ctaId = Array.isArray(combo.clips.cta)
    ? combo.clips.cta[0]
    : combo.clips.cta ?? ''

  return [
    safe(recipeName),
    `v${String(variantIndex).padStart(3, '0')}`,
    `topic-${safe(combo.topic)}`,
    hookId ? `hook-${safe(hookId.slice(-6))}` : null,
    ctaId ? `cta-${safe(ctaId.slice(-6))}` : null,
    `speed-${String(combo.speed).replace('.', 'p')}x`,
    `edit-${safe(combo.edit_preset)}`,
  ]
    .filter(Boolean)
    .join('_') + '.mp4'
}
