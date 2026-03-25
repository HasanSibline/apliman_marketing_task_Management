import { useState, useRef } from 'react';
import {
  UsersIcon,
  ClipboardDocumentCheckIcon,
  CloudArrowUpIcon,
  CheckBadgeIcon,
  InformationCircleIcon,
  CalendarIcon,
  SparklesIcon
} from '@heroicons/react/24/outline';
import { useNavigate } from 'react-router-dom';
import toast from 'react-hot-toast';
import api from '../services/api';

// ── One-time credentials modal ────────────────────────────────────────────────
function CredentialsModal({
  data, onClose,
}: {
  data: { label: string; value: string; copyable?: boolean }[];
  onClose: () => void;
}) {
  const [copied, setCopied] = useState<string | null>(null);
  const copy = (text: string, label: string) => {
    navigator.clipboard.writeText(text);
    setCopied(label);
    setTimeout(() => setCopied(null), 2000);
  };
  return (
    <div className="fixed inset-0 bg-black/70 backdrop-blur-sm flex items-center justify-center z-50 p-4">
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-lg overflow-hidden">
        <div className="bg-gradient-to-r from-blue-600 to-blue-500 px-6 py-5">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-white/20 flex items-center justify-center text-white text-xl">
              <CheckBadgeIcon className="h-6 w-6" />
            </div>
            <div>
              <h2 className="text-lg font-bold text-white">Company Created!</h2>
              <p className="text-sm text-blue-100">Save these credentials — password won't be shown again</p>
            </div>
          </div>
        </div>
        <div className="mx-6 mt-4 px-4 py-3 bg-amber-50 border border-amber-200 rounded-xl flex items-start gap-2">
          <span className="text-amber-500 mt-0.5">
            <InformationCircleIcon className="h-5 w-5" />
          </span>
          <p className="text-xs text-amber-700 font-medium">
            This password is shown only once. Copy and share it securely with the company admin before closing.
          </p>
        </div>
        <div className="px-6 py-4 space-y-3">
          {data.map(({ label, value, copyable }) => (
            <div key={label} className="flex items-center justify-between p-3 bg-gray-50 rounded-xl border border-gray-200">
              <div className="flex-1 min-w-0">
                <p className="text-xs text-gray-500 mb-0.5">{label}</p>
                <p className="text-sm font-mono font-semibold text-gray-900 break-all">{value}</p>
              </div>
              {copyable && (
                <button onClick={() => copy(value, label)}
                  className={`ml-3 px-3 py-1.5 rounded-lg text-xs font-medium shrink-0 transition
                    ${copied === label ? 'bg-blue-600 text-white' : 'bg-blue-100 text-blue-700 hover:bg-blue-200'}`}>
                  {copied === label ? '✓ Copied' : 'Copy'}
                </button>
              )}
            </div>
          ))}
        </div>
        <div className="px-6 pb-5 flex gap-3">
          <button
            onClick={() => {
              const all = data.filter(d => d.copyable).map(d => `${d.label}: ${d.value}`).join('\n');
              navigator.clipboard.writeText(all);
              toast.success('All credentials copied!');
            }}
            className="flex-1 px-4 py-2.5 bg-gray-100 hover:bg-gray-200 text-gray-700 rounded-xl text-sm font-medium transition">
            <ClipboardDocumentCheckIcon className="h-5 w-5 mr-2 inline" /> Copy All
          </button>
          <button onClick={onClose}
            className="flex-1 px-4 py-2.5 bg-blue-600 hover:bg-blue-700 text-white rounded-xl text-sm font-semibold transition">
            I've saved it — Close
          </button>
        </div>
      </div>
    </div>
  );
}

interface CreateCompanyForm {
  name: string;
  slug: string;
  logo?: string;
  primaryColor: string;
  adminName: string;
  adminEmail: string;
  adminPassword: string;
  subscriptionPlan: 'FREE_TRIAL' | 'PRO' | 'ENTERPRISE';
  subscriptionDays: number;
  aiApiKey?: string;
  aiProvider: string;
  maxUsers: number;
  maxTasks: number;
  maxStorage: number;
  billingEmail?: string;
}

// ── Field component — defined OUTSIDE the parent so React never remounts it ──
function Field({
  label, name, type = 'text', placeholder, required, hint,
  value, onChange, error, children,
}: {
  label: string;
  name: string;
  type?: string;
  placeholder?: string;
  required?: boolean;
  hint?: string;
  value?: string | number;
  onChange?: (e: React.ChangeEvent<HTMLInputElement>) => void;
  error?: string;
  children?: React.ReactNode;
}) {
  return (
    <div>
      <label className="block text-sm font-medium text-gray-700 mb-1.5">
        {label}{required && <span className="text-blue-600 ml-1">*</span>}
      </label>
      {children ?? (
        <input
          type={type}
          name={name}
          value={value ?? ''}
          onChange={onChange}
          placeholder={placeholder}
          className={`w-full px-4 py-2.5 rounded-xl bg-white border text-gray-900 placeholder-gray-400 text-sm
            focus:outline-none focus:ring-2 focus:ring-blue-500 transition
            ${error ? 'border-red-500' : 'border-gray-300 hover:border-gray-400'}`}
        />
      )}
      {error && (
        <p className="mt-1 text-xs text-red-500 flex items-center gap-1">⚠ {error}</p>
      )}
      {hint && !error && <p className="mt-1 text-xs text-gray-500">{hint}</p>}
    </div>
  );
}

const PLAN_LIMITS: Record<string, { maxUsers: number; maxTasks: number; maxStorage: number; price: string }> = {
  FREE_TRIAL: { maxUsers: 10, maxTasks: 500, maxStorage: 2, price: '7-Day Trial' },
  PRO: { maxUsers: 25, maxTasks: 5000, maxStorage: 10, price: '$99/mo' },
  ENTERPRISE: { maxUsers: 200, maxTasks: -1, maxStorage: 100, price: '$299/mo' },
};

const STEPS = [
  { id: 1, label: 'Company Info', icon: '🏢' },
  { id: 2, label: 'Admin Account', icon: '👤' },
  { id: 3, label: 'Subscription', icon: '💳' },
  { id: 4, label: 'AI & Limits', icon: '🤖' },
];

function PasswordStrength({ password }: { password: string }) {
  if (!password) return null;
  let score = 0;
  if (password.length >= 8) score++;
  if (password.length >= 12) score++;
  if (/[A-Z]/.test(password)) score++;
  if (/[0-9]/.test(password)) score++;
  if (/[^A-Za-z0-9]/.test(password)) score++;

  const levels = [
    { label: 'Weak', color: 'bg-red-500', text: 'text-red-600' },
    { label: 'Weak', color: 'bg-red-500', text: 'text-red-600' },
    { label: 'Fair', color: 'bg-amber-400', text: 'text-amber-600' },
    { label: 'Good', color: 'bg-blue-500', text: 'text-blue-600' },
    { label: 'Strong', color: 'bg-emerald-500', text: 'text-emerald-600' },
    { label: 'Strong', color: 'bg-emerald-500', text: 'text-emerald-600' },
  ];
  const level = levels[Math.min(score, 5)];
  const width = ['10%', '20%', '45%', '65%', '85%', '100%'][Math.min(score, 5)];

  return (
    <div className="mt-2 space-y-1">
      <div className="flex justify-between items-center">
        <span className="text-xs text-gray-500">Password strength</span>
        <span className={`text-xs font-semibold ${level.text}`}>{level.label}</span>
      </div>
      <div className="h-1.5 w-full bg-gray-200 rounded-full overflow-hidden">
        <div className={`h-full rounded-full transition-all duration-500 ${level.color}`} style={{ width }} />
      </div>
      <p className="text-xs text-gray-400">Tip: mix uppercase, numbers & symbols</p>
    </div>
  );
}

export default function CreateCompany() {
  const navigate = useNavigate();
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [loading, setLoading] = useState(false);
  const [step, setStep] = useState(1);
  const [logoFile, setLogoFile] = useState<File | null>(null);
  const [logoPreview, setLogoPreview] = useState<string | null>(null);
  const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({});
  const [credentials, setCredentials] = useState<{ label: string; value: string; copyable?: boolean }[] | null>(null);

  const [formData, setFormData] = useState<CreateCompanyForm>({
    name: '',
    slug: '',
    primaryColor: '#6366f1',
    adminName: '',
    adminEmail: '',
    adminPassword: '',
    subscriptionPlan: 'FREE_TRIAL',
    subscriptionDays: 7,
    aiProvider: 'gemini',
    maxUsers: 10,
    maxTasks: 500,
    maxStorage: 2,
  });

  const clearError = (field: string) =>
    setFieldErrors(prev => { const next = { ...prev }; delete next[field]; return next; });

  const handleChange = (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement>) => {
    const { name, value, type } = e.target;
    const newValue = type === 'number' ? parseInt(value) || 0 : value;
    clearError(name);

    setFormData(prev => {
      const updated = { ...prev, [name]: newValue };

      if (name === 'name') {
        let slug = value.toLowerCase()
          .replace(/[^a-z0-9]+/g, '-')
          .replace(/^-+|-+$/g, '')
          .replace(/-+/g, '-');
        if (!slug && value) slug = 'company';
        updated.slug = slug;
      }

      if (name === 'subscriptionPlan') {
        const limits = PLAN_LIMITS[value] || PLAN_LIMITS.PRO;
        updated.maxUsers = limits.maxUsers;
        updated.maxTasks = limits.maxTasks;
        updated.maxStorage = limits.maxStorage;

        // Auto-set 7 days for FREE_TRIAL
        if (value === 'FREE_TRIAL') {
          updated.subscriptionDays = 7;
        }
      }

      return updated;
    });
  };

  const handleLogoChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    if (file.size > 5 * 1024 * 1024) { toast.error('Max 5MB'); return; }
    if (!file.type.startsWith('image/')) { toast.error('Images only'); return; }
    setLogoFile(file);
    const reader = new FileReader();
    reader.onloadend = () => setLogoPreview(reader.result as string);
    reader.readAsDataURL(file);
  };

  const removeLogo = () => {
    setLogoFile(null);
    setLogoPreview(null);
    setFormData(prev => ({ ...prev, logo: undefined }));
    if (fileInputRef.current) fileInputRef.current.value = '';
  };

  // Per-step validation — returns true if valid
  const validateStep = (s: number): boolean => {
    const errors: Record<string, string> = {};

    if (s === 1) {
      if (!formData.name.trim()) errors.name = 'Company name is required';
      if (!formData.slug.trim()) errors.slug = 'Slug is required';
    }
    if (s === 2) {
      if (!formData.adminName.trim()) errors.adminName = 'Admin name is required';
      if (!formData.adminEmail.trim()) errors.adminEmail = 'Admin email is required';
      else if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(formData.adminEmail))
        errors.adminEmail = 'Enter a valid email address';
      if (!formData.adminPassword) errors.adminPassword = 'Password is required';
      else if (formData.adminPassword.length < 8)
        errors.adminPassword = 'Password must be at least 8 characters';
    }
    if (s === 3) {
      if (!formData.subscriptionDays || formData.subscriptionDays < 1)
        errors.subscriptionDays = 'Must be at least 1 day';
    }
    if (s === 4) {
      if (!formData.aiApiKey?.trim()) {
        errors.aiApiKey = 'AI API Key is required to enable AI features';
      }
    }

    setFieldErrors(errors);
    if (Object.keys(errors).length > 0) {
      toast.error('Please fix the highlighted fields');
      return false;
    }
    return true;
  };

  const nextStep = () => {
    if (validateStep(step) && step < 4) setStep(step + 1);
  };
  const prevStep = () => { if (step > 1) { setFieldErrors({}); setStep(step - 1); } };

  const uploadLogo = async (): Promise<string | undefined> => {
    if (!logoFile) return undefined;
    const fd = new FormData();
    fd.append('file', logoFile);
    const res = await api.post('/files/upload', fd, { headers: { 'Content-Type': 'multipart/form-data' } });
    return res.data.url;
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    e.stopPropagation();
    if (step !== 4) return;
    if (!validateStep(4)) return;

    try {
      setLoading(true);
      let logoUrl: string | undefined;
      if (logoFile) {
        const t = toast.loading('Uploading logo…');
        try { logoUrl = await uploadLogo(); toast.dismiss(t); }
        catch (err) { toast.dismiss(t); throw err; }
      }

      const response = await api.post('/companies', { ...formData, logo: logoUrl });
      toast.success('Company created successfully!');

      // Show one-time credentials modal instead of toast
      if (response.data.adminCredentials) {
        const { email, password } = response.data.adminCredentials;
        const slug = response.data.company?.slug ?? formData.slug;
        setCredentials([
          { label: 'Company', value: formData.name },
          { label: 'Admin Name', value: formData.adminName },
          { label: 'Admin Email', value: email, copyable: true },
          { label: 'Password', value: password, copyable: true },
          { label: 'Login URL', value: `${window.location.origin}/${slug}/login`, copyable: true },
        ]);
      } else {
        navigate('/admin/companies');
      }
    } catch (err: any) {
      const msg = err.response?.data?.message || err.message || 'Failed to create company';
      toast.error(msg);
    } finally {
      setLoading(false);
    }
  };

  const handleKeyDown = (e: React.KeyboardEvent<HTMLFormElement>) => {
    if (e.key === 'Enter' && (e.target as HTMLElement).tagName !== 'TEXTAREA') {
      e.preventDefault();
      if (step < 4) {
        nextStep();
      } else {
        // Trigger handle submit manually if on last step
        const form = e.currentTarget;
        form.requestSubmit();
      }
    }
  };

  const fmt = (n: number) => n === -1 ? '∞' : n.toLocaleString();

  return (
    <div className="min-h-screen bg-gray-50 flex">
      {/* Credentials modal — shown once after successful creation */}
      {credentials && (
        <CredentialsModal
          data={credentials}
          onClose={() => { setCredentials(null); navigate('/admin/companies'); }}
        />
      )}
      {/* ── LEFT SIDEBAR ── */}
      <aside className="hidden lg:flex w-72 flex-col bg-white border-r border-gray-200 p-8 shadow-sm">
        <button
          onClick={() => navigate('/admin/companies')}
          className="flex items-center gap-2 text-gray-500 hover:text-gray-900 text-sm mb-10 transition font-medium"
        >
          <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
          </svg>
          Back to Companies
        </button>

        <div className="mb-10">
          <h1 className="text-xl font-bold text-gray-900">Create Company</h1>
          <p className="text-sm text-gray-500 mt-1">4-step setup wizard</p>
        </div>

        {/* Step list */}
        <nav className="flex flex-col gap-3">
          {STEPS.map((s) => {
            const isActive = step === s.id;
            const isCompleted = step > s.id;
            return (
              <div
                key={s.id}
                className={`flex items-center gap-3 px-4 py-3 rounded-xl transition cursor-default
                  ${isActive ? 'bg-blue-600 text-white shadow-lg shadow-blue-600/20' : ''}
                  ${isCompleted ? 'text-blue-700 bg-blue-50/50' : ''}
                  ${!isActive && !isCompleted ? 'text-gray-400' : ''}`}
              >
                <div className={`w-8 h-8 rounded-full flex items-center justify-center text-xs font-bold shrink-0
                  ${isActive ? 'bg-white text-blue-600' : ''}
                  ${isCompleted ? 'bg-blue-600 text-white' : ''}
                  ${!isActive && !isCompleted ? 'bg-gray-100 text-gray-400' : ''}`}>
                  {isCompleted ? '✓' : s.id}
                </div>
                <div className="min-w-0">
                  <div className={`text-sm font-bold truncate ${isActive ? 'text-white' : isCompleted ? 'text-blue-900' : 'text-gray-500'}`}>
                    {s.label}
                  </div>
                </div>
              </div>
            );
          })}
        </nav>

        {/* Preview card */}
        {formData.name && (
          <div className="mt-auto pt-8">
            <div className="rounded-2xl border border-gray-100 bg-gray-50 p-5 shadow-inner">
              <div className="flex items-center gap-3 mb-4">
                {logoPreview ? (
                  <img src={logoPreview} alt="logo" className="w-10 h-10 rounded-xl object-contain bg-white shadow-sm p-1.5 border border-gray-100" />
                ) : (
                  <div className="w-10 h-10 rounded-xl flex items-center justify-center text-white text-lg font-bold shadow-lg"
                    style={{ backgroundColor: formData.primaryColor }}>
                    {formData.name[0]?.toUpperCase()}
                  </div>
                )}
                <div className="min-w-0">
                  <p className="text-sm font-bold text-gray-900 truncate">{formData.name}</p>
                  <p className="text-xs text-gray-500">/{formData.slug}</p>
                </div>
              </div>
              <div className="flex items-center justify-between">
                <span className={`text-[10px] px-2.5 py-1 rounded-full font-bold uppercase tracking-wider
                  ${formData.subscriptionPlan === 'FREE_TRIAL' ? 'bg-purple-100 text-purple-700' : ''}
                  ${formData.subscriptionPlan === 'PRO' ? 'bg-blue-100 text-blue-700' : ''}
                  ${formData.subscriptionPlan === 'ENTERPRISE' ? 'bg-amber-100 text-amber-700' : ''}`}>
                  {formData.subscriptionPlan === 'FREE_TRIAL' ? 'TRIAL' : formData.subscriptionPlan}
                </span>
                <span className="text-xs font-medium text-gray-400">{formData.subscriptionDays}d</span>
              </div>
            </div>
          </div>
        )}
      </aside>

      {/* ── MAIN CONTENT ── */}
      <main className="flex-1 flex flex-col min-h-screen overflow-y-auto">
        {/* Mobile header */}
        <div className="lg:hidden flex items-center gap-3 p-4 border-b border-gray-200 bg-white">
          <button onClick={() => navigate('/admin/companies')} className="text-gray-500">
            <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
            </svg>
          </button>
          <h1 className="text-gray-900 font-bold text-lg">Create New Company</h1>
        </div>

        <div className="flex-1 flex flex-col max-w-2xl mx-auto w-full px-6 py-12">
          {/* Progress bar */}
          <div className="mb-12">
            <div className="flex items-center justify-between">
              {STEPS.map((s, i) => (
                <div key={s.id} className="flex-1 flex items-center group">
                  <div className="flex flex-col items-center flex-1 relative">
                    <div className={`w-10 h-10 rounded-2xl flex items-center justify-center text-sm font-bold transition-all duration-300 z-10
                      ${step > s.id ? 'bg-blue-600 text-white shadow-lg shadow-blue-600/20' : ''}
                      ${step === s.id ? 'bg-blue-600 text-white shadow-xl shadow-blue-600/30 ring-4 ring-blue-600/10' : ''}
                      ${step < s.id ? 'bg-white text-gray-300 border border-gray-100' : ''}`}>
                      {step > s.id ? '✓' : s.id}
                    </div>
                    <span className={`absolute -bottom-7 whitespace-nowrap text-[10px] font-black uppercase tracking-widest transition-colors
                      ${step === s.id ? 'text-blue-600' : step > s.id ? 'text-blue-600/60' : 'text-gray-400'}`}>
                      {s.label}
                    </span>
                  </div>
                  {i < STEPS.length - 1 && (
                    <div className="flex-1 px-2">
                      <div className={`h-1 rounded-full transition-all duration-500
                        ${step > s.id ? 'bg-blue-600' : 'bg-gray-100'}`} />
                    </div>
                  )}
                </div>
              ))}
            </div>
          </div>

          {/* Card */}
          <form
            onSubmit={handleSubmit}
            onKeyDown={handleKeyDown}
            autoComplete="off"
            className="bg-white border border-gray-200 rounded-3xl p-8 lg:p-10 shadow-xl shadow-gray-200/50"
          >
            {/* ── STEP 1: Company Info ── */}
            {step === 1 && (
              <div className="space-y-8">
                <div className="mb-4">
                  <h2 className="text-2xl font-bold text-gray-900 tracking-tight">Company Information</h2>
                  <p className="text-sm text-gray-500 mt-1.5 font-medium">Basic details about the company to set up the workspace.</p>
                </div>

                <Field label="Company Name" name="name" placeholder="e.g. Acme Corporation" required
                  value={formData.name} onChange={handleChange} error={fieldErrors.name}
                  hint="This is the company's display name seen by all users." />

                <Field label="URL Slug" name="slug" placeholder="e.g. acme-corporation" required
                  value={formData.slug} onChange={handleChange} error={fieldErrors.slug}
                  hint={`Your portal will be: ${window.location.origin}/${formData.slug || 'slug'}/login`} />

                <div>
                  <label className="block text-sm font-bold text-gray-700 mb-2">
                    Brand Color
                  </label>
                  <div className="flex items-center gap-4">
                    <div className="relative group">
                      <input
                        type="color"
                        name="primaryColor"
                        value={formData.primaryColor}
                        onChange={handleChange}
                        className="w-14 h-14 rounded-2xl border-2 border-gray-100 bg-white cursor-pointer p-1 shadow-sm group-hover:border-blue-200 transition"
                      />
                    </div>
                    <div className="flex-1 relative">
                      <input
                        type="text"
                        value={formData.primaryColor}
                        onChange={e => setFormData(prev => ({ ...prev, primaryColor: e.target.value }))}
                        className="w-full px-4 py-3 rounded-xl bg-gray-50 border border-gray-200 text-gray-900 font-mono text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 focus:bg-white transition"
                        placeholder="#6366f1"
                      />
                    </div>
                    <div className="w-14 h-14 rounded-2xl shadow-inner border border-gray-100" style={{ backgroundColor: formData.primaryColor }} />
                  </div>
                </div>

                <div>
                  <label className="block text-sm font-bold text-gray-700 mb-2">Company Logo</label>
                  {logoPreview ? (
                    <div className="flex items-center gap-5 p-5 bg-blue-50/50 rounded-2xl border border-blue-100">
                      <img src={logoPreview} alt="logo preview" className="w-16 h-16 object-contain rounded-xl bg-white shadow-sm p-1.5 border border-white" />
                      <div className="flex-1 min-w-0">
                        <p className="text-sm text-gray-900 font-bold truncate">{logoFile?.name}</p>
                        <p className="text-xs text-gray-500 font-medium">{((logoFile?.size ?? 0) / 1024).toFixed(0)} KB</p>
                      </div>
                      <button type="button" onClick={removeLogo}
                        className="bg-white text-gray-400 hover:text-red-500 p-2.5 rounded-xl border border-gray-100 shadow-sm hover:border-red-100 transition">
                        <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                        </svg>
                      </button>
                    </div>
                  ) : (
                    <label htmlFor="logo-upload"
                      className="flex flex-col items-center justify-center gap-3 p-8 border-2 border-dashed border-gray-200 rounded-2xl cursor-pointer hover:border-blue-400 hover:bg-blue-50 group transition">
                      <div className="w-12 h-12 bg-gray-50 rounded-full flex items-center justify-center text-2xl group-hover:scale-110 transition duration-300 shadow-sm">📁</div>
                      <div className="text-center">
                        <span className="text-sm text-gray-900 font-bold block">Click to upload brand logo</span>
                        <span className="text-xs text-gray-500 font-medium">PNG, JPG, WEBP • max 5MB</span>
                      </div>
                      <input ref={fileInputRef} id="logo-upload" type="file" accept="image/*"
                        onChange={handleLogoChange} className="hidden" />
                    </label>
                  )}
                </div>
              </div>
            )}

            {/* ── STEP 2: Admin Account ── */}
            {step === 2 && (
              <div className="space-y-8">
                <div className="mb-4">
                  <h2 className="text-2xl font-bold text-gray-900 tracking-tight">Admin Account</h2>
                  <p className="text-sm text-gray-500 mt-1.5 font-medium">Primary contact who becomes the Company Administrator.</p>
                </div>

                <Field label="Full Name" name="adminName" placeholder="e.g. John Doe" required
                  value={formData.adminName} onChange={handleChange} error={fieldErrors.adminName} />
                <Field label="Email Address" name="adminEmail" type="email" placeholder="admin@company.com" required
                  value={formData.adminEmail} onChange={handleChange} error={fieldErrors.adminEmail} />

                <div>
                  <label className="block text-sm font-bold text-gray-700 mb-2">
                    Password <span className="text-blue-600">*</span>
                  </label>
                  <input
                    type="password"
                    name="adminPassword"
                    value={formData.adminPassword}
                    onChange={handleChange}
                    placeholder="Create a strong password"
                    className={`w-full px-4 py-3 rounded-xl bg-white border text-gray-900 placeholder-gray-400 text-sm
                      focus:outline-none focus:ring-2 focus:ring-blue-500 transition
                      ${fieldErrors.adminPassword ? 'border-red-500' : 'border-gray-300 hover:border-gray-400'}`}
                  />
                  {fieldErrors.adminPassword && (
                    <p className="mt-1.5 text-xs text-red-500 font-medium flex items-center gap-1">⚠ {fieldErrors.adminPassword}</p>
                  )}
                  <PasswordStrength password={formData.adminPassword} />
                </div>
              </div>
            )}

            {/* ── STEP 3: Subscription ── */}
            {step === 3 && (
              <div className="space-y-8">
                <div className="mb-4">
                  <h2 className="text-2xl font-bold text-gray-900 tracking-tight">Subscription Plan</h2>
                  <p className="text-sm text-gray-500 mt-1.5 font-medium">Choose a package that fits your organization's scale.</p>
                </div>

                {/* Plan cards */}
                <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                  {(['FREE_TRIAL', 'PRO', 'ENTERPRISE'] as const).map(plan => {
                    const info = PLAN_LIMITS[plan];
                    const selected = formData.subscriptionPlan === plan;
                    return (
                      <button
                        key={plan}
                        type="button"
                        onClick={() => handleChange({ target: { name: 'subscriptionPlan', value: plan, type: 'select' } } as any)}
                        className={`group relative flex flex-col items-start p-5 rounded-2xl border-2 transition-all duration-300 text-left
                          ${selected
                            ? 'border-blue-600 bg-blue-50/30'
                            : 'border-gray-100 bg-gray-50/50 hover:border-gray-300 hover:bg-white'}`}
                      >
                        <div className={`text-[10px] font-bold mb-3 px-2.5 py-1 rounded-full uppercase tracking-widest
                          ${plan === 'FREE_TRIAL' ? 'bg-purple-600 text-white shadow-sm' :
                            plan === 'PRO' ? 'bg-blue-600 text-white shadow-sm' :
                              'bg-amber-100 text-amber-700'}`}>
                          {plan === 'FREE_TRIAL' ? 'Free Trial' : plan}
                        </div>
                        <p className="text-gray-900 font-bold text-lg mb-1">{info.price}</p>
                        <div className="space-y-1 mt-2">
                          <p className="text-xs text-gray-500 font-semibold flex items-center gap-1.5">
                            <span className="text-blue-500 opacity-70">●</span> {info.maxUsers === -1 ? 'Unlimited' : info.maxUsers} Users
                          </p>
                          <p className="text-xs text-gray-500 font-semibold flex items-center gap-1.5">
                            <span className="text-blue-500 opacity-70">●</span> {info.maxTasks === -1 ? 'Unlimited' : info.maxTasks} Tasks
                          </p>
                        </div>
                        {selected && (
                          <div className="absolute top-4 right-4">
                            <div className="w-5 h-5 rounded-full bg-blue-600 flex items-center justify-center shadow-lg shadow-blue-200">
                              <svg className="w-3 h-3 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={3} d="M5 13l4 4L19 7" />
                              </svg>
                            </div>
                          </div>
                        )}
                      </button>
                    );
                  })}
                </div>

                <Field label="Initial Duration (days)" name="subscriptionDays" type="number" required
                  value={formData.subscriptionDays} onChange={handleChange} error={fieldErrors.subscriptionDays}
                  hint="Account will be active for this period after creation." />

                <div className="p-5 rounded-2xl bg-gray-50 border border-gray-100 text-sm text-gray-600 font-medium flex items-center gap-2">
                  <CalendarIcon className="h-5 w-5 text-gray-400" />
                  Renewal Date: <span className="font-bold text-gray-900">
                    {new Date(Date.now() + formData.subscriptionDays * 86400000).toLocaleDateString('en-US', {
                      year: 'numeric', month: 'long', day: 'numeric'
                    })}
                  </span>
                </div>

                <Field label="Billing Contact Email" name="billingEmail" type="email" placeholder="billing@company.com"
                  value={formData.billingEmail ?? ''} onChange={handleChange}
                  hint="Used for billing notifications and automated invoices." />
              </div>
            )}

            {/* ── STEP 4: AI & Limits ── */}
            {step === 4 && (
              <div className="space-y-8">
                <div className="mb-4">
                  <h2 className="text-2xl font-bold text-gray-900 tracking-tight">AI & Final Review</h2>
                  <p className="text-sm text-gray-500 mt-1.5 font-medium">Configure intelligence features and verify organization details.</p>
                </div>

                <div className="p-6 rounded-3xl bg-blue-50/50 border border-blue-100 shadow-sm relative overflow-hidden">
                  <div className="absolute top-0 right-0 p-4 opacity-10 blur-[1px]">
                    <SparklesIcon className="h-12 w-12" />
                  </div>
                  <h3 className="text-sm font-bold text-blue-800 flex items-center gap-2 mb-4 uppercase tracking-wider">
                    AI Configuration (Required)
                  </h3>
                  <div className="space-y-5">
                    <Field label="Company AI API Key" name="aiApiKey" placeholder="Enter API Key..." required
                      value={formData.aiApiKey ?? ''} onChange={handleChange} error={fieldErrors.aiApiKey}
                      hint="Paste your Gemini or Groq API key here depending on the selected provider." />

                    <div>
                      <label className="block text-sm font-bold text-gray-700 mb-2">Primary AI Provider</label>
                      <select name="aiProvider" value={formData.aiProvider} onChange={handleChange}
                        className="select-field w-full text-sm">
                        <option value="gemini">Google Gemini (Recommended)</option>
                        <option value="openai">OpenAI (GPT-4)</option>
                        <option value="groq">Groq (High Speed)</option>
                      </select>
                    </div>
                  </div>
                </div>

                {/* Resource Limits List (Style Match) */}
                <div className="rounded-2xl border border-gray-100 bg-gray-50 p-6">
                  <p className="text-[10px] font-bold text-gray-400 mb-5 uppercase tracking-widest">
                    Plan Resources: {formData.subscriptionPlan}
                  </p>
                  <div className="grid grid-cols-3 gap-4">
                    {[
                      { label: 'Max Users', value: fmt(formData.maxUsers), icon: <UsersIcon className="h-6 w-6 text-blue-500" /> },
                      { label: 'Max Tasks', value: fmt(formData.maxTasks), icon: <ClipboardDocumentCheckIcon className="h-6 w-6 text-emerald-500" /> },
                      { label: 'Storage', value: `${fmt(formData.maxStorage)} GB`, icon: <CloudArrowUpIcon className="h-6 w-6 text-purple-500" /> },
                    ].map(({ label, value, icon }) => (
                      <div key={label} className="flex flex-col items-center p-4 bg-white rounded-2xl border border-gray-100 shadow-sm hover:border-blue-200 transition-colors">
                        <div className="mb-2 p-2 bg-gray-50 rounded-xl">{icon}</div>
                        <span className="text-lg font-black text-gray-900 tracking-tight">{value}</span>
                        <span className="text-[10px] font-bold text-gray-400 uppercase">{label}</span>
                      </div>
                    ))}
                  </div>
                </div>

                {/* Full review summary */}
                <div className="rounded-2xl border border-gray-100 bg-white overflow-hidden shadow-sm">
                  <div className="px-5 py-3 border-b border-gray-100 bg-gray-50/80">
                    <h3 className="text-xs font-bold text-gray-900 uppercase tracking-widest flex items-center gap-2">
                      <ClipboardDocumentCheckIcon className="h-4 w-4" /> Registration Summary
                    </h3>
                  </div>
                  <div className="p-5 grid grid-cols-2 gap-x-8 gap-y-4 text-sm">
                    {[
                      { label: 'Organization', value: formData.name, required: true },
                      { label: 'Portal Path', value: `/${formData.slug}`, required: true },
                      { label: 'Administrator', value: formData.adminName, required: true },
                      { label: 'Admin Email', value: formData.adminEmail, required: true },
                      { label: 'Tier', value: formData.subscriptionPlan, weight: 'font-black text-blue-600 uppercase' },
                      { label: 'Status', value: 'Active', weight: 'text-emerald-500 font-bold' },
                      { label: 'AI Status', value: formData.aiApiKey ? 'ENABLED' : 'DISABLED', color: formData.aiApiKey ? 'text-blue-600 font-bold' : 'text-gray-400' },
                      { label: 'Support', value: 'Standard', color: 'text-gray-400' },
                    ].map(({ label, value, required, color, weight }) => (
                      <div key={label} className="flex flex-col border-b border-gray-50 pb-2">
                        <span className="text-gray-400 text-[10px] font-bold uppercase tracking-tight">{label}</span>
                        <span className={`truncate ${weight ?? 'font-bold'} ${color ?? 'text-gray-800'} ${required && !value ? 'text-red-500' : ''}`}>
                          {value || (required ? '⚠ REQUIRED' : '—')}
                        </span>
                      </div>
                    ))}
                  </div>
                </div>
              </div>
            )}

            {/* ── Navigation Buttons ── */}
            <div className="flex items-center justify-between mt-12 pt-8 border-t border-gray-100">
              <button
                type="button"
                onClick={prevStep}
                className={`px-6 py-3 text-sm font-bold rounded-xl border border-gray-200 text-gray-500
                  hover:bg-gray-50 hover:text-gray-900 transition flex items-center gap-2
                  ${step === 1 ? 'invisible' : ''}`}
              >
                <span>←</span> Back
              </button>

              <div className="hidden sm:flex items-center gap-2.5">
                {STEPS.map(s => (
                  <div key={s.id} className={`h-2 rounded-full transition-all duration-300
                    ${step === s.id ? 'w-8 bg-blue-600 shadow-sm' : step > s.id ? 'w-2 bg-blue-200' : 'w-2 bg-gray-100'}`} />
                ))}
              </div>

              {step < 4 ? (
                <button
                  type="button"
                  onClick={nextStep}
                  className="px-8 py-3 text-sm font-bold rounded-xl bg-gray-900 hover:bg-black text-white transition shadow-lg hover:-translate-y-0.5"
                >
                  Continue →
                </button>
              ) : (
                <button
                  type="submit"
                  disabled={loading}
                  className="px-8 py-3 text-sm font-black rounded-xl bg-blue-600 hover:bg-blue-700
                    text-white transition shadow-xl shadow-blue-200 disabled:opacity-60 disabled:cursor-not-allowed
                    flex items-center gap-2 hover:-translate-y-0.5 uppercase tracking-widest"
                >
                  {loading ? (
                    <>
                      <div className="animate-spin w-4 h-4 border-2 border-white/20 border-t-white rounded-full" />
                      Processing...
                    </>
                  ) : 'Confirm & Launch'}
                </button>
              )}
            </div>
          </form>
        </div>
      </main>
    </div>
  );
}
