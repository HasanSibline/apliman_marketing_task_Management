import React from 'react'
import { motion } from 'framer-motion'
import { PieChart, Pie, Cell, ResponsiveContainer, Tooltip, Legend } from 'recharts'

interface TaskPhaseChartProps {
  data: Array<{
    phase: string
    count: number
    color: string
  }>
}

const TaskPhaseChart: React.FC<TaskPhaseChartProps> = ({ data }) => {
  const COLORS = {
    'PENDING_APPROVAL': '#6B7280',
    'APPROVED': '#3B82F6', 
    'ASSIGNED': '#8B5CF6',
    'IN_PROGRESS': '#F59E0B',
    'COMPLETED': '#10B981',
    'ARCHIVED': '#6B7280'
  }

  const chartData = data.map(item => ({
    name: item.phase.replace('_', ' '),
    value: item.count,
    color: COLORS[item.phase as keyof typeof COLORS] || '#6B7280'
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
      <h3 className="text-lg font-semibold text-gray-900 mb-4">Tasks by Phase</h3>
      
      {data.length > 0 ? (
        <div className="h-64">
          <ResponsiveContainer width="100%" height="100%">
            <PieChart>
              <Pie
                data={chartData}
                cx="50%"
                cy="50%"
                innerRadius={40}
                outerRadius={80}
                paddingAngle={2}
                dataKey="value"
              >
                {chartData.map((entry, index) => (
                  <Cell key={`cell-${index}`} fill={entry.color} />
                ))}
              </Pie>
              <Tooltip content={<CustomTooltip />} />
              <Legend 
                verticalAlign="bottom" 
                height={36}
                formatter={(value) => (
                  <span className="text-sm text-gray-600">{value}</span>
                )}
              />
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
