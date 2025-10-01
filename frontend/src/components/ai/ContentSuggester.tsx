import React, { useState } from 'react'
import { motion } from 'framer-motion'
import {
  SparklesIcon,
  ClipboardDocumentIcon,
  ArrowPathIcon,
} from '@heroicons/react/24/outline'
import { aiApi } from '@/services/api'
import toast from 'react-hot-toast'

interface ContentSuggesterProps {
  title: string
  type: 'task' | 'goal' | 'achievement'
}

const ContentSuggester: React.FC<ContentSuggesterProps> = ({ title, type }) => {
  const [isLoading, setIsLoading] = useState(false)
  const [suggestion, setSuggestion] = useState<string>('')

  const generateContent = async () => {
    setIsLoading(true)
    try {
      const response = await aiApi.generateContent(title, type)
      setSuggestion(response.content)
    } catch (error: any) {
      const message = error.response?.data?.message || 'Failed to generate content'
      toast.error(message)
    } finally {
      setIsLoading(false)
    }
  }

  const copyToClipboard = () => {
    navigator.clipboard.writeText(suggestion)
    toast.success('Content copied to clipboard!')
  }

  return (
    <div className="relative">
      <button
        onClick={generateContent}
        disabled={isLoading}
        className="inline-flex items-center space-x-2 text-primary-600 hover:text-primary-700"
      >
        {isLoading ? (
          <ArrowPathIcon className="h-5 w-5 animate-spin" />
        ) : (
          <SparklesIcon className="h-5 w-5" />
        )}
        <span>✨ Generate Content</span>
      </button>

      {suggestion && (
        <motion.div
          initial={{ opacity: 0, y: -10 }}
          animate={{ opacity: 1, y: 0 }}
          className="mt-4 p-4 bg-white rounded-lg border border-gray-200 shadow-sm"
        >
          <div className="prose prose-sm max-w-none">
            <p>{suggestion}</p>
          </div>
          <button
            onClick={copyToClipboard}
            className="mt-4 inline-flex items-center space-x-2 text-gray-600 hover:text-gray-700"
          >
            <ClipboardDocumentIcon className="h-5 w-5" />
            <span>Copy to Clipboard</span>
          </button>
        </motion.div>
      )}
    </div>
  )
}

export default ContentSuggester
