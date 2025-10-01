import React, { useState, useEffect } from 'react'
import { motion } from 'framer-motion'
import { PlayIcon, PauseIcon, StopIcon, ClockIcon } from '@heroicons/react/24/outline'
import { useAppSelector } from '@/hooks/redux'
import { tasksApi } from '@/services/api'
import toast from 'react-hot-toast'

interface TimeEntry {
  id: string
  startTime: string
  endTime?: string
  duration: number
  createdBy: {
    id: string
    name: string
  }
}

interface TimeTrackerProps {
  taskId: string
  timeEntries: TimeEntry[]
  onTimeEntriesUpdated: () => void
}

const TimeTracker: React.FC<TimeTrackerProps> = ({ taskId, timeEntries, onTimeEntriesUpdated }) => {
  const { user } = useAppSelector((state) => state.auth)
  const [isTracking, setIsTracking] = useState(false)
  const [currentTime, setCurrentTime] = useState(0)
  const [startTime, setStartTime] = useState<Date | null>(null)
  const [timer, setTimer] = useState<NodeJS.Timeout | null>(null)

  useEffect(() => {
    // Check if there's an active time entry
    const activeEntry = timeEntries.find(entry => !entry.endTime)
    if (activeEntry) {
      const start = new Date(activeEntry.startTime)
      setStartTime(start)
      setIsTracking(true)
      setCurrentTime(Math.floor((new Date().getTime() - start.getTime()) / 1000))
    }

    return () => {
      if (timer) clearInterval(timer)
    }
  }, [timeEntries])

  useEffect(() => {
    if (isTracking && startTime) {
      const interval = setInterval(() => {
        setCurrentTime(Math.floor((new Date().getTime() - startTime.getTime()) / 1000))
      }, 1000)
      setTimer(interval)
      return () => clearInterval(interval)
    }
  }, [isTracking, startTime])

  const formatTime = (seconds: number) => {
    const hours = Math.floor(seconds / 3600)
    const minutes = Math.floor((seconds % 3600) / 60)
    const secs = seconds % 60
    return `${hours.toString().padStart(2, '0')}:${minutes.toString().padStart(2, '0')}:${secs.toString().padStart(2, '0')}`
  }

  const formatDuration = (seconds: number) => {
    const hours = Math.floor(seconds / 3600)
    const minutes = Math.floor((seconds % 3600) / 60)
    return `${hours}h ${minutes}m`
  }

  const handleStart = async () => {
    try {
      await tasksApi.startTimeTracking(taskId)
      setStartTime(new Date())
      setIsTracking(true)
      setCurrentTime(0)
      onTimeEntriesUpdated()
      toast.success('Time tracking started')
    } catch (error: any) {
      const message = error.response?.data?.message || 'Failed to start time tracking'
      toast.error(message)
    }
  }

  const handleStop = async () => {
    try {
      await tasksApi.stopTimeTracking(taskId)
      setStartTime(null)
      setIsTracking(false)
      if (timer) clearInterval(timer)
      onTimeEntriesUpdated()
      toast.success('Time tracking stopped')
    } catch (error: any) {
      const message = error.response?.data?.message || 'Failed to stop time tracking'
      toast.error(message)
    }
  }

  const handlePause = async () => {
    try {
      await tasksApi.pauseTimeTracking(taskId)
      setIsTracking(false)
      if (timer) clearInterval(timer)
      onTimeEntriesUpdated()
      toast.success('Time tracking paused')
    } catch (error: any) {
      const message = error.response?.data?.message || 'Failed to pause time tracking'
      toast.error(message)
    }
  }

  const getTotalTime = () => {
    return timeEntries.reduce((total, entry) => {
      if (entry.endTime) {
        return total + entry.duration
      }
      if (startTime) {
        return total + Math.floor((new Date().getTime() - new Date(entry.startTime).getTime()) / 1000)
      }
      return total
    }, 0)
  }

  return (
    <div className="space-y-4">
      {/* Time Tracking Controls */}
      <div className="flex items-center justify-between bg-gray-50 rounded-lg p-4 border border-gray-200">
        <div className="flex items-center space-x-4">
          <div className="flex items-center space-x-2">
            <ClockIcon className="h-5 w-5 text-gray-500" />
            <span className="text-lg font-mono font-medium text-gray-900">
              {formatTime(currentTime)}
            </span>
          </div>
          <div className="flex items-center space-x-2">
            {!isTracking ? (
              <button
                onClick={handleStart}
                className="p-2 text-green-600 hover:bg-green-50 rounded-full transition-colors"
              >
                <PlayIcon className="h-5 w-5" />
              </button>
            ) : (
              <>
                <button
                  onClick={handlePause}
                  className="p-2 text-yellow-600 hover:bg-yellow-50 rounded-full transition-colors"
                >
                  <PauseIcon className="h-5 w-5" />
                </button>
                <button
                  onClick={handleStop}
                  className="p-2 text-red-600 hover:bg-red-50 rounded-full transition-colors"
                >
                  <StopIcon className="h-5 w-5" />
                </button>
              </>
            )}
          </div>
        </div>
        <div className="text-sm text-gray-500">
          Total: {formatDuration(getTotalTime())}
        </div>
      </div>

      {/* Time Entries List */}
      <div className="space-y-2">
        {timeEntries.map((entry, index) => (
          <motion.div
            key={entry.id}
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: index * 0.1 }}
            className="flex items-center justify-between p-3 rounded-lg border border-gray-200"
          >
            <div>
              <div className="flex items-center space-x-2">
                <span className="text-sm font-medium text-gray-900">
                  {entry.createdBy.name}
                </span>
                <span className="text-xs text-gray-500">
                  {new Date(entry.startTime).toLocaleString()}
                </span>
              </div>
              {entry.endTime && (
                <div className="text-xs text-gray-500">
                  Duration: {formatDuration(entry.duration)}
                </div>
              )}
            </div>
            {!entry.endTime && (
              <span className="px-2 py-1 text-xs font-medium text-green-800 bg-green-100 rounded-full">
                Active
              </span>
            )}
          </motion.div>
        ))}

        {timeEntries.length === 0 && (
          <div className="text-center py-8">
            <p className="text-gray-500">No time entries yet</p>
          </div>
        )}
      </div>
    </div>
  )
}

export default TimeTracker
