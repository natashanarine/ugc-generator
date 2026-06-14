import { execFile } from 'child_process'
import { promisify } from 'util'
import path from 'path'
import fs from 'fs'

const execFileAsync = promisify(execFile)

export const TARGET_WIDTH = 1080
export const TARGET_HEIGHT = 1920
export const TARGET_FPS = 30

export type EditPreset = 'hard_cut' | 'crossfade' | 'zoom_punch'

export interface OverlayStyle {
  preset: 'default' | 'bold' | 'subtle'
  text: string
}

export interface SectionInput {
  filepath: string
  trim_in?: number | null
  trim_out?: number | null
  speed?: number
  overlay?: OverlayStyle
  maxDuration?: number
}

export interface RenderJobConfig {
  sections: SectionInput[]
  editPreset: EditPreset
  outputPath: string
  onProgress?: (pct: number) => void
}

function getFfmpegBinary(): string {
  // Check common locations
  const candidates = [
    process.env.FFMPEG_PATH,
    '/opt/homebrew/bin/ffmpeg',
    '/usr/local/bin/ffmpeg',
    '/usr/bin/ffmpeg',
    'ffmpeg',
  ].filter(Boolean) as string[]

  for (const p of candidates) {
    try {
      const { execFileSync } = require('child_process')
      execFileSync(p, ['-version'], { stdio: 'pipe' })
      return p
    } catch {
      continue
    }
  }
  throw new Error('ffmpeg binary not found. Install via: brew install ffmpeg')
}

function getFfprobeBinary(): string {
  const candidates = [
    process.env.FFPROBE_PATH,
    '/opt/homebrew/bin/ffprobe',
    '/usr/local/bin/ffprobe',
    '/usr/bin/ffprobe',
    'ffprobe',
  ].filter(Boolean) as string[]

  for (const p of candidates) {
    try {
      const { execFileSync } = require('child_process')
      execFileSync(p, ['-version'], { stdio: 'pipe' })
      return p
    } catch {
      continue
    }
  }
  throw new Error('ffprobe binary not found. Install via: brew install ffmpeg')
}

export async function probeVideo(filepath: string): Promise<{ duration: number; width: number; height: number }> {
  const ffprobe = getFfprobeBinary()
  const { stdout } = await execFileAsync(ffprobe, [
    '-v', 'quiet',
    '-print_format', 'json',
    '-show_streams',
    '-show_format',
    filepath,
  ])
  const data = JSON.parse(stdout)
  const videoStream = data.streams?.find((s: { codec_type: string }) => s.codec_type === 'video')
  const duration = parseFloat(data.format?.duration ?? '0')
  return {
    duration,
    width: videoStream?.width ?? 0,
    height: videoStream?.height ?? 0,
  }
}

// Build drawtext filter for a style preset
function buildDrawtextFilter(overlay: OverlayStyle, duration: number): string {
  const presets: Record<string, { fontsize: number; fontcolor: string; box: number; boxcolor: string; x: string; y: string }> = {
    default: {
      fontsize: 52,
      fontcolor: 'white',
      box: 1,
      boxcolor: 'black@0.45',
      x: '(w-text_w)/2',
      y: '(h-text_h)/2',
    },
    bold: {
      fontsize: 64,
      fontcolor: 'white',
      box: 1,
      boxcolor: 'black@0.7',
      x: '(w-text_w)/2',
      y: 'h*0.15',
    },
    subtle: {
      fontsize: 42,
      fontcolor: 'white@0.85',
      box: 0,
      boxcolor: 'black@0',
      x: '(w-text_w)/2',
      y: 'h*0.8',
    },
  }

  const s = presets[overlay.preset] ?? presets.default
  const fadeIn = 0.3
  const fadeOut = 0.3
  const escapedText = overlay.text.replace(/'/g, "’").replace(/:/g, '\\:')
  const alphaExpr = `if(lt(t,${fadeIn}),t/${fadeIn},if(gt(t,${duration - fadeOut}),(${duration}-t)/${fadeOut},1))`

  return (
    `drawtext=text='${escapedText}'` +
    `:fontsize=${s.fontsize}` +
    `:fontcolor=${s.fontcolor}` +
    `:x=${s.x}:y=${s.y}` +
    (s.box ? `:box=1:boxcolor=${s.boxcolor}:boxborderw=12` : '') +
    `:alpha='${alphaExpr}'`
  )
}

// Build speed filter chain (video + audio), handling atempo limits (0.5–2.0 per filter)
function buildSpeedFilters(speed: number): { videoFilter: string; audioFilter: string } {
  if (speed === 1) return { videoFilter: '', audioFilter: '' }

  const videoFilter = `setpts=${(1 / speed).toFixed(4)}*PTS`

  // atempo is constrained to 0.5–2.0, chain multiple for extreme values
  const audioFilters: string[] = []
  let remaining = speed
  while (remaining > 2.0) {
    audioFilters.push('atempo=2.0')
    remaining /= 2.0
  }
  while (remaining < 0.5) {
    audioFilters.push('atempo=0.5')
    remaining /= 0.5
  }
  audioFilters.push(`atempo=${remaining.toFixed(4)}`)

  return { videoFilter, audioFilter: audioFilters.join(',') }
}

// Normalize a single section clip to 1080x1920@30fps and apply speed/overlay
// Returns path to a temp file
async function processSectionClip(
  input: SectionInput,
  tmpDir: string,
  index: number,
): Promise<string> {
  const ffmpeg = getFfmpegBinary()
  const outPath = path.join(tmpDir, `section_${index}.mp4`)

  const args: string[] = ['-y']

  // Input with optional trim
  const trimIn = input.trim_in ?? 0
  if (trimIn > 0) {
    args.push('-ss', String(trimIn))
  }
  args.push('-i', input.filepath)

  // Duration cap
  let duration: number | undefined
  if (input.trim_out != null && input.trim_out > trimIn) {
    duration = input.trim_out - trimIn
  } else if (input.maxDuration) {
    duration = input.maxDuration
  }
  if (duration != null) {
    args.push('-t', String(duration))
  }

  const speed = input.speed ?? 1
  const { videoFilter, audioFilter } = buildSpeedFilters(speed)

  // Effective duration after speed
  const effectiveDuration = duration != null ? duration / speed : undefined

  // Build filter_complex
  const vFilters: string[] = []
  // Scale to 1080x1920 with pad (letterbox/pillarbox)
  vFilters.push(`scale=${TARGET_WIDTH}:${TARGET_HEIGHT}:force_original_aspect_ratio=decrease,pad=${TARGET_WIDTH}:${TARGET_HEIGHT}:(ow-iw)/2:(oh-ih)/2:color=black`)
  vFilters.push(`fps=${TARGET_FPS}`)
  if (videoFilter) vFilters.push(videoFilter)
  if (input.overlay && effectiveDuration) {
    vFilters.push(buildDrawtextFilter(input.overlay, effectiveDuration))
  }

  const vfStr = vFilters.join(',')
  args.push('-vf', vfStr)

  if (audioFilter) {
    args.push('-af', audioFilter)
  }

  args.push(
    '-c:v', 'libx264',
    '-preset', 'fast',
    '-crf', '22',
    '-c:a', 'aac',
    '-ar', '44100',
    '-movflags', '+faststart',
    outPath,
  )

  await execFileAsync(ffmpeg, args)
  return outPath
}

// Build xfade transition between consecutive clips
async function concatWithTransitions(
  clips: string[],
  editPreset: EditPreset,
  outputPath: string,
): Promise<void> {
  const ffmpeg = getFfmpegBinary()

  if (clips.length === 1) {
    fs.copyFileSync(clips[0], outputPath)
    return
  }

  if (editPreset === 'hard_cut') {
    // Simple concat demuxer is fastest
    const listFile = outputPath + '.list'
    const lines = clips.map(c => `file '${c}'`).join('\n')
    fs.writeFileSync(listFile, lines)
    try {
      await execFileAsync(ffmpeg, [
        '-y',
        '-f', 'concat',
        '-safe', '0',
        '-i', listFile,
        '-c', 'copy',
        outputPath,
      ])
    } finally {
      fs.unlinkSync(listFile)
    }
    return
  }

  // For crossfade and zoom_punch we need durations
  const durations: number[] = []
  for (const clip of clips) {
    const probe = await probeVideo(clip)
    durations.push(probe.duration)
  }

  // Build filter_complex with xfade
  const args: string[] = ['-y']
  for (const clip of clips) {
    args.push('-i', clip)
  }

  const XFADE_DURATION = 0.25
  let filterComplex = ''
  let currentLabel = '[0:v]'
  let currentAudio = '[0:a]'
  let offset = 0

  for (let i = 1; i < clips.length; i++) {
    offset += durations[i - 1] - XFADE_DURATION
    const vOut = i === clips.length - 1 ? '[vout]' : `[v${i}]`
    const aOut = i === clips.length - 1 ? '[aout]' : `[a${i}]`

    let transition = 'fade'
    if (editPreset === 'zoom_punch') transition = 'zoomin'

    filterComplex += `${currentLabel}[${i}:v]xfade=transition=${transition}:duration=${XFADE_DURATION}:offset=${offset.toFixed(3)}${vOut};`
    filterComplex += `${currentAudio}[${i}:a]acrossfade=d=${XFADE_DURATION}${aOut};`
    currentLabel = vOut
    currentAudio = aOut
  }

  // Remove trailing semicolons
  filterComplex = filterComplex.replace(/;$/, '')

  args.push(
    '-filter_complex', filterComplex,
    '-map', '[vout]',
    '-map', '[aout]',
    '-c:v', 'libx264',
    '-preset', 'fast',
    '-crf', '22',
    '-c:a', 'aac',
    '-movflags', '+faststart',
    outputPath,
  )

  await execFileAsync(ffmpeg, args)
}

export async function renderVariant(config: RenderJobConfig): Promise<void> {
  const ffmpeg = getFfmpegBinary()
  const tmpDir = path.join(path.dirname(config.outputPath), '.tmp_' + path.basename(config.outputPath, '.mp4'))
  fs.mkdirSync(tmpDir, { recursive: true })

  try {
    const processedClips: string[] = []
    for (let i = 0; i < config.sections.length; i++) {
      const clip = await processSectionClip(config.sections[i], tmpDir, i)
      processedClips.push(clip)
      config.onProgress?.(Math.round(((i + 1) / config.sections.length) * 80))
    }

    await concatWithTransitions(processedClips, config.editPreset, config.outputPath)
    config.onProgress?.(100)
  } finally {
    fs.rmSync(tmpDir, { recursive: true, force: true })
  }
}

export function isFfmpegAvailable(): boolean {
  try {
    getFfmpegBinary()
    return true
  } catch {
    return false
  }
}
