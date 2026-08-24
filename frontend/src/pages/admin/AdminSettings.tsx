import React, { useState, useEffect } from 'react';
import {
  ShieldCheckIcon,
  ClockIcon,
  DocumentTextIcon,
} from '@heroicons/react/24/outline';
import api from '@/services/api';
import toast from 'react-hot-toast';
import AiProviderChain from '@/components/admin/AiProviderChain';
import Select from '@/components/ui/Select';

/**
 * What is actually global.
 *
 * AI is no longer in here. A platform-wide key meant one company's traffic could
 * exhaust a quota every other company then found missing, so providers are configured
 * per company and this covers only the settings that genuinely apply to everybody.
 */
interface SystemSettings {
  maxFileSize: number;
  allowedFileTypes: string;
  sessionTimeout: number;
}

const AdminSettings: React.FC = () => {
  /**
   * Null until the platform's real settings arrive. Nothing is guessed.
   *
   * This used to be seeded with 5MB / 8 hours / a fixed MIME list, and the catch
   * below deliberately kept them on failure ("Use defaults if fetch fails"). Those
   * three numbers were then rendered in the inputs as though they were what the
   * platform is configured with. That is bad enough on its own, but the Save button
   * sits directly beneath them: a super admin who opened this page during an outage
   * and pressed Save would PUT three invented values over whatever was genuinely
   * configured, and the upload limit for every company on the platform would quietly
   * become whatever this file happened to have hardcoded.
   */
  const [settings, setSettings] = useState<SystemSettings | null>(null);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState(false);
  const [saving, setSaving] = useState(false);

  /**
   * Which company's AI is being configured.
   *
   * There is no platform-wide key any more, so this screen cannot configure "AI" in
   * the abstract: a super admin picks the tenant whose chain they are editing.
   */
  const [companies, setCompanies] = useState<{ id: string; name: string }[]>([]);
  const [companyId, setCompanyId] = useState('');

  useEffect(() => {
    api
      .get('/companies')
      .then(({ data }) => {
        const list = Array.isArray(data) ? data : data?.companies ?? [];
        setCompanies(list.map((c: any) => ({ id: c.id, name: c.name })));
        // One company is the common case; picking it saves a click that has no choice in it.
        if (list.length === 1) setCompanyId(list[0].id);
      })
      .catch(() => setCompanies([]));
  }, []);

  useEffect(() => {
    fetchSystemSettings();
  }, []);

  const fetchSystemSettings = async () => {
    setLoading(true);
    setLoadError(false);
    try {
      const { data } = await api.get('/system/settings');
      if (!data) throw new Error('The settings endpoint returned nothing');
      setSettings({
        maxFileSize: data.maxFileSize,
        allowedFileTypes: data.allowedFileTypes,
        sessionTimeout: data.sessionTimeout,
      });
    } catch (error) {
      console.error('Error fetching system settings:', error);
      setLoadError(true);
      setSettings(null);
    } finally {
      setLoading(false);
    }
  };

  const handleSave = async () => {
    // Unreachable while the button is disabled, but the guard is what makes the
    // button's disabled state a rule rather than a decoration.
    if (!settings) return;
    setSaving(true);
    try {
      // Send only writable fields. The GET returns more than this form owns.
      const { data } = await api.put('/system/settings', {
        maxFileSize: settings.maxFileSize,
        allowedFileTypes: settings.allowedFileTypes,
        sessionTimeout: settings.sessionTimeout,
      });
      if (data) setSettings((current) => (current ? { ...current, ...data } : current));
      toast.success('Settings saved');
    } catch (error) {
      console.error('Error saving settings:', error);
      toast.error('Failed to save settings');
    } finally {
      setSaving(false);
    }
  };

  const settingsSections = !settings ? [] : [
    {
      title: 'File Upload Settings',
      icon: DocumentTextIcon,
      settings: [
        {
          label: 'Max File Size (MB)',
          value: (settings.maxFileSize / 1048576).toFixed(1),
          onChange: (value: string) => setSettings({ ...settings, maxFileSize: parseFloat(value) * 1048576 }),
          type: 'number',
          description: 'Maximum file size allowed for uploads across all companies',
        },
        {
          label: 'Allowed File Types',
          value: settings.allowedFileTypes,
          onChange: (value: string) => setSettings({ ...settings, allowedFileTypes: value }),
          type: 'text',
          description: 'Comma-separated list of allowed MIME types',
        },
      ],
    },
    {
      title: 'Session Settings',
      icon: ClockIcon,
      settings: [
        {
          label: 'Session Timeout (minutes)',
          value: settings.sessionTimeout.toString(),
          onChange: (value: string) => setSettings({ ...settings, sessionTimeout: parseInt(value) }),
          type: 'number',
          description: 'How long users can stay logged in without activity',
        },
      ],
    },
    {
      title: 'Plan & Billing Settings',
      icon: ShieldCheckIcon,
      settings: [],
      isCustom: true,
      render: () => (
        <div className="flex items-center justify-between">
          <div>
            <p className="text-sm font-medium text-gray-900 dark:text-white">Manage Subscription Plans</p>
            <p className="text-xs text-gray-500 dark:text-gray-400">Configure global limits and pricing for all tiers</p>
          </div>
          <button
            onClick={() => window.location.href = '/admin/plans'}
            className="px-4 py-2 bg-primary-50 dark:bg-primary-900/30 text-primary-700 dark:text-primary-300 text-sm font-medium rounded-lg hover:bg-primary-100 dark:hover:bg-primary-900/50 transition-colors"
          >
            Go to Plan Settings
          </button>
        </div>
      )
    },
  ];

  if (loading) {
    return (
      <div className="p-6">
        <div className="animate-pulse">
          <div className="h-8 bg-gray-200 dark:bg-gray-700 rounded w-1/4 mb-6"></div>
          <div className="space-y-4">
            <div className="h-32 bg-gray-200 dark:bg-gray-700 rounded"></div>
            <div className="h-32 bg-gray-200 dark:bg-gray-700 rounded"></div>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="p-6 max-w-4xl">
      <div className="mb-6">
        <h1 className="text-2xl font-bold text-gray-900 dark:text-white">System Settings</h1>
        <p className="mt-2 text-sm text-gray-600 dark:text-gray-300">
          Configure global platform settings that apply to all companies
        </p>
      </div>

      <div className="space-y-6">
        <div className="surface p-4">
          <label htmlFor="ai-company" className="form-label">
            Configure AI for
          </label>
          <Select
            id="ai-company"
            value={companyId}
            onChange={(e) => setCompanyId(e.target.value)}
            className="select-field sm:max-w-sm"
          >
            <option value="">Choose a company…</option>
            {companies.map((c) => (
              <option key={c.id} value={c.id}>{c.name}</option>
            ))}
          </Select>
          <p className="form-hint">
            Each company has its own providers and its own keys. Nothing is shared between
            them, so one running out of quota cannot affect another.
          </p>
        </div>

        {companyId && (
          <AiProviderChain
            companyId={companyId}
            companyName={companies.find((c) => c.id === companyId)?.name}
          />
        )}

        {loadError && (
          <div className="rounded-lg border border-error-200 bg-error-50 p-4 dark:border-error-900/40 dark:bg-error-900/20">
            <h3 className="text-sm font-medium text-error-800 dark:text-error-300">
              Platform settings could not be loaded
            </h3>
            <p className="mt-1 text-sm text-error-700 dark:text-error-300">
              The upload and session limits are not shown because they are not known.
              Saving is disabled until they load, so nothing here can overwrite what is
              already configured.
            </p>
            <button onClick={fetchSystemSettings} className="btn-primary mt-3">Try again</button>
          </div>
        )}

        {settingsSections.map((section) => (
          <div key={section.title} className="bg-white dark:bg-gray-800 shadow rounded-lg">
            <div className="px-6 py-4 border-b border-gray-200 dark:border-gray-700">
              <div className="flex items-center">
                <section.icon className="h-6 w-6 text-primary-600 dark:text-primary-400 mr-3" />
                <h2 className="text-lg font-medium text-gray-900 dark:text-white">{section.title}</h2>
              </div>
            </div>
            <div className="px-6 py-4 space-y-4">
              {section.isCustom ? (
                section.render()
              ) : (
                section.settings.map((setting) => (
                  <div key={setting.label}>
                    <label className="block text-sm font-medium text-gray-700 dark:text-gray-200 mb-1">
                      {setting.label}
                    </label>
                    <input
                      type={setting.type}
                      value={setting.value}
                      onChange={(e) => setting.onChange(e.target.value)}
                      className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg focus:ring-2 focus:ring-primary-500 focus:border-transparent"
                    />
                    <p className="mt-1 text-xs text-gray-500 dark:text-gray-400">{setting.description}</p>
                  </div>
                ))
              )}
            </div>
          </div>
        ))}

        {/*
          A "System Information" panel used to sit here reporting Platform Version
          2.0.0, PostgreSQL (Neon), NestJS (Render) and React + Vite (Cloudflare), and
          a "Security" panel listing JWT authentication, multi-tenant isolation and
          bcrypt with a green "Active" pill beside each.

          Not one of those was read from anything. The version was a string literal
          that would have gone stale at the next release, and a status badge that
          cannot render any value other than "Active" is not reporting a check, it is
          drawing a reassurance. On a page an administrator visits precisely to find
          out whether something is switched on, that is the worst place in the app to
          put a number nobody verifies.

          They are gone rather than rewritten because there is no endpoint behind
          them. Bring the panel back when there is something real to read.
        */}
      </div>

      <div className="mt-6 flex justify-end space-x-3">
        <button
          type="button"
          onClick={fetchSystemSettings}
          className="px-4 py-2 border border-gray-300 dark:border-gray-600 rounded-lg text-sm font-medium text-gray-700 dark:text-gray-200 hover:bg-gray-50 dark:hover:bg-gray-700"
        >
          Reload
        </button>
        <button
          type="button"
          onClick={handleSave}
          disabled={saving || !settings}
          className="px-4 py-2 bg-primary-600 text-white rounded-lg text-sm font-medium hover:bg-primary-700 disabled:opacity-50"
        >
          {saving ? 'Saving...' : 'Save Changes'}
        </button>
      </div>

      <div className="mt-6 bg-yellow-50 dark:bg-yellow-900/30 border border-yellow-200 rounded-lg p-4">
        <div className="flex">
          <div className="flex-shrink-0">
            <ShieldCheckIcon className="h-5 w-5 text-yellow-400" aria-hidden="true" />
          </div>
          <div className="ml-3">
            <h3 className="text-sm font-medium text-yellow-800 dark:text-yellow-300">Important Notice</h3>
            <div className="mt-2 text-sm text-yellow-700 dark:text-yellow-300">
              <p>
                Changes to system settings affect all companies on the platform.
                Use caution when modifying these values.
              </p>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};

export default AdminSettings;

