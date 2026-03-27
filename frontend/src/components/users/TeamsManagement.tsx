import React, { useState, useEffect } from 'react'
import { PlusIcon, UserGroupIcon, TrashIcon } from '@heroicons/react/24/outline'
import api from '@/services/api'
import { toast } from 'react-hot-toast'

const TeamsManagement: React.FC = () => {
  const [teams, setTeams] = useState<any[]>([])
  const [availableUsers, setAvailableUsers] = useState<any[]>([])
  const [isLoading, setIsLoading] = useState(true)
  const [showCreateModal, setShowCreateModal] = useState(false)
  const [newTeamName, setNewTeamName] = useState('')
  const [selectedUserIds, setSelectedUserIds] = useState<string[]>([])

  useEffect(() => {
    fetchData()
  }, [])

  const fetchData = async () => {
    setIsLoading(true)
    try {
      const [teamsRes, usersRes] = await Promise.all([
        api.get('/teams'),
        api.get('/users')
      ])
      setTeams(teamsRes.data)
      setAvailableUsers(usersRes.data)
    } catch (error) {
      toast.error('Failed to fetch teams data')
    } finally {
      setIsLoading(false)
    }
  }

  const handleCreate = async () => {
    if (!newTeamName) return
    try {
      await api.post('/teams', {
        name: newTeamName,
        memberIds: selectedUserIds
      })
      toast.success('Team created')
      setNewTeamName('')
      setSelectedUserIds([])
      setShowCreateModal(false)
      fetchData()
    } catch (error) {
      toast.error('Failed to create team')
    }
  }

  const handleDelete = async (id: string) => {
    if (!confirm('Are you sure you want to delete this team?')) return
    try {
      await api.delete(`/teams/${id}`)
      toast.success('Team deleted')
      fetchData()
    } catch (error) {
      toast.error('Failed to delete team')
    }
  }

  const toggleUser = (userId: string) => {
    setSelectedUserIds(prev => 
      prev.includes(userId) ? prev.filter(id => id !== userId) : [...prev, userId]
    )
  }

  if (isLoading) return <div className="text-center py-8">Loading teams...</div>

  return (
    <div className="space-y-6">
      <div className="flex justify-between items-center">
        <h2 className="text-xl font-semibold text-gray-800">Teams</h2>
        <button onClick={() => setShowCreateModal(true)} className="btn-primary">
          <PlusIcon className="h-4 w-4 mr-2" />
          Add Team
        </button>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
        {teams.map((team) => (
          <div key={team.id} className="card p-4 border border-gray-100 hover:shadow-md transition-shadow">
            <div className="flex justify-between items-start">
              <div className="flex items-center space-x-3">
                <div className="p-2 bg-indigo-100 rounded-lg">
                  <UserGroupIcon className="h-6 w-6 text-indigo-600" />
                </div>
                <div>
                  <h3 className="font-bold text-gray-900">{team.name}</h3>
                  <div className="text-sm text-gray-500 mt-1">
                    {team.members?.length || 0} members
                  </div>
                </div>
              </div>
              <button 
                onClick={() => handleDelete(team.id)}
                className="p-1 text-gray-400 hover:text-red-600 rounded-full hover:bg-gray-100"
              >
                <TrashIcon className="h-4 w-4" />
              </button>
            </div>
            <div className="mt-4 flex flex-wrap gap-1">
              {team.members?.map((m: any) => (
                <div key={m.user?.id} className="px-2 py-0.5 bg-gray-100 rounded text-xs text-gray-600">
                  {m.user?.name}
                </div>
              ))}
            </div>
          </div>
        ))}
      </div>

      {showCreateModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black bg-opacity-50">
          <div className="bg-white rounded-xl shadow-2xl p-6 w-full max-w-md max-h-[80vh] overflow-y-auto">
            <h3 className="text-xl font-bold mb-4">Create Team</h3>
            <div className="space-y-4">
              <div>
                <label className="block text-sm font-medium text-gray-700">Team Name</label>
                <input 
                  type="text" 
                  value={newTeamName}
                  onChange={(e) => setNewTeamName(e.target.value)}
                  className="input mt-1" 
                  placeholder="e.g. Design Hackathon, Q4 Task Force" 
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">Members</label>
                <div className="space-y-2 max-h-40 overflow-y-auto p-2 border rounded-lg">
                  {availableUsers.map(u => (
                    <label key={u.id} className="flex items-center space-x-3 cursor-pointer p-1 hover:bg-gray-50 rounded">
                      <input 
                        type="checkbox" 
                        checked={selectedUserIds.includes(u.id)}
                        onChange={() => toggleUser(u.id)}
                        className="rounded border-gray-300 text-primary-600 shadow-sm"
                      />
                      <span className="text-sm text-gray-700">{u.name} ({u.department?.name || 'No Dept'})</span>
                    </label>
                  ))}
                </div>
              </div>
            </div>
            <div className="mt-6 flex justify-end space-x-3">
              <button onClick={() => setShowCreateModal(false)} className="px-4 py-2 text-gray-600 hover:bg-gray-100 rounded-lg">Cancel</button>
              <button 
                onClick={handleCreate} 
                className="btn-primary"
                disabled={!newTeamName}
              >
                Create
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}

export default TeamsManagement
