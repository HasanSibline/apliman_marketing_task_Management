import React, { useState, useEffect } from 'react'
import { confirmDialog } from '@/components/ui/confirm'
import { PlusIcon, UserGroupIcon, TrashIcon } from '@heroicons/react/24/outline'
import api from '@/services/api'
import { toast } from 'react-hot-toast'

const TeamsManagement: React.FC = () => {
  const [teams, setTeams] = useState<any[]>([])
  const [availableUsers, setAvailableUsers] = useState<any[]>([])
  const [isLoading, setIsLoading] = useState(true)
  const [loadFailed, setLoadFailed] = useState(false)
  const [showCreateModal, setShowCreateModal] = useState(false)
  const [newTeamName, setNewTeamName] = useState('')
  const [selectedUserIds, setSelectedUserIds] = useState<string[]>([])

  useEffect(() => {
    fetchData()
  }, [])

  const fetchData = async () => {
    setIsLoading(true)
    try {
      // allSettled: the member picker failing is no reason to claim this company
      // has no teams. Each list stands or falls on its own request.
      const [teamsRes, usersRes] = await Promise.allSettled([
        api.get('/teams'),
        api.get('/users')
      ])

      if (teamsRes.status === 'fulfilled') {
        setTeams(teamsRes.value.data ?? [])
        setLoadFailed(false)
      } else {
        setLoadFailed(true)
        toast.error('Could not load teams')
      }

      if (usersRes.status === 'fulfilled') setAvailableUsers(usersRes.value.data ?? [])
    } catch (error) {
      setLoadFailed(true)
      toast.error('Could not load teams')
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
    if (!(await confirmDialog({
      title: 'Delete this team?',
      description: 'The team is removed. Its members keep their accounts and their work.',
      confirmText: 'Delete team',
      variant: 'danger',
    }))) return
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
        <h2 className="text-xl font-semibold text-gray-800 dark:text-gray-100">Teams</h2>
        <button onClick={() => setShowCreateModal(true)} className="btn-primary">
          <PlusIcon className="h-4 w-4 mr-2" />
          Add Team
        </button>
      </div>

      {/* An empty list and a failed request rendered identically: both showed
          nothing at all, so "none created yet" was indistinguishable from "the
          request failed", and the only clue was a toast that had already gone. */}
      {loadFailed ? (
        <div className="surface px-6 py-12 text-center">
          <p className="text-sm font-medium text-gray-900 dark:text-white">Could not load teams</p>
          <p className="mx-auto mt-1 max-w-sm text-sm text-gray-500 dark:text-gray-400">
            Nothing is missing, we just could not reach the server. Try again in a moment.
          </p>
        </div>
      ) : teams.length === 0 ? (
        <div className="surface px-6 py-12 text-center">
          <p className="text-sm font-medium text-gray-900 dark:text-white">No teams yet</p>
          <p className="mx-auto mt-1 max-w-sm text-sm text-gray-500 dark:text-gray-400">
            A team is a group you can assign work to together, so nobody has to be named individually.
          </p>
        </div>
      ) : (
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
        {teams.map((team) => (
          <div key={team.id} className="card p-4 border border-gray-100 dark:border-gray-700 hover:shadow-md transition-shadow">
            <div className="flex justify-between items-start">
              <div className="flex items-center space-x-3">
                <div className="p-2 bg-indigo-100 dark:bg-indigo-900/30 rounded-lg">
                  <UserGroupIcon className="h-6 w-6 text-indigo-600 dark:text-indigo-400" />
                </div>
                <div>
                  <h3 className="font-bold text-gray-900 dark:text-white">{team.name}</h3>
                  <div className="text-sm text-gray-500 dark:text-gray-400 mt-1">
                    {team.members?.length || 0} members
                  </div>
                </div>
              </div>
              <button 
                onClick={() => handleDelete(team.id)}
                className="p-1 text-gray-500 dark:text-gray-400 hover:text-red-600 rounded-full hover:bg-gray-100 dark:hover:bg-gray-700"
              >
                <TrashIcon className="h-4 w-4" />
              </button>
            </div>
            <div className="mt-4 flex flex-wrap gap-1">
              {team.members?.map((m: any) => (
                <div key={m.user?.id} className="px-2 py-0.5 bg-gray-100 dark:bg-gray-800 rounded text-xs text-gray-600 dark:text-gray-300">
                  {m.user?.name}
                </div>
              ))}
            </div>
          </div>
        ))}
      </div>
      )}

      {showCreateModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black bg-opacity-50">
          <div className="bg-white dark:bg-gray-800 rounded-xl shadow-lg p-6 w-full max-w-md max-h-[80vh] overflow-y-auto">
            <h3 className="text-xl font-bold mb-4">Create Team</h3>
            <div className="space-y-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 dark:text-gray-200">Team Name</label>
                <input 
                  type="text" 
                  value={newTeamName}
                  onChange={(e) => setNewTeamName(e.target.value)}
                  className="input-field mt-1" 
                  placeholder="e.g. Design Hackathon, Q4 Task Force" 
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 dark:text-gray-200 mb-2">Members</label>
                <div className="space-y-2 max-h-40 overflow-y-auto p-2 border rounded-lg">
                  {availableUsers.map(u => (
                    <label key={u.id} className="flex items-center space-x-3 cursor-pointer p-1 hover:bg-gray-50 dark:hover:bg-gray-700 rounded">
                      <input 
                        type="checkbox" 
                        checked={selectedUserIds.includes(u.id)}
                        onChange={() => toggleUser(u.id)}
                        className="rounded border-gray-300 dark:border-gray-600 text-primary-600 dark:text-primary-400 shadow-sm"
                      />
                      <span className="text-sm text-gray-700 dark:text-gray-200">{u.name} ({u.department?.name || 'No Dept'})</span>
                    </label>
                  ))}
                </div>
              </div>
            </div>
            <div className="mt-6 flex justify-end space-x-3">
              <button onClick={() => setShowCreateModal(false)} className="px-4 py-2 text-gray-600 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-700 rounded-lg">Cancel</button>
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
