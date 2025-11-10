import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { useSelector } from 'react-redux';
import { RootState } from '../store';
import axios from 'axios';
import toast from 'react-hot-toast';

const API_URL = import.meta.env.VITE_API_URL || 'http://localhost:3000';

interface Company {
  id: string;
  name: string;
  slug: string;
  logo?: string;
  primaryColor: string;
  isActive: boolean;
  subscriptionPlan: string;
  subscriptionStatus: string;
  subscriptionEnd?: string;
  aiEnabled: boolean;
  createdAt: string;
  _count?: {
    users: number;
    tasks: number;
  };
}

export default function SuperAdminDashboard() {
  const navigate = useNavigate();
  const { user } = useSelector((state: RootState) => state.auth);
  const [companies, setCompanies] = useState<Company[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // Check if user is super admin
  useEffect(() => {
    if (user?.role !== 'SUPER_ADMIN') {
      navigate('/dashboard');
    }
  }, [user, navigate]);

  // Fetch companies
  useEffect(() => {
    fetchCompanies();
  }, []);

  const fetchCompanies = async () => {
    try {
      setLoading(true);
      setError(null);
      const token = localStorage.getItem('token');
      const response = await axios.get(`${API_URL}/companies`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      setCompanies(response.data);
    } catch (err: any) {
      console.error('Error fetching companies:', err);
      setError(err.response?.data?.message || 'Failed to load companies');
    } finally {
      setLoading(false);
    }
  };

  const handleToggleAI = async (companyId: string, currentStatus: boolean) => {
    try {
      const token = localStorage.getItem('token');
      await axios.post(
        `${API_URL}/companies/${companyId}/toggle-ai`,
        { enabled: !currentStatus },
        { headers: { Authorization: `Bearer ${token}` } }
      );
      
      toast.success(`AI ${!currentStatus ? 'enabled' : 'disabled'} successfully`);
      fetchCompanies(); // Refresh the list
    } catch (err: any) {
      console.error('Error toggling AI:', err);
      toast.error(err.response?.data?.message || 'Failed to toggle AI');
    }
  };

  const handleDeleteCompany = async (companyId: string, companyName: string) => {
    if (!confirm(`Are you sure you want to delete "${companyName}"?\n\nThis will permanently delete:\n- All company users\n- All tasks and data\n- All workflows\n- All AI chat history\n\nThis action CANNOT be undone!`)) {
      return;
    }

    try {
      const token = localStorage.getItem('token');
      await axios.delete(`${API_URL}/companies/${companyId}`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      
      toast.success(`Company "${companyName}" deleted successfully`);
      fetchCompanies(); // Refresh the list
    } catch (err: any) {
      console.error('Error deleting company:', err);
      toast.error(err.response?.data?.message || 'Failed to delete company');
    }
  };

  const getStatusBadge = (status: string) => {
    const styles: Record<string, string> = {
      ACTIVE: 'bg-green-100 text-green-800',
      TRIAL: 'bg-blue-100 text-blue-800',
      EXPIRED: 'bg-red-100 text-red-800',
      SUSPENDED: 'bg-gray-100 text-gray-800',
    };
    return styles[status] || 'bg-gray-100 text-gray-800';
  };

  const getPlanBadge = (plan: string) => {
    const styles: Record<string, string> = {
      FREE: 'bg-gray-100 text-gray-800',
      PRO: 'bg-purple-100 text-purple-800',
      ENTERPRISE: 'bg-indigo-100 text-indigo-800',
    };
    return styles[plan] || 'bg-gray-100 text-gray-800';
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-screen">
        <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-600"></div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gray-50 py-8 px-4 sm:px-6 lg:px-8">
      <div className="max-w-7xl mx-auto">
        {/* Header */}
        <div className="mb-8">
          <div className="flex justify-between items-center">
            <div>
              <h1 className="text-3xl font-bold text-gray-900">Companies Management</h1>
              <p className="mt-2 text-gray-600">Manage all companies in the system</p>
            </div>
            <button
              onClick={() => navigate('/admin/companies/create')}
              className="px-6 py-3 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors font-medium shadow-sm"
            >
              + Create Company
            </button>
          </div>
        </div>

        {/* Error Message */}
        {error && (
          <div className="mb-6 bg-red-50 border border-red-200 text-red-700 px-4 py-3 rounded-lg">
            {error}
          </div>
        )}

        {/* Statistics Cards */}
        <div className="grid grid-cols-1 md:grid-cols-4 gap-6 mb-8">
          <div className="bg-white rounded-lg shadow-sm p-6">
            <div className="text-sm text-gray-600 mb-1">Total Companies</div>
            <div className="text-3xl font-bold text-gray-900">{companies.length}</div>
          </div>
          <div className="bg-white rounded-lg shadow-sm p-6">
            <div className="text-sm text-gray-600 mb-1">Active</div>
            <div className="text-3xl font-bold text-green-600">
              {companies.filter(c => c.isActive && c.subscriptionStatus === 'ACTIVE').length}
            </div>
          </div>
          <div className="bg-white rounded-lg shadow-sm p-6">
            <div className="text-sm text-gray-600 mb-1">Trial</div>
            <div className="text-3xl font-bold text-blue-600">
              {companies.filter(c => c.subscriptionStatus === 'TRIAL').length}
            </div>
          </div>
          <div className="bg-white rounded-lg shadow-sm p-6">
            <div className="text-sm text-gray-600 mb-1">Suspended</div>
            <div className="text-3xl font-bold text-red-600">
              {companies.filter(c => !c.isActive || c.subscriptionStatus === 'SUSPENDED').length}
            </div>
          </div>
        </div>

        {/* Companies List */}
        <div className="bg-white rounded-lg shadow-sm overflow-hidden">
          <div className="overflow-x-auto">
            <table className="min-w-full divide-y divide-gray-200">
              <thead className="bg-gray-50">
                <tr>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                    Company
                  </th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                    Plan
                  </th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                    Status
                  </th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                    Users
                  </th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                    Tasks
                  </th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                    AI
                  </th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                    Actions
                  </th>
                </tr>
              </thead>
              <tbody className="bg-white divide-y divide-gray-200">
                {companies.map((company) => (
                  <tr key={company.id} className="hover:bg-gray-50 transition-colors">
                    <td className="px-6 py-4 whitespace-nowrap">
                      <div className="flex items-center">
                        {company.logo ? (
                          <img src={company.logo} alt={company.name} className="h-10 w-10 rounded-full mr-3" />
                        ) : (
                          <div
                            className="h-10 w-10 rounded-full mr-3 flex items-center justify-center text-white font-bold"
                            style={{ backgroundColor: company.primaryColor }}
                          >
                            {company.name.charAt(0)}
                          </div>
                        )}
                        <div>
                          <div className="text-sm font-medium text-gray-900">{company.name}</div>
                          <div className="text-sm text-gray-500">{company.slug}</div>
                        </div>
                      </div>
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap">
                      <span className={`px-2 inline-flex text-xs leading-5 font-semibold rounded-full ${getPlanBadge(company.subscriptionPlan)}`}>
                        {company.subscriptionPlan}
                      </span>
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap">
                      <span className={`px-2 inline-flex text-xs leading-5 font-semibold rounded-full ${getStatusBadge(company.subscriptionStatus)}`}>
                        {company.subscriptionStatus}
                      </span>
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-900">
                      {company._count?.users || 0}
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-900">
                      {company._count?.tasks || 0}
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap">
                      {company.aiEnabled ? (
                        <span className="text-green-600">✓ Enabled</span>
                      ) : (
                        <span className="text-gray-400">✗ Disabled</span>
                      )}
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap text-sm font-medium">
                      <div className="flex items-center space-x-2">
                        {/* View Button */}
                        <button
                          onClick={() => navigate(`/admin/companies/${company.id}`)}
                          className="text-blue-600 hover:text-blue-900 transition-colors"
                          title="View Details"
                        >
                          <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M2.458 12C3.732 7.943 7.523 5 12 5c4.478 0 8.268 2.943 9.542 7-1.274 4.057-5.064 7-9.542 7-4.477 0-8.268-2.943-9.542-7z" />
                          </svg>
                        </button>

                        {/* Edit Button */}
                        <button
                          onClick={() => navigate(`/admin/companies/${company.id}/edit`)}
                          className="text-indigo-600 hover:text-indigo-900 transition-colors"
                          title="Edit Company"
                        >
                          <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z" />
                          </svg>
                        </button>

                        {/* Toggle AI Button */}
                        <button
                          onClick={() => handleToggleAI(company.id, company.aiEnabled)}
                          className={`${
                            company.aiEnabled 
                              ? 'text-green-600 hover:text-green-900' 
                              : 'text-gray-400 hover:text-gray-600'
                          } transition-colors`}
                          title={company.aiEnabled ? 'Disable AI' : 'Enable AI'}
                        >
                          <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9.663 17h4.673M12 3v1m6.364 1.636l-.707.707M21 12h-1M4 12H3m3.343-5.657l-.707-.707m2.828 9.9a5 5 0 117.072 0l-.548.547A3.374 3.374 0 0014 18.469V19a2 2 0 11-4 0v-.531c0-.895-.356-1.754-.988-2.386l-.548-.547z" />
                          </svg>
                        </button>

                        {/* Delete Button */}
                        <button
                          onClick={() => handleDeleteCompany(company.id, company.name)}
                          className="text-red-600 hover:text-red-900 transition-colors"
                          title="Delete Company"
                        >
                          <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
                          </svg>
                        </button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          {companies.length === 0 && !loading && (
            <div className="text-center py-12">
              <div className="text-gray-400 text-lg mb-4">No companies yet</div>
              <button
                onClick={() => navigate('/super-admin/companies/create')}
                className="px-6 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors"
              >
                Create First Company
              </button>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

