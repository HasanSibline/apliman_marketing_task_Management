import React from 'react'
import {
  PhotoIcon,
  DocumentTextIcon,
  TableCellsIcon,
  PresentationChartBarIcon,
  ArchiveBoxIcon,
  FilmIcon,
  MusicalNoteIcon,
  CodeBracketIcon,
  DocumentIcon,
} from '@heroicons/react/24/outline'
import { fileKind, FILE_KIND_TONE, type FileKind } from '@/lib/fileKind'

/** One icon per kind. Chosen so the shapes differ, not only the colours. */
const ICONS: Record<FileKind, React.ComponentType<{ className?: string }>> = {
  image: PhotoIcon,
  pdf: DocumentTextIcon,
  sheet: TableCellsIcon,
  doc: DocumentTextIcon,
  slides: PresentationChartBarIcon,
  archive: ArchiveBoxIcon,
  video: FilmIcon,
  audio: MusicalNoteIcon,
  code: CodeBracketIcon,
  file: DocumentIcon,
}

interface Props {
  fileName?: string | null
  mimeType?: string | null
  className?: string
}

/**
 * The icon for an attachment, decided from its name.
 *
 * Written as a component rather than a function returning JSX so it can be used
 * anywhere a file is listed without each caller repeating the lookup and the tone
 * class, which is how the two attachment lists in this app ended up drawing the same
 * files two different ways.
 */
const FileIcon: React.FC<Props> = ({ fileName, mimeType, className = 'h-5 w-5' }) => {
  const kind = fileKind(fileName, mimeType)
  const Icon = ICONS[kind]
  return <Icon className={`${className} ${FILE_KIND_TONE[kind]}`} />
}

export default FileIcon
