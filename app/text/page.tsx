'use client'

import { useState, useEffect, useCallback } from 'react'
import type { TextOverlay, OverlaySection, StylePreset } from '@/lib/db'

const STYLE_PRESETS: StylePreset[] = ['default', 'bold', 'subtle']
const PRESET_DESCRIPTIONS: Record<StylePreset, string> = {
  default: 'Center screen, white on dark box',
  bold: 'Top third, large white on heavy box',
  subtle: 'Bottom fifth, smaller semi-transparent',
}

export default function TextPage() {
  const [overlays, setOverlays] = useState<TextOverlay[]>([])
  const [newText, setNewText] = useState('')
  const [newSection, setNewSection] = useState<OverlaySection>('hook')
  const [newPreset, setNewPreset] = useState<StylePreset>('default')
  const [newTopic, setNewTopic] = useState('')
  const [editingId, setEditingId] = useState<string | null>(null)
  const [editData, setEditData] = useState<Partial<TextOverlay>>({})

  const fetchOverlays = useCallback(async () => {
    const res = await fetch('/api/text-overlays')
    setOverlays(await res.json())
  }, [])

  useEffect(() => { fetchOverlays() }, [fetchOverlays])

  const addOverlay = async () => {
    if (!newText.trim()) return
    await fetch('/api/text-overlays', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ text: newText, section: newSection, style_preset: newPreset, topic: newTopic }),
    })
    setNewText('')
    setNewTopic('')
    fetchOverlays()
  }

  const saveEdit = async (id: string) => {
    await fetch(`/api/text-overlays/${id}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(editData),
    })
    setEditingId(null)
    fetchOverlays()
  }

  const deleteOverlay = async (id: string) => {
    if (!confirm('Delete this text overlay?')) return
    await fetch(`/api/text-overlays/${id}`, { method: 'DELETE' })
    fetchOverlays()
  }

  const hooks = overlays.filter(o => o.section === 'hook')
  const ctas = overlays.filter(o => o.section === 'cta')

  return (
    <div className="p-8 max-w-4xl mx-auto">
      <h1 className="text-2xl font-semibold text-gray-900 mb-1">Text Overlays</h1>
      <p className="text-sm text-gray-400 mb-8">{overlays.length} overlays total</p>

      {/* Add form */}
      <div className="bg-white border border-gray-100 rounded-2xl p-6 mb-10">
        <h2 className="text-sm font-semibold text-gray-700 mb-4">Add Overlay</h2>
        <div className="mb-3">
          <label className="block text-xs text-gray-500 mb-1">Text</label>
          <textarea
            value={newText}
            onChange={e => setNewText(e.target.value)}
            placeholder="e.g. If you struggle to focus for more than 5 minutes…"
            rows={2}
            className="w-full text-sm border border-gray-200 rounded-lg px-3 py-2 focus:outline-none focus:ring-2 focus:ring-indigo-500 resize-none"
          />
        </div>
        <div className="grid grid-cols-3 gap-4 mb-4">
          <div>
            <label className="block text-xs text-gray-500 mb-1">Section</label>
            <select
              value={newSection}
              onChange={e => setNewSection(e.target.value as OverlaySection)}
              className="w-full text-sm border border-gray-200 rounded-lg px-3 py-2 bg-white focus:outline-none focus:ring-2 focus:ring-indigo-500"
            >
              <option value="hook">Hook</option>
              <option value="cta">CTA</option>
            </select>
          </div>
          <div>
            <label className="block text-xs text-gray-500 mb-1">Style</label>
            <select
              value={newPreset}
              onChange={e => setNewPreset(e.target.value as StylePreset)}
              className="w-full text-sm border border-gray-200 rounded-lg px-3 py-2 bg-white focus:outline-none focus:ring-2 focus:ring-indigo-500"
            >
              {STYLE_PRESETS.map(p => <option key={p} value={p}>{p}</option>)}
            </select>
          </div>
          <div>
            <label className="block text-xs text-gray-500 mb-1">Topic (optional)</label>
            <input
              value={newTopic}
              onChange={e => setNewTopic(e.target.value)}
              placeholder="adhd"
              className="w-full text-sm border border-gray-200 rounded-lg px-3 py-2 focus:outline-none focus:ring-2 focus:ring-indigo-500"
            />
          </div>
        </div>
        <div className="flex justify-end">
          <button
            onClick={addOverlay}
            className="px-4 py-2 text-sm bg-indigo-600 text-white rounded-lg hover:bg-indigo-700 font-medium"
          >
            Add
          </button>
        </div>
      </div>

      {/* Style preview reference */}
      <div className="bg-gray-50 border border-gray-100 rounded-xl p-4 mb-10 grid grid-cols-3 gap-4">
        {STYLE_PRESETS.map(p => (
          <div key={p}>
            <p className="text-xs font-semibold text-gray-700 mb-1 capitalize">{p}</p>
            <p className="text-xs text-gray-400">{PRESET_DESCRIPTIONS[p]}</p>
          </div>
        ))}
      </div>

      {/* Hook overlays */}
      <OverlaySection
        title="Hook Text"
        overlays={hooks}
        editingId={editingId}
        editData={editData}
        onStartEdit={(o) => { setEditingId(o.id); setEditData({ text: o.text, section: o.section, style_preset: o.style_preset, topic: o.topic }) }}
        onSaveEdit={saveEdit}
        onCancelEdit={() => setEditingId(null)}
        onEditChange={(patch) => setEditData(d => ({ ...d, ...patch }))}
        onDelete={deleteOverlay}
      />

      {/* CTA overlays */}
      <OverlaySection
        title="CTA Text"
        overlays={ctas}
        editingId={editingId}
        editData={editData}
        onStartEdit={(o) => { setEditingId(o.id); setEditData({ text: o.text, section: o.section, style_preset: o.style_preset, topic: o.topic }) }}
        onSaveEdit={saveEdit}
        onCancelEdit={() => setEditingId(null)}
        onEditChange={(patch) => setEditData(d => ({ ...d, ...patch }))}
        onDelete={deleteOverlay}
      />
    </div>
  )
}

function OverlaySection({
  title, overlays, editingId, editData,
  onStartEdit, onSaveEdit, onCancelEdit, onEditChange, onDelete,
}: {
  title: string
  overlays: TextOverlay[]
  editingId: string | null
  editData: Partial<TextOverlay>
  onStartEdit: (o: TextOverlay) => void
  onSaveEdit: (id: string) => void
  onCancelEdit: () => void
  onEditChange: (patch: Partial<TextOverlay>) => void
  onDelete: (id: string) => void
}) {
  return (
    <div className="mb-10">
      <div className="flex items-center gap-2 mb-4">
        <h2 className="text-sm font-semibold text-gray-700">{title}</h2>
        <span className="text-xs text-gray-400">{overlays.length}</span>
      </div>
      {overlays.length === 0 ? (
        <p className="text-sm text-gray-300 italic">No overlays yet</p>
      ) : (
        <div className="space-y-2">
          {overlays.map(o => (
            <div key={o.id} className="bg-white border border-gray-100 rounded-xl p-4">
              {editingId === o.id ? (
                <div className="space-y-3">
                  <textarea
                    value={editData.text ?? ''}
                    onChange={e => onEditChange({ text: e.target.value })}
                    rows={2}
                    className="w-full text-sm border border-gray-200 rounded-lg px-3 py-2 focus:outline-none focus:ring-2 focus:ring-indigo-500 resize-none"
                  />
                  <div className="grid grid-cols-3 gap-3">
                    <select
                      value={editData.section}
                      onChange={e => onEditChange({ section: e.target.value as OverlaySection })}
                      className="text-sm border border-gray-200 rounded-lg px-3 py-2 bg-white focus:outline-none focus:ring-2 focus:ring-indigo-500"
                    >
                      <option value="hook">hook</option>
                      <option value="cta">cta</option>
                    </select>
                    <select
                      value={editData.style_preset}
                      onChange={e => onEditChange({ style_preset: e.target.value as StylePreset })}
                      className="text-sm border border-gray-200 rounded-lg px-3 py-2 bg-white focus:outline-none focus:ring-2 focus:ring-indigo-500"
                    >
                      {(['default', 'bold', 'subtle'] as StylePreset[]).map(p => <option key={p} value={p}>{p}</option>)}
                    </select>
                    <input
                      value={editData.topic ?? ''}
                      onChange={e => onEditChange({ topic: e.target.value })}
                      placeholder="topic"
                      className="text-sm border border-gray-200 rounded-lg px-3 py-2 focus:outline-none focus:ring-2 focus:ring-indigo-500"
                    />
                  </div>
                  <div className="flex gap-2 justify-end">
                    <button onClick={onCancelEdit} className="px-3 py-1.5 text-xs text-gray-500 hover:text-gray-700">Cancel</button>
                    <button onClick={() => onSaveEdit(o.id)} className="px-3 py-1.5 text-xs bg-indigo-600 text-white rounded-lg hover:bg-indigo-700">Save</button>
                  </div>
                </div>
              ) : (
                <div className="flex items-start justify-between gap-4">
                  <div className="flex-1 min-w-0">
                    <p className="text-sm text-gray-800">{o.text}</p>
                    <div className="flex gap-2 mt-1.5 flex-wrap">
                      <span className="text-[10px] bg-gray-100 text-gray-500 px-2 py-0.5 rounded">{o.style_preset}</span>
                      {o.topic && <span className="text-[10px] bg-indigo-50 text-indigo-500 px-2 py-0.5 rounded">{o.topic}</span>}
                    </div>
                  </div>
                  <div className="flex gap-2 shrink-0">
                    <button onClick={() => onStartEdit(o)} className="text-xs text-indigo-600 hover:text-indigo-800">Edit</button>
                    <button onClick={() => onDelete(o.id)} className="text-xs text-red-500 hover:text-red-700">Delete</button>
                  </div>
                </div>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  )
}
