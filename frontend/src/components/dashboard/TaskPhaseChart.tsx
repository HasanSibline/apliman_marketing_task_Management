import React from 'react'
import { motion } from 'framer-motion'
import { PieChart, Pie, Cell, ResponsiveContainer, Tooltip } from 'recharts'

interface TaskPhaseChartProps {
  data: Array<{
    phase: string
    count: number
    color: string
  }>
}

const TaskPhaseChart: React.FC<TaskPhaseChartProps> = ({ data }) => {
  const chartData = data.map(item => ({
    name: item.phase,
    value: item.count,
    color: item.color
  }))

  const CustomTooltip = ({ active, payload }: any) => {
    if (active && payload && payload.length) {
      return (
        <div className="bg-white p-3 border border-gray-200 rounded-lg shadow-lg">
          <p className="font-medium text-gray-900">{payload[0].name}</p>
          <p className="text-sm text-gray-600">
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
      className="bg-white rounded-lg shadow-sm border border-gray-200 p-6"
    >
      <h3 className="text-lg font-semibold text-gray-900 mb-2">Tasks by Workflow</h3>
      
      {/* Legend under title */}
      {data.length > 0 && (
        <div className="flex flex-wrap gap-3 mb-6">
          {data.map((item, index) => (
            <div key={`legend-top-${index}`} className="flex items-center gap-2">
              <div 
                className="w-3 h-3 rounded-sm" 
                style={{ backgroundColor: item.color }}
              />
              <span className="text-sm text-gray-700 font-medium">
                {item.phase} ({item.count})
              </span>
            </div>
          ))}
        </div>
      )}
      
      {data.length > 0 ? (
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
          <p className="text-gray-500">No task data available</p>
        </div>
      )}
    </motion.div>
  )
}

export default TaskPhaseChart
