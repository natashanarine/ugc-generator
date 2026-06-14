import { insertClip as _insertClip, updateClip, type Clip } from './db'
import { probeVideo } from './ffmpeg'

export { insertClip } from './db'

export async function probeAndUpdateClip(id: string, filepath: string): Promise<void> {
  try {
    const info = await probeVideo(filepath)
    updateClip(id, { duration: info.duration })
  } catch {
    // ffmpeg not available or probe failed — duration stays null
  }
}
