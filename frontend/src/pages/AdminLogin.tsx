import React, { useState, FormEvent } from 'react';
import { forgetCompany } from '@/lib/companyLogin';
import { useNavigate } from 'react-router-dom';
import { useDispatch } from 'react-redux';
import { ArrowPathIcon } from '@heroicons/react/24/outline';
import AuthSplitLayout from '@/components/auth/AuthSplitLayout';
import api from '../services/api';
import toast from 'react-hot-toast';
import { setAuth } from '../store/slices/authSlice';

const AdminLogin: React.FC = () => {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const navigate = useNavigate();
  const dispatch = useDispatch();

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault();
    setError('');
    setLoading(true);

    try {
      const response = await api.post('/auth/admin-login', {
        email,
        password,
      });

      const { access_token, user } = response.data;

      // Verify this is a SUPER_ADMIN
      if (user.role !== 'SUPER_ADMIN' || user.companyId !== null) {
        setError('Access denied. This portal is for System Administrators only.');
        setLoading(false);
        return;
      }

      // Store token
      forgetCompany();
      localStorage.setItem('token', access_token);
      api.defaults.headers.common['Authorization'] = `Bearer ${access_token}`;

      // Update Redux state with user data and token
      dispatch(setAuth({ user, token: access_token }));

      toast.success('Welcome, System Administrator!');

      // Redirect to admin dashboard
      navigate('/admin/companies');
    } catch (err: any) {
      console.error('Admin login error:', err);
      
      let errorMessage = 'Invalid credentials or insufficient permissions';
      
      if (err.code === 'ECONNABORTED') {
        errorMessage = 'Request timed out. The server might be starting up (this can take 30-60 seconds on first request). Please try again.';
      } else if (err.message === 'Network Error') {
        errorMessage = 'Cannot connect to server. Please check if the backend is running.';
      } else if (err.response?.data?.message) {
        errorMessage = err.response.data.message;
      }
      
      setError(errorMessage);
      toast.error(errorMessage);
    } finally {
      setLoading(false);
    }
  };

  return (
    <AuthSplitLayout
      variant="admin"
      title="System administrator"
      subtitle="Sign in to manage companies, plans and platform settings."
      contextLabel="Restricted to system administrators. Company staff sign in at their own company URL."
    >
      <form className="space-y-5" onSubmit={handleSubmit}>
        {error && (
          <div
            role="alert"
            className="rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-800 dark:border-red-900 dark:bg-red-900/20 dark:text-red-300"
          >
            {error}
          </div>
        )}

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

        <button type="submit" disabled={loading} className="btn-primary w-full justify-center py-2.5">
          {loading ? (
            <>
              <ArrowPathIcon className="mr-2 h-4 w-4 animate-spin" />
              Signing in…
            </>
          ) : (
            'Sign in'
          )}
        </button>

        <p className="text-center text-sm text-gray-500 dark:text-gray-400">
          Looking for your company portal? Use your company’s sign-in link.
        </p>
      </form>
    </AuthSplitLayout>
  );
};

export default AdminLogin;
