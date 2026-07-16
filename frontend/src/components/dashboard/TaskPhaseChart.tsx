import React from 'react'
import { motion } from 'framer-motion'
import { PieChart, Pie, Cell, ResponsiveContainer, Tooltip } from 'recharts'

interface TaskPhaseChartProps {
  data: Array<{
    phase: string
    count: number
    subtasksCount?: number
    color: string
  }>
}

const TaskPhaseChart: React.FC<TaskPhaseChartProps> = ({ data }) => {
  console.log('TaskPhaseChart received data:', data)
  
  // Filter out workflows with 0 tasks for display
  // This ensures deleted workflows or empty workflows don't show in chart
  const filteredData = data.filter(item => item.count > 0)
  
  console.log('Filtered data (count > 0):', filteredData)
  
  // If no data, show empty state
  if (filteredData.length === 0) {
    console.log('No workflow data with tasks > 0, showing empty state')
  }
  
  const chartData = filteredData.map(item => ({
    name: item.phase,
    value: item.count,
    color: item.color
  }))

  const CustomTooltip = ({ active, payload }: any) => {
    if (active && payload && payload.length) {
      return (
        <div className="bg-white dark:bg-gray-800 p-3 border border-gray-200 dark:border-gray-700 rounded-lg shadow-lg">
          <p className="font-medium text-gray-900 dark:text-white">{payload[0].name}</p>
          <p className="text-sm text-gray-600 dark:text-gray-300">
            Tasks: <span className="font-medium">{payload[0].value}</span>
          </p>
        </div>
      )
    }
    return null
  }

  return (
    <motion.div
      initial={{ opacity: 0, scale: 0.95 }}
      animate={{ opacity: 1, scale: 1 }}
      className="bg-white dark:bg-gray-800 rounded-xl border border-gray-100 dark:border-gray-700 p-8"
    >
      <h3 className="text-xl font-black text-gray-900 dark:text-white mb-6 tracking-tight uppercase">Tasks by Workflow</h3>
      
      {/* Legend under title - VERTICAL layout */}
      {filteredData.length > 0 && (
        <div className="flex flex-col gap-2 mb-6">
          {filteredData.map((item, index) => (
            <div key={`legend-top-${index}`} className="flex items-center gap-2">
              <div 
                className="w-3 h-3 rounded-sm flex-shrink-0" 
                style={{ backgroundColor: item.color }}
              />
              <span className="text-xs text-gray-600 dark:text-gray-300">
                <span className="font-semibold text-gray-800 dark:text-gray-100">{item.phase}</span>
                {' - '}
                <span className="font-medium">Tasks: {item.count}</span>
                {item.subtasksCount !== undefined && item.subtasksCount > 0 && (
                  <span> - Subtasks: {item.subtasksCount}</span>
                )}
              </span>
            </div>
          ))}
        </div>
      )}
      
      {filteredData.length > 0 ? (
        <div className="h-64">
          <ResponsiveContainer width="100%" height="100%">
            <PieChart>
              <Pie
                data={chartData}
                cx="50%"
                cy="50%"
                innerRadius={50}
                outerRadius={90}
                paddingAngle={2}
                dataKey="value"
                label={({ percent }) => `${(percent * 100).toFixed(0)}%`}
              >
                {chartData.map((entry, index) => (
                  <Cell key={`cell-${index}`} fill={entry.color} />
                ))}
              </Pie>
              <Tooltip content={<CustomTooltip />} />
            </PieChart>
          </ResponsiveContainer>
        </div>
      ) : (
        <div className="h-64 flex items-center justify-center">
          <div className="text-center">
            <div className="text-4xl mb-3">📊</div>
            <p className="text-gray-500 dark:text-gray-400 font-medium">No tasks yet</p>
            <p className="text-gray-400 text-sm mt-1">Create tasks to see workflow distribution</p>
          </div>
        </div>
      )}
    </motion.div>
  )
}

export default TaskPhaseChart
