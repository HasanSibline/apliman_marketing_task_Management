import React, { useState, useEffect, FormEvent } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { useDispatch } from 'react-redux';
import toast from 'react-hot-toast';
import api from '../services/api';
import { setAuth } from '../store/slices/authSlice';

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
  const { slug } = useParams<{ slug: string }>();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const [companyLoading, setCompanyLoading] = useState(true);
  const [company, setCompany] = useState<CompanyBranding | null>(null);
  const navigate = useNavigate();
  const dispatch = useDispatch();

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

      const { access_token, user } = response.data;

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
      localStorage.setItem('token', access_token);
      api.defaults.headers.common['Authorization'] = `Bearer ${access_token}`;

      // Update Redux state
      dispatch(setAuth({ user, token: access_token }));

      toast.success(`Welcome back, ${user.name}!`);

      // Redirect to dashboard
      navigate('/dashboard');
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
    return (
      <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-blue-50 to-indigo-100">
        <div className="text-center">
          <div className="inline-block animate-spin rounded-full h-12 w-12 border-b-2 border-indigo-600"></div>
          <p className="mt-4 text-gray-600">Loading company information...</p>
        </div>
      </div>
    );
  }

  // Error state (company not found or inactive)
  if (error && !company) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-red-50 to-pink-100">
        <div className="max-w-md w-full bg-white p-10 rounded-xl shadow-2xl">
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
            <h2 className="mt-6 text-center text-3xl font-extrabold text-gray-900">
              Company Not Found
            </h2>
            <p className="mt-2 text-center text-sm text-red-600">{error}</p>
            <p className="mt-4 text-center text-sm text-gray-600">
              The company you're trying to access doesn't exist or has been deactivated.
            </p>
            <div className="mt-6 text-center">
              <button
                onClick={() => window.history.back()}
                className="inline-flex items-center text-indigo-600 hover:text-indigo-500 font-medium"
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

  // Dynamic background color based on company branding
  const bgGradient = company?.primaryColor
    ? `linear-gradient(to bottom right, ${company.primaryColor}22, ${company.primaryColor}44)`
    : 'linear-gradient(to bottom right, #EFF6FF, #E0E7FF)';

  const accentColor = company?.primaryColor || '#4F46E5';
  
  // Convert relative logo URL to absolute URL if needed
  const logoUrl = company?.logo 
    ? (company.logo.startsWith('http') 
        ? company.logo 
        : `${import.meta.env.VITE_API_URL || 'http://localhost:3000'}${company.logo}`)
    : null;

  return (
    <div 
      className="min-h-screen flex items-center justify-center"
      style={{ background: bgGradient }}
    >
      <div className="max-w-md w-full space-y-8 bg-white p-10 rounded-xl shadow-2xl">
        <div>
          {/* Company Logo */}
          {logoUrl ? (
            <img
              src={logoUrl}
              alt={`${company.name} logo`}
              className="mx-auto h-16 w-auto object-contain"
            />
          ) : (
            <div 
              className="mx-auto h-16 w-16 rounded-full flex items-center justify-center text-white text-2xl font-bold"
              style={{ backgroundColor: accentColor }}
            >
              {company?.name.charAt(0).toUpperCase()}
            </div>
          )}
          <h2 className="mt-6 text-center text-3xl font-extrabold text-gray-900">
            {company?.name}
          </h2>
          <p className="mt-2 text-center text-sm text-gray-600">
            Sign in to your account
          </p>
        </div>
        <form className="mt-8 space-y-6" onSubmit={handleSubmit}>
          <div className="rounded-md shadow-sm -space-y-px">
            <div>
              <label htmlFor="email-address" className="sr-only">
                Email address
              </label>
              <input
                id="email-address"
                name="email"
                type="email"
                autoComplete="email"
                required
                className="appearance-none rounded-none relative block w-full px-3 py-2 border border-gray-300 placeholder-gray-500 text-gray-900 rounded-t-md focus:outline-none focus:ring-2 focus:z-10 sm:text-sm"
                style={{ 
                  borderColor: error ? '#EF4444' : undefined 
                }}
                placeholder="Email address"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
              />
            </div>
            <div>
              <label htmlFor="password" className="sr-only">
                Password
              </label>
              <input
                id="password"
                name="password"
                type="password"
                autoComplete="current-password"
                required
                className="appearance-none rounded-none relative block w-full px-3 py-2 border border-gray-300 placeholder-gray-500 text-gray-900 rounded-b-md focus:outline-none focus:ring-2 focus:z-10 sm:text-sm"
                style={{ 
                  borderColor: error ? '#EF4444' : undefined 
                }}
                placeholder="Password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
              />
            </div>
          </div>

          {error && (
            <div className="text-red-600 text-sm text-center bg-red-50 p-2 rounded">
              {error}
            </div>
          )}

          <div>
            <button
              type="submit"
              className="group relative w-full flex justify-center py-2 px-4 border border-transparent text-sm font-medium rounded-md text-white focus:outline-none focus:ring-2 focus:ring-offset-2 transition-colors"
              style={{ 
                backgroundColor: accentColor,
                opacity: loading ? 0.7 : 1
              }}
              disabled={loading}
            >
              {loading ? 'Signing in...' : 'Sign in'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};

export default CompanyLogin;

