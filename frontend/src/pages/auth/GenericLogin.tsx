import React, { useState, FormEvent } from 'react';
import SigningInScreen from '@/components/auth/SigningInScreen'
import { useForcedDark } from '@/theme/useForcedDark'
import { rememberCompany } from '@/lib/companyLogin';
import { useNavigate } from 'react-router-dom';
import { useDispatch } from 'react-redux';
import toast from 'react-hot-toast';
import api from '../../services/api';
import { setAuth } from '../../store/slices/authSlice';
import AuthSplitLayout from '@/components/auth/AuthSplitLayout';

const GenericLogin: React.FC = () => {
  useForcedDark()
  const [entering, setEntering] = useState<string | null | undefined>(undefined)
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const [showForgotModal, setShowForgotModal] = useState(false);
  const [forgotEmail, setForgotEmail] = useState('');
  const [forgotLoading, setForgotLoading] = useState(false);
  const [forgotResult, setForgotResult] = useState<string | null>(null);
  const navigate = useNavigate();
  const dispatch = useDispatch();

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault();
    setError('');
    setLoading(true);

    try {
      const response = await api.post('/auth/login', {
        email,
        password,
      });

      // The server returns accessToken. Reading access_token gave undefined, which
      // localStorage stores as the string "undefined", so every request after this
      // carried "Bearer undefined" and the first 401 threw the session away. That is
      // the sign-in that lasted a second.
      const { accessToken, user } = response.data;

      // Check if this is a System Admin
      if (user.role === 'SUPER_ADMIN' && user.companyId === null) {
        setError('System Administrators should use the admin portal.');
        setLoading(false);
        return;
      }

      // Check if user has a company
      if (!user.companyId) {
        setError('Your account is not associated with any company.');
        setLoading(false);
        return;
      }

      // Store token
      localStorage.setItem('token', accessToken);
      api.defaults.headers.common['Authorization'] = `Bearer ${accessToken}`;

      // Signing in generically still identifies a company, so the way back to its own
      // page is known from here on even though this page never saw a slug.
      rememberCompany(user.companySlug);

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

  const handleForgotPassword = async (e: FormEvent) => {
    e.preventDefault();
    setForgotLoading(true);
    try {
      const resp = await api.post('/auth/forgot-password', { email: forgotEmail });
      const token = resp.data?.debug_token;
      if (token) {
        setForgotResult(`Reset token (dev only): ${token}`);
      } else {
        setForgotResult('If that email is registered, a reset link has been sent.');
      }
      toast.success('Password reset token generated');
    } catch {
      toast.error('Failed to send reset request');
    } finally {
      setForgotLoading(false);
    }
  };

  if (entering !== undefined) {
    return <SigningInScreen name={entering} onDone={() => navigate('/dashboard')} />
  }

  return (
    <>
      <AuthSplitLayout
        title="Sign in"
        subtitle="Use the email address your administrator set up for you."
        contextLabel="Signing in to a specific company? Use the sign-in link they gave you."
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

          <div className="flex items-center justify-between text-sm">
            <button
              type="button"
              onClick={() => { setShowForgotModal(true); setForgotResult(null); }}
              className="font-medium text-primary-600 hover:underline dark:text-primary-400"
            >
              Forgot your password?
            </button>
            <span className="text-gray-500 dark:text-gray-400">Need an account? Ask your admin.</span>
          </div>
        </form>
      </AuthSplitLayout>

      {/* Forgot Password Modal */}
      {showForgotModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
          <div
            role="dialog"
            aria-modal="true"
            aria-labelledby="reset-title"
            className="w-full max-w-sm rounded-xl bg-white p-6 shadow-lg dark:bg-gray-800"
          >
            <h2 id="reset-title" className="text-lg font-semibold text-gray-900 dark:text-white">
              Reset password
            </h2>
            {forgotResult ? (
              <>
                <p className="mt-3 break-all rounded-lg bg-primary-50 p-3 text-sm text-gray-700 dark:bg-primary-900/30 dark:text-gray-200">
                  {forgotResult}
                </p>
                <button
                  onClick={() => { setShowForgotModal(false); setForgotResult(null); setForgotEmail(''); }}
                  className="btn-primary mt-4 w-full justify-center"
                >
                  Close
                </button>
              </>
            ) : (
              <form onSubmit={handleForgotPassword} className="mt-3">
                <p className="mb-4 text-sm text-gray-600 dark:text-gray-400">
                  Enter your email address and we&rsquo;ll generate a password reset token.
                </p>
                <label htmlFor="forgot-email" className="sr-only">Email address</label>
                <input
                  id="forgot-email"
                  type="email"
                  required
                  placeholder="you@company.com"
                  value={forgotEmail}
                  onChange={(e) => setForgotEmail(e.target.value)}
                  className="input-field"
                />
                <div className="mt-4 flex gap-3">
                  <button type="button" onClick={() => setShowForgotModal(false)} className="btn-secondary flex-1 justify-center">
                    Cancel
                  </button>
                  <button type="submit" disabled={forgotLoading} className="btn-primary flex-1 justify-center">
                    {forgotLoading ? 'Sending…' : 'Send reset'}
                  </button>
                </div>
              </form>
            )}
          </div>
        </div>
      )}
    </>
  );
};

export default GenericLogin;
