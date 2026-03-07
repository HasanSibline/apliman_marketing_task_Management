import { useState, useRef } from 'react';
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
        <div className="bg-gradient-to-r from-indigo-600 to-indigo-500 px-6 py-5">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-white/20 flex items-center justify-center text-white text-xl">🔐</div>
            <div>
              <h2 className="text-lg font-bold text-white">Company Created!</h2>
              <p className="text-sm text-indigo-200">Save these credentials — password won't be shown again</p>
            </div>
          </div>
        </div>
        <div className="mx-6 mt-4 px-4 py-3 bg-amber-50 border border-amber-200 rounded-xl flex items-start gap-2">
          <span className="text-amber-500 mt-0.5">⚠️</span>
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
                    ${copied === label ? 'bg-emerald-100 text-emerald-700' : 'bg-indigo-100 text-indigo-700 hover:bg-indigo-200'}`}>
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
            📋 Copy All
          </button>
          <button onClick={onClose}
            className="flex-1 px-4 py-2.5 bg-indigo-600 hover:bg-indigo-700 text-white rounded-xl text-sm font-semibold transition">
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
  subscriptionPlan: 'FREE' | 'PRO' | 'ENTERPRISE';
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
      <label className="block text-sm font-medium text-gray-200 mb-1.5">
        {label}{required && <span className="text-indigo-400 ml-1">*</span>}
      </label>
      {children ?? (
        <input
          type={type}
          name={name}
          value={value ?? ''}
          onChange={onChange}
          placeholder={placeholder}
          className={`w-full px-4 py-2.5 rounded-xl bg-gray-800 border text-white placeholder-gray-500 text-sm
            focus:outline-none focus:ring-2 focus:ring-indigo-500 transition
            ${error ? 'border-red-500' : 'border-gray-700 hover:border-gray-600'}`}
        />
      )}
      {error && (
        <p className="mt-1 text-xs text-red-400 flex items-center gap-1">⚠ {error}</p>
      )}
      {hint && !error && <p className="mt-1 text-xs text-gray-500">{hint}</p>}
    </div>
  );
}

const PLAN_LIMITS: Record<string, { maxUsers: number; maxTasks: number; maxStorage: number; price: string }> = {
  FREE: { maxUsers: 5, maxTasks: 100, maxStorage: 1, price: 'Free' },
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
        <span className="text-xs text-gray-400">Password strength</span>
        <span className={`text-xs font-semibold ${level.text}`}>{level.label}</span>
      </div>
      <div className="h-1.5 w-full bg-gray-700 rounded-full overflow-hidden">
        <div className={`h-full rounded-full transition-all duration-500 ${level.color}`} style={{ width }} />
      </div>
      <p className="text-xs text-gray-500">Tip: mix uppercase, numbers & symbols</p>
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
    subscriptionPlan: 'PRO',
    subscriptionDays: 30,
    aiProvider: 'gemini',
    maxUsers: 25,
    maxTasks: 5000,
    maxStorage: 10,
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
    <div className="min-h-screen bg-gray-950 flex">
      {/* Credentials modal — shown once after successful creation */}
      {credentials && (
        <CredentialsModal
          data={credentials}
          onClose={() => { setCredentials(null); navigate('/admin/companies'); }}
        />
      )}
      {/* ── LEFT SIDEBAR ── */}
      <aside className="hidden lg:flex w-72 flex-col bg-gray-900 border-r border-gray-800 p-8">
        <button
          onClick={() => navigate('/admin/companies')}
          className="flex items-center gap-2 text-gray-400 hover:text-white text-sm mb-10 transition"
        >
          <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
          </svg>
          Back to Companies
        </button>

        <div className="mb-10">
          <h1 className="text-xl font-bold text-white">Create Company</h1>
          <p className="text-sm text-gray-400 mt-1">4-step setup wizard</p>
        </div>

        {/* Step list */}
        <nav className="flex flex-col gap-1">
          {STEPS.map((s) => {
            const isActive = step === s.id;
            const isCompleted = step > s.id;
            return (
              <div
                key={s.id}
                className={`flex items-center gap-3 px-4 py-3 rounded-xl transition cursor-default
                  ${isActive ? 'bg-indigo-600 text-white' : ''}
                  ${isCompleted ? 'text-emerald-400' : ''}
                  ${!isActive && !isCompleted ? 'text-gray-500' : ''}`}
              >
                <div className={`w-7 h-7 rounded-full flex items-center justify-center text-xs font-bold shrink-0
                  ${isActive ? 'bg-white text-indigo-600' : ''}
                  ${isCompleted ? 'bg-emerald-500 text-white' : ''}
                  ${!isActive && !isCompleted ? 'bg-gray-800 text-gray-500' : ''}`}>
                  {isCompleted ? '✓' : s.id}
                </div>
                <div>
                  <div className={`text-sm font-medium ${isActive ? 'text-white' : ''}`}>{s.label}</div>
                </div>
              </div>
            );
          })}
        </nav>

        {/* Preview card */}
        {formData.name && (
          <div className="mt-auto pt-8">
            <div className="rounded-xl border border-gray-700 bg-gray-800 p-4">
              <div className="flex items-center gap-3 mb-3">
                {logoPreview ? (
                  <img src={logoPreview} alt="logo" className="w-9 h-9 rounded-lg object-contain bg-white p-1" />
                ) : (
                  <div className="w-9 h-9 rounded-lg flex items-center justify-center text-white text-lg font-bold"
                    style={{ backgroundColor: formData.primaryColor }}>
                    {formData.name[0]?.toUpperCase()}
                  </div>
                )}
                <div>
                  <p className="text-sm font-semibold text-white truncate max-w-[140px]">{formData.name}</p>
                  <p className="text-xs text-gray-400">/{formData.slug}</p>
                </div>
              </div>
              <div className="flex items-center justify-between">
                <span className={`text-xs px-2 py-0.5 rounded-full font-medium
                  ${formData.subscriptionPlan === 'FREE' ? 'bg-gray-700 text-gray-300' : ''}
                  ${formData.subscriptionPlan === 'PRO' ? 'bg-indigo-900 text-indigo-300' : ''}
                  ${formData.subscriptionPlan === 'ENTERPRISE' ? 'bg-amber-900 text-amber-300' : ''}`}>
                  {formData.subscriptionPlan}
                </span>
                <span className="text-xs text-gray-500">{formData.subscriptionDays}d</span>
              </div>
            </div>
          </div>
        )}
      </aside>

      {/* ── MAIN CONTENT ── */}
      <main className="flex-1 flex flex-col min-h-screen overflow-y-auto">
        {/* Mobile header */}
        <div className="lg:hidden flex items-center gap-3 p-4 border-b border-gray-800">
          <button onClick={() => navigate('/admin/companies')} className="text-gray-400">
            <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
            </svg>
          </button>
          <h1 className="text-white font-semibold">Create New Company</h1>
        </div>

        <div className="flex-1 flex flex-col max-w-2xl mx-auto w-full px-6 py-10">
          {/* Progress bar */}
          <div className="mb-8">
            <div className="flex items-center justify-between mb-3">
              {STEPS.map((s, i) => (
                <div key={s.id} className="flex items-center flex-1">
                  <div className="flex flex-col items-center">
                    <div className={`w-9 h-9 rounded-full flex items-center justify-center text-sm font-bold transition-all duration-300
                      ${step > s.id ? 'bg-emerald-500 text-white shadow-lg shadow-emerald-500/30' : ''}
                      ${step === s.id ? 'bg-indigo-600 text-white shadow-lg shadow-indigo-500/40 ring-4 ring-indigo-500/20' : ''}
                      ${step < s.id ? 'bg-gray-800 text-gray-500 border border-gray-700' : ''}`}>
                      {step > s.id ? (
                        <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={3} d="M5 13l4 4L19 7" />
                        </svg>
                      ) : s.id}
                    </div>
                    <span className={`mt-1.5 text-xs font-medium whitespace-nowrap transition-colors
                      ${step === s.id ? 'text-indigo-400' : step > s.id ? 'text-emerald-500' : 'text-gray-600'}`}>
                      {s.label}
                    </span>
                  </div>
                  {i < STEPS.length - 1 && (
                    <div className={`flex-1 h-0.5 mx-3 mb-5 rounded-full transition-colors duration-500
                      ${step > s.id ? 'bg-emerald-500' : 'bg-gray-800'}`} />
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
            className="bg-gray-900 border border-gray-800 rounded-2xl p-8 shadow-2xl"
          >
            {/* ── STEP 1: Company Info ── */}
            {step === 1 && (
              <div className="space-y-6">
                <div className="mb-2">
                  <h2 className="text-xl font-bold text-white">Company Information</h2>
                  <p className="text-sm text-gray-400 mt-1">Basic details about the company</p>
                </div>

                <Field label="Company Name" name="name" placeholder="e.g. Acme Corporation" required
                  value={formData.name} onChange={handleChange} error={fieldErrors.name}
                  hint="This is the company's display name" />

                <Field label="URL Slug" name="slug" placeholder="e.g. acme-corporation" required
                  value={formData.slug} onChange={handleChange} error={fieldErrors.slug}
                  hint={`Login URL: ${window.location.origin}/${formData.slug || 'your-slug'}/login`} />

                <div>
                  <label className="block text-sm font-medium text-gray-200 mb-1.5">
                    Brand Color
                  </label>
                  <div className="flex items-center gap-3">
                    <div className="relative">
                      <input
                        type="color"
                        name="primaryColor"
                        value={formData.primaryColor}
                        onChange={handleChange}
                        className="w-12 h-12 rounded-xl border border-gray-700 bg-transparent cursor-pointer p-1"
                      />
                    </div>
                    <input
                      type="text"
                      value={formData.primaryColor}
                      onChange={e => setFormData(prev => ({ ...prev, primaryColor: e.target.value }))}
                      className="flex-1 px-4 py-2.5 rounded-xl bg-gray-800 border border-gray-700 text-white text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500"
                      placeholder="#6366f1"
                    />
                    <div className="w-10 h-10 rounded-xl shrink-0" style={{ backgroundColor: formData.primaryColor }} />
                  </div>
                </div>

                <div>
                  <label className="block text-sm font-medium text-gray-200 mb-1.5">Company Logo</label>
                  {logoPreview ? (
                    <div className="flex items-center gap-4 p-4 bg-gray-800 rounded-xl border border-gray-700">
                      <img src={logoPreview} alt="logo preview" className="w-16 h-16 object-contain rounded-lg bg-white p-1" />
                      <div className="flex-1">
                        <p className="text-sm text-white font-medium truncate">{logoFile?.name}</p>
                        <p className="text-xs text-gray-400">{((logoFile?.size ?? 0) / 1024).toFixed(0)} KB</p>
                      </div>
                      <button type="button" onClick={removeLogo}
                        className="text-gray-400 hover:text-red-400 p-2 rounded-lg hover:bg-gray-700 transition">
                        <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                        </svg>
                      </button>
                    </div>
                  ) : (
                    <label htmlFor="logo-upload"
                      className="flex flex-col items-center justify-center gap-2 p-6 border-2 border-dashed border-gray-700 rounded-xl cursor-pointer hover:border-indigo-500 hover:bg-gray-800/50 transition">
                      <span className="text-3xl">📁</span>
                      <span className="text-sm text-gray-400">Click to upload logo</span>
                      <span className="text-xs text-gray-600">PNG, JPG, WEBP — max 5MB</span>
                      <input ref={fileInputRef} id="logo-upload" type="file" accept="image/*"
                        onChange={handleLogoChange} className="hidden" />
                    </label>
                  )}
                </div>
              </div>
            )}

            {/* ── STEP 2: Admin Account ── */}
            {step === 2 && (
              <div className="space-y-6">
                <div className="mb-2">
                  <h2 className="text-xl font-bold text-white">Admin Account</h2>
                  <p className="text-sm text-gray-400 mt-1">This person will manage the company</p>
                </div>

                <Field label="Full Name" name="adminName" placeholder="e.g. John Doe" required
                  value={formData.adminName} onChange={handleChange} error={fieldErrors.adminName} />
                <Field label="Email Address" name="adminEmail" type="email" placeholder="admin@company.com" required
                  value={formData.adminEmail} onChange={handleChange} error={fieldErrors.adminEmail} />

                <div>
                  <label className="block text-sm font-medium text-gray-200 mb-1.5">
                    Password <span className="text-indigo-400">*</span>
                  </label>
                  <input
                    type="password"
                    name="adminPassword"
                    value={formData.adminPassword}
                    onChange={handleChange}
                    placeholder="Minimum 8 characters"
                    className={`w-full px-4 py-2.5 rounded-xl bg-gray-800 border text-white placeholder-gray-500 text-sm
                      focus:outline-none focus:ring-2 focus:ring-indigo-500 transition
                      ${fieldErrors.adminPassword ? 'border-red-500' : 'border-gray-700 hover:border-gray-600'}`}
                  />
                  {fieldErrors.adminPassword && (
                    <p className="mt-1 text-xs text-red-400">⚠ {fieldErrors.adminPassword}</p>
                  )}
                  <PasswordStrength password={formData.adminPassword} />
                </div>
              </div>
            )}

            {/* ── STEP 3: Subscription ── */}
            {step === 3 && (
              <div className="space-y-6">
                <div className="mb-2">
                  <h2 className="text-xl font-bold text-white">Subscription</h2>
                  <p className="text-sm text-gray-400 mt-1">Choose a plan and set duration</p>
                </div>

                {/* Plan cards */}
                <div className="grid grid-cols-3 gap-3">
                  {(['FREE', 'PRO', 'ENTERPRISE'] as const).map(plan => {
                    const info = PLAN_LIMITS[plan];
                    const selected = formData.subscriptionPlan === plan;
                    return (
                      <button
                        key={plan}
                        type="button"
                        onClick={() => handleChange({ target: { name: 'subscriptionPlan', value: plan, type: 'select' } } as any)}
                        className={`flex flex-col items-start p-4 rounded-xl border transition-all duration-200 text-left
                          ${selected
                            ? 'border-indigo-500 bg-indigo-950 shadow-lg shadow-indigo-500/20'
                            : 'border-gray-700 bg-gray-800 hover:border-gray-600'}`}
                      >
                        <div className={`text-xs font-bold mb-2 px-2 py-0.5 rounded-full
                          ${plan === 'FREE' ? 'bg-gray-700 text-gray-300' :
                            plan === 'PRO' ? 'bg-indigo-700 text-indigo-200' :
                              'bg-amber-800 text-amber-200'}`}>
                          {plan}
                        </div>
                        <p className="text-white font-semibold text-sm">{info.price}</p>
                        <p className="text-xs text-gray-400 mt-1">
                          {info.maxUsers === -1 ? '∞' : info.maxUsers} users<br />
                          {info.maxTasks === -1 ? '∞' : info.maxTasks} tasks
                        </p>
                        {selected && (
                          <div className="mt-2 w-full flex justify-end">
                            <span className="w-4 h-4 rounded-full bg-indigo-500 flex items-center justify-center">
                              <svg className="w-2.5 h-2.5 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={3} d="M5 13l4 4L19 7" />
                              </svg>
                            </span>
                          </div>
                        )}
                      </button>
                    );
                  })}
                </div>

                <Field label="Duration (days)" name="subscriptionDays" type="number" required
                  value={formData.subscriptionDays} onChange={handleChange} error={fieldErrors.subscriptionDays}
                  hint="How many days this subscription is active from today" />

                <div className="p-4 rounded-xl bg-gray-800 border border-gray-700 text-sm text-gray-300">
                  📅 Subscription ends:{' '}
                  <span className="font-semibold text-white">
                    {new Date(Date.now() + formData.subscriptionDays * 86400000).toLocaleDateString('en-US', {
                      year: 'numeric', month: 'long', day: 'numeric'
                    })}
                  </span>
                </div>

                <Field label="Billing Email" name="billingEmail" type="email" placeholder="billing@company.com"
                  value={formData.billingEmail ?? ''} onChange={handleChange}
                  hint="Optional — for invoicing purposes" />
              </div>
            )}

            {/* ── STEP 4: AI & Limits ── */}
            {step === 4 && (
              <div className="space-y-6">
                <div className="mb-2">
                  <h2 className="text-xl font-bold text-white">AI & Resource Limits</h2>
                  <p className="text-sm text-gray-400 mt-1">Configure AI and verify resource limits</p>
                </div>

                <div className="p-4 rounded-xl bg-indigo-950 border border-indigo-800">
                  <h3 className="text-sm font-semibold text-indigo-300 flex items-center gap-2 mb-3">
                    <span>⚡</span> AI Configuration (Required)
                  </h3>
                  <Field label="Gemini API Key" name="aiApiKey" placeholder="AIza..." required
                    value={formData.aiApiKey ?? ''} onChange={handleChange} error={fieldErrors.aiApiKey}
                    hint="Your Google Gemini API Key is required for AI features like task generation" />
                  {formData.aiApiKey && (
                    <div className="mt-3">
                      <label className="block text-sm font-medium text-gray-200 mb-1.5">AI Provider</label>
                      <select name="aiProvider" value={formData.aiProvider} onChange={handleChange}
                        className="w-full px-4 py-2.5 rounded-xl bg-gray-800 border border-gray-700 text-white text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500">
                        <option value="gemini">Google Gemini</option>
                        <option value="openai">OpenAI</option>
                      </select>
                    </div>
                  )}
                </div>

                {/* Plan limits summary — driven by plan selection on Step 3 */}
                <div className="rounded-xl bg-gray-800 border border-gray-700 p-4">
                  <p className="text-xs font-medium text-gray-400 mb-3 uppercase tracking-wide">
                    Limits from {formData.subscriptionPlan} plan
                  </p>
                  <div className="grid grid-cols-3 gap-3">
                    {[
                      { label: 'Max Users', value: fmt(formData.maxUsers) },
                      { label: 'Max Tasks', value: fmt(formData.maxTasks) },
                      { label: 'Storage', value: `${fmt(formData.maxStorage)} GB` },
                    ].map(({ label, value }) => (
                      <div key={label} className="flex flex-col items-center p-3 bg-gray-900 rounded-xl">
                        <span className="text-xl font-bold text-white">{value}</span>
                        <span className="text-xs text-gray-500 mt-1">{label}</span>
                      </div>
                    ))}
                  </div>
                  <p className="text-xs text-gray-600 mt-3">To change limits, go back to Step 3 and change the plan.</p>
                </div>

                {/* Full review summary */}
                <div className="rounded-xl border border-gray-700 bg-gray-800 overflow-hidden">
                  <div className="px-4 py-3 border-b border-gray-700 bg-gray-750">
                    <h3 className="text-sm font-semibold text-white">📋 Review Summary</h3>
                  </div>
                  <div className="p-4 grid grid-cols-2 gap-3 text-sm">
                    {[
                      { label: 'Company', value: formData.name, required: true },
                      { label: 'Slug', value: formData.slug, required: true },
                      { label: 'Admin name', value: formData.adminName, required: true },
                      { label: 'Admin email', value: formData.adminEmail, required: true },
                      { label: 'Plan', value: formData.subscriptionPlan },
                      { label: 'Duration', value: `${formData.subscriptionDays} days` },
                      { label: 'Max users', value: fmt(formData.maxUsers) },
                      { label: 'Max tasks', value: fmt(formData.maxTasks) },
                      { label: 'Storage', value: `${formData.maxStorage} GB` },
                      { label: 'AI', value: formData.aiApiKey ? '✓ Enabled' : '— Disabled', color: formData.aiApiKey ? 'text-emerald-400' : 'text-gray-500' },
                    ].map(({ label, value, required, color }) => (
                      <div key={label} className="flex flex-col gap-0.5">
                        <span className="text-gray-500 text-xs">{label}</span>
                        <span className={`font-medium ${color ?? 'text-white'} ${required && !value ? 'text-red-400' : ''}`}>
                          {value || (required ? '⚠ Missing' : '—')}
                        </span>
                      </div>
                    ))}
                  </div>
                </div>
              </div>
            )}

            {/* ── Navigation Buttons ── */}
            <div className="flex items-center justify-between mt-8 pt-6 border-t border-gray-800">
              <button
                type="button"
                onClick={prevStep}
                className={`px-5 py-2.5 text-sm font-medium rounded-xl border border-gray-700 text-gray-300
                  hover:bg-gray-800 hover:text-white transition
                  ${step === 1 ? 'invisible' : ''}`}
              >
                ← Previous
              </button>

              <div className="flex items-center gap-2">
                {STEPS.map(s => (
                  <div key={s.id} className={`h-1.5 rounded-full transition-all duration-300
                    ${step === s.id ? 'w-6 bg-indigo-500' : step > s.id ? 'w-2 bg-emerald-500' : 'w-2 bg-gray-700'}`} />
                ))}
              </div>

              {step < 4 ? (
                <button
                  type="button"
                  onClick={nextStep}
                  className="px-6 py-2.5 text-sm font-semibold rounded-xl bg-indigo-600 hover:bg-indigo-500 text-white transition shadow-lg shadow-indigo-500/20"
                >
                  Next →
                </button>
              ) : (
                <button
                  type="submit"
                  disabled={loading}
                  className="px-6 py-2.5 text-sm font-semibold rounded-xl bg-emerald-600 hover:bg-emerald-500
                    text-white transition shadow-lg shadow-emerald-500/20 disabled:opacity-60 disabled:cursor-not-allowed
                    flex items-center gap-2"
                >
                  {loading ? (
                    <>
                      <svg className="animate-spin w-4 h-4" fill="none" viewBox="0 0 24 24">
                        <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                        <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
                      </svg>
                      Creating…
                    </>
                  ) : '✓ Create Company'}
                </button>
              )}
            </div>
          </form>
        </div>
      </main>
    </div>
  );
}
