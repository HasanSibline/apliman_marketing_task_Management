import React, { useState, useEffect, FormEvent } from 'react';
import SigningInScreen from '@/components/auth/SigningInScreen'
import { useForcedDark } from '@/theme/useForcedDark'
import { rememberCompany } from '@/lib/companyLogin';
import { useNavigate, useParams } from 'react-router-dom';
import { useDispatch } from 'react-redux';
import toast from 'react-hot-toast';
import api, { formatAssetUrl } from '../services/api';
import { setAuth } from '../store/slices/authSlice';
import AuthSplitLayout from '@/components/auth/AuthSplitLayout';
import { AuraLogo } from '@/components/brand/AuraMark';
import { applyBrandColor } from '@/theme/brandTheme';

interface CompanyBranding {
  id: string;
  name: string;
  slug: string;
  logo: string | null;
  primaryColor: string | null;
  isActive: boolean;
  subscriptionStatus: 'ACTIVE' | 'TRIAL' | 'EXPIRED' | 'SUSPENDED';
}

const CompanyLogin: React.FC = () => {
  useForcedDark()
  const [entering, setEntering] = useState<string | null | undefined>(undefined)
  const { slug } = useParams<{ slug: string }>();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const [companyLoading, setCompanyLoading] = useState(true);
  const [company, setCompany] = useState<CompanyBranding | null>(null);
  const navigate = useNavigate();
  const dispatch = useDispatch();

  // Apply the company's brand colour to this page as soon as we know it.
  useEffect(() => {
    if (company?.primaryColor) applyBrandColor(company.primaryColor);
  }, [company?.primaryColor]);

  // Fetch company branding on mount
  useEffect(() => {
    const fetchCompanyBranding = async () => {
      if (!slug) {
        setError('Invalid company URL');
        setCompanyLoading(false);
        return;
      }

      try {
        const response = await api.get(`/public/companies/by-slug/${slug}`);
        const companyData = response.data;

        // Check if company is active
        if (!companyData.isActive) {
          setError('This company account has been deactivated. Please contact support.');
          setCompanyLoading(false);
          return;
        }

        // Check subscription status
        if (companyData.subscriptionStatus === 'EXPIRED' || companyData.subscriptionStatus === 'SUSPENDED') {
          setError('This company subscription has expired. Please contact your administrator.');
          setCompanyLoading(false);
          return;
        }

        setCompany(companyData);
      } catch (err: any) {
        console.error('Failed to fetch company:', err);
        setError(err.response?.data?.message || 'Company not found. Please check the URL.');
      } finally {
        setCompanyLoading(false);
      }
    };

    fetchCompanyBranding();
  }, [slug]);

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault();
    setError('');
    setLoading(true);

    try {
      const response = await api.post('/auth/login', {
        email,
        password,
      });

      const { accessToken, user } = response.data; // FIX: Use accessToken (camelCase)

      // Verify user belongs to this company
      if (user.companyId !== company?.id) {
        setError('Your account is not associated with this company.');
        setLoading(false);
        return;
      }

      // Verify this is NOT a System Admin
      if (user.role === 'SUPER_ADMIN' && user.companyId === null) {
        setError('System Administrators should login at /admin/login');
        setLoading(false);
        return;
      }

      // Store token
      localStorage.setItem('token', accessToken);
      api.defaults.headers.common['Authorization'] = `Bearer ${accessToken}`;

      // Update Redux state
      rememberCompany(slug ?? user.companySlug);

      dispatch(setAuth({ user, token: accessToken }));

      toast.success(`Welcome back, ${user.name}!`);

      // Redirect to dashboard
      setEntering(user.name ?? null);
    } catch (err: any) {
      console.error('Login error:', err);
      setError(
        err.response?.data?.message || 
        'Invalid credentials. Please try again.'
      );
      toast.error(err.response?.data?.message || 'Login failed');
    } finally {
      setLoading(false);
    }
  };

  // Loading state
  if (companyLoading) {
    if (entering !== undefined) {
    return <SigningInScreen name={entering} onDone={() => navigate('/dashboard')} />
  }

  return (
      <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-blue-50 dark:from-blue-900/20 to-indigo-100 dark:to-indigo-900/20">
        <div className="text-center">
          <div className="inline-block animate-spin rounded-full h-12 w-12 border-b-2 border-indigo-600"></div>
          <p className="mt-4 text-gray-600 dark:text-gray-300">Loading company information...</p>
        </div>
      </div>
    );
  }

  // Error state (company not found or inactive)
  if (error && !company) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-red-50 dark:from-red-900/20 to-pink-100 dark:to-pink-900/20">
        <div className="max-w-md w-full bg-white dark:bg-gray-800 p-10 rounded-xl shadow-lg">
          <div className="text-center">
            <svg
              className="mx-auto h-12 w-12 text-red-500"
              fill="none"
              viewBox="0 0 24 24"
              stroke="currentColor"
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth={2}
                d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z"
              />
            </svg>
            <h2 className="mt-6 text-center text-3xl font-extrabold text-gray-900 dark:text-white">
              Company Not Found
            </h2>
            <p className="mt-2 text-center text-sm text-red-600 dark:text-red-400">{error}</p>
            <p className="mt-4 text-center text-sm text-gray-600 dark:text-gray-300">
              The company you're trying to access doesn't exist or has been deactivated.
            </p>
            <div className="mt-6 text-center">
              <button
                onClick={() => window.history.back()}
                className="inline-flex items-center text-indigo-600 dark:text-indigo-400 hover:text-indigo-500 font-medium"
              >
                <svg
                  className="w-4 h-4 mr-2"
                  fill="none"
                  viewBox="0 0 24 24"
                  stroke="currentColor"
                >
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    strokeWidth={2}
                    d="M10 19l-7-7m0 0l7-7m-7 7h18"
                  />
                </svg>
                Go Back
              </button>
            </div>
          </div>
        </div>
      </div>
    );
  }

  return (
    <AuthSplitLayout
      title={`Sign in to ${company?.name ?? 'your workspace'}`}
      subtitle="Use the email address your administrator set up for you."
      contextLabel={company?.name ? `${company.name} · Aura Operations` : undefined}
      brandSlot={
        company?.logo ? (
          <img
            src={formatAssetUrl(company.logo)}
            alt={company.name}
            className="h-11 w-auto max-w-[200px] object-contain"
          />
        ) : (
          <AuraLogo size="lg" subtitle={company?.name} />
        )
      }
    >
      <form className="space-y-5" onSubmit={handleSubmit}>
        <div>
          <label
            htmlFor="email-address"
            className="mb-1.5 block text-sm font-medium text-gray-700 dark:text-gray-200"
          >
            Email
          </label>
          <input
            id="email-address"
            name="email"
            type="email"
            autoComplete="email"
            required
            className="input-field"
            placeholder="you@company.com"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
          />
        </div>

        <div>
          <label
            htmlFor="password"
            className="mb-1.5 block text-sm font-medium text-gray-700 dark:text-gray-200"
          >
            Password
          </label>
          <input
            id="password"
            name="password"
            type="password"
            autoComplete="current-password"
            required
            className="input-field"
            placeholder="Enter your password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
          />
        </div>

        {error && (
          <div
            role="alert"
            className="rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-800 dark:border-red-900 dark:bg-red-900/20 dark:text-red-300"
          >
            {error}
          </div>
        )}

        <button type="submit" disabled={loading} className="btn-primary w-full justify-center py-2.5">
          {loading ? 'Signing in…' : 'Sign in'}
        </button>

        <p className="text-center text-sm text-gray-500 dark:text-gray-400">
          Trouble signing in? Contact your administrator.
        </p>
      </form>
    </AuthSplitLayout>
  );
};

export default CompanyLogin;
