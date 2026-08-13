import React, { useState } from 'react';
import {
  CpuChipIcon,
  KeyIcon,
  CheckCircleIcon,
  ExclamationTriangleIcon,
  ArrowPathIcon,
  EyeIcon,
  EyeSlashIcon,
} from '@heroicons/react/24/outline';
import api from '@/services/api';
import toast from 'react-hot-toast';
import Select from '@/components/ui/Select'

export interface PlatformAiConfig {
  platformAiEnabled: boolean;
  platformAiProvider: string;
  platformAiModel: string | null;
  platformAiKeySet: boolean;
  platformAiApiKey: string;
}

interface Provider {
  id: string;
  name: string;
  /** What a super admin needs to know before picking this one. */
  summary: string;
  keyHint: string;
  keyPrefix?: string;
  consoleUrl: string;
  models: { id: string; label: string }[];
  vision: boolean;
}

/**
 * The platform key is the one credential every company falls back to. Anthropic is
 * listed first because it is the only option here with paid-tier rate limits, native
 * image reading, and no free-tier request cliff.
 */
const PROVIDERS: Provider[] = [
  {
    id: 'anthropic',
    name: 'Claude (Anthropic)',
    summary: 'Paid usage-based billing, no free-tier request cliff. Reads images and PDFs.',
    keyHint: 'Create a key at console.anthropic.com → API keys, then add credit under Billing.',
    keyPrefix: 'sk-ant-',
    consoleUrl: 'https://console.anthropic.com/settings/keys',
    vision: true,
    models: [
      { id: 'claude-opus-5', label: 'Claude Opus 5, most capable' },
      { id: 'claude-sonnet-5', label: 'Claude Sonnet 5, balanced' },
      { id: 'claude-haiku-4-5', label: 'Claude Haiku 4.5, fastest and cheapest' },
    ],
  },
  {
    id: 'gemini',
    name: 'Google Gemini',
    summary: 'Free tier available, but its per-minute limit is low and trips easily.',
    keyHint: 'Create a key at aistudio.google.com → Get API key.',
    consoleUrl: 'https://aistudio.google.com/app/apikey',
    vision: true,
    models: [],
  },
  {
    id: 'groq',
    name: 'Groq',
    summary: 'Very fast and free, text only. Image attachments are rejected.',
    keyHint: 'Create a key at console.groq.com → API Keys.',
    keyPrefix: 'gsk_',
    consoleUrl: 'https://console.groq.com/keys',
    vision: false,
    models: [],
  },
  {
    id: 'openai',
    name: 'OpenAI',
    summary: 'Paid usage-based billing, text only in this deployment.',
    keyHint: 'Create a key at platform.openai.com → API keys.',
    keyPrefix: 'sk-',
    consoleUrl: 'https://platform.openai.com/api-keys',
    vision: false,
    models: [],
  },
];

interface Props {
  config: PlatformAiConfig;
  onChange: (next: PlatformAiConfig) => void;
}

const PlatformAiSettings: React.FC<Props> = ({ config, onChange }) => {
  const [showKey, setShowKey] = useState(false);
  const [testing, setTesting] = useState(false);
  const [testResult, setTestResult] = useState<{ ok: boolean; message: string } | null>(null);

  const provider = PROVIDERS.find((p) => p.id === config.platformAiProvider) ?? PROVIDERS[0];
  const keyIsDirty = !!config.platformAiApiKey && !config.platformAiApiKey.startsWith('•');
  const prefixMismatch =
    keyIsDirty && provider.keyPrefix ? !config.platformAiApiKey.trim().startsWith(provider.keyPrefix) : false;

  const runTest = async () => {
    setTesting(true);
    setTestResult(null);
    try {
      const { data } = await api.post('/system/settings/platform-ai/test');
      setTestResult({ ok: data.ok, message: data.message });
      if (data.ok) toast.success('Platform AI key verified');
    } catch (error: any) {
      const message = error?.response?.data?.message ?? 'Could not reach the AI service.';
      setTestResult({ ok: false, message });
    } finally {
      setTesting(false);
    }
  };

  return (
    <section className="bg-white dark:bg-gray-800 shadow rounded-lg">
      <header className="px-6 py-4 border-b border-gray-200 dark:border-gray-700">
        <div className="flex items-start gap-3">
          <CpuChipIcon className="h-6 w-6 flex-shrink-0 text-primary-600 dark:text-primary-400 mt-0.5" />
          <div className="min-w-0">
            <h2 className="text-lg font-medium text-gray-900 dark:text-white">AI Platform Key</h2>
            <p className="mt-1 text-sm text-gray-600 dark:text-gray-300">
              One key, shared by every company. Companies that have their own key keep using it, this
              one covers everyone else, and covers them too while their own key is rate limited.
            </p>
          </div>
        </div>
      </header>

      <div className="px-6 py-5 space-y-5">
        {/* Status strip, the one thing a super admin checks at a glance. */}
        <div
          className={`flex items-center gap-3 rounded-lg border px-4 py-3 ${
            config.platformAiEnabled && config.platformAiKeySet
              ? 'border-green-200 bg-green-50 dark:border-green-900 dark:bg-green-900/20'
              : 'border-amber-200 bg-amber-50 dark:border-amber-900 dark:bg-amber-900/20'
          }`}
        >
          {config.platformAiEnabled && config.platformAiKeySet ? (
            <>
              <CheckCircleIcon className="h-5 w-5 flex-shrink-0 text-green-600 dark:text-green-400" />
              <p className="text-sm text-green-900 dark:text-green-200">
                Serving AI to all companies via <strong>{provider.name}</strong>
                {config.platformAiModel ? ` (${config.platformAiModel})` : ''}.
              </p>
            </>
          ) : (
            <>
              <ExclamationTriangleIcon className="h-5 w-5 flex-shrink-0 text-amber-600 dark:text-amber-400" />
              <p className="text-sm text-amber-900 dark:text-amber-200">
                {config.platformAiKeySet
                  ? 'A key is saved but switched off. Companies without their own key cannot use AI.'
                  : 'No platform key saved. Only companies with their own key can use AI.'}
              </p>
            </>
          )}
        </div>

        <label className="flex items-start gap-3 cursor-pointer">
          <input
            type="checkbox"
            checked={config.platformAiEnabled}
            onChange={(e) => onChange({ ...config, platformAiEnabled: e.target.checked })}
            className="mt-0.5 h-4 w-4 rounded border-gray-300 text-primary-600 focus:ring-primary-500 dark:border-gray-600 dark:bg-gray-900"
          />
          <span>
            <span className="block text-sm font-medium text-gray-900 dark:text-white">
              Use this key for every company
            </span>
            <span className="block text-xs text-gray-500 dark:text-gray-400">
              Turn off to go back to per-company keys only.
            </span>
          </span>
        </label>

        <div className="grid gap-5 sm:grid-cols-2">
          <div>
            <label
              htmlFor="platform-ai-provider"
              className="block text-sm font-medium text-gray-700 dark:text-gray-200 mb-1"
            >
              Provider
            </label>
            <Select
              id="platform-ai-provider"
              value={config.platformAiProvider}
              onChange={(e) => {
                const next = PROVIDERS.find((p) => p.id === e.target.value);
                onChange({
                  ...config,
                  platformAiProvider: e.target.value,
                  // A model id is provider-specific, so drop it when the provider changes.
                  platformAiModel: next?.models[0]?.id ?? null,
                });
                setTestResult(null);
              }}
              className="select-field"
            >
              {PROVIDERS.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.name}
                </option>
              ))}
            </Select>
            <p className="mt-1.5 text-xs text-gray-500 dark:text-gray-400">{provider.summary}</p>
          </div>

          {provider.models.length > 0 && (
            <div>
              <label
                htmlFor="platform-ai-model"
                className="block text-sm font-medium text-gray-700 dark:text-gray-200 mb-1"
              >
                Model
              </label>
              <Select
                id="platform-ai-model"
                value={config.platformAiModel ?? provider.models[0].id}
                onChange={(e) => onChange({ ...config, platformAiModel: e.target.value })}
                className="select-field"
              >
                {provider.models.map((m) => (
                  <option key={m.id} value={m.id}>
                    {m.label}
                  </option>
                ))}
              </Select>
              <p className="mt-1.5 text-xs text-gray-500 dark:text-gray-400">
                Cost scales with the model. Haiku handles task descriptions and chat well for a fraction
                of the price.
              </p>
            </div>
          )}
        </div>

        <div>
          <label
            htmlFor="platform-ai-key"
            className="block text-sm font-medium text-gray-700 dark:text-gray-200 mb-1"
          >
            API key
          </label>
          <div className="relative">
            <KeyIcon className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-gray-500 dark:text-gray-400" />
            <input
              id="platform-ai-key"
              type={showKey ? 'text' : 'password'}
              value={config.platformAiApiKey}
              onChange={(e) => {
                onChange({ ...config, platformAiApiKey: e.target.value });
                setTestResult(null);
              }}
              placeholder={config.platformAiKeySet ? 'Saved, type to replace' : provider.keyPrefix ?? 'Paste your key'}
              autoComplete="off"
              spellCheck={false}
              className="input-field pl-9 pr-11 font-mono"
            />
            <button
              type="button"
              onClick={() => setShowKey((v) => !v)}
              aria-label={showKey ? 'Hide key' : 'Show key'}
              className="absolute right-2 top-1/2 -translate-y-1/2 rounded p-1.5 text-gray-500 dark:text-gray-400 hover:text-gray-600 dark:hover:text-gray-200"
            >
              {showKey ? <EyeSlashIcon className="h-4 w-4" /> : <EyeIcon className="h-4 w-4" />}
            </button>
          </div>

          <p className="mt-1.5 text-xs text-gray-500 dark:text-gray-400">
            {provider.keyHint}{' '}
            <a
              href={provider.consoleUrl}
              target="_blank"
              rel="noreferrer"
              className="font-medium text-primary-600 hover:underline dark:text-primary-400"
            >
              Open console
            </a>
          </p>

          {prefixMismatch && (
            <p className="mt-1.5 text-xs text-amber-700 dark:text-amber-400">
              {provider.name} keys start with <code className="font-mono">{provider.keyPrefix}</code>. Check
              you pasted a key for the selected provider.
            </p>
          )}

          {!provider.vision && (
            <p className="mt-1.5 text-xs text-amber-700 dark:text-amber-400">
              {provider.name} is text only here. Users who attach images to chat will get an error.
            </p>
          )}
        </div>

        <div className="flex flex-wrap items-center gap-3 border-t border-gray-200 pt-4 dark:border-gray-700">
          <button
            type="button"
            onClick={runTest}
            disabled={testing || !config.platformAiKeySet}
            className="btn-secondary"
          >
            {testing ? (
              <ArrowPathIcon className="mr-2 h-4 w-4 animate-spin" />
            ) : (
              <CheckCircleIcon className="mr-2 h-4 w-4" />
            )}
            {testing ? 'Testing…' : 'Test saved key'}
          </button>

          <p className="text-xs text-gray-500 dark:text-gray-400">
            {config.platformAiKeySet
              ? 'Sends one short prompt through the saved key.'
              : 'Save a key first, then test it.'}
          </p>
        </div>

        {testResult && (
          <div
            role="status"
            className={`flex items-start gap-3 rounded-lg border px-4 py-3 text-sm ${
              testResult.ok
                ? 'border-green-200 bg-green-50 text-green-900 dark:border-green-900 dark:bg-green-900/20 dark:text-green-200'
                : 'border-red-200 bg-red-50 text-red-900 dark:border-red-900 dark:bg-red-900/20 dark:text-red-200'
            }`}
          >
            {testResult.ok ? (
              <CheckCircleIcon className="h-5 w-5 flex-shrink-0" />
            ) : (
              <ExclamationTriangleIcon className="h-5 w-5 flex-shrink-0" />
            )}
            <p className="min-w-0 break-words">{testResult.message}</p>
          </div>
        )}
      </div>
    </section>
  );
};

export default PlatformAiSettings;
