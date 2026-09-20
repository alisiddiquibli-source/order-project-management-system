export type MediaKind = 'image' | 'video' | 'other'

const IMAGE_EXTENSIONS = ['jpg', 'jpeg', 'png']
const VIDEO_EXTENSIONS = ['mp4', 'mov', 'webm', 'm4v']

export function mediaKind(filePath: string): MediaKind {
  const extension = filePath.split('.').pop()?.toLowerCase() ?? ''
  if (IMAGE_EXTENSIONS.includes(extension)) return 'image'
  if (VIDEO_EXTENSIONS.includes(extension)) return 'video'
  return 'other'
}
