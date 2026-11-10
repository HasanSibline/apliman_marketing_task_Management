import { useState, useEffect, useRef } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import toast from 'react-hot-toast';
import api, { formatAssetUrl, plansApi, billingApi, type PlanRecord, type RetiredUser } from '../services/api';
import Select from '@/components/ui/Select'
import { confirmDialog } from '@/components/ui/confirm'
import { formatLimit, formatPlanPrice, planLabel } from '@/components/billing/subscription'

interface EditCompanyForm {
  name: string;
  slug: string;
  logo?: string;
  primaryColor: string;
  subscriptionPlan: string;
  /**
   * Off means the company follows its plan's limits, which is what the server stores
   * as null. On means a super admin set this company's own numbers on purpose.
   */
  customLimits: boolean;
  /** Text, so an empty box stays empty rather than becoming a limit of 0. */
  maxUsers: string;
  maxTasks: string;
  billingEmail?: string;
  /** Purchase-order tickets at or above this amount require manager approval.
   *  Empty string means the gate is off, not zero. */
  ticketApprovalThreshold: string;
}

/** What the company had when the page loaded, so only real changes are sent. */
interface LoadedLimits {
  plan: string;
  maxUsers: number | null;
  maxTasks: number | null;
  maxStorage: number | null;
}

/**
 * A limit box's value as the server wants it: -1 for unlimited, a positive whole
 * number, or undefined when the box does not hold a usable limit.
 */
function parseLimit(text: string): number | undefined {
  const n = Number(text.trim());
  if (text.trim() === '' || !Number.isInteger(n)) return undefined;
  if (n === -1 || n >= 1) return n;
  return undefined;
}

export default function EditCompany() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [loading, setLoading] = useState(false);
  const [loadingData, setLoadingData] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [logoFile, setLogoFile] = useState<File | null>(null);
  const [logoPreview, setLogoPreview] = useState<string | null>(null);

  const [formData, setFormData] = useState<EditCompanyForm>({
    name: '',
    slug: '',
    primaryColor: '#3B82F6',
    subscriptionPlan: '',
    customLimits: false,
    maxUsers: '',
    maxTasks: '',
    ticketApprovalThreshold: '',
  });
  const [plans, setPlans] = useState<PlanRecord[]>([]);
  const [loaded, setLoaded] = useState<LoadedLimits | null>(null);
  /** People counted against the user limit right now, for the deactivation warning. */
  const [activeUsers, setActiveUsers] = useState<number | null>(null);

  useEffect(() => {
    if (id) {
      fetchCompany();
    }
  }, [id]);

  const fetchCompany = async () => {
    try {
      setLoadingData(true);
      const [response, planList] = await Promise.all([
        api.get(`/companies/${id}`),
        plansApi.list().catch(() => [] as PlanRecord[]),
      ]);
      const company = response.data;
      setPlans(planList);

      // Null is "follows the plan" and is kept as exactly that. Inventing a number
      // here would turn into a custom limit on the next save, and a low one would
      // deactivate real people.
      const maxUsers: number | null = company.maxUsers ?? null;
      const maxTasks: number | null = company.maxTasks ?? null;
      const maxStorage: number | null = company.maxStorage ?? null;
      setLoaded({ plan: company.subscriptionPlan || '', maxUsers, maxTasks, maxStorage });

      setFormData({
        name: company.name || '',
        slug: company.slug || '',
        logo: company.logo || undefined,
        primaryColor: company.primaryColor || '#3B82F6',
        subscriptionPlan: company.subscriptionPlan || '',
        customLimits: maxUsers !== null || maxTasks !== null,
        maxUsers: maxUsers !== null ? String(maxUsers) : '',
        maxTasks: maxTasks !== null ? String(maxTasks) : '',
        billingEmail: company.billingEmail || '',
        ticketApprovalThreshold:
          company.settings?.ticketApprovalThreshold != null
            ? String(company.settings.ticketApprovalThreshold)
            : '',
      });

      setActiveUsers(typeof company.stats?.totalUsers === 'number' ? company.stats.totalUsers : null);
      billingApi
        .overview()
        .then((o) => {
          const row = o.companies.find((c) => c.id === id);
          if (row) setActiveUsers(row.activeUsers);
        })
        .catch(() => undefined);

      // Set logo preview if exists
      if (company.logo) {
        const absoluteLogoUrl = company.logo ? formatAssetUrl(company.logo) : null;
        setLogoPreview(absoluteLogoUrl);
      }
    } catch (err: any) {
      console.error('Error fetching company:', err);
      toast.error('Failed to load company data');
      navigate('/admin/companies');
    } finally {
      setLoadingData(false);
    }
  };

  const handleChange = (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement>) => {
    const { name, value, type } = e.target;

    if (type === 'checkbox') {
      const checked = (e.target as HTMLInputElement).checked;
      setFormData(prev => ({
        ...prev,
        [name]: checked,
      }));
    } else {
      // Limits stay as typed text. A plan change no longer copies numbers in, because
      // a company that follows its plan should go on following the new one.
      setFormData(prev => ({ ...prev, [name]: value }));
    }
  };

  const handleLogoChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      // Fallback for browsers with poor webp support
      const type = file.type || (file.name.toLowerCase().endsWith('.webp') ? 'image/webp' : '');
      console.log(`Edit logo selected: ${file.name}, type: ${type}, size: ${file.size}`);

      if (file.size > 5 * 1024 * 1024) {
        toast.error('File size must be less than 5MB');
        return;
      }

      if (!type.startsWith('image/')) {
        toast.error('Please select an image file');
        return;
      }

      setLogoFile(file);

      const reader = new FileReader();
      reader.onloadend = () => {
        setLogoPreview(reader.result as string);
      };
      reader.readAsDataURL(file);
    }
  };

  const removeLogo = () => {
    setLogoFile(null);
    setLogoPreview(null);
    setFormData(prev => ({ ...prev, logo: undefined }));
    if (fileInputRef.current) {
      fileInputRef.current.value = '';
    }
  };

  const uploadLogo = async (): Promise<string | undefined> => {
    if (!logoFile) return formData.logo;

    try {
      const formDataUpload = new FormData();
      formDataUpload.append('file', logoFile);

      const response = await api.post('/files/upload/branding', formDataUpload, {
        headers: {
          'Content-Type': 'multipart/form-data',
        },
      });

      console.log('Logo uploaded successfully:', response.data);
      return response.data.url; // Returns path like /api/files/public/filename.webp
    } catch (err) {
      console.error('Error uploading logo:', err);
      toast.error('Failed to upload logo');
      throw err; // Re-throw to prevent saving with failed logo upload
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    try {
      setLoading(true);
      setError(null);

      // Upload logo if a new one was selected
      let logoUrl = formData.logo;
      if (logoFile) {
        logoUrl = await uploadLogo();
      }

      // Limits: send only what actually changed. A limit in the payload makes the server
      // re-check the user count and deactivate anyone over it, so an unchanged limit
      // must not be sent just because the form was saved.
      // An empty box follows the plan for that field, and a value left exactly as it
      // was loaded is kept as it is, even one the old form wrote that is not valid now
      // (a 0, say). Only a value someone actually typed is validated.
      const limitFor = (text: string, was: number | null): number | null | undefined => {
        if (!formData.customLimits) return null;
        const t = text.trim();
        if (t === '') return null;
        if (was !== null && t === String(was)) return was;
        return parseLimit(t);
      };
      const wantUsers = limitFor(formData.maxUsers, loaded?.maxUsers ?? null);
      const wantTasks = limitFor(formData.maxTasks, loaded?.maxTasks ?? null);
      if (wantUsers === undefined || wantTasks === undefined) {
        throw Object.assign(new Error('limits'), {
          friendly: 'Custom limits must be a whole number of 1 or more, or -1 for unlimited.',
        });
      }
      const planChanged = !!loaded && formData.subscriptionPlan !== loaded.plan;
      const limitPatch: Record<string, number | null> = {};
      if (loaded && wantUsers !== loaded.maxUsers) limitPatch.maxUsers = wantUsers;
      if (loaded && wantTasks !== loaded.maxTasks) limitPatch.maxTasks = wantTasks;
      // Storage is not enforced and has no box here. It is only cleared, alongside the
      // other two, when the company goes back to following its plan.
      if (loaded && !formData.customLimits && loaded.maxStorage !== null) limitPatch.maxStorage = null;

      // The limit that will apply after saving, and whether saving changes it.
      const newPlan = plans.find((p) => p.name === formData.subscriptionPlan);
      const effectiveUsers = wantUsers !== null ? wantUsers : newPlan?.maxUsers;
      const limitTouched = planChanged || 'maxUsers' in limitPatch;
      if (
        limitTouched &&
        typeof effectiveUsers === 'number' &&
        effectiveUsers !== -1 &&
        activeUsers !== null &&
        activeUsers > effectiveUsers
      ) {
        const over = activeUsers - effectiveUsers;
        const ok = await confirmDialog({
          title: `Deactivate up to ${over} user${over === 1 ? '' : 's'}?`,
          description: `This company has ${activeUsers} active users and the new limit is ${effectiveUsers}. ${over} user${over === 1 ? '' : 's'} will be deactivated (newest first, never company admins). They can be reactivated later if the limit is raised.`,
          confirmText: 'Save and deactivate',
          variant: 'danger',
        });
        if (!ok) {
          setLoading(false);
          return;
        }
      }

      const payload: any = {
        name: formData.name,
        /**
         * Empty string, not undefined, when there is no logo.
         *
         * `removeLogo` set this to `undefined`, and JSON.stringify drops undefined
         * keys, so the field never reached the server: the preview disappeared, the
         * save reported success, and the old logo was still there on the next load.
         * The column is an optional string, and every place that renders it goes
         * through Avatar, which falls back to initials for a falsy src.
         */
        logo: logoUrl ?? '',
        primaryColor: formData.primaryColor,
        subscriptionPlan: formData.subscriptionPlan,
        ...limitPatch,
        billingEmail: formData.billingEmail,
        // Empty box means "off": send null rather than parsing '' to NaN or 0, either
        // of which would mean something a blank box does not.
        ticketApprovalThreshold:
          formData.ticketApprovalThreshold.trim() === ''
            ? null
            : Number(formData.ticketApprovalThreshold),
      };

      const { data } = await api.patch(`/companies/${id}`, payload);

      const retired: RetiredUser[] = Array.isArray(data?.retiredUsers) ? data.retiredUsers : [];
      if (retired.length > 0) {
        toast(
          `${retired.length} user${retired.length === 1 ? ' was' : 's were'} deactivated to fit the new limit: ${retired
            .map((u) => u.name || u.email)
            .join(', ')}`,
          { duration: 8000 },
        );
      }
      toast.success('Company updated successfully!');
      navigate(`/admin/companies/${id}`);
    } catch (err: any) {
      console.error('Error updating company:', err);
      const serverMessage = err.response?.data?.message;
      const errorMessage =
        err.friendly || (Array.isArray(serverMessage) ? serverMessage.join(', ') : serverMessage) || 'Failed to update company';
      setError(errorMessage);
      toast.error(errorMessage);
    } finally {
      setLoading(false);
    }
  };

  if (loadingData) {
    return (
      <div className="flex items-center justify-center min-h-screen">
        <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-600"></div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gray-50 dark:bg-gray-900/40 py-8 px-4 sm:px-6 lg:px-8">
      <div className="max-w-3xl mx-auto">
        <div className="mb-8">
          <button
            onClick={() => navigate(`/admin/companies/${id}`)}
            className="text-gray-600 dark:text-gray-300 hover:text-gray-900 dark:hover:text-white mb-4 flex items-center"
          >
            ← Back to Company Details
          </button>
          <h1 className="text-3xl font-bold text-gray-900 dark:text-white">Edit Company</h1>
          <p className="mt-2 text-gray-600 dark:text-gray-300">Update company information and settings</p>
        </div>

        {error && (
          <div className="mb-6 bg-red-50 dark:bg-red-900/30 border border-red-200 text-red-700 dark:text-red-300 px-4 py-3 rounded-lg">
            {error}
          </div>
        )}

        <form onSubmit={handleSubmit} className="bg-white dark:bg-gray-800 rounded-lg shadow-sm p-8 space-y-6">
          {/* Company Info Section */}
          <div>
            <h2 className="text-xl font-semibold text-gray-900 dark:text-white mb-4">Company Information</h2>

            <div className="space-y-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 dark:text-gray-200 mb-2">
                  Company Name *
                </label>
                <input
                  type="text"
                  name="name"
                  value={formData.name}
                  onChange={handleChange}
                  required
                  className="w-full px-4 py-2 border border-gray-300 dark:border-gray-600 rounded-lg focus:ring-2 focus:ring-primary-500 focus:border-transparent"
                />
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 dark:text-gray-200 mb-2">
                  Slug (URL-friendly name) *
                </label>
                <input
                  type="text"
                  name="slug"
                  value={formData.slug}
                  onChange={handleChange}
                  required
                  disabled
                  className="w-full px-4 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-gray-100 dark:bg-gray-800 cursor-not-allowed"
                />
                <p className="text-sm text-gray-500 dark:text-gray-400 mt-1">Slug cannot be changed after creation</p>
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 dark:text-gray-200 mb-2">
                  Primary Color
                </label>
                <div className="flex items-center space-x-4">
                  <input
                    type="color"
                    name="primaryColor"
                    value={formData.primaryColor}
                    onChange={handleChange}
                    className="h-12 w-20 border border-gray-300 dark:border-gray-600 rounded cursor-pointer"
                  />
                  <input
                    type="text"
                    value={formData.primaryColor}
                    onChange={(e) => setFormData(prev => ({ ...prev, primaryColor: e.target.value }))}
                    className="flex-1 px-4 py-2 border border-gray-300 dark:border-gray-600 rounded-lg"
                  />
                </div>
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 dark:text-gray-200 mb-2">
                  Company Logo
                </label>

                {logoPreview && (
                  <div className="mb-4 relative inline-block">
                    <img
                      src={logoPreview}
                      alt="Logo preview"
                      className="h-24 w-24 object-contain border border-gray-300 dark:border-gray-600 rounded-lg p-2 bg-white dark:bg-gray-800"
                    />
                    <button
                      type="button"
                      onClick={removeLogo}
                      aria-label="Remove logo"
                      className="absolute -top-2 -right-2 bg-red-500 text-white rounded-full p-1 hover:bg-red-600"
                    >
                      <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                      </svg>
                    </button>
                  </div>
                )}

                <input
                  ref={fileInputRef}
                  type="file"
                  accept="image/*"
                  onChange={handleLogoChange}
                  className="block w-full text-sm text-gray-500 dark:text-gray-400 file:mr-4 file:py-2 file:px-4 file:rounded-lg file:border-0 file:text-sm file:font-semibold file:bg-blue-50 file:text-blue-700 hover:file:bg-blue-100"
                />
                <p className="text-sm text-gray-500 dark:text-gray-400 mt-1">Upload a new logo to replace the current one</p>
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 dark:text-gray-200 mb-2">
                  Billing Email
                </label>
                <input
                  type="email"
                  name="billingEmail"
                  value={formData.billingEmail || ''}
                  onChange={handleChange}
                  className="w-full px-4 py-2 border border-gray-300 dark:border-gray-600 rounded-lg focus:ring-2 focus:ring-primary-500 focus:border-transparent"
                />
              </div>
            </div>
          </div>

          {/* Subscription Section */}
          <div className="border-t border-gray-200 dark:border-gray-700 pt-6">
            <h2 className="text-xl font-semibold text-gray-900 dark:text-white mb-4">Subscription</h2>

            <div>
              <label className="block text-sm font-medium text-gray-700 dark:text-gray-200 mb-2">
                Subscription Plan
              </label>
              <Select
                name="subscriptionPlan"
                value={formData.subscriptionPlan}
                onChange={handleChange}
                className="select-field w-full mb-4"
              >
                {plans.map((plan) => (
                  <option key={plan.id} value={plan.name}>
                    {`${planLabel(plan.name)} (${formatLimit(plan.maxUsers)} users, ${formatLimit(plan.maxTasks)} tasks), ${
                      plan.name === 'FREE_TRIAL' ? '7-day free trial' : formatPlanPrice(plan.price)
                    }`}
                  </option>
                ))}
                {/* A company on a plan that no longer exists keeps showing it, rather than
                    silently appearing to be on the first plan in the list. */}
                {formData.subscriptionPlan && !plans.some((p) => p.name === formData.subscriptionPlan) && (
                  <option value={formData.subscriptionPlan}>{planLabel(formData.subscriptionPlan)}</option>
                )}
              </Select>

              <div className="bg-gray-50 dark:bg-gray-900/40 p-4 rounded-xl border border-gray-100 dark:border-gray-700 space-y-3">
                <label className="flex items-start gap-3 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={formData.customLimits}
                    onChange={(e) => {
                      const on = e.target.checked;
                      setFormData(prev => {
                        if (!on) return { ...prev, customLimits: false };
                        // Start a custom limit from the plan's own numbers: a deliberate
                        // starting point the super admin then edits, never a guess.
                        const plan = plans.find((p) => p.name === prev.subscriptionPlan);
                        return {
                          ...prev,
                          customLimits: true,
                          maxUsers: prev.maxUsers || (plan ? String(plan.maxUsers) : ''),
                          maxTasks: prev.maxTasks || (plan ? String(plan.maxTasks) : ''),
                        };
                      });
                    }}
                    className="mt-0.5 h-4 w-4 rounded border-gray-300 text-primary-600 focus:ring-primary-500"
                  />
                  <span>
                    <span className="block text-sm font-medium text-gray-900 dark:text-white">Custom limits for this company</span>
                    <span className="block text-xs text-gray-500 dark:text-gray-400">
                      Off: the company follows its plan, and any change to the plan applies to it.
                    </span>
                  </span>
                </label>

                {formData.customLimits ? (
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    <div>
                      <label className="block text-xs font-bold text-gray-500 dark:text-gray-400 tracking-wide mb-1">Max users</label>
                      <input type="number" name="maxUsers" min={-1} value={formData.maxUsers} onChange={handleChange} required
                        className="w-full px-3 py-2 border border-gray-200 dark:border-gray-700 rounded-lg text-sm font-bold" />
                      <p className="text-xs text-gray-500 dark:text-gray-400 mt-1">-1 for unlimited</p>
                    </div>
                    <div>
                      <label className="block text-xs font-bold text-gray-500 dark:text-gray-400 tracking-wide mb-1">Max tasks</label>
                      <input type="number" name="maxTasks" min={-1} value={formData.maxTasks} onChange={handleChange} required
                        className="w-full px-3 py-2 border border-gray-200 dark:border-gray-700 rounded-lg text-sm font-bold" />
                      <p className="text-xs text-gray-500 dark:text-gray-400 mt-1">-1 for unlimited</p>
                    </div>
                  </div>
                ) : (
                  (() => {
                    const plan = plans.find((p) => p.name === formData.subscriptionPlan);
                    return plan ? (
                      <p className="text-sm text-gray-600 dark:text-gray-300">
                        Following the {planLabel(plan.name)} plan: {formatLimit(plan.maxUsers)} users, {formatLimit(plan.maxTasks)} tasks.
                      </p>
                    ) : null;
                  })()
                )}

                {activeUsers !== null && (
                  <p className="text-xs text-gray-500 dark:text-gray-400">
                    {activeUsers} active user{activeUsers === 1 ? '' : 's'} today. Lowering the user limit below that
                    deactivates the newest users first, never company admins.
                  </p>
                )}
              </div>
            </div>
          </div>

          {/* AI keys live on the company's own detail page now, next to its usage and
              health, not here alongside name and plan. */}
          <div className="border-t border-gray-200 dark:border-gray-700 pt-6">
            <div className="flex items-center justify-between rounded-xl border border-gray-200 bg-gray-50 px-4 py-3 dark:border-gray-700 dark:bg-gray-900/40">
              <div>
                <p className="text-sm font-medium text-gray-900 dark:text-white">AI providers</p>
                <p className="text-xs text-gray-500 dark:text-gray-400">Add, reorder or remove keys from the company page</p>
              </div>
              <button
                type="button"
                onClick={() => navigate(`/admin/companies/${id}`)}
                className="px-4 py-2 bg-primary-50 dark:bg-primary-900/30 text-primary-700 dark:text-primary-300 text-sm font-medium rounded-lg hover:bg-primary-100 dark:hover:bg-primary-900/50 transition-colors"
              >
                Manage AI providers
              </button>
            </div>
          </div>

          {/* Ticketing Section */}
          <div className="border-t border-gray-200 dark:border-gray-700 pt-6">
            <h2 className="text-xl font-semibold text-gray-900 dark:text-white mb-4">Ticketing</h2>
            <label className="block text-sm font-medium text-gray-700 dark:text-gray-200 mb-2">
              Purchase-order approval threshold
            </label>
            <div className="flex items-center gap-2 max-w-xs">
              <span className="text-gray-500 dark:text-gray-400">$</span>
              <input
                type="number"
                min="0"
                step="0.01"
                value={formData.ticketApprovalThreshold}
                onChange={(e) => setFormData(prev => ({ ...prev, ticketApprovalThreshold: e.target.value }))}
                placeholder="Off"
                className="w-full px-4 py-2 border border-gray-300 dark:border-gray-600 rounded-lg focus:ring-2 focus:ring-primary-500 focus:border-transparent"
              />
            </div>
            <p className="text-sm text-gray-500 dark:text-gray-400 mt-1">
              A purchase-order ticket at or above this amount always requires the receiving
              department's manager to approve it, even if the requester did not ask for
              approval. Leave blank to turn this off.
            </p>
          </div>

          {/* Action Buttons */}
          <div className="flex justify-end space-x-4 pt-6 border-t border-gray-200 dark:border-gray-700">
            <button
              type="button"
              onClick={() => navigate(`/admin/companies/${id}`)}
              className="px-6 py-2 border border-gray-300 dark:border-gray-600 text-gray-700 dark:text-gray-200 rounded-lg hover:bg-gray-50 dark:hover:bg-gray-700 transition-colors"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={loading}
              className="px-6 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors disabled:opacity-50"
            >
              {loading ? 'Saving...' : 'Save Changes'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

