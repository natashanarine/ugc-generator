'use client'

import { useState, useEffect, useCallback } from 'react'
import type { Clip, ClipSection } from '@/lib/db'

const SECTIONS: ClipSection[] = ['hook', 'problem', 'solution', 'demo', 'cta']
const FORMAT_STYLES = ['storytelling', 'talking-head', 'ranking', 'reaction-camera-flip', 'pov', 'b-roll', 'other']
const SECTION_COLORS: Record<ClipSection, string> = {
  hook: 'bg-violet-100 text-violet-700',
  problem: 'bg-orange-100 text-orange-700',
  solution: 'bg-blue-100 text-blue-700',
  demo: 'bg-green-100 text-green-700',
  cta: 'bg-pink-100 text-pink-700',
}

export default function LibraryPage() {
  const [clips, setClips] = useState<Clip[]>([])
  const [filterSection, setFilterSection] = useState<ClipSection | 'all'>('all')
  const [filterTopic, setFilterTopic] = useState('')
  const [uploading, setUploading] = useState(false)
  const [uploadSection, setUploadSection] = useState<ClipSection>('hook')
  const [uploadTopics, setUploadTopics] = useState('')
  const [uploadStyle, setUploadStyle] = useState('')
  const [editingClip, setEditingClip] = useState<Clip | null>(null)
  const [dragOver, setDragOver] = useState(false)

  const fetchClips = useCallback(async () => {
    const res = await fetch('/api/clips')
    const data = await res.json()
    setClips(data)
  }, [])

  useEffect(() => { fetchClips() }, [fetchClips])

  const uploadFile = async (file: File) => {
    setUploading(true)
    try {
      const fd = new FormData()
      fd.append('file', file)
      fd.append('section', uploadSection)
      fd.append('topics', JSON.stringify(uploadTopics.split(',').map(t => t.trim()).filter(Boolean)))
      fd.append('format_style', uploadStyle)
      await fetch('/api/upload', { method: 'POST', body: fd })
      await fetchClips()
    } finally {
      setUploading(false)
    }
  }

  const handleFiles = (files: FileList | null) => {
    if (!files) return
    Array.from(files).forEach(uploadFile)
  }

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault()
    setDragOver(false)
    handleFiles(e.dataTransfer.files)
  }

  const saveEdit = async () => {
    if (!editingClip) return
    await fetch(`/api/clips/${editingClip.id}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        section: editingClip.section,
        topics: editingClip.topics,
        format_style: editingClip.format_style,
        trim_in: editingClip.trim_in,
        trim_out: editingClip.trim_out,
      }),
    })
    setEditingClip(null)
    fetchClips()
  }

  const deleteClip = async (id: string) => {
    if (!confirm('Delete this clip?')) return
    await fetch(`/api/clips/${id}`, { method: 'DELETE' })
    fetchClips()
  }

  const allTopics = Array.from(new Set(clips.flatMap(c => c.topics))).sort()

  const filtered = clips.filter(c => {
    if (filterSection !== 'all' && c.section !== filterSection) return false
    if (filterTopic && !c.topics.includes(filterTopic)) return false
    return true
  })

  const grouped = SECTIONS.reduce((acc, s) => {
    acc[s] = filtered.filter(c => c.section === s)
    return acc
  }, {} as Record<ClipSection, Clip[]>)

  return (
    <div className="p-8 max-w-7xl mx-auto">
      <h1 className="text-2xl font-semibold text-gray-900 mb-1">Clip Library</h1>
      <p className="text-sm text-gray-400 mb-8">{clips.length} clips total</p>

      {/* Upload area */}
      <div className="mb-10 bg-white border border-gray-100 rounded-2xl p-6">
        <h2 className="text-sm font-semibold text-gray-700 mb-4">Upload Clips</h2>
        <div className="grid grid-cols-3 gap-4 mb-4">
          <div>
            <label className="block text-xs text-gray-500 mb-1">Section</label>
            <select
              value={uploadSection}
              onChange={e => setUploadSection(e.target.value as ClipSection)}
              className="w-full text-sm border border-gray-200 rounded-lg px-3 py-2 bg-white focus:outline-none focus:ring-2 focus:ring-indigo-500"
            >
              {SECTIONS.map(s => <option key={s} value={s}>{s}</option>)}
            </select>
          </div>
          <div>
            <label className="block text-xs text-gray-500 mb-1">Topics (comma-separated)</label>
            <input
              value={uploadTopics}
              onChange={e => setUploadTopics(e.target.value)}
              placeholder="adhd, students, general"
              className="w-full text-sm border border-gray-200 rounded-lg px-3 py-2 focus:outline-none focus:ring-2 focus:ring-indigo-500"
            />
          </div>
          <div>
            <label className="block text-xs text-gray-500 mb-1">Format Style</label>
            <select
              value={uploadStyle}
              onChange={e => setUploadStyle(e.target.value)}
              className="w-full text-sm border border-gray-200 rounded-lg px-3 py-2 bg-white focus:outline-none focus:ring-2 focus:ring-indigo-500"
            >
              <option value="">— pick style —</option>
              {FORMAT_STYLES.map(s => <option key={s} value={s}>{s}</option>)}
            </select>
          </div>
        </div>

        <div
          onDrop={handleDrop}
          onDragOver={e => { e.preventDefault(); setDragOver(true) }}
          onDragLeave={() => setDragOver(false)}
          className={`border-2 border-dashed rounded-xl p-10 text-center transition-colors ${dragOver ? 'border-indigo-400 bg-indigo-50' : 'border-gray-200 bg-gray-50'}`}
        >
          <p className="text-sm text-gray-400 mb-3">Drop video files here</p>
          <label className="cursor-pointer">
            <span className="text-sm font-medium text-indigo-600 hover:text-indigo-700">
              {uploading ? 'Uploading…' : 'Browse files'}
            </span>
            <input
              type="file"
              accept="video/*"
              multiple
              className="hidden"
              onChange={e => handleFiles(e.target.files)}
              disabled={uploading}
            />
          </label>
        </div>
      </div>

      {/* Filters */}
      <div className="flex items-center gap-3 mb-6">
        <div className="flex gap-1">
          {(['all', ...SECTIONS] as const).map(s => (
            <button
              key={s}
              onClick={() => setFilterSection(s)}
              className={`px-3 py-1.5 rounded-lg text-xs font-medium transition-colors
                ${filterSection === s ? 'bg-gray-900 text-white' : 'bg-white border border-gray-200 text-gray-600 hover:bg-gray-50'}`}
            >
              {s}
            </button>
          ))}
        </div>
        {allTopics.length > 0 && (
          <select
            value={filterTopic}
            onChange={e => setFilterTopic(e.target.value)}
            className="text-xs border border-gray-200 rounded-lg px-3 py-1.5 bg-white focus:outline-none focus:ring-2 focus:ring-indigo-500"
          >
            <option value="">All topics</option>
            {allTopics.map(t => <option key={t} value={t}>{t}</option>)}
          </select>
        )}
      </div>

      {/* Grid by section */}
      {SECTIONS.map(section => {
        const sectionClips = grouped[section]
        if (filterSection !== 'all' && filterSection !== section) return null
        if (sectionClips.length === 0 && filterSection !== 'all') return null
        return (
          <div key={section} className="mb-10">
            <div className="flex items-center gap-2 mb-4">
              <span className={`px-2 py-0.5 rounded-md text-xs font-semibold uppercase tracking-wide ${SECTION_COLORS[section]}`}>
                {section}
              </span>
              <span className="text-xs text-gray-400">{sectionClips.length} clips</span>
            </div>
            {sectionClips.length === 0 ? (
              <p className="text-sm text-gray-300 italic px-1">No clips yet</p>
            ) : (
              <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5 gap-4">
                {sectionClips.map(clip => (
                  <ClipCard
                    key={clip.id}
                    clip={clip}
                    onEdit={() => setEditingClip({ ...clip })}
                    onDelete={() => deleteClip(clip.id)}
                  />
                ))}
              </div>
            )}
          </div>
        )
      })}

      {/* Edit modal */}
      {editingClip && (
        <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50" onClick={() => setEditingClip(null)}>
          <div className="bg-white rounded-2xl p-6 w-full max-w-md shadow-2xl" onClick={e => e.stopPropagation()}>
            <h3 className="font-semibold text-gray-900 mb-4">Edit Clip</h3>
            <p className="text-xs text-gray-400 mb-4 truncate">{editingClip.filename}</p>

            <label className="block text-xs text-gray-500 mb-1">Section</label>
            <select
              value={editingClip.section}
              onChange={e => setEditingClip({ ...editingClip, section: e.target.value as ClipSection })}
              className="w-full text-sm border border-gray-200 rounded-lg px-3 py-2 mb-3 bg-white focus:outline-none focus:ring-2 focus:ring-indigo-500"
            >
              {SECTIONS.map(s => <option key={s} value={s}>{s}</option>)}
            </select>

            <label className="block text-xs text-gray-500 mb-1">Topics (comma-separated)</label>
            <input
              value={editingClip.topics.join(', ')}
              onChange={e => setEditingClip({ ...editingClip, topics: e.target.value.split(',').map(t => t.trim()).filter(Boolean) })}
              className="w-full text-sm border border-gray-200 rounded-lg px-3 py-2 mb-3 focus:outline-none focus:ring-2 focus:ring-indigo-500"
            />

            <label className="block text-xs text-gray-500 mb-1">Format Style</label>
            <select
              value={editingClip.format_style}
              onChange={e => setEditingClip({ ...editingClip, format_style: e.target.value })}
              className="w-full text-sm border border-gray-200 rounded-lg px-3 py-2 mb-3 bg-white focus:outline-none focus:ring-2 focus:ring-indigo-500"
            >
              <option value="">— none —</option>
              {FORMAT_STYLES.map(s => <option key={s} value={s}>{s}</option>)}
            </select>

            <div className="grid grid-cols-2 gap-3 mb-4">
              <div>
                <label className="block text-xs text-gray-500 mb-1">Trim In (s)</label>
                <input
                  type="number"
                  step="0.1"
                  value={editingClip.trim_in ?? ''}
                  onChange={e => setEditingClip({ ...editingClip, trim_in: e.target.value ? parseFloat(e.target.value) : null })}
                  className="w-full text-sm border border-gray-200 rounded-lg px-3 py-2 focus:outline-none focus:ring-2 focus:ring-indigo-500"
                />
              </div>
              <div>
                <label className="block text-xs text-gray-500 mb-1">Trim Out (s)</label>
                <input
                  type="number"
                  step="0.1"
                  value={editingClip.trim_out ?? ''}
                  onChange={e => setEditingClip({ ...editingClip, trim_out: e.target.value ? parseFloat(e.target.value) : null })}
                  className="w-full text-sm border border-gray-200 rounded-lg px-3 py-2 focus:outline-none focus:ring-2 focus:ring-indigo-500"
                />
              </div>
            </div>

            <div className="flex gap-2 justify-end">
              <button onClick={() => setEditingClip(null)} className="px-4 py-2 text-sm text-gray-600 hover:text-gray-900">Cancel</button>
              <button onClick={saveEdit} className="px-4 py-2 text-sm bg-indigo-600 text-white rounded-lg hover:bg-indigo-700">Save</button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}

function ClipCard({ clip, onEdit, onDelete }: { clip: Clip; onEdit: () => void; onDelete: () => void }) {
  return (
    <div className="bg-white border border-gray-100 rounded-xl overflow-hidden hover:shadow-md transition-shadow group">
      <div className="aspect-[9/16] bg-gray-100 relative overflow-hidden">
        <video
          src={`/api/video?path=${encodeURIComponent(clip.filepath)}`}
          className="w-full h-full object-cover"
          preload="metadata"
          muted
          playsInline
          onMouseEnter={e => (e.target as HTMLVideoElement).play()}
          onMouseLeave={e => { const v = e.target as HTMLVideoElement; v.pause(); v.currentTime = 0 }}
        />
        <div className="absolute inset-0 bg-black/0 group-hover:bg-black/10 transition-colors" />
      </div>
      <div className="p-3">
        <p className="text-xs font-medium text-gray-700 truncate mb-1" title={clip.filename}>{clip.filename}</p>
        {clip.duration && (
          <p className="text-xs text-gray-400 mb-1">{clip.duration.toFixed(1)}s</p>
        )}
        {clip.topics.length > 0 && (
          <div className="flex flex-wrap gap-1 mb-2">
            {clip.topics.map(t => (
              <span key={t} className="px-1.5 py-0.5 bg-gray-100 text-gray-500 text-[10px] rounded">{t}</span>
            ))}
          </div>
        )}
        {clip.format_style && (
          <p className="text-[10px] text-gray-400 mb-2">{clip.format_style}</p>
        )}
        <div className="flex gap-2 opacity-0 group-hover:opacity-100 transition-opacity">
          <button onClick={onEdit} className="flex-1 text-xs text-indigo-600 hover:text-indigo-800 font-medium">Edit</button>
          <button onClick={onDelete} className="flex-1 text-xs text-red-500 hover:text-red-700 font-medium">Delete</button>
        </div>
      </div>
    </div>
  )
}
