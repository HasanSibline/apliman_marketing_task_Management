import { useState, useEffect, useRef } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import toast from 'react-hot-toast';
import api from '../services/api';

interface EditCompanyForm {
  name: string;
  slug: string;
  logo?: string;
  primaryColor: string;
  subscriptionPlan: 'FREE' | 'PRO' | 'ENTERPRISE';
  aiApiKey?: string;
  aiProvider: string;
  aiEnabled: boolean;
  maxUsers: number;
  maxTasks: number;
  maxStorage: number;
  billingEmail?: string;
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
    subscriptionPlan: 'PRO',
    aiProvider: 'gemini',
    aiEnabled: false,
    maxUsers: 50,
    maxTasks: 5000,
    maxStorage: 10,
  });

  useEffect(() => {
    if (id) {
      fetchCompany();
    }
  }, [id]);

  const fetchCompany = async () => {
    try {
      setLoadingData(true);
      const response = await api.get(`/companies/${id}`);
      const company = response.data;
      
      setFormData({
        name: company.name || '',
        slug: company.slug || '',
        logo: company.logo || undefined,
        primaryColor: company.primaryColor || '#3B82F6',
        subscriptionPlan: company.subscriptionPlan || 'PRO',
        aiApiKey: '', // Don't populate for security
        aiProvider: company.aiProvider || 'gemini',
        aiEnabled: company.aiEnabled || false,
        maxUsers: company.maxUsers || 50,
        maxTasks: company.maxTasks || 5000,
        maxStorage: company.maxStorage || 10,
        billingEmail: company.billingEmail || '',
      });
      
      // Set logo preview if exists
      if (company.logo) {
        // Convert relative URL to absolute if needed
        const absoluteLogoUrl = company.logo.startsWith('http')
          ? company.logo
          : `${import.meta.env.VITE_API_URL || 'http://localhost:3000'}${company.logo}`;
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
      setFormData(prev => ({
        ...prev,
        [name]: type === 'number' ? parseInt(value) || 0 : value,
      }));
    }
  };

  const handleLogoChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      if (file.size > 5 * 1024 * 1024) {
        toast.error('File size must be less than 5MB');
        return;
      }
      
      if (!file.type.startsWith('image/')) {
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

      const response = await api.post('/files/upload', formDataUpload, {
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
      
      const payload: any = {
        name: formData.name,
        logo: logoUrl,
        primaryColor: formData.primaryColor,
        subscriptionPlan: formData.subscriptionPlan,
        aiProvider: formData.aiProvider,
        maxUsers: formData.maxUsers,
        maxTasks: formData.maxTasks,
        maxStorage: formData.maxStorage,
        billingEmail: formData.billingEmail,
      };

      // Only include aiApiKey if it was changed
      if (formData.aiApiKey && formData.aiApiKey.trim()) {
        payload.aiApiKey = formData.aiApiKey;
        payload.aiEnabled = true;
      }

      await api.patch(`/companies/${id}`, payload);
      
      toast.success('Company updated successfully!');
      navigate(`/admin/companies/${id}`);
    } catch (err: any) {
      console.error('Error updating company:', err);
      const errorMessage = err.response?.data?.message || 'Failed to update company';
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
    <div className="min-h-screen bg-gray-50 py-8 px-4 sm:px-6 lg:px-8">
      <div className="max-w-3xl mx-auto">
        <div className="mb-8">
          <button
            onClick={() => navigate(`/admin/companies/${id}`)}
            className="text-gray-600 hover:text-gray-900 mb-4 flex items-center"
          >
            ← Back to Company Details
          </button>
          <h1 className="text-3xl font-bold text-gray-900">Edit Company</h1>
          <p className="mt-2 text-gray-600">Update company information and settings</p>
        </div>

        {error && (
          <div className="mb-6 bg-red-50 border border-red-200 text-red-700 px-4 py-3 rounded-lg">
            {error}
          </div>
        )}

        <form onSubmit={handleSubmit} className="bg-white rounded-lg shadow-sm p-8 space-y-6">
          {/* Company Info Section */}
          <div>
            <h2 className="text-xl font-semibold text-gray-900 mb-4">Company Information</h2>
            
            <div className="space-y-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">
                  Company Name *
                </label>
                <input
                  type="text"
                  name="name"
                  value={formData.name}
                  onChange={handleChange}
                  required
                  className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                />
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">
                  Slug (URL-friendly name) *
                </label>
                <input
                  type="text"
                  name="slug"
                  value={formData.slug}
                  onChange={handleChange}
                  required
                  disabled
                  className="w-full px-4 py-2 border border-gray-300 rounded-lg bg-gray-100 cursor-not-allowed"
                />
                <p className="text-sm text-gray-500 mt-1">Slug cannot be changed after creation</p>
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">
                  Primary Color
                </label>
                <div className="flex items-center space-x-4">
                  <input
                    type="color"
                    name="primaryColor"
                    value={formData.primaryColor}
                    onChange={handleChange}
                    className="h-12 w-20 border border-gray-300 rounded cursor-pointer"
                  />
                  <input
                    type="text"
                    value={formData.primaryColor}
                    onChange={(e) => setFormData(prev => ({ ...prev, primaryColor: e.target.value }))}
                    className="flex-1 px-4 py-2 border border-gray-300 rounded-lg"
                  />
                </div>
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">
                  Company Logo
                </label>
                
                {logoPreview && (
                  <div className="mb-4 relative inline-block">
                    <img 
                      src={logoPreview} 
                      alt="Logo preview" 
                      className="h-24 w-24 object-contain border border-gray-300 rounded-lg p-2 bg-white"
                    />
                    <button
                      type="button"
                      onClick={removeLogo}
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
                  className="block w-full text-sm text-gray-500 file:mr-4 file:py-2 file:px-4 file:rounded-lg file:border-0 file:text-sm file:font-semibold file:bg-blue-50 file:text-blue-700 hover:file:bg-blue-100"
                />
                <p className="text-sm text-gray-500 mt-1">Upload a new logo to replace the current one</p>
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">
                  Billing Email
                </label>
                <input
                  type="email"
                  name="billingEmail"
                  value={formData.billingEmail || ''}
                  onChange={handleChange}
                  className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                />
              </div>
            </div>
          </div>

          {/* Subscription Section */}
          <div className="border-t border-gray-200 pt-6">
            <h2 className="text-xl font-semibold text-gray-900 mb-4">Subscription</h2>
            
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">
                Subscription Plan
              </label>
              <select
                name="subscriptionPlan"
                value={formData.subscriptionPlan}
                onChange={handleChange}
                className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
              >
                <option value="FREE">Free (5 users, 100 tasks, 1 GB)</option>
                <option value="PRO">Pro (25 users, 5000 tasks, 10 GB) - $99/month</option>
                <option value="ENTERPRISE">Enterprise (Unlimited) - $299/month</option>
              </select>
            </div>
          </div>

          {/* AI Configuration Section */}
          <div className="border-t border-gray-200 pt-6">
            <h2 className="text-xl font-semibold text-gray-900 mb-4">AI Configuration</h2>
            
            <div className="space-y-4">
              <div>
                <label className="flex items-center space-x-2">
                  <input
                    type="checkbox"
                    name="aiEnabled"
                    checked={formData.aiEnabled}
                    onChange={handleChange}
                    className="rounded border-gray-300 text-blue-600 focus:ring-blue-500"
                  />
                  <span className="text-sm font-medium text-gray-700">Enable AI Features</span>
                </label>
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">
                  AI API Key
                </label>
                <input
                  type="password"
                  name="aiApiKey"
                  value={formData.aiApiKey || ''}
                  onChange={handleChange}
                  placeholder="Enter new AI API key (leave blank to keep current)"
                  className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                />
                <p className="text-sm text-gray-500 mt-1">Only enter a new key if you want to update it</p>
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">
                  AI Provider
                </label>
                <select
                  name="aiProvider"
                  value={formData.aiProvider}
                  onChange={handleChange}
                  className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                >
                  <option value="gemini">Google Gemini</option>
                  <option value="openai">OpenAI</option>
                  <option value="anthropic">Anthropic Claude</option>
                </select>
              </div>
            </div>
          </div>

          {/* Resource Limits Section */}
          <div className="border-t border-gray-200 pt-6">
            <h2 className="text-xl font-semibold text-gray-900 mb-4">Resource Limits</h2>
            
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">
                  Max Users
                </label>
                <input
                  type="number"
                  name="maxUsers"
                  value={formData.maxUsers}
                  onChange={handleChange}
                  min={1}
                  className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                />
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">
                  Max Tasks
                </label>
                <input
                  type="number"
                  name="maxTasks"
                  value={formData.maxTasks}
                  onChange={handleChange}
                  min={1}
                  className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                />
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">
                  Max Storage (GB)
                </label>
                <input
                  type="number"
                  name="maxStorage"
                  value={formData.maxStorage}
                  onChange={handleChange}
                  min={1}
                  className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                />
              </div>
            </div>
          </div>

          {/* Action Buttons */}
          <div className="flex justify-end space-x-4 pt-6 border-t border-gray-200">
            <button
              type="button"
              onClick={() => navigate(`/admin/companies/${id}`)}
              className="px-6 py-2 border border-gray-300 text-gray-700 rounded-lg hover:bg-gray-50 transition-colors"
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

