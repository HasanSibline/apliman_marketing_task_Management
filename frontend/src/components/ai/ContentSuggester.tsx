import React, { useState } from 'react'
import { motion } from 'framer-motion'
import {
  SparklesIcon,
  ClipboardDocumentIcon,
  ArrowPathIcon,
} from '@heroicons/react/24/outline'
import { aiApi } from '@/services/api'
import toast from 'react-hot-toast'

interface Suggestion {
  description?: string
  goals?: string
  priority?: number
}

interface ContentSuggesterProps {
  title: string
  type: 'task' | 'goal' | 'achievement'
  onSuggestionSelect?: (suggestion: Suggestion) => void
}

const ContentSuggester: React.FC<ContentSuggesterProps> = ({ title, type, onSuggestionSelect }) => {
  const [isLoading, setIsLoading] = useState(false)
  const [suggestion, setSuggestion] = useState<Suggestion | null>(null)

  const generateContent = async () => {
    setIsLoading(true)
    try {
      const response = await aiApi.generateContent(title, type)
      const newSuggestion: Suggestion = {
        description: response.content,
        goals: response.goals,
        priority: response.priority
      }
      setSuggestion(newSuggestion)
    } catch (error: any) {
      const message = error.response?.data?.message || 'Failed to generate content'
      toast.error(message)
    } finally {
      setIsLoading(false)
    }
  }

  const copyToClipboard = () => {
    if (suggestion) {
      navigator.clipboard.writeText(suggestion.description || '')
      toast.success('Content copied to clipboard!')
    }
  }

  const handleApply = () => {
    if (suggestion && onSuggestionSelect) {
      onSuggestionSelect(suggestion)
    }
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
            <p>{suggestion.description}</p>
            {suggestion.goals && (
              <div className="mt-2">
                <h4 className="text-sm font-medium text-gray-900">Suggested Goals</h4>
                <p className="text-sm text-gray-600">{suggestion.goals}</p>
              </div>
            )}
            {suggestion.priority && (
              <div className="mt-2">
                <h4 className="text-sm font-medium text-gray-900">Suggested Priority</h4>
                <p className="text-sm text-gray-600">Level {suggestion.priority}</p>
              </div>
            )}
          </div>
          <div className="mt-4 flex items-center space-x-4">
            <button
              onClick={copyToClipboard}
              className="inline-flex items-center space-x-2 text-gray-600 hover:text-gray-700"
            >
              <ClipboardDocumentIcon className="h-5 w-5" />
              <span>Copy to Clipboard</span>
            </button>
            {onSuggestionSelect && (
              <button
                onClick={handleApply}
                className="inline-flex items-center space-x-2 text-primary-600 hover:text-primary-700"
              >
                <SparklesIcon className="h-5 w-5" />
                <span>Apply Suggestions</span>
              </button>
            )}
          </div>
        </motion.div>
      )}
    </div>
  )
}

export default ContentSuggester
