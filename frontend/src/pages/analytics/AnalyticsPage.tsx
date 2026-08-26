import React, { useState } from 'react'
import { useAppSelector } from '@/hooks/redux'
import { Tab } from '@headlessui/react'
import { ChartBarIcon, UserGroupIcon, UserIcon, TicketIcon } from '@heroicons/react/24/outline'
import AdminAnalyticsDashboard from '@/components/analytics/AdminAnalyticsDashboard'
import UserAnalytics from '@/components/analytics/UserAnalytics'
import TeamAnalytics from '@/components/analytics/TeamAnalytics'
import TicketAnalytics from '@/components/analytics/TicketAnalytics'

function classNames(...classes: string[]) {
  return classes.filter(Boolean).join(' ')
}

const AnalyticsPage: React.FC = () => {
  const { user } = useAppSelector((state) => state.auth)
  const isAdmin = user?.role === 'SUPER_ADMIN' || user?.role === 'ADMIN' || user?.role === 'COMPANY_ADMIN'
  
  // Keyed, not indexed. The list depends on the role, so index 2 means Team for an
  // admin and nothing at all for anyone else: a role that changes mid-session left
  // the page pointing at a tab that no longer exists.
  const tabs = isAdmin
    ? [
        { key: 'overview', name: 'Overview', icon: ChartBarIcon },
        { key: 'mine', name: 'My analytics', icon: UserIcon },
        { key: 'team', name: 'Team analytics', icon: UserGroupIcon },
        { key: 'tickets', name: 'Tickets', icon: TicketIcon },
      ]
    : [{ key: 'mine', name: 'My analytics', icon: UserIcon }]

  const [selectedKey, setSelectedKey] = useState(tabs[0].key)
  const selectedTab = Math.max(0, tabs.findIndex((t) => t.key === selectedKey))

  return (
    <div className="space-y-6">
      {/* Header */}
      <div>
        <h1 className="page-title">Analytics</h1>
        <p className="page-subtitle">
          How work is moving: what is getting done, by whom, and where it is slowing down.
        </p>
      </div>

      {/* Tabs */}
      <Tab.Group selectedIndex={selectedTab} onChange={(i) => setSelectedKey(tabs[i]?.key ?? tabs[0].key)}>
        <Tab.List className="flex space-x-2 rounded-xl bg-gray-100 dark:bg-gray-800 p-1.5">
          {tabs.map((tab) => (
            <Tab
              key={tab.name}
              className={({ selected }) =>
                classNames(
                  'w-full rounded-lg py-3 text-sm font-semibold leading-5',
                  'ring-white ring-opacity-60 ring-offset-2 ring-offset-primary-400 focus:outline-none focus:ring-2 transition-all',
                  selected
                    ? 'bg-white dark:bg-gray-800 text-primary-700 shadow-md'
                    : 'text-gray-600 dark:text-gray-300 hover:bg-white/[0.12] hover:text-primary-600'
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
        <Tab.Panels className="mt-6">
          {isAdmin ? (
            <>
              <Tab.Panel>
                <AdminAnalyticsDashboard />
              </Tab.Panel>
              <Tab.Panel>
                <UserAnalytics />
              </Tab.Panel>
              <Tab.Panel>
                <TeamAnalytics />
              </Tab.Panel>
              <Tab.Panel>
                <TicketAnalytics />
              </Tab.Panel>
            </>
          ) : (
            <Tab.Panel>
              <UserAnalytics />
            </Tab.Panel>
          )}
        </Tab.Panels>
      </Tab.Group>
    </div>
  )
}

export default AnalyticsPage