'use client'

import { useState, useEffect, useCallback, useRef } from 'react'
import type { VariantRecipe, GeneratedVariant } from '@/lib/db'

const STATUS_COLORS = {
  pending: 'bg-gray-100 text-gray-500',
  rendering: 'bg-amber-100 text-amber-600',
  done: 'bg-green-100 text-green-700',
  failed: 'bg-red-100 text-red-600',
}

export default function GeneratePage() {
  const [recipes, setRecipes] = useState<VariantRecipe[]>([])
  const [selectedRecipeId, setSelectedRecipeId] = useState('')
  const [variants, setVariants] = useState<GeneratedVariant[]>([])
  const [enqueuing, setEnqueuing] = useState(false)
  const [replace, setReplace] = useState(false)
  const pollRef = useRef<ReturnType<typeof setInterval> | null>(null)
  const [ffmpegWarning, setFfmpegWarning] = useState(false)

  const fetchRecipes = useCallback(async () => {
    const r = await fetch('/api/recipes').then(r => r.json())
    setRecipes(r)
    if (r.length > 0 && !selectedRecipeId) setSelectedRecipeId(r[0].id)
  }, [selectedRecipeId])

  const fetchVariants = useCallback(async (id: string) => {
    if (!id) return
    const v = await fetch(`/api/variants?recipe_id=${id}`).then(r => r.json())
    setVariants(v)
  }, [])

  useEffect(() => { fetchRecipes() }, [fetchRecipes])

  useEffect(() => {
    if (!selectedRecipeId) return
    fetchVariants(selectedRecipeId)
    // Auto-poll while there are rendering/pending jobs
    pollRef.current = setInterval(async () => {
      const v: GeneratedVariant[] = await fetch(`/api/variants?recipe_id=${selectedRecipeId}`).then(r => r.json())
      setVariants(v)
      const active = v.filter(x => x.status === 'pending' || x.status === 'rendering').length
      if (active === 0 && pollRef.current) {
        clearInterval(pollRef.current)
        pollRef.current = null
      }
    }, 2000)
    return () => { if (pollRef.current) clearInterval(pollRef.current) }
  }, [selectedRecipeId, fetchVariants])

  const kickOff = async () => {
    if (!selectedRecipeId) return
    setEnqueuing(true)
    try {
      const res = await fetch('/api/generate', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ recipe_id: selectedRecipeId, replace }),
      })
      const data = await res.json()
      if (data.error?.includes('ffmpeg')) setFfmpegWarning(true)
      await fetchVariants(selectedRecipeId)
      // Start polling
      if (pollRef.current) clearInterval(pollRef.current)
      pollRef.current = setInterval(async () => {
        const v: GeneratedVariant[] = await fetch(`/api/variants?recipe_id=${selectedRecipeId}`).then(r => r.json())
        setVariants(v)
        const active = v.filter(x => x.status === 'pending' || x.status === 'rendering').length
        if (active === 0 && pollRef.current) {
          clearInterval(pollRef.current)
          pollRef.current = null
        }
      }, 2000)
    } finally {
      setEnqueuing(false)
    }
  }

  const deleteVariant = async (id: string) => {
    await fetch(`/api/variants/${id}`, { method: 'DELETE' })
    fetchVariants(selectedRecipeId)
  }

  const counts = {
    pending: variants.filter(v => v.status === 'pending').length,
    rendering: variants.filter(v => v.status === 'rendering').length,
    done: variants.filter(v => v.status === 'done').length,
    failed: variants.filter(v => v.status === 'failed').length,
  }
  const total = variants.length
  const donePercent = total ? Math.round((counts.done / total) * 100) : 0

  const selectedRecipe = recipes.find(r => r.id === selectedRecipeId)

  return (
    <div className="p-8 max-w-5xl mx-auto">
      <h1 className="text-2xl font-semibold text-gray-900 mb-1">Generate</h1>
      <p className="text-sm text-gray-400 mb-8">Kick off a batch render for a recipe</p>

      {ffmpegWarning && (
        <div className="mb-6 bg-amber-50 border border-amber-200 rounded-xl p-4">
          <p className="text-sm text-amber-800 font-medium">ffmpeg not found</p>
          <p className="text-xs text-amber-600 mt-1">Install ffmpeg to render videos: <code className="bg-amber-100 px-1 rounded">brew install ffmpeg</code></p>
        </div>
      )}

      {/* Control panel */}
      <div className="bg-white border border-gray-100 rounded-2xl p-6 mb-8">
        <div className="grid grid-cols-2 gap-4 mb-4">
          <div>
            <label className="block text-xs text-gray-500 mb-1">Recipe</label>
            <select
              value={selectedRecipeId}
              onChange={e => { setSelectedRecipeId(e.target.value); fetchVariants(e.target.value) }}
              className="w-full text-sm border border-gray-200 rounded-lg px-3 py-2 bg-white focus:outline-none focus:ring-2 focus:ring-indigo-500"
            >
              {recipes.length === 0 && <option value="">No recipes — build one first</option>}
              {recipes.map(r => <option key={r.id} value={r.id}>{r.name}</option>)}
            </select>
          </div>
          <div className="flex items-end gap-3">
            <label className="flex items-center gap-2 text-sm text-gray-600 cursor-pointer pb-2">
              <input
                type="checkbox"
                checked={replace}
                onChange={e => setReplace(e.target.checked)}
                className="rounded border-gray-300 text-indigo-600"
              />
              Replace existing variants
            </label>
          </div>
        </div>

        {selectedRecipe && (
          <div className="flex flex-wrap gap-2 mb-4">
            <span className="text-xs bg-gray-100 text-gray-600 px-2 py-1 rounded">{selectedRecipe.target_count} variants target</span>
            <span className="text-xs bg-gray-100 text-gray-600 px-2 py-1 rounded">{selectedRecipe.speed_options.map(s => `${s}x`).join(', ')} speed</span>
            <span className="text-xs bg-gray-100 text-gray-600 px-2 py-1 rounded">{selectedRecipe.edit_presets.join(', ')}</span>
            {selectedRecipe.topic_axis.length > 0 && <span className="text-xs bg-indigo-50 text-indigo-600 px-2 py-1 rounded">topics: {selectedRecipe.topic_axis.join(', ')}</span>}
          </div>
        )}

        <button
          onClick={kickOff}
          disabled={enqueuing || !selectedRecipeId}
          className="px-6 py-2.5 bg-indigo-600 text-white text-sm font-medium rounded-lg hover:bg-indigo-700 disabled:opacity-50"
        >
          {enqueuing ? 'Enqueueing…' : '▶ Start Render'}
        </button>
      </div>

      {/* Progress */}
      {total > 0 && (
        <div className="mb-8">
          <div className="flex items-center justify-between mb-2">
            <p className="text-sm font-medium text-gray-700">{counts.done} / {total} done</p>
            <p className="text-xs text-gray-400">{donePercent}%</p>
          </div>
          <div className="h-2 bg-gray-100 rounded-full overflow-hidden">
            <div
              className="h-full bg-indigo-500 transition-all duration-500"
              style={{ width: `${donePercent}%` }}
            />
          </div>
          <div className="flex gap-4 mt-2">
            {Object.entries(counts).map(([status, n]) => (
              <span key={status} className={`text-xs px-2 py-0.5 rounded ${STATUS_COLORS[status as keyof typeof STATUS_COLORS]}`}>
                {status}: {n}
              </span>
            ))}
          </div>
        </div>
      )}

      {/* Download all */}
      {counts.done > 0 && (
        <div className="mb-6">
          <a
            href={`/api/download-zip?recipe_id=${selectedRecipeId}`}
            className="inline-block px-4 py-2 text-sm border border-gray-200 text-gray-700 rounded-lg hover:bg-gray-50"
          >
            ↓ Download all ({counts.done} videos)
          </a>
        </div>
      )}

      {/* Queue */}
      {variants.length > 0 && (
        <div className="space-y-2">
          {variants.map((v, i) => (
            <VariantRow key={v.id} variant={v} index={i + 1} onDelete={() => deleteVariant(v.id)} />
          ))}
        </div>
      )}

      {variants.length === 0 && selectedRecipeId && (
        <div className="text-center py-16 text-gray-300 text-sm">No variants yet — hit Start Render</div>
      )}
    </div>
  )
}

function VariantRow({ variant, index, onDelete }: { variant: GeneratedVariant; index: number; onDelete: () => void }) {
  const combo = variant.combo
  return (
    <div className={`bg-white border border-gray-100 rounded-xl px-4 py-3 flex items-center gap-4 ${variant.status === 'rendering' ? 'ring-1 ring-amber-200' : ''}`}>
      <span className="text-xs text-gray-300 w-8 text-right shrink-0">#{index}</span>
      <div className="flex-1 min-w-0 flex flex-wrap gap-1.5">
        {combo.topic && <Tag label={`topic: ${combo.topic}`} />}
        <Tag label={`speed: ${combo.speed}x`} />
        <Tag label={`edit: ${combo.edit_preset}`} />
        {Object.entries(combo.clips ?? {}).map(([section, id]) =>
          id ? <Tag key={section} label={`${section}: …${String(Array.isArray(id) ? id[0] : id).slice(-6)}`} /> : null
        )}
      </div>
      <span className={`shrink-0 text-xs px-2 py-0.5 rounded ${STATUS_COLORS[variant.status]}`}>
        {variant.status}
        {variant.status === 'rendering' && <span className="ml-1 animate-pulse">●</span>}
      </span>
      {variant.status === 'done' && variant.output_filepath && (
        <a
          href={`/api/download-zip?variant_id=${variant.id}`}
          className="shrink-0 text-xs text-indigo-600 hover:text-indigo-800"
        >
          ↓
        </a>
      )}
      {variant.status === 'failed' && variant.error && (
        <span className="shrink-0 text-xs text-red-400 max-w-32 truncate" title={variant.error}>
          {variant.error}
        </span>
      )}
      <button onClick={onDelete} className="shrink-0 text-xs text-gray-300 hover:text-red-400">✕</button>
    </div>
  )
}

function Tag({ label }: { label: string }) {
  return (
    <span className="text-[10px] bg-gray-100 text-gray-500 px-2 py-0.5 rounded">{label}</span>
  )
}
