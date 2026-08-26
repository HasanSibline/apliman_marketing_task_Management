import React, { useState, useRef } from 'react'
import { motion } from 'framer-motion'
import { CloudArrowUpIcon, TrashIcon } from '@heroicons/react/24/outline'
import { filesApi, formatAssetUrl } from '@/services/api'
import FileIcon from '@/components/ui/FileIcon'
import { fileKind, FILE_KIND_LABEL, formatBytes } from '@/lib/fileKind'
import toast from 'react-hot-toast'

interface FileUploadProps {
  taskId: string
  files: any[]
  onFilesUpdated: () => void
}

const FileUpload: React.FC<FileUploadProps> = ({ taskId, files, onFilesUpdated }) => {
  const fileInputRef = useRef<HTMLInputElement>(null)
  const [uploading, setUploading] = useState(false)
  const [dragActive, setDragActive] = useState(false)

  // Every rejection is said out loud. All three of these used to be console.error, so
  // dropping a 20MB scan, or a .zip, or losing the connection mid-upload all looked
  // exactly like a successful upload that had simply not appeared in the list yet.
  const handleFileSelect = (selectedFiles: FileList | null) => {
    if (!selectedFiles) return

    const validFiles = Array.from(selectedFiles).filter(file => {
      // Check file size (5MB limit)
      if (file.size > 5 * 1024 * 1024) {
        toast.error(`${file.name} is larger than 5MB, so it was not uploaded.`)
        return false
      }

      // Check file type
      const allowedTypes = [
        'image/jpeg', 'image/png', 'image/webp',
        'application/pdf',
        'application/msword',
        'application/vnd.openxmlformats-officedocument.wordprocessingml.document'
      ]

      if (!allowedTypes.includes(file.type)) {
        toast.error(`${file.name} is not a supported file type, so it was not uploaded.`)
        return false
      }

      return true
    })

    if (validFiles.length > 0) {
      uploadFiles(validFiles)
    }
  }

  const uploadFiles = async (filesToUpload: File[]) => {
    setUploading(true)
    
    try {
      // Convert File[] to FileList-like object
      const fileList = {
        length: filesToUpload.length,
        item: (index: number) => filesToUpload[index],
        [Symbol.iterator]: function* () {
          for (let i = 0; i < this.length; i++) {
            yield this.item(i)
          }
        }
      } as FileList
      
      await filesApi.upload(taskId, fileList)

      toast.success(
        filesToUpload.length === 1
          ? `${filesToUpload[0].name} attached`
          : `${filesToUpload.length} files attached`,
      )
      onFilesUpdated()
    } catch (error: any) {
      console.error('Upload error:', error)
      toast.error(error?.response?.data?.message || 'That upload did not go through. Try again.')
    } finally {
      setUploading(false)
    }
  }

  const handleDeleteFile = async (fileId: string, fileName: string) => {
    try {
      await filesApi.delete(fileId)
      toast.success(`${fileName} deleted`)
      onFilesUpdated()
    } catch (error: any) {
      console.error('Failed to delete file', error)
      toast.error(error?.response?.data?.message || `${fileName} could not be deleted.`)
    }
  }

  /**
   * Actually hands the file over.
   *
   * The button used to call the download helper and drop the promise on the floor. The
   * helper resolves with a Blob and nothing else: the bytes arrived, were held in
   * memory for an instant and discarded, so clicking Download did nothing at all, in
   * complete silence, however many times it was pressed.
   */
  const handleDownload = async (fileId: string, fileName: string) => {
    try {
      const blob = await filesApi.download(fileId)
      const url = window.URL.createObjectURL(blob)
      const link = document.createElement('a')
      link.href = url
      link.download = fileName
      document.body.appendChild(link)
      link.click()
      link.remove()
      window.URL.revokeObjectURL(url)
    } catch (error: any) {
      console.error('Download error:', error)
      toast.error(error?.response?.data?.message || `${fileName} could not be downloaded.`)
    }
  }

  const handleDrag = (e: React.DragEvent) => {
    e.preventDefault()
    e.stopPropagation()
    if (e.type === 'dragenter' || e.type === 'dragover') {
      setDragActive(true)
    } else if (e.type === 'dragleave') {
      setDragActive(false)
    }
  }

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault()
    e.stopPropagation()
    setDragActive(false)
    
    if (e.dataTransfer.files && e.dataTransfer.files[0]) {
      handleFileSelect(e.dataTransfer.files)
    }
  }

  return (
    <div className="space-y-4">
      {/* Upload Area */}
      <div
        role="button"
        tabIndex={0}
        aria-label="Upload files by clicking or dragging and dropping"
        className={`border-2 border-dashed rounded-lg p-6 text-center transition-colors focus:outline-none focus:ring-2 focus:ring-primary-500 focus:ring-offset-2 ${
          dragActive 
            ? 'border-primary-500 bg-primary-50 dark:bg-primary-900/30' 
            : 'border-gray-300 dark:border-gray-600 hover:border-gray-400'
        }`}
        onDragEnter={handleDrag}
        onDragLeave={handleDrag}
        onDragOver={handleDrag}
        onDrop={handleDrop}
        onClick={() => fileInputRef.current?.click()}
        onKeyPress={(e) => {
          if (e.key === 'Enter' || e.key === ' ') {
            fileInputRef.current?.click()
          }
        }}
      >
        <CloudArrowUpIcon className="mx-auto h-12 w-12 text-gray-500 dark:text-gray-400" aria-hidden="true" />
        <div className="mt-4">
          <p className="text-sm text-gray-600 dark:text-gray-300">
            <span className="font-medium text-primary-600 dark:text-primary-400">Click to upload</span>
            {' '}or drag and drop
          </p>
          <p className="text-xs text-gray-500 dark:text-gray-400 mt-1" id="file-upload-description">
            Supported formats: PNG, JPG, WebP, PDF, DOC, DOCX (Max size: 5MB)
          </p>
        </div>
        
        {uploading && (
          <div className="mt-4">
            <div className="animate-spin rounded-full h-6 w-6 border-b-2 border-primary-600 mx-auto"></div>
            <p className="text-sm text-gray-600 dark:text-gray-300 mt-2">Uploading...</p>
          </div>
        )}
      </div>

      <input
        ref={fileInputRef}
        type="file"
        multiple
        className="hidden"
        accept=".jpg,.jpeg,.png,.webp,.pdf,.doc,.docx"
        onChange={(e) => {
          handleFileSelect(e.target.files)
          // Cleared so the same file can be chosen twice. An input holding the file
          // fires no change event when it is picked again, so an upload that failed,
          // or a file deleted and wanted back, could not be re-selected at all: the
          // second click on the same name simply did nothing.
          e.target.value = ''
        }}
        disabled={uploading}
        aria-label="File upload input"
        aria-describedby="file-upload-description"
      />

      {/* File List */}
      {files && files.length > 0 && (
        <div className="space-y-2">
          <h4 className="text-sm font-medium text-gray-900 dark:text-white">Attached Files</h4>
          {files.map((file: any) => (
            <motion.div
              key={file.id}
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              className="flex items-center justify-between p-3 bg-gray-50 dark:bg-gray-900/40 rounded-lg"
            >
              <div className="flex items-center space-x-3 min-w-0">
                {fileKind(file.fileName, file.fileType) === 'image' ? (
                  <a
                    href={formatAssetUrl(file.filePath)}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="block h-10 w-10 shrink-0 overflow-hidden rounded-lg border border-gray-200 dark:border-gray-700"
                  >
                    <img
                      src={formatAssetUrl(file.filePath)}
                      alt={file.fileName}
                      className="h-full w-full object-cover"
                    />
                  </a>
                ) : (
                  <FileIcon fileName={file.fileName} mimeType={file.fileType} />
                )}
                <div className="min-w-0">
                  <p className="truncate text-sm font-medium text-gray-900 dark:text-white">{file.fileName}</p>
                  <p className="text-xs text-gray-500 dark:text-gray-400">
                    {/* fileSize is stored as the byte count multer reported, and
                        formatBytes takes bytes, so the ×1024 that used to be here read
                        a 2MB attachment out as 2GB. */}
                    {FILE_KIND_LABEL[fileKind(file.fileName, file.fileType)]} ·{' '}
                    {formatBytes(file.fileSize)} · {new Date(file.uploadedAt).toLocaleDateString()}
                  </p>
                </div>
              </div>
              <div className="flex items-center space-x-2">
                <button
                  onClick={() => handleDownload(file.id, file.fileName)}
                  className="text-primary-600 dark:text-primary-400 hover:text-primary-700 text-sm font-medium focus:outline-none focus:ring-2 focus:ring-primary-500 focus:ring-offset-2 rounded"
                  aria-label={`Download ${file.fileName}`}
                >
                  Download
                </button>
                <button
                  onClick={() => handleDeleteFile(file.id, file.fileName)}
                  className="text-red-600 dark:text-red-400 hover:text-red-700 p-1 rounded focus:outline-none focus:ring-2 focus:ring-red-500 focus:ring-offset-2"
                  aria-label={`Delete ${file.fileName}`}
                >
                  <TrashIcon className="h-4 w-4" aria-hidden="true" />
                </button>
              </div>
            </motion.div>
          ))}
        </div>
      )}
    </div>
  )
}

export default FileUpload
