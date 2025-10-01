import React, { useState } from 'react'
import { useAppSelector } from '@/hooks/redux'
import { Tab } from '@headlessui/react'
import { ChartBarIcon, UserGroupIcon, UserIcon } from '@heroicons/react/24/outline'
import AnalyticsDashboard from '@/components/analytics/AnalyticsDashboard'
import UserAnalytics from '@/components/analytics/UserAnalytics'
import TeamAnalytics from '@/components/analytics/TeamAnalytics'

function classNames(...classes: string[]) {
  return classes.filter(Boolean).join(' ')
}

const AnalyticsPage: React.FC = () => {
  const { user } = useAppSelector((state) => state.auth)
  const [selectedTab, setSelectedTab] = useState(0)

  const isAdmin = user?.role === 'SUPER_ADMIN' || user?.role === 'ADMIN'

  const tabs = isAdmin
    ? [
        { name: 'Overview', icon: ChartBarIcon },
        { name: 'My Analytics', icon: UserIcon },
        { name: 'Team Analytics', icon: UserGroupIcon },
      ]
    : [
        { name: 'My Analytics', icon: UserIcon },
      ]

  return (
    <div className="space-y-6">
      {/* Header */}
      <div>
        <h1 className="text-2xl font-bold text-gray-900">Analytics</h1>
        <p className="text-gray-600 mt-1">
          Track and analyze task performance and team productivity
        </p>
      </div>

      {/* Tabs */}
      <Tab.Group selectedIndex={selectedTab} onChange={setSelectedTab}>
        <Tab.List className="flex space-x-1 rounded-xl bg-gray-100 p-1">
          {tabs.map((tab) => (
            <Tab
              key={tab.name}
              className={({ selected }) =>
                classNames(
                  'w-full rounded-lg py-2.5 text-sm font-medium leading-5',
                  'ring-white ring-opacity-60 ring-offset-2 ring-offset-primary-400 focus:outline-none focus:ring-2',
                  selected
                    ? 'bg-white text-primary-700 shadow'
                    : 'text-gray-600 hover:bg-white/[0.12] hover:text-primary-600'
                )
              }
            >
              <div className="flex items-center justify-center space-x-2">
                <tab.icon className="h-5 w-5" />
                <span>{tab.name}</span>
              </div>
            </Tab>
          ))}
        </Tab.List>
        <Tab.Panels>
          <Tab.Panel>
            <AnalyticsDashboard />
          </Tab.Panel>
          <Tab.Panel>
            <UserAnalytics />
          </Tab.Panel>
          <Tab.Panel>
            <TeamAnalytics />
          </Tab.Panel>
        </Tab.Panels>
      </Tab.Group>
    </div>
  )
}

export default AnalyticsPage