/**
 * What kind of file this is, from whatever the server happened to send.
 *
 * Attachments were drawn with one grey document icon whatever they were, so a
 * spreadsheet, a screenshot and a signed PDF were three identical rows and the only
 * way to tell them apart was to read the filename. An icon that is the same for
 * everything is not an icon, it is a bullet point.
 *
 * The name is the more reliable signal, not the MIME type: uploads reach us through
 * several paths and some record a type of `application/octet-stream` or nothing at
 * all, while the extension survives every one of them. MIME is used as the fallback,
 * which is the opposite of the usual order and the right way round here.
 */

export type FileKind =
  | 'image'
  | 'pdf'
  | 'sheet'
  | 'doc'
  | 'slides'
  | 'archive'
  | 'video'
  | 'audio'
  | 'code'
  | 'file'

const BY_EXTENSION: Record<string, FileKind> = {
  png: 'image', jpg: 'image', jpeg: 'image', gif: 'image', webp: 'image',
  svg: 'image', bmp: 'image', avif: 'image', heic: 'image',

  pdf: 'pdf',

  xls: 'sheet', xlsx: 'sheet', csv: 'sheet', ods: 'sheet', numbers: 'sheet',

  doc: 'doc', docx: 'doc', rtf: 'doc', odt: 'doc', txt: 'doc', md: 'doc', pages: 'doc',

  ppt: 'slides', pptx: 'slides', odp: 'slides', key: 'slides',

  zip: 'archive', rar: 'archive', '7z': 'archive', tar: 'archive', gz: 'archive',

  mp4: 'video', mov: 'video', avi: 'video', webm: 'video', mkv: 'video',

  mp3: 'audio', wav: 'audio', m4a: 'audio', ogg: 'audio', flac: 'audio',

  js: 'code', ts: 'code', tsx: 'code', jsx: 'code', json: 'code', html: 'code',
  css: 'code', py: 'code', sql: 'code', xml: 'code', yml: 'code', yaml: 'code',
}

export function fileKind(fileName?: string | null, mimeType?: string | null): FileKind {
  const ext = (fileName ?? '').split('.').pop()?.toLowerCase()
  if (ext && BY_EXTENSION[ext]) return BY_EXTENSION[ext]

  const mime = (mimeType ?? '').toLowerCase()
  if (mime.startsWith('image/')) return 'image'
  if (mime.startsWith('video/')) return 'video'
  if (mime.startsWith('audio/')) return 'audio'
  if (mime.includes('pdf')) return 'pdf'
  if (mime.includes('spreadsheet') || mime.includes('excel')) return 'sheet'
  if (mime.includes('presentation') || mime.includes('powerpoint')) return 'slides'
  if (mime.includes('word') || mime.startsWith('text/')) return 'doc'
  if (mime.includes('zip') || mime.includes('compressed')) return 'archive'

  return 'file'
}

/**
 * Colour per kind, so a folder of attachments can be scanned rather than read.
 * These are status-style semantic colours and deliberately not the brand: an
 * attachment list tinted entirely in the company colour tells you nothing.
 */
export const FILE_KIND_TONE: Record<FileKind, string> = {
  image: 'text-sky-600 dark:text-sky-400',
  pdf: 'text-red-600 dark:text-red-400',
  sheet: 'text-emerald-600 dark:text-emerald-400',
  doc: 'text-blue-600 dark:text-blue-400',
  slides: 'text-amber-600 dark:text-amber-400',
  archive: 'text-purple-600 dark:text-purple-400',
  video: 'text-fuchsia-600 dark:text-fuchsia-400',
  audio: 'text-teal-600 dark:text-teal-400',
  code: 'text-slate-600 dark:text-slate-300',
  file: 'text-gray-500 dark:text-gray-400',
}

/**
 * A file size a person can read.
 *
 * Sizes were printed as fixed megabytes, so everything under half a megabyte, which
 * is most screenshots and every document, displayed as "0.00 MB". Picking the unit
 * from the number is the whole fix.
 */
export function formatBytes(bytes?: number | null): string {
  if (!bytes || bytes < 0) return '0 KB'
  const units = ['B', 'KB', 'MB', 'GB']
  const i = Math.min(units.length - 1, Math.floor(Math.log(bytes) / Math.log(1024)))
  const value = bytes / Math.pow(1024, i)
  // No decimal on bytes and kilobytes: "347.28 KB" is false precision for a filesize.
  return `${i <= 1 ? Math.round(value) : value.toFixed(1)} ${units[i]}`
}

/** A short label, for the cases where an icon alone is too terse. */
export const FILE_KIND_LABEL: Record<FileKind, string> = {
  image: 'Image',
  pdf: 'PDF',
  sheet: 'Spreadsheet',
  doc: 'Document',
  slides: 'Slides',
  archive: 'Archive',
  video: 'Video',
  audio: 'Audio',
  code: 'Code',
  file: 'File',
}
