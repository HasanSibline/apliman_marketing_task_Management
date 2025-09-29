import React, { useState, useRef } from 'react'
import { motion } from 'framer-motion'
import { 
  CloudArrowUpIcon, 
  DocumentIcon, 
  PhotoIcon,
  TrashIcon 
} from '@heroicons/react/24/outline'
import { filesApi } from '@/services/api'
import { useAppDispatch } from '@/hooks/redux'

interface FileUploadProps {
  taskId: string
  files: any[]
  onFilesUpdated: () => void
}

const FileUpload: React.FC<FileUploadProps> = ({ taskId, files, onFilesUpdated }) => {
  const dispatch = useAppDispatch()
  const fileInputRef = useRef<HTMLInputElement>(null)
  const [uploading, setUploading] = useState(false)
  const [dragActive, setDragActive] = useState(false)

  const handleFileSelect = (selectedFiles: FileList | null) => {
    if (!selectedFiles) return

    const validFiles = Array.from(selectedFiles).filter(file => {
      // Check file size (5MB limit)
      if (file.size > 5 * 1024 * 1024) {
        console.error(`File ${file.name} is too large. Maximum size is 5MB.`)
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
        console.error(`File ${file.name} type is not supported.`)
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
      
      console.log(`${filesToUpload.length} file(s) uploaded successfully!`)
      onFilesUpdated()
    } catch (error) {
      console.error('Upload error:', error)
    } finally {
      setUploading(false)
    }
  }

  const handleDeleteFile = async (fileId: string, fileName: string) => {
    try {
      await filesApi.delete(fileId)
      console.log(`${fileName} deleted successfully`)
      onFilesUpdated()
    } catch (error) {
      console.error('Failed to delete file', error)
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

  const getFileIcon = (fileType: string) => {
    if (fileType.startsWith('image/')) {
      return <PhotoIcon className="h-5 w-5 text-blue-500" />
    }
    return <DocumentIcon className="h-5 w-5 text-gray-500" />
  }

  const formatFileSize = (bytes: number) => {
    if (bytes === 0) return '0 Bytes'
    const k = 1024
    const sizes = ['Bytes', 'KB', 'MB', 'GB']
    const i = Math.floor(Math.log(bytes) / Math.log(k))
    return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i]
  }

  return (
    <div className="space-y-4">
      {/* Upload Area */}
      <div
        className={`border-2 border-dashed rounded-lg p-6 text-center transition-colors ${
          dragActive 
            ? 'border-primary-500 bg-primary-50' 
            : 'border-gray-300 hover:border-gray-400'
        }`}
        onDragEnter={handleDrag}
        onDragLeave={handleDrag}
        onDragOver={handleDrag}
        onDrop={handleDrop}
      >
        <CloudArrowUpIcon className="mx-auto h-12 w-12 text-gray-400" />
        <div className="mt-4">
          <p className="text-sm text-gray-600">
            <button
              type="button"
              className="font-medium text-primary-600 hover:text-primary-500"
              onClick={() => fileInputRef.current?.click()}
              disabled={uploading}
            >
              Click to upload
            </button>
            {' '}or drag and drop
          </p>
          <p className="text-xs text-gray-500 mt-1">
            PNG, JPG, WebP, PDF, DOC, DOCX up to 5MB
          </p>
        </div>
        
        {uploading && (
          <div className="mt-4">
            <div className="animate-spin rounded-full h-6 w-6 border-b-2 border-primary-600 mx-auto"></div>
            <p className="text-sm text-gray-600 mt-2">Uploading...</p>
          </div>
        )}
      </div>

      <input
        ref={fileInputRef}
        type="file"
        multiple
        className="hidden"
        accept=".jpg,.jpeg,.png,.webp,.pdf,.doc,.docx"
        onChange={(e) => handleFileSelect(e.target.files)}
        disabled={uploading}
      />

      {/* File List */}
      {files && files.length > 0 && (
        <div className="space-y-2">
          <h4 className="text-sm font-medium text-gray-900">Attached Files</h4>
          {files.map((file: any) => (
            <motion.div
              key={file.id}
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              className="flex items-center justify-between p-3 bg-gray-50 rounded-lg"
            >
              <div className="flex items-center space-x-3">
                {getFileIcon(file.fileType)}
                <div>
                  <p className="text-sm font-medium text-gray-900">{file.fileName}</p>
                  <p className="text-xs text-gray-500">
                    {formatFileSize(file.fileSize * 1024)} • {new Date(file.uploadedAt).toLocaleDateString()}
                  </p>
                </div>
              </div>
              <div className="flex items-center space-x-2">
                <button
                  onClick={() => filesApi.download(file.id)}
                  className="text-primary-600 hover:text-primary-700 text-sm font-medium"
                >
                  Download
                </button>
                <button
                  onClick={() => handleDeleteFile(file.id, file.fileName)}
                  className="text-red-600 hover:text-red-700 p-1"
                  title="Delete file"
                >
                  <TrashIcon className="h-4 w-4" />
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
