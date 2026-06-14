'use client'

import { useState, useEffect, useCallback, useMemo } from 'react'
import { useRouter } from 'next/navigation'
import type { Clip, TextOverlay, VariantRecipe, ClipSection } from '@/lib/db'
import { countPossibleCombos } from '@/lib/variant-generator'

const ALL_SECTIONS: ClipSection[] = ['hook', 'problem', 'solution', 'demo', 'cta']
const EDIT_PRESETS = ['hard_cut', 'crossfade', 'zoom_punch']
const SPEED_OPTIONS = [0.85, 1, 1.15, 1.3, 1.5]
const SECTION_COLORS: Record<ClipSection, string> = {
  hook: 'bg-violet-100 text-violet-700',
  problem: 'bg-orange-100 text-orange-700',
  solution: 'bg-blue-100 text-blue-700',
  demo: 'bg-green-100 text-green-700',
  cta: 'bg-pink-100 text-pink-700',
}

export default function BuilderPage() {
  const router = useRouter()

  // Recipe selection
  const [recipes, setRecipes] = useState<VariantRecipe[]>([])
  const [selectedRecipeId, setSelectedRecipeId] = useState<string | 'new'>('new')
  const [recipeName, setRecipeName] = useState('')
  const [saving, setSaving] = useState(false)

  // Data
  const [allClips, setAllClips] = useState<Clip[]>([])
  const [allOverlays, setAllOverlays] = useState<TextOverlay[]>([])

  // Recipe state
  const [sections, setSections] = useState<ClipSection[]>(['hook', 'problem', 'solution', 'demo', 'cta'])
  const [clipPool, setClipPool] = useState<Partial<Record<ClipSection, string[]>>>({})
  const [overlayPool, setOverlayPool] = useState<{ hook: string[]; cta: string[] }>({ hook: [], cta: [] })
  const [speedOptions, setSpeedOptions] = useState<number[]>([1])
  const [editPresets, setEditPresets] = useState<string[]>(['hard_cut'])
  const [topicAxis, setTopicAxis] = useState<string[]>([])
  const [topicInput, setTopicInput] = useState('')
  const [targetCount, setTargetCount] = useState(20)

  // Filter state for clip picker
  const [filterTopic, setFilterTopic] = useState<Record<ClipSection, string>>({} as Record<ClipSection, string>)
  const [filterStyle, setFilterStyle] = useState<Record<ClipSection, string>>({} as Record<ClipSection, string>)

  const fetchAll = useCallback(async () => {
    const [r, c, o] = await Promise.all([
      fetch('/api/recipes').then(r => r.json()),
      fetch('/api/clips').then(r => r.json()),
      fetch('/api/text-overlays').then(r => r.json()),
    ])
    setRecipes(r)
    setAllClips(c)
    setAllOverlays(o)
  }, [])

  useEffect(() => { fetchAll() }, [fetchAll])

  const loadRecipe = (recipe: VariantRecipe) => {
    setRecipeName(recipe.name)
    setSections(recipe.sections)
    setClipPool(recipe.clip_pool)
    setOverlayPool(recipe.overlay_pool)
    setSpeedOptions(recipe.speed_options)
    setEditPresets(recipe.edit_presets)
    setTopicAxis(recipe.topic_axis)
    setTargetCount(recipe.target_count)
  }

  const handleRecipeSelect = (id: string) => {
    setSelectedRecipeId(id)
    if (id === 'new') {
      setRecipeName('')
      setSections(['hook', 'problem', 'solution', 'demo', 'cta'])
      setClipPool({})
      setOverlayPool({ hook: [], cta: [] })
      setSpeedOptions([1])
      setEditPresets(['hard_cut'])
      setTopicAxis([])
      setTargetCount(20)
    } else {
      const recipe = recipes.find(r => r.id === id)
      if (recipe) loadRecipe(recipe)
    }
  }

  // Live combo count (reuse the same logic from variant-generator)
  const possibleCount = useMemo(() => {
    const draft: VariantRecipe = {
      id: 'draft',
      name: recipeName,
      sections,
      clip_pool: clipPool as Record<ClipSection, string[]>,
      overlay_pool: overlayPool,
      speed_options: speedOptions,
      speed_sections: [],
      edit_presets: editPresets,
      topic_axis: topicAxis,
      target_count: targetCount,
      created_at: '',
    }
    try { return countPossibleCombos(draft) } catch { return 0 }
  }, [sections, clipPool, overlayPool, speedOptions, editPresets, topicAxis, targetCount, recipeName])

  const toggleClip = (section: ClipSection, clipId: string) => {
    const current = clipPool[section] ?? []
    setClipPool(prev => ({
      ...prev,
      [section]: current.includes(clipId) ? current.filter(id => id !== clipId) : [...current, clipId],
    }))
  }

  const toggleOverlay = (section: 'hook' | 'cta', id: string) => {
    const current = overlayPool[section] ?? []
    setOverlayPool(prev => ({
      ...prev,
      [section]: current.includes(id) ? current.filter(x => x !== id) : [...current, id],
    }))
  }

  const toggleSpeed = (s: number) => {
    setSpeedOptions(prev => prev.includes(s) ? prev.filter(x => x !== s) : [...prev, s].sort())
  }

  const toggleEditPreset = (p: string) => {
    setEditPresets(prev => prev.includes(p) ? prev.filter(x => x !== p) : [...prev, p])
  }

  const addTopic = () => {
    const t = topicInput.trim()
    if (t && !topicAxis.includes(t)) setTopicAxis(prev => [...prev, t])
    setTopicInput('')
  }

  const save = async () => {
    if (!recipeName.trim()) { alert('Recipe needs a name'); return }
    setSaving(true)
    const body = {
      name: recipeName,
      sections,
      clip_pool: clipPool,
      overlay_pool: overlayPool,
      speed_options: speedOptions,
      speed_sections: [],
      edit_presets: editPresets,
      topic_axis: topicAxis,
      target_count: targetCount,
    }

    if (selectedRecipeId !== 'new') {
      await fetch(`/api/recipes/${selectedRecipeId}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      })
    } else {
      const res = await fetch('/api/recipes', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      })
      const recipe = await res.json()
      setSelectedRecipeId(recipe.id)
    }
    await fetchAll()
    setSaving(false)
  }

  const saveAndGenerate = async () => {
    await save()
    router.push('/generate')
  }

  const allTopics = Array.from(new Set(allClips.flatMap(c => c.topics))).sort()
  const allStyles = Array.from(new Set(allClips.map(c => c.format_style).filter(Boolean))).sort()

  return (
    <div className="p-8 max-w-6xl mx-auto">
      <div className="flex items-start justify-between mb-8">
        <div>
          <h1 className="text-2xl font-semibold text-gray-900 mb-1">Recipe Builder</h1>
          <p className="text-sm text-gray-400">Configure which clips, texts, speeds, and edits to mix</p>
        </div>
        <div className="flex gap-2">
          <button onClick={save} disabled={saving} className="px-4 py-2 text-sm border border-gray-200 text-gray-700 rounded-lg hover:bg-gray-50">
            {saving ? 'Saving…' : 'Save'}
          </button>
          <button onClick={saveAndGenerate} disabled={saving} className="px-4 py-2 text-sm bg-indigo-600 text-white rounded-lg hover:bg-indigo-700 font-medium">
            Save & Generate →
          </button>
        </div>
      </div>

      {/* Recipe picker + name */}
      <div className="bg-white border border-gray-100 rounded-2xl p-6 mb-6">
        <div className="grid grid-cols-2 gap-4">
          <div>
            <label className="block text-xs text-gray-500 mb-1">Recipe</label>
            <select
              value={selectedRecipeId}
              onChange={e => handleRecipeSelect(e.target.value)}
              className="w-full text-sm border border-gray-200 rounded-lg px-3 py-2 bg-white focus:outline-none focus:ring-2 focus:ring-indigo-500"
            >
              <option value="new">+ New recipe</option>
              {recipes.map(r => <option key={r.id} value={r.id}>{r.name}</option>)}
            </select>
          </div>
          <div>
            <label className="block text-xs text-gray-500 mb-1">Name</label>
            <input
              value={recipeName}
              onChange={e => setRecipeName(e.target.value)}
              placeholder="e.g. ADHD Students Q3 Test"
              className="w-full text-sm border border-gray-200 rounded-lg px-3 py-2 focus:outline-none focus:ring-2 focus:ring-indigo-500"
            />
          </div>
        </div>
      </div>

      {/* Combo counter */}
      <div className="bg-indigo-50 border border-indigo-100 rounded-xl px-5 py-4 mb-6 flex items-center justify-between">
        <div>
          <p className="text-xs text-indigo-500 font-medium uppercase tracking-wide">Possible combinations</p>
          <p className="text-2xl font-semibold text-indigo-700">{possibleCount.toLocaleString()}</p>
        </div>
        <div>
          <p className="text-xs text-indigo-500 font-medium uppercase tracking-wide">Requesting</p>
          <div className="flex items-center gap-2">
            <input
              type="number"
              value={targetCount}
              min={1}
              max={500}
              onChange={e => setTargetCount(Number(e.target.value))}
              className="w-20 text-xl font-semibold text-indigo-700 bg-transparent border-b border-indigo-200 focus:outline-none text-center"
            />
          </div>
        </div>
        <div className="text-right">
          <p className="text-xs text-indigo-400">
            {possibleCount >= targetCount
              ? `Sampling ${targetCount} of ${possibleCount.toLocaleString()}`
              : `${possibleCount} < ${targetCount} requested — all used`}
          </p>
        </div>
      </div>

      <div className="grid grid-cols-5 gap-6">
        {/* Left col: sections + speeds + edits + topics */}
        <div className="col-span-2 space-y-6">
          {/* Sections */}
          <div className="bg-white border border-gray-100 rounded-2xl p-5">
            <h3 className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-3">Sections</h3>
            <div className="space-y-2">
              {ALL_SECTIONS.map(s => (
                <label key={s} className="flex items-center gap-3 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={sections.includes(s)}
                    onChange={e => setSections(prev => e.target.checked ? [...prev, s] : prev.filter(x => x !== s))}
                    className="rounded border-gray-300 text-indigo-600 focus:ring-indigo-500"
                  />
                  <span className={`text-xs font-medium px-2 py-0.5 rounded ${SECTION_COLORS[s]}`}>{s}</span>
                  <span className="text-xs text-gray-400">{(clipPool[s] ?? []).length} clips selected</span>
                </label>
              ))}
            </div>
          </div>

          {/* Speed */}
          <div className="bg-white border border-gray-100 rounded-2xl p-5">
            <h3 className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-3">Speed options</h3>
            <div className="flex flex-wrap gap-2">
              {SPEED_OPTIONS.map(s => (
                <button
                  key={s}
                  onClick={() => toggleSpeed(s)}
                  className={`px-3 py-1.5 text-xs rounded-lg font-medium transition-colors ${speedOptions.includes(s) ? 'bg-indigo-600 text-white' : 'bg-gray-100 text-gray-600 hover:bg-gray-200'}`}
                >
                  {s}x
                </button>
              ))}
            </div>
          </div>

          {/* Edit presets */}
          <div className="bg-white border border-gray-100 rounded-2xl p-5">
            <h3 className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-3">Edit / Transitions</h3>
            <div className="space-y-2">
              {EDIT_PRESETS.map(p => (
                <label key={p} className="flex items-center gap-3 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={editPresets.includes(p)}
                    onChange={() => toggleEditPreset(p)}
                    className="rounded border-gray-300 text-indigo-600 focus:ring-indigo-500"
                  />
                  <span className="text-sm text-gray-700">{p.replace(/_/g, ' ')}</span>
                </label>
              ))}
            </div>
          </div>

          {/* Topic axis */}
          <div className="bg-white border border-gray-100 rounded-2xl p-5">
            <h3 className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-3">Topic / Audience Axis</h3>
            <p className="text-xs text-gray-400 mb-3">Hook clip + hook text + CTA will be matched to the same topic within each variant.</p>
            <div className="flex flex-wrap gap-1.5 mb-3">
              {topicAxis.map(t => (
                <span key={t} className="flex items-center gap-1 bg-indigo-50 text-indigo-600 text-xs px-2 py-1 rounded-lg">
                  {t}
                  <button onClick={() => setTopicAxis(prev => prev.filter(x => x !== t))} className="opacity-50 hover:opacity-100 ml-1">×</button>
                </span>
              ))}
            </div>
            {allTopics.length > 0 && (
              <div className="flex flex-wrap gap-1 mb-2">
                {allTopics.filter(t => !topicAxis.includes(t)).map(t => (
                  <button key={t} onClick={() => setTopicAxis(prev => [...prev, t])} className="text-[10px] bg-gray-100 text-gray-500 px-2 py-0.5 rounded hover:bg-indigo-50 hover:text-indigo-600">+{t}</button>
                ))}
              </div>
            )}
            <div className="flex gap-2">
              <input
                value={topicInput}
                onChange={e => setTopicInput(e.target.value)}
                onKeyDown={e => e.key === 'Enter' && addTopic()}
                placeholder="Add topic…"
                className="flex-1 text-xs border border-gray-200 rounded-lg px-3 py-1.5 focus:outline-none focus:ring-2 focus:ring-indigo-500"
              />
              <button onClick={addTopic} className="text-xs px-3 py-1.5 bg-gray-100 text-gray-600 rounded-lg hover:bg-gray-200">Add</button>
            </div>
          </div>
        </div>

        {/* Right col: clip and overlay selectors */}
        <div className="col-span-3 space-y-6">
          {/* Clip pools per section */}
          {ALL_SECTIONS.filter(s => sections.includes(s)).map(section => {
            const selected = clipPool[section] ?? []
            const fTopic = filterTopic[section] ?? ''
            const fStyle = filterStyle[section] ?? ''
            const available = allClips.filter(c => {
              if (c.section !== section) return false
              if (fTopic && !c.topics.includes(fTopic)) return false
              if (fStyle && c.format_style !== fStyle) return false
              return true
            })
            return (
              <div key={section} className="bg-white border border-gray-100 rounded-2xl p-5">
                <div className="flex items-center justify-between mb-3">
                  <div className="flex items-center gap-2">
                    <span className={`text-xs font-semibold px-2 py-0.5 rounded ${SECTION_COLORS[section]}`}>{section}</span>
                    <span className="text-xs text-gray-400">{selected.length} selected</span>
                  </div>
                  <div className="flex gap-2">
                    {allTopics.length > 0 && (
                      <select
                        value={fTopic}
                        onChange={e => setFilterTopic(p => ({ ...p, [section]: e.target.value }))}
                        className="text-xs border border-gray-200 rounded-lg px-2 py-1 bg-white focus:outline-none"
                      >
                        <option value="">All topics</option>
                        {allTopics.map(t => <option key={t} value={t}>{t}</option>)}
                      </select>
                    )}
                    {allStyles.length > 0 && (
                      <select
                        value={fStyle}
                        onChange={e => setFilterStyle(p => ({ ...p, [section]: e.target.value }))}
                        className="text-xs border border-gray-200 rounded-lg px-2 py-1 bg-white focus:outline-none"
                      >
                        <option value="">All styles</option>
                        {allStyles.map(s => <option key={s} value={s}>{s}</option>)}
                      </select>
                    )}
                  </div>
                </div>
                {available.length === 0 ? (
                  <p className="text-xs text-gray-300 italic">No clips in library for this section</p>
                ) : (
                  <div className="grid grid-cols-4 gap-2">
                    {available.map(clip => {
                      const isSelected = selected.includes(clip.id)
                      return (
                        <button
                          key={clip.id}
                          onClick={() => toggleClip(section, clip.id)}
                          className={`relative rounded-lg overflow-hidden aspect-[9/16] transition-all ${isSelected ? 'ring-2 ring-indigo-500' : 'ring-1 ring-gray-100 opacity-60 hover:opacity-100'}`}
                        >
                          <video
                            src={`/api/video?path=${encodeURIComponent(clip.filepath)}`}
                            className="w-full h-full object-cover"
                            preload="metadata"
                            muted
                            playsInline
                          />
                          {isSelected && (
                            <div className="absolute top-1 right-1 w-4 h-4 bg-indigo-600 rounded-full flex items-center justify-center">
                              <span className="text-white text-[8px]">✓</span>
                            </div>
                          )}
                          <div className="absolute bottom-0 inset-x-0 bg-gradient-to-t from-black/60 p-1">
                            <p className="text-[9px] text-white truncate">{clip.filename}</p>
                          </div>
                        </button>
                      )
                    })}
                  </div>
                )}
              </div>
            )
          })}

          {/* Hook text overlays */}
          {sections.includes('hook') && (
            <OverlaySelector
              title="Hook Text"
              section="hook"
              overlays={allOverlays.filter(o => o.section === 'hook')}
              selected={overlayPool.hook}
              onToggle={(id) => toggleOverlay('hook', id)}
            />
          )}

          {/* CTA text overlays */}
          {sections.includes('cta') && (
            <OverlaySelector
              title="CTA Text"
              section="cta"
              overlays={allOverlays.filter(o => o.section === 'cta')}
              selected={overlayPool.cta}
              onToggle={(id) => toggleOverlay('cta', id)}
            />
          )}
        </div>
      </div>
    </div>
  )
}

function OverlaySelector({
  title, overlays, selected, onToggle,
}: {
  title: string
  section: 'hook' | 'cta'
  overlays: TextOverlay[]
  selected: string[]
  onToggle: (id: string) => void
}) {
  return (
    <div className="bg-white border border-gray-100 rounded-2xl p-5">
      <div className="flex items-center gap-2 mb-3">
        <h3 className="text-xs font-semibold text-gray-700">{title}</h3>
        <span className="text-xs text-gray-400">{selected.length} selected</span>
      </div>
      {overlays.length === 0 ? (
        <p className="text-xs text-gray-300 italic">No text overlays — add them in the Text tab</p>
      ) : (
        <div className="space-y-1.5">
          {overlays.map(o => {
            const isSelected = selected.includes(o.id)
            return (
              <button
                key={o.id}
                onClick={() => onToggle(o.id)}
                className={`w-full text-left px-3 py-2.5 rounded-lg border text-sm transition-colors ${isSelected ? 'border-indigo-300 bg-indigo-50 text-indigo-700' : 'border-gray-100 bg-gray-50 text-gray-600 hover:bg-gray-100'}`}
              >
                <div className="flex items-center justify-between gap-2">
                  <span className="flex-1 truncate">{o.text}</span>
                  <div className="flex gap-1.5 shrink-0">
                    <span className="text-[10px] opacity-60">{o.style_preset}</span>
                    {o.topic && <span className="text-[10px] opacity-60">{o.topic}</span>}
                    {isSelected && <span className="text-indigo-500 text-[10px]">✓</span>}
                  </div>
                </div>
              </button>
            )
          })}
        </div>
      )}
    </div>
  )
}
