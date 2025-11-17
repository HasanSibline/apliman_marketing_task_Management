import { useState, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import toast from 'react-hot-toast';
import api from '../services/api';

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

export default function CreateCompany() {
  const navigate = useNavigate();
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [step, setStep] = useState(1);
  const [logoFile, setLogoFile] = useState<File | null>(null);
  const [logoPreview, setLogoPreview] = useState<string | null>(null);
  
  const [formData, setFormData] = useState<CreateCompanyForm>({
    name: '',
    slug: '',
    primaryColor: '#3B82F6',
    adminName: '',
    adminEmail: '',
    adminPassword: '',
    subscriptionPlan: 'PRO',
    subscriptionDays: 30,
    aiProvider: 'gemini',
    maxUsers: 50,
    maxTasks: 5000,
    maxStorage: 10,
  });

  const handleChange = (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement>) => {
    const { name, value, type } = e.target;
    setFormData(prev => ({
      ...prev,
      [name]: type === 'number' ? parseInt(value) : value,
    }));

    // Auto-generate slug from name
    if (name === 'name') {
      let slug = value.toLowerCase()
        .replace(/[^a-z0-9]+/g, '-') // Replace non-alphanumeric with hyphens
        .replace(/^-+|-+$/g, '')      // Remove leading/trailing hyphens
        .replace(/-+/g, '-');          // Replace multiple hyphens with single hyphen
      
      // Ensure slug is not empty
      if (!slug) {
        slug = 'company';
      }
      
      setFormData(prev => ({ ...prev, slug }));
    }
  };

  const handleLogoChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      if (file.size > 5 * 1024 * 1024) { // 5MB limit
        toast.error('File size must be less than 5MB');
        return;
      }
      
      if (!file.type.startsWith('image/')) {
        toast.error('Please select an image file');
        return;
      }

      setLogoFile(file);
      
      // Create preview
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
    if (!logoFile) return undefined;

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
      throw err; // Re-throw to prevent company creation with failed logo upload
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    e.stopPropagation();
    
    // CRITICAL: Only allow submission on step 4
    // This prevents accidental form submission before reaching the final step
    if (step !== 4) {
      console.warn('Form submission blocked - not on step 4. Current step:', step);
      toast.error('Please complete all steps before creating the company');
      return;
    }
    
    console.log('Form submission allowed - on step 4');
    
    // Validate required fields
    if (!formData.name || !formData.slug) {
      toast.error('Company name and slug are required');
      setStep(1);
      return;
    }
    
    if (!formData.adminName || !formData.adminEmail || !formData.adminPassword) {
      toast.error('Admin account details are required');
      setStep(2);
      return;
    }
    
    if (formData.adminPassword.length < 8) {
      toast.error('Admin password must be at least 8 characters');
      setStep(2);
      return;
    }
    
    try {
      setLoading(true);
      setError(null);
      
      // Upload logo if provided
      let logoUrl = undefined;
      if (logoFile) {
        const uploadToast = toast.loading('Uploading logo...');
        try {
          logoUrl = await uploadLogo();
          if (!logoUrl) {
            throw new Error('Logo upload failed');
          }
          console.log('Logo URL to be saved:', logoUrl);
          toast.dismiss(uploadToast);
        } catch (err) {
          toast.dismiss(uploadToast);
          throw err;
        }
      }
      
      const payload = {
        ...formData,
        logo: logoUrl, // This will be the file path from the server
      };

      console.log('Creating company with payload:', payload);
      const response = await api.post('/companies', payload);
      
      toast.success('Company created successfully!');
      
      // Show the admin credentials to the super admin
      if (response.data.adminCredentials) {
        const { email, password } = response.data.adminCredentials;
        const { slug } = response.data.company;
        
        toast.success(
          `Admin Login:\nEmail: ${email}\nPassword: ${password}\nLogin URL: ${window.location.origin}/${slug}/login`,
          { duration: 10000 }
        );
      }
      
      navigate('/admin/companies');
    } catch (err: any) {
      console.error('Error creating company:', err);
      const errorMessage = err.response?.data?.message || err.message || 'Failed to create company';
      setError(errorMessage);
      toast.error(errorMessage);
    } finally {
      setLoading(false);
    }
  };

  const handleFormKeyDown = (e: React.KeyboardEvent<HTMLFormElement>) => {
    // Prevent Enter key from submitting form except on step 4
    if (e.key === 'Enter') {
      const target = e.target as HTMLElement;
      // Allow Enter in textarea, but prevent form submission on other inputs unless on step 4
      if (target.tagName !== 'TEXTAREA') {
        e.preventDefault();
        e.stopPropagation();
        
        if (step < 4) {
          // Move to next step instead of submitting
          console.log('Enter key pressed - moving to next step');
          nextStep();
        } else {
          // On step 4, allow form submission via the submit button only
          // Don't trigger submission on Enter to prevent accidental submission
          console.log('Enter key pressed on step 4 - use "Create Company" button to submit');
          toast('Please click "Create Company" button to submit', { icon: '👆' });
        }
      }
    }
  };

  const nextStep = () => {
    if (step < 4) setStep(step + 1);
  };

  const prevStep = () => {
    if (step > 1) setStep(step - 1);
  };

  return (
    <div className="min-h-screen bg-gray-50 py-8 px-4 sm:px-6 lg:px-8">
      <div className="max-w-3xl mx-auto">
        {/* Header */}
        <div className="mb-8">
          <button
            onClick={() => navigate('/admin/companies')}
            className="text-gray-600 hover:text-gray-900 mb-4 flex items-center"
          >
            ← Back to Companies
          </button>
          <h1 className="text-3xl font-bold text-gray-900">Create New Company</h1>
          <p className="mt-2 text-gray-600">Set up a new company with admin account and subscription</p>
        </div>

        {/* Progress Steps */}
        <div className="mb-8">
          <div className="flex items-center justify-between">
            {[1, 2, 3, 4].map((num) => (
              <div key={num} className="flex items-center flex-1">
                <div className={`flex items-center justify-center w-10 h-10 rounded-full border-2 ${
                  step >= num ? 'border-blue-600 bg-blue-600 text-white' : 'border-gray-300 text-gray-400'
                }`}>
                  {num}
                </div>
                {num < 4 && (
                  <div className={`flex-1 h-1 mx-2 ${step > num ? 'bg-blue-600' : 'bg-gray-300'}`}></div>
                )}
              </div>
            ))}
          </div>
          <div className="flex justify-between mt-2">
            <span className={`text-sm ${step >= 1 ? 'text-blue-600 font-medium' : 'text-gray-400'}`}>Company Info</span>
            <span className={`text-sm ${step >= 2 ? 'text-blue-600 font-medium' : 'text-gray-400'}`}>Admin Account</span>
            <span className={`text-sm ${step >= 3 ? 'text-blue-600 font-medium' : 'text-gray-400'}`}>Subscription</span>
            <span className={`text-sm ${step >= 4 ? 'text-blue-600 font-medium' : 'text-gray-400'}`}>AI & Limits</span>
          </div>
        </div>

        {/* Error Message */}
        {error && (
          <div className="mb-6 bg-red-50 border border-red-200 text-red-700 px-4 py-3 rounded-lg">
            {error}
          </div>
        )}

        {/* Form */}
        <form 
          onSubmit={handleSubmit} 
          onKeyDown={handleFormKeyDown} 
          autoComplete="off"
          className="bg-white rounded-lg shadow-sm p-8"
        >
          {/* Step 1: Company Info */}
          {step === 1 && (
            <div className="space-y-6">
              <h2 className="text-xl font-semibold text-gray-900 mb-4">Company Information</h2>
              
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">
                  Company Name *
                </label>
                <input
                  type="text"
                  name="name"
                  value={formData.name}
                  onChange={handleChange}
                  className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                  placeholder="e.g., Acme Corporation"
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
                  className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                  placeholder="e.g., acme-corporation"
                />
                <p className="text-sm text-gray-500 mt-1">Auto-generated from company name</p>
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
                    placeholder="#3B82F6"
                  />
                </div>
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">
                  Company Logo
                </label>
                
                {/* Logo Preview */}
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
                
                {/* File Input */}
                <div className="flex items-center space-x-4">
                  <input
                    ref={fileInputRef}
                    type="file"
                    accept="image/*"
                    onChange={handleLogoChange}
                    className="hidden"
                    id="logo-upload"
                  />
                  <label
                    htmlFor="logo-upload"
                    className="cursor-pointer bg-white px-4 py-2 border border-gray-300 rounded-lg hover:bg-gray-50 text-sm font-medium text-gray-700"
                  >
                    {logoFile ? 'Change Logo' : 'Choose Logo'}
                  </label>
                  <span className="text-sm text-gray-500">
                    {logoFile ? logoFile.name : 'No file chosen'}
                  </span>
                </div>
                
                <p className="text-xs text-gray-500 mt-2">
                  Max size: 5MB. Recommended: Square image (e.g., 200x200px). Formats: JPG, PNG, WEBP, GIF
                </p>
              </div>
            </div>
          )}

          {/* Step 2: Admin Account */}
          {step === 2 && (
            <div className="space-y-6">
              <h2 className="text-xl font-semibold text-gray-900 mb-4">Admin Account</h2>
              
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">
                  Admin Name *
                </label>
                <input
                  type="text"
                  name="adminName"
                  value={formData.adminName}
                  onChange={handleChange}
                  className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                  placeholder="John Doe"
                />
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">
                  Admin Email *
                </label>
                <input
                  type="email"
                  name="adminEmail"
                  value={formData.adminEmail}
                  onChange={handleChange}
                  className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                  placeholder="admin@company.com"
                />
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">
                  Admin Password *
                </label>
                <input
                  type="password"
                  name="adminPassword"
                  value={formData.adminPassword}
                  onChange={handleChange}
                  minLength={8}
                  className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                  placeholder="Minimum 8 characters"
                />
                <p className="text-sm text-gray-500 mt-1">At least 8 characters</p>
              </div>
            </div>
          )}

          {/* Step 3: Subscription */}
          {step === 3 && (
            <div className="space-y-6">
              <h2 className="text-xl font-semibold text-gray-900 mb-4">Subscription Details</h2>
              
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">
                  Subscription Plan *
                </label>
                <select
                  name="subscriptionPlan"
                  value={formData.subscriptionPlan}
                  onChange={handleChange}
                  className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                >
                  <option value="FREE">FREE - Basic features</option>
                  <option value="PRO">PRO - Advanced features</option>
                  <option value="ENTERPRISE">ENTERPRISE - All features</option>
                </select>
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">
                  Subscription Duration (days) *
                </label>
                <input
                  type="number"
                  name="subscriptionDays"
                  value={formData.subscriptionDays}
                  onChange={handleChange}
                  min={1}
                  className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                />
                <p className="text-sm text-gray-500 mt-1">Number of days the subscription is valid</p>
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">
                  Billing Email (optional)
                </label>
                <input
                  type="email"
                  name="billingEmail"
                  value={formData.billingEmail || ''}
                  onChange={handleChange}
                  className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                  placeholder="billing@company.com"
                />
              </div>
            </div>
          )}

          {/* Step 4: AI & Limits */}
          {step === 4 && (
            <div className="space-y-6">
              <div>
                <h2 className="text-xl font-semibold text-gray-900 mb-2">AI Configuration & Resource Limits</h2>
                <p className="text-sm text-gray-600 mb-4">
                  Configure AI features and set resource limits for the company. 
                  <span className="font-semibold text-blue-600"> AI configuration is optional</span> - you can skip it and enable AI later.
                </p>
              </div>
              
              {/* AI Configuration Section */}
              <div className="bg-blue-50 border border-blue-200 rounded-lg p-4">
                <h3 className="text-sm font-semibold text-blue-900 mb-3 flex items-center gap-2">
                  <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 10V3L4 14h7v7l9-11h-7z" />
                  </svg>
                  AI Features (Optional)
                </h3>
                
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-2">
                    AI API Key
                  </label>
                  <input
                    type="text"
                    name="aiApiKey"
                    value={formData.aiApiKey || ''}
                    onChange={handleChange}
                    className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent bg-white"
                    placeholder="Enter your Gemini API key (optional)"
                  />
                  <p className="text-sm text-gray-600 mt-2">
                    {formData.aiApiKey ? (
                      <span className="text-green-600 font-medium">✓ AI will be enabled for this company</span>
                    ) : (
                      <span className="text-gray-500">AI will be disabled. You can enable it later by editing the company.</span>
                    )}
                  </p>
                </div>
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
                </select>
              </div>

              <div className="grid grid-cols-3 gap-4">
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
              
              {/* Summary Section */}
              <div className="bg-gray-50 border border-gray-200 rounded-lg p-4 mt-6">
                <h3 className="text-sm font-semibold text-gray-900 mb-3">📋 Summary - Review Before Creating</h3>
                <div className="grid grid-cols-2 gap-3 text-sm">
                  <div>
                    <span className="text-gray-600">Company:</span>
                    <span className="ml-2 font-medium text-gray-900">{formData.name || 'Not set'}</span>
                  </div>
                  <div>
                    <span className="text-gray-600">Slug:</span>
                    <span className="ml-2 font-medium text-gray-900">{formData.slug || 'Not set'}</span>
                  </div>
                  <div>
                    <span className="text-gray-600">Admin:</span>
                    <span className="ml-2 font-medium text-gray-900">{formData.adminName || 'Not set'}</span>
                  </div>
                  <div>
                    <span className="text-gray-600">Plan:</span>
                    <span className="ml-2 font-medium text-gray-900">{formData.subscriptionPlan}</span>
                  </div>
                  <div className="col-span-2">
                    <span className="text-gray-600">AI Status:</span>
                    <span className={`ml-2 font-medium ${formData.aiApiKey ? 'text-green-600' : 'text-gray-500'}`}>
                      {formData.aiApiKey ? '✓ Enabled' : '✗ Disabled (can enable later)'}
                    </span>
                  </div>
                </div>
                <p className="text-xs text-gray-500 mt-3 border-t border-gray-300 pt-3">
                  ⚠️ Click "Create Company" button below to create the company. This action cannot be undone.
                </p>
              </div>
            </div>
          )}

          {/* Navigation Buttons */}
          <div className="flex justify-between mt-8 pt-6 border-t border-gray-200">
            {step > 1 && (
              <button
                type="button"
                onClick={prevStep}
                className="px-6 py-2 border border-gray-300 text-gray-700 rounded-lg hover:bg-gray-50 transition-colors"
              >
                Previous
              </button>
            )}
            
            {step < 4 ? (
              <button
                type="button"
                onClick={nextStep}
                className={`px-6 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors ${step === 1 ? 'ml-auto' : ''}`}
              >
                Next
              </button>
            ) : (
              <button
                type="submit"
                disabled={loading}
                className="px-6 py-2 bg-green-600 text-white rounded-lg hover:bg-green-700 transition-colors disabled:opacity-50 disabled:cursor-not-allowed ml-auto flex items-center gap-2"
              >
                {loading ? (
                  <>
                    <svg className="animate-spin h-5 w-5 text-white" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
                      <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
                      <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
                    </svg>
                    Creating Company...
                  </>
                ) : (
                  <>
                    ✓ Create Company
                  </>
                )}
              </button>
            )}
          </div>
        </form>
      </div>
    </div>
  );
}

