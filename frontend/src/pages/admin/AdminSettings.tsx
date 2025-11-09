import React, { useState, useEffect } from 'react';
import { 
  ServerIcon, 
  ShieldCheckIcon,
  ClockIcon,
  DocumentTextIcon,
} from '@heroicons/react/24/outline';
import api from '@/services/api';
import toast from 'react-hot-toast';

interface SystemSettings {
  maxFileSize: number;
  allowedFileTypes: string;
  sessionTimeout: number;
}

const AdminSettings: React.FC = () => {
  const [settings, setSettings] = useState<SystemSettings>({
    maxFileSize: 5242880, // 5MB
    allowedFileTypes: 'image/jpeg,image/png,image/webp,application/pdf',
    sessionTimeout: 480, // 8 hours
  });
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    fetchSystemSettings();
  }, []);

  const fetchSystemSettings = async () => {
    setLoading(true);
    try {
      const response = await api.get('/system/settings');
      if (response.data) {
        setSettings(response.data);
      }
    } catch (error) {
      console.error('Error fetching system settings:', error);
      // Use defaults if fetch fails
    } finally {
      setLoading(false);
    }
  };

  const handleSave = async () => {
    setSaving(true);
    try {
      await api.put('/system/settings', settings);
      toast.success('System settings updated successfully');
    } catch (error) {
      console.error('Error saving settings:', error);
      toast.error('Failed to save settings');
    } finally {
      setSaving(false);
    }
  };

  const settingsSections = [
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
  ];

  if (loading) {
    return (
      <div className="p-6">
        <div className="animate-pulse">
          <div className="h-8 bg-gray-200 rounded w-1/4 mb-6"></div>
          <div className="space-y-4">
            <div className="h-32 bg-gray-200 rounded"></div>
            <div className="h-32 bg-gray-200 rounded"></div>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="p-6 max-w-4xl">
      <div className="mb-6">
        <h1 className="text-2xl font-bold text-gray-900">System Settings</h1>
        <p className="mt-2 text-sm text-gray-600">
          Configure global platform settings that apply to all companies
        </p>
      </div>

      <div className="space-y-6">
        {settingsSections.map((section) => (
          <div key={section.title} className="bg-white shadow rounded-lg">
            <div className="px-6 py-4 border-b border-gray-200">
              <div className="flex items-center">
                <section.icon className="h-6 w-6 text-indigo-600 mr-3" />
                <h2 className="text-lg font-medium text-gray-900">{section.title}</h2>
              </div>
            </div>
            <div className="px-6 py-4 space-y-4">
              {section.settings.map((setting) => (
                <div key={setting.label}>
                  <label className="block text-sm font-medium text-gray-700 mb-1">
                    {setting.label}
                  </label>
                  <input
                    type={setting.type}
                    value={setting.value}
                    onChange={(e) => setting.onChange(e.target.value)}
                    className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-indigo-500 focus:border-transparent"
                  />
                  <p className="mt-1 text-xs text-gray-500">{setting.description}</p>
                </div>
              ))}
            </div>
          </div>
        ))}

        {/* Additional Info Cards */}
        <div className="bg-white shadow rounded-lg">
          <div className="px-6 py-4 border-b border-gray-200">
            <div className="flex items-center">
              <ServerIcon className="h-6 w-6 text-indigo-600 mr-3" />
              <h2 className="text-lg font-medium text-gray-900">System Information</h2>
            </div>
          </div>
          <div className="px-6 py-4 space-y-3">
            <div className="flex justify-between">
              <span className="text-sm text-gray-600">Platform Version</span>
              <span className="text-sm font-medium text-gray-900">2.0.0</span>
            </div>
            <div className="flex justify-between">
              <span className="text-sm text-gray-600">Database</span>
              <span className="text-sm font-medium text-gray-900">PostgreSQL (Neon)</span>
            </div>
            <div className="flex justify-between">
              <span className="text-sm text-gray-600">Backend</span>
              <span className="text-sm font-medium text-gray-900">NestJS (Render)</span>
            </div>
            <div className="flex justify-between">
              <span className="text-sm text-gray-600">Frontend</span>
              <span className="text-sm font-medium text-gray-900">React + Vite (Cloudflare)</span>
            </div>
          </div>
        </div>

        <div className="bg-white shadow rounded-lg">
          <div className="px-6 py-4 border-b border-gray-200">
            <div className="flex items-center">
              <ShieldCheckIcon className="h-6 w-6 text-indigo-600 mr-3" />
              <h2 className="text-lg font-medium text-gray-900">Security</h2>
            </div>
          </div>
          <div className="px-6 py-4 space-y-3">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm font-medium text-gray-900">JWT Authentication</p>
                <p className="text-xs text-gray-500">Secure token-based authentication</p>
              </div>
              <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium bg-green-100 text-green-800">
                Active
              </span>
            </div>
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm font-medium text-gray-900">Multi-Tenant Isolation</p>
                <p className="text-xs text-gray-500">Company data isolation enforced</p>
              </div>
              <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium bg-green-100 text-green-800">
                Active
              </span>
            </div>
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm font-medium text-gray-900">Password Encryption</p>
                <p className="text-xs text-gray-500">Bcrypt with 12 salt rounds</p>
              </div>
              <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium bg-green-100 text-green-800">
                Active
              </span>
            </div>
          </div>
        </div>
      </div>

      <div className="mt-6 flex justify-end space-x-3">
        <button
          type="button"
          onClick={fetchSystemSettings}
          className="px-4 py-2 border border-gray-300 rounded-lg text-sm font-medium text-gray-700 hover:bg-gray-50"
        >
          Reset
        </button>
        <button
          type="button"
          onClick={handleSave}
          disabled={saving}
          className="px-4 py-2 bg-indigo-600 text-white rounded-lg text-sm font-medium hover:bg-indigo-700 disabled:opacity-50"
        >
          {saving ? 'Saving...' : 'Save Changes'}
        </button>
      </div>

      <div className="mt-6 bg-yellow-50 border border-yellow-200 rounded-lg p-4">
        <div className="flex">
          <div className="flex-shrink-0">
            <ShieldCheckIcon className="h-5 w-5 text-yellow-400" aria-hidden="true" />
          </div>
          <div className="ml-3">
            <h3 className="text-sm font-medium text-yellow-800">Important Notice</h3>
            <div className="mt-2 text-sm text-yellow-700">
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

