'use client'

import { useState, useEffect, useCallback } from 'react'
import type { GeneratedVariant, VariantRecipe } from '@/lib/db'

const STATUS_COLORS = {
  pending: 'bg-gray-100 text-gray-400',
  rendering: 'bg-amber-100 text-amber-600',
  done: 'bg-green-100 text-green-700',
  failed: 'bg-red-100 text-red-500',
}

export default function GalleryPage() {
  const [recipes, setRecipes] = useState<VariantRecipe[]>([])
  const [selectedRecipeId, setSelectedRecipeId] = useState<string>('all')
  const [variants, setVariants] = useState<GeneratedVariant[]>([])
  const [filterStatus, setFilterStatus] = useState<string>('all')
  const [sortBy, setSortBy] = useState<'date' | 'topic' | 'speed'>('date')
  const [noteEditing, setNoteEditing] = useState<string | null>(null)
  const [noteValue, setNoteValue] = useState('')

  const fetchAll = useCallback(async () => {
    const [r, v] = await Promise.all([
      fetch('/api/recipes').then(r => r.json()),
      selectedRecipeId === 'all'
        ? fetch('/api/variants').then(r => r.json())
        : fetch(`/api/variants?recipe_id=${selectedRecipeId}`).then(r => r.json()),
    ])
    setRecipes(r)
    setVariants(v)
  }, [selectedRecipeId])

  useEffect(() => { fetchAll() }, [fetchAll])

  const saveNote = async (id: string) => {
    await fetch(`/api/variants/${id}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ notes: noteValue }),
    })
    setNoteEditing(null)
    fetchAll()
  }

  const deleteVariant = async (id: string) => {
    if (!confirm('Delete this variant?')) return
    await fetch(`/api/variants/${id}`, { method: 'DELETE' })
    fetchAll()
  }

  let filtered = variants
  if (filterStatus !== 'all') filtered = filtered.filter(v => v.status === filterStatus)

  filtered = [...filtered].sort((a, b) => {
    if (sortBy === 'topic') return (a.combo.topic ?? '').localeCompare(b.combo.topic ?? '')
    if (sortBy === 'speed') return (a.combo.speed ?? 1) - (b.combo.speed ?? 1)
    return new Date(b.generated_at).getTime() - new Date(a.generated_at).getTime()
  })

  const doneVariants = filtered.filter(v => v.status === 'done')

  return (
    <div className="p-8 max-w-7xl mx-auto">
      <div className="flex items-start justify-between mb-8">
        <div>
          <h1 className="text-2xl font-semibold text-gray-900 mb-1">Gallery</h1>
          <p className="text-sm text-gray-400">{variants.length} variants total</p>
        </div>
        {doneVariants.length > 0 && selectedRecipeId !== 'all' && (
          <a
            href={`/api/download-zip?recipe_id=${selectedRecipeId}`}
            className="px-4 py-2 text-sm border border-gray-200 text-gray-700 rounded-lg hover:bg-gray-50"
          >
            ↓ Download all ({doneVariants.length} videos)
          </a>
        )}
      </div>

      {/* Filters */}
      <div className="flex flex-wrap items-center gap-3 mb-8">
        <select
          value={selectedRecipeId}
          onChange={e => setSelectedRecipeId(e.target.value)}
          className="text-sm border border-gray-200 rounded-lg px-3 py-2 bg-white focus:outline-none focus:ring-2 focus:ring-indigo-500"
        >
          <option value="all">All recipes</option>
          {recipes.map(r => <option key={r.id} value={r.id}>{r.name}</option>)}
        </select>

        <div className="flex gap-1">
          {(['all', 'done', 'rendering', 'pending', 'failed'] as const).map(s => (
            <button
              key={s}
              onClick={() => setFilterStatus(s)}
              className={`px-3 py-1.5 text-xs rounded-lg font-medium transition-colors ${filterStatus === s ? 'bg-gray-900 text-white' : 'bg-white border border-gray-200 text-gray-600 hover:bg-gray-50'}`}
            >
              {s}
            </button>
          ))}
        </div>

        <select
          value={sortBy}
          onChange={e => setSortBy(e.target.value as 'date' | 'topic' | 'speed')}
          className="text-sm border border-gray-200 rounded-lg px-3 py-2 bg-white focus:outline-none focus:ring-2 focus:ring-indigo-500"
        >
          <option value="date">Sort: newest</option>
          <option value="topic">Sort: topic</option>
          <option value="speed">Sort: speed</option>
        </select>
      </div>

      {filtered.length === 0 ? (
        <div className="text-center py-24 text-gray-300 text-sm">No variants here yet</div>
      ) : (
        <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5 gap-5">
          {filtered.map((variant, i) => (
            <VariantCard
              key={variant.id}
              variant={variant}
              index={i + 1}
              noteEditing={noteEditing}
              noteValue={noteValue}
              onStartNote={() => { setNoteEditing(variant.id); setNoteValue(variant.notes) }}
              onNoteChange={setNoteValue}
              onSaveNote={() => saveNote(variant.id)}
              onCancelNote={() => setNoteEditing(null)}
              onDelete={() => deleteVariant(variant.id)}
            />
          ))}
        </div>
      )}
    </div>
  )
}

function VariantCard({
  variant, index, noteEditing, noteValue,
  onStartNote, onNoteChange, onSaveNote, onCancelNote, onDelete,
}: {
  variant: GeneratedVariant
  index: number
  noteEditing: string | null
  noteValue: string
  onStartNote: () => void
  onNoteChange: (v: string) => void
  onSaveNote: () => void
  onCancelNote: () => void
  onDelete: () => void
}) {
  const combo = variant.combo

  return (
    <div className="bg-white border border-gray-100 rounded-xl overflow-hidden group">
      {/* Video preview */}
      <div className="aspect-[9/16] bg-gray-100 relative overflow-hidden">
        {variant.status === 'done' && variant.output_filepath ? (
          <video
            src={`/api/video?path=${encodeURIComponent(variant.output_filepath)}`}
            className="w-full h-full object-cover"
            controls
            preload="metadata"
            muted
            playsInline
          />
        ) : (
          <div className="w-full h-full flex items-center justify-center flex-col gap-2">
            <span className={`text-xs px-2 py-0.5 rounded ${STATUS_COLORS[variant.status]}`}>{variant.status}</span>
            {variant.status === 'rendering' && <div className="w-6 h-6 border-2 border-amber-400 border-t-transparent rounded-full animate-spin" />}
            {variant.status === 'failed' && variant.error && (
              <p className="text-[10px] text-red-400 text-center px-3 mt-1">{variant.error}</p>
            )}
          </div>
        )}
        <div className="absolute top-2 left-2 bg-black/50 text-white text-[10px] px-1.5 py-0.5 rounded">#{index}</div>
      </div>

      {/* Metadata */}
      <div className="p-3">
        <div className="flex flex-wrap gap-1 mb-2">
          {combo.topic && <Tag label={`topic: ${combo.topic}`} color="indigo" />}
          <Tag label={`${combo.speed}x`} />
          <Tag label={combo.edit_preset.replace(/_/g, ' ')} />
        </div>

        {/* Notes */}
        {noteEditing === variant.id ? (
          <div className="mb-2">
            <textarea
              value={noteValue}
              onChange={e => onNoteChange(e.target.value)}
              placeholder="Paste in views, likes, saves…"
              rows={3}
              className="w-full text-xs border border-gray-200 rounded-lg px-2 py-1.5 resize-none focus:outline-none focus:ring-2 focus:ring-indigo-500"
            />
            <div className="flex gap-2 mt-1">
              <button onClick={onSaveNote} className="text-xs text-indigo-600 font-medium">Save</button>
              <button onClick={onCancelNote} className="text-xs text-gray-400">Cancel</button>
            </div>
          </div>
        ) : (
          <button
            onClick={onStartNote}
            className="text-xs text-gray-400 hover:text-gray-600 mb-2 text-left w-full"
          >
            {variant.notes ? <span className="text-gray-600">{variant.notes}</span> : '+ add notes'}
          </button>
        )}

        {/* Actions */}
        <div className="flex gap-2 pt-1 border-t border-gray-50">
          {variant.status === 'done' && variant.output_filepath && (
            <a
              href={`/api/download-zip?variant_id=${variant.id}`}
              className="flex-1 text-center text-xs text-indigo-600 hover:text-indigo-800 py-1"
            >
              ↓ Download
            </a>
          )}
          <button
            onClick={onDelete}
            className="flex-1 text-xs text-gray-300 hover:text-red-400 py-1"
          >
            Delete
          </button>
        </div>
      </div>
    </div>
  )
}

function Tag({ label, color = 'gray' }: { label: string; color?: 'gray' | 'indigo' }) {
  const cls = color === 'indigo'
    ? 'bg-indigo-50 text-indigo-500'
    : 'bg-gray-100 text-gray-400'
  return <span className={`text-[10px] px-1.5 py-0.5 rounded ${cls}`}>{label}</span>
}
