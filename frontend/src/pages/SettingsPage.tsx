import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import {
  UsersIcon,
  Cog6ToothIcon,
  GlobeAltIcon,
  ChartBarIcon,
  UserCircleIcon,
  SparklesIcon,
  BuildingOffice2Icon,
  ArrowRightIcon,
} from '@heroicons/react/24/outline'
import api from '@/services/api'
import PageHeader from '@/components/ui/PageHeader'
import Badge from '@/components/ui/Badge'

interface MyCompany {
  name?: string
  slug?: string
  subscriptionPlan?: string
  subscriptionStatus?: string
  aiEnabled?: boolean
  aiProvider?: string
}

const cards = [
  { title: 'Team & Users', description: 'Invite, edit, and manage members and roles', href: '/users', icon: UsersIcon },
  { title: 'Workflows', description: 'Configure task workflows and phases', href: '/workflows', icon: Cog6ToothIcon },
  { title: 'Knowledge Sources', description: 'Company & competitor URLs that power AI content', href: '/knowledge-sources', icon: GlobeAltIcon },
  { title: 'Analytics', description: 'Performance, output, and team insights', href: '/analytics', icon: ChartBarIcon },
  { title: 'My Profile', description: 'Your account and password', href: '/profile', icon: UserCircleIcon },
]

export default function SettingsPage() {
  const [company, setCompany] = useState<MyCompany | null>(null)

  useEffect(() => {
    api
      .get('/companies/my-company')
      .then((res) => setCompany(res.data))
      .catch(() => setCompany(null))
  }, [])

  return (
    <div className="max-w-6xl mx-auto">
      <PageHeader title="Settings" subtitle="Manage your workspace, team, and AI configuration" />

      {/* Company summary */}
      <div className="rounded-xl border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 p-6 mb-8">
        <div className="flex flex-col sm:flex-row sm:items-center gap-4">
          <div className="h-12 w-12 rounded-xl bg-primary-50 dark:bg-primary-900/30 text-primary-600 dark:text-primary-300 flex items-center justify-center border border-primary-100 dark:border-primary-800 shrink-0">
            <BuildingOffice2Icon className="h-6 w-6" />
          </div>
          <div className="min-w-0 flex-1">
            <h2 className="text-lg font-bold text-gray-900 dark:text-white truncate">
              {company?.name || 'Your Company'}
            </h2>
            <div className="flex flex-wrap items-center gap-2 mt-1">
              {company?.subscriptionPlan && <Badge tone="primary">{company.subscriptionPlan}</Badge>}
              {company?.subscriptionStatus && (
                <Badge tone={company.subscriptionStatus === 'ACTIVE' ? 'success' : 'warning'}>
                  {company.subscriptionStatus}
                </Badge>
              )}
              <Badge tone={company?.aiEnabled ? 'success' : 'neutral'}>
                <SparklesIcon className="h-3.5 w-3.5 mr-1" />
                AI {company?.aiEnabled ? `On · ${company.aiProvider || 'gemini'}` : 'Off'}
              </Badge>
            </div>
          </div>
        </div>
        <p className="text-xs text-gray-500 dark:text-gray-400 mt-4">
          AI keys and subscription are managed by your platform administrator. Contact them to change your plan or AI provider.
        </p>
      </div>

      {/* Management cards */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
        {cards.map(({ title, description, href, icon: Icon }) => (
          <Link
            key={href}
            to={href}
            className="group rounded-xl border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 p-5 hover:border-primary-300 dark:hover:border-primary-700 hover:shadow-sm transition-all"
          >
            <div className="flex items-start justify-between">
              <div className="h-10 w-10 rounded-lg bg-gray-100 dark:bg-gray-700 text-gray-600 dark:text-gray-300 flex items-center justify-center group-hover:bg-primary-50 group-hover:text-primary-600 dark:group-hover:bg-primary-900/30 dark:group-hover:text-primary-300 transition-colors">
                <Icon className="h-6 w-6" />
              </div>
              <ArrowRightIcon className="h-4 w-4 text-gray-300 dark:text-gray-600 group-hover:text-primary-500 transition-colors" />
            </div>
            <h3 className="mt-4 text-base font-semibold text-gray-900 dark:text-white">{title}</h3>
            <p className="mt-1 text-sm text-gray-500 dark:text-gray-400">{description}</p>
          </Link>
        ))}
      </div>
    </div>
  )
}
