import Database from 'better-sqlite3'
import path from 'path'
import fs from 'fs'

const DATA_DIR = path.join(process.cwd(), 'data')
const DB_PATH = path.join(DATA_DIR, 'ugc.db')

fs.mkdirSync(DATA_DIR, { recursive: true })
fs.mkdirSync(path.join(DATA_DIR, 'uploads'), { recursive: true })
fs.mkdirSync(path.join(DATA_DIR, 'output'), { recursive: true })

let _db: Database.Database | null = null

export function getDb(): Database.Database {
  if (!_db) {
    _db = new Database(DB_PATH)
    _db.pragma('journal_mode = WAL')
    _db.pragma('foreign_keys = ON')
    migrate(_db)
  }
  return _db
}

function migrate(db: Database.Database) {
  db.exec(`
    CREATE TABLE IF NOT EXISTS clips (
      id TEXT PRIMARY KEY,
      filename TEXT NOT NULL,
      filepath TEXT NOT NULL,
      section TEXT NOT NULL CHECK(section IN ('hook','problem','solution','demo','cta')),
      topics TEXT NOT NULL DEFAULT '[]',
      format_style TEXT NOT NULL DEFAULT '',
      duration REAL,
      trim_in REAL,
      trim_out REAL,
      created_at TEXT NOT NULL DEFAULT (datetime('now'))
    );

    CREATE TABLE IF NOT EXISTS text_overlays (
      id TEXT PRIMARY KEY,
      text TEXT NOT NULL,
      section TEXT NOT NULL CHECK(section IN ('hook','cta')),
      style_preset TEXT NOT NULL DEFAULT 'default',
      topic TEXT NOT NULL DEFAULT '',
      created_at TEXT NOT NULL DEFAULT (datetime('now'))
    );

    CREATE TABLE IF NOT EXISTS variant_recipes (
      id TEXT PRIMARY KEY,
      name TEXT NOT NULL,
      sections TEXT NOT NULL DEFAULT '["hook","problem","solution","demo","cta"]',
      clip_pool TEXT NOT NULL DEFAULT '{}',
      overlay_pool TEXT NOT NULL DEFAULT '{}',
      speed_options TEXT NOT NULL DEFAULT '[1]',
      speed_sections TEXT NOT NULL DEFAULT '[]',
      edit_presets TEXT NOT NULL DEFAULT '["hard_cut"]',
      topic_axis TEXT NOT NULL DEFAULT '[]',
      target_count INTEGER NOT NULL DEFAULT 20,
      created_at TEXT NOT NULL DEFAULT (datetime('now'))
    );

    CREATE TABLE IF NOT EXISTS generated_variants (
      id TEXT PRIMARY KEY,
      recipe_id TEXT NOT NULL REFERENCES variant_recipes(id) ON DELETE CASCADE,
      output_filepath TEXT,
      combo JSON NOT NULL DEFAULT '{}',
      status TEXT NOT NULL DEFAULT 'pending' CHECK(status IN ('pending','rendering','done','failed')),
      error TEXT,
      notes TEXT NOT NULL DEFAULT '',
      generated_at TEXT NOT NULL DEFAULT (datetime('now'))
    );

    CREATE INDEX IF NOT EXISTS idx_clips_section ON clips(section);
    CREATE INDEX IF NOT EXISTS idx_variants_recipe ON generated_variants(recipe_id);
    CREATE INDEX IF NOT EXISTS idx_variants_status ON generated_variants(status);
  `)
}

// ── Clips ──────────────────────────────────────────────────────────────────

export type ClipSection = 'hook' | 'problem' | 'solution' | 'demo' | 'cta'
export type FormatStyle = 'storytelling' | 'talking-head' | 'ranking' | 'reaction-camera-flip' | 'pov' | string

export interface Clip {
  id: string
  filename: string
  filepath: string
  section: ClipSection
  topics: string[]
  format_style: string
  duration: number | null
  trim_in: number | null
  trim_out: number | null
  created_at: string
}

interface ClipRow {
  id: string
  filename: string
  filepath: string
  section: ClipSection
  topics: string
  format_style: string
  duration: number | null
  trim_in: number | null
  trim_out: number | null
  created_at: string
}

function rowToClip(row: ClipRow): Clip {
  return { ...row, topics: JSON.parse(row.topics) }
}

export function getAllClips(): Clip[] {
  const db = getDb()
  return (db.prepare('SELECT * FROM clips ORDER BY created_at DESC').all() as ClipRow[]).map(rowToClip)
}

export function getClipsBySection(section: ClipSection): Clip[] {
  const db = getDb()
  return (db.prepare('SELECT * FROM clips WHERE section = ? ORDER BY created_at DESC').all(section) as ClipRow[]).map(rowToClip)
}

export function getClipById(id: string): Clip | undefined {
  const db = getDb()
  const row = db.prepare('SELECT * FROM clips WHERE id = ?').get(id) as ClipRow | undefined
  return row ? rowToClip(row) : undefined
}

export function insertClip(clip: Omit<Clip, 'created_at'>): Clip {
  const db = getDb()
  db.prepare(`
    INSERT INTO clips (id, filename, filepath, section, topics, format_style, duration, trim_in, trim_out)
    VALUES (@id, @filename, @filepath, @section, @topics, @format_style, @duration, @trim_in, @trim_out)
  `).run({ ...clip, topics: JSON.stringify(clip.topics) })
  return getClipById(clip.id)!
}

export function updateClip(id: string, patch: Partial<Omit<Clip, 'id' | 'created_at'>>): Clip | undefined {
  const db = getDb()
  const existing = getClipById(id)
  if (!existing) return undefined
  const merged = { ...existing, ...patch }
  db.prepare(`
    UPDATE clips SET filename=@filename, filepath=@filepath, section=@section,
      topics=@topics, format_style=@format_style, duration=@duration, trim_in=@trim_in, trim_out=@trim_out
    WHERE id=@id
  `).run({ ...merged, id, topics: JSON.stringify(merged.topics) })
  return getClipById(id)
}

export function deleteClip(id: string): boolean {
  const db = getDb()
  const result = db.prepare('DELETE FROM clips WHERE id = ?').run(id)
  return result.changes > 0
}

// ── Text Overlays ──────────────────────────────────────────────────────────

export type OverlaySection = 'hook' | 'cta'
export type StylePreset = 'default' | 'bold' | 'subtle'

export interface TextOverlay {
  id: string
  text: string
  section: OverlaySection
  style_preset: StylePreset
  topic: string
  created_at: string
}

export function getAllOverlays(): TextOverlay[] {
  const db = getDb()
  return db.prepare('SELECT * FROM text_overlays ORDER BY section, created_at DESC').all() as TextOverlay[]
}

export function getOverlayById(id: string): TextOverlay | undefined {
  const db = getDb()
  return db.prepare('SELECT * FROM text_overlays WHERE id = ?').get(id) as TextOverlay | undefined
}

export function insertOverlay(overlay: Omit<TextOverlay, 'created_at'>): TextOverlay {
  const db = getDb()
  db.prepare(`
    INSERT INTO text_overlays (id, text, section, style_preset, topic)
    VALUES (@id, @text, @section, @style_preset, @topic)
  `).run(overlay)
  return getOverlayById(overlay.id)!
}

export function updateOverlay(id: string, patch: Partial<Omit<TextOverlay, 'id' | 'created_at'>>): TextOverlay | undefined {
  const db = getDb()
  const existing = getOverlayById(id)
  if (!existing) return undefined
  const merged = { ...existing, ...patch }
  db.prepare(`
    UPDATE text_overlays SET text=@text, section=@section, style_preset=@style_preset, topic=@topic
    WHERE id=@id
  `).run({ ...merged, id })
  return getOverlayById(id)
}

export function deleteOverlay(id: string): boolean {
  const db = getDb()
  const result = db.prepare('DELETE FROM text_overlays WHERE id = ?').run(id)
  return result.changes > 0
}

// ── Variant Recipes ────────────────────────────────────────────────────────

export interface VariantRecipe {
  id: string
  name: string
  sections: ClipSection[]
  clip_pool: Record<ClipSection, string[]>
  overlay_pool: { hook: string[]; cta: string[] }
  speed_options: number[]
  speed_sections: ClipSection[]
  edit_presets: string[]
  topic_axis: string[]
  target_count: number
  created_at: string
}

interface RecipeRow {
  id: string
  name: string
  sections: string
  clip_pool: string
  overlay_pool: string
  speed_options: string
  speed_sections: string
  edit_presets: string
  topic_axis: string
  target_count: number
  created_at: string
}

function rowToRecipe(row: RecipeRow): VariantRecipe {
  return {
    ...row,
    sections: JSON.parse(row.sections),
    clip_pool: JSON.parse(row.clip_pool),
    overlay_pool: JSON.parse(row.overlay_pool),
    speed_options: JSON.parse(row.speed_options),
    speed_sections: JSON.parse(row.speed_sections),
    edit_presets: JSON.parse(row.edit_presets),
    topic_axis: JSON.parse(row.topic_axis),
  }
}

export function getAllRecipes(): VariantRecipe[] {
  const db = getDb()
  return (db.prepare('SELECT * FROM variant_recipes ORDER BY created_at DESC').all() as RecipeRow[]).map(rowToRecipe)
}

export function getRecipeById(id: string): VariantRecipe | undefined {
  const db = getDb()
  const row = db.prepare('SELECT * FROM variant_recipes WHERE id = ?').get(id) as RecipeRow | undefined
  return row ? rowToRecipe(row) : undefined
}

export function insertRecipe(recipe: Omit<VariantRecipe, 'created_at'>): VariantRecipe {
  const db = getDb()
  db.prepare(`
    INSERT INTO variant_recipes (id, name, sections, clip_pool, overlay_pool, speed_options, speed_sections, edit_presets, topic_axis, target_count)
    VALUES (@id, @name, @sections, @clip_pool, @overlay_pool, @speed_options, @speed_sections, @edit_presets, @topic_axis, @target_count)
  `).run({
    id: recipe.id,
    name: recipe.name,
    sections: JSON.stringify(recipe.sections),
    clip_pool: JSON.stringify(recipe.clip_pool),
    overlay_pool: JSON.stringify(recipe.overlay_pool),
    speed_options: JSON.stringify(recipe.speed_options),
    speed_sections: JSON.stringify(recipe.speed_sections),
    edit_presets: JSON.stringify(recipe.edit_presets),
    topic_axis: JSON.stringify(recipe.topic_axis),
    target_count: recipe.target_count,
  })
  return getRecipeById(recipe.id)!
}

export function updateRecipe(id: string, patch: Partial<Omit<VariantRecipe, 'id' | 'created_at'>>): VariantRecipe | undefined {
  const db = getDb()
  const existing = getRecipeById(id)
  if (!existing) return undefined
  const merged = { ...existing, ...patch }
  db.prepare(`
    UPDATE variant_recipes SET name=@name, sections=@sections, clip_pool=@clip_pool,
      overlay_pool=@overlay_pool, speed_options=@speed_options, speed_sections=@speed_sections,
      edit_presets=@edit_presets, topic_axis=@topic_axis, target_count=@target_count
    WHERE id=@id
  `).run({
    id,
    name: merged.name,
    sections: JSON.stringify(merged.sections),
    clip_pool: JSON.stringify(merged.clip_pool),
    overlay_pool: JSON.stringify(merged.overlay_pool),
    speed_options: JSON.stringify(merged.speed_options),
    speed_sections: JSON.stringify(merged.speed_sections),
    edit_presets: JSON.stringify(merged.edit_presets),
    topic_axis: JSON.stringify(merged.topic_axis),
    target_count: merged.target_count,
  })
  return getRecipeById(id)
}

export function deleteRecipe(id: string): boolean {
  const db = getDb()
  const result = db.prepare('DELETE FROM variant_recipes WHERE id = ?').run(id)
  return result.changes > 0
}

// ── Generated Variants ─────────────────────────────────────────────────────

export interface VariantCombo {
  topic: string
  edit_preset: string
  speed: number
  clips: Record<ClipSection, string | string[]>
  hook_overlay_id?: string
  cta_overlay_id?: string
}

export interface GeneratedVariant {
  id: string
  recipe_id: string
  output_filepath: string | null
  combo: VariantCombo
  status: 'pending' | 'rendering' | 'done' | 'failed'
  error: string | null
  notes: string
  generated_at: string
}

interface VariantRow {
  id: string
  recipe_id: string
  output_filepath: string | null
  combo: string
  status: 'pending' | 'rendering' | 'done' | 'failed'
  error: string | null
  notes: string
  generated_at: string
}

function rowToVariant(row: VariantRow): GeneratedVariant {
  return { ...row, combo: JSON.parse(row.combo) }
}

export function getVariantsByRecipe(recipe_id: string): GeneratedVariant[] {
  const db = getDb()
  return (db.prepare('SELECT * FROM generated_variants WHERE recipe_id = ? ORDER BY generated_at DESC').all(recipe_id) as VariantRow[]).map(rowToVariant)
}

export function getAllVariants(): GeneratedVariant[] {
  const db = getDb()
  return (db.prepare('SELECT * FROM generated_variants ORDER BY generated_at DESC').all() as VariantRow[]).map(rowToVariant)
}

export function getVariantById(id: string): GeneratedVariant | undefined {
  const db = getDb()
  const row = db.prepare('SELECT * FROM generated_variants WHERE id = ?').get(id) as VariantRow | undefined
  return row ? rowToVariant(row) : undefined
}

export function insertVariant(variant: Omit<GeneratedVariant, 'generated_at'>): GeneratedVariant {
  const db = getDb()
  db.prepare(`
    INSERT INTO generated_variants (id, recipe_id, output_filepath, combo, status, error, notes)
    VALUES (@id, @recipe_id, @output_filepath, @combo, @status, @error, @notes)
  `).run({ ...variant, combo: JSON.stringify(variant.combo) })
  return getVariantById(variant.id)!
}

export function updateVariant(id: string, patch: Partial<Omit<GeneratedVariant, 'id' | 'generated_at'>>): GeneratedVariant | undefined {
  const db = getDb()
  const existing = getVariantById(id)
  if (!existing) return undefined
  const merged = { ...existing, ...patch }
  db.prepare(`
    UPDATE generated_variants SET output_filepath=@output_filepath, combo=@combo,
      status=@status, error=@error, notes=@notes
    WHERE id=@id
  `).run({ ...merged, id, combo: JSON.stringify(merged.combo) })
  return getVariantById(id)
}

export function deleteVariant(id: string): boolean {
  const db = getDb()
  return db.prepare('DELETE FROM generated_variants WHERE id = ?').run(id).changes > 0
}

export function deleteVariantsByRecipe(recipe_id: string): number {
  const db = getDb()
  return db.prepare('DELETE FROM generated_variants WHERE recipe_id = ?').run(recipe_id).changes
}
