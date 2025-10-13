import { useState, useEffect } from 'react';
import { Plus, RefreshCw, Edit, Trash2, Globe, AlertCircle, CheckCircle, Clock } from 'lucide-react';
import api from '../../services/api';

interface KnowledgeSource {
  id: string;
  name: string;
  url: string;
  type: 'APLIMAN' | 'COMPETITOR';
  description?: string;
  isActive: boolean;
  content?: string;
  lastScraped?: string;
  scrapingError?: string;
  priority: number;
  createdBy: {
    id: string;
    name: string;
    email: string;
  };
  createdAt: string;
  updatedAt: string;
}

export default function KnowledgeSourcesPage() {
  const [sources, setSources] = useState<KnowledgeSource[]>([]);
  const [loading, setLoading] = useState(true);
  const [showModal, setShowModal] = useState(false);
  const [editingSource, setEditingSource] = useState<KnowledgeSource | null>(null);
  const [scraping, setScraping] = useState<string | null>(null);
  const [scrapingAll, setScrapingAll] = useState(false);

  const [formData, setFormData] = useState({
    name: '',
    url: '',
    type: 'APLIMAN' as 'APLIMAN' | 'COMPETITOR',
    description: '',
    isActive: true,
    priority: 3,
  });

  useEffect(() => {
    fetchSources();
  }, []);

  const fetchSources = async () => {
    try {
      setLoading(true);
      const response = await api.get('/knowledge-sources');
      setSources(response.data);
    } catch (error) {
      console.error('Error fetching knowledge sources:', error);
    } finally {
      setLoading(false);
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      if (editingSource) {
        await api.put(`/knowledge-sources/${editingSource.id}`, formData);
      } else {
        await api.post('/knowledge-sources', formData);
      }
      setShowModal(false);
      resetForm();
      fetchSources();
    } catch (error) {
      console.error('Error saving knowledge source:', error);
      alert('Failed to save knowledge source');
    }
  };

  const handleEdit = (source: KnowledgeSource) => {
    setEditingSource(source);
    setFormData({
      name: source.name,
      url: source.url,
      type: source.type,
      description: source.description || '',
      isActive: source.isActive,
      priority: source.priority,
    });
    setShowModal(true);
  };

  const handleDelete = async (id: string) => {
    if (!confirm('Are you sure you want to delete this knowledge source?')) return;
    
    try {
      await api.delete(`/knowledge-sources/${id}`);
      fetchSources();
    } catch (error) {
      console.error('Error deleting knowledge source:', error);
      alert('Failed to delete knowledge source');
    }
  };

  const handleScrape = async (id: string) => {
    try {
      setScraping(id);
      await api.post(`/knowledge-sources/${id}/scrape`);
      fetchSources();
    } catch (error) {
      console.error('Error scraping knowledge source:', error);
      alert('Failed to scrape knowledge source');
    } finally {
      setScraping(null);
    }
  };

  const handleScrapeAll = async () => {
    try {
      setScrapingAll(true);
      const response = await api.post('/knowledge-sources/scrape-all');
      alert(`Scraping complete: ${response.data.successful} successful, ${response.data.failed} failed`);
      fetchSources();
    } catch (error) {
      console.error('Error scraping all sources:', error);
      alert('Failed to scrape sources');
    } finally {
      setScrapingAll(false);
    }
  };

  const resetForm = () => {
    setFormData({
      name: '',
      url: '',
      type: 'APLIMAN',
      description: '',
      isActive: true,
      priority: 3,
    });
    setEditingSource(null);
  };

  const closeModal = () => {
    setShowModal(false);
    resetForm();
  };

  const getStatusIcon = (source: KnowledgeSource) => {
    if (source.scrapingError) {
      return <div title={source.scrapingError}><AlertCircle className="w-5 h-5 text-red-500" /></div>;
    }
    if (source.content) {
      return <div title="Content available"><CheckCircle className="w-5 h-5 text-green-500" /></div>;
    }
    return <div title="Not scraped yet"><Clock className="w-5 h-5 text-gray-400" /></div>;
  };

  const formatDate = (dateString?: string) => {
    if (!dateString) return 'Never';
    return new Date(dateString).toLocaleString();
  };

  return (
    <div className="min-h-screen bg-gray-50 p-8">
      <div className="max-w-7xl mx-auto">
        {/* Header */}
        <div className="flex justify-between items-center mb-8">
          <div>
            <h1 className="text-3xl font-bold text-gray-900">Knowledge Sources</h1>
            <p className="text-gray-600 mt-2">
              Manage Apliman and competitor URLs for enhanced AI content generation
            </p>
          </div>
          <div className="flex gap-3">
            <button
              onClick={handleScrapeAll}
              disabled={scrapingAll || sources.length === 0}
              className="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 flex items-center gap-2 disabled:opacity-50 disabled:cursor-not-allowed"
            >
              <RefreshCw className={`w-5 h-5 ${scrapingAll ? 'animate-spin' : ''}`} />
              {scrapingAll ? 'Scraping...' : 'Scrape All'}
            </button>
            <button
              onClick={() => setShowModal(true)}
              className="px-4 py-2 bg-indigo-600 text-white rounded-lg hover:bg-indigo-700 flex items-center gap-2"
            >
              <Plus className="w-5 h-5" />
              Add Source
            </button>
          </div>
        </div>

        {/* Sources Grid */}
        {loading ? (
          <div className="flex justify-center items-center py-12">
            <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-indigo-600"></div>
          </div>
        ) : sources.length === 0 ? (
          <div className="bg-white rounded-lg shadow p-12 text-center">
            <Globe className="w-16 h-16 text-gray-400 mx-auto mb-4" />
            <h3 className="text-xl font-semibold text-gray-900 mb-2">No Knowledge Sources</h3>
            <p className="text-gray-600 mb-6">
              Add your first knowledge source to enhance AI content generation
            </p>
            <button
              onClick={() => setShowModal(true)}
              className="px-6 py-3 bg-indigo-600 text-white rounded-lg hover:bg-indigo-700"
            >
              Add First Source
            </button>
          </div>
        ) : (
          <div className="grid grid-cols-1 gap-6">
            {sources.map((source) => (
              <div
                key={source.id}
                className="bg-white rounded-lg shadow hover:shadow-lg transition-shadow p-6"
              >
                <div className="flex items-start justify-between">
                  <div className="flex-1">
                    <div className="flex items-center gap-3 mb-2">
                      {getStatusIcon(source)}
                      <h3 className="text-xl font-semibold text-gray-900">{source.name}</h3>
                      <span
                        className={`px-3 py-1 rounded-full text-xs font-semibold ${
                          source.type === 'APLIMAN'
                            ? 'bg-indigo-100 text-indigo-800'
                            : 'bg-orange-100 text-orange-800'
                        }`}
                      >
                        {source.type}
                      </span>
                      <span
                        className={`px-3 py-1 rounded-full text-xs font-semibold ${
                          source.isActive
                            ? 'bg-green-100 text-green-800'
                            : 'bg-gray-100 text-gray-800'
                        }`}
                      >
                        {source.isActive ? 'Active' : 'Inactive'}
                      </span>
                      <span className="px-3 py-1 bg-purple-100 text-purple-800 rounded-full text-xs font-semibold">
                        Priority: {source.priority}
                      </span>
                    </div>
                    
                    <a
                      href={source.url}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="text-blue-600 hover:underline text-sm mb-2 block"
                    >
                      {source.url}
                    </a>

                    {source.description && (
                      <p className="text-gray-600 text-sm mb-3">{source.description}</p>
                    )}

                    <div className="flex items-center gap-4 text-xs text-gray-500">
                      <span>Last scraped: {formatDate(source.lastScraped)}</span>
                      {source.content && (
                        <span>Content: {source.content.length} characters</span>
                      )}
                      <span>Created by: {source.createdBy.name}</span>
                    </div>

                    {source.scrapingError && (
                      <div className="mt-3 p-3 bg-red-50 border border-red-200 rounded-lg">
                        <p className="text-sm text-red-800">
                          <strong>Error:</strong> {source.scrapingError}
                        </p>
                      </div>
                    )}
                  </div>

                  <div className="flex gap-2 ml-4">
                    <button
                      onClick={() => handleScrape(source.id)}
                      disabled={scraping === source.id}
                      className="p-2 text-blue-600 hover:bg-blue-50 rounded-lg disabled:opacity-50 disabled:cursor-not-allowed"
                      title="Scrape content"
                    >
                      <RefreshCw className={`w-5 h-5 ${scraping === source.id ? 'animate-spin' : ''}`} />
                    </button>
                    <button
                      onClick={() => handleEdit(source)}
                      className="p-2 text-gray-600 hover:bg-gray-50 rounded-lg"
                      title="Edit"
                    >
                      <Edit className="w-5 h-5" />
                    </button>
                    <button
                      onClick={() => handleDelete(source.id)}
                      className="p-2 text-red-600 hover:bg-red-50 rounded-lg"
                      title="Delete"
                    >
                      <Trash2 className="w-5 h-5" />
                    </button>
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}

        {/* Modal */}
        {showModal && (
          <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4">
            <div className="bg-white rounded-lg shadow-xl max-w-2xl w-full max-h-[90vh] overflow-y-auto">
              <div className="p-6">
                <h2 className="text-2xl font-bold text-gray-900 mb-6">
                  {editingSource ? 'Edit Knowledge Source' : 'Add Knowledge Source'}
                </h2>

                <form onSubmit={handleSubmit} className="space-y-4">
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">
                      Name *
                    </label>
                    <input
                      type="text"
                      value={formData.name}
                      onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                      className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-indigo-500 focus:border-transparent"
                      required
                    />
                  </div>

                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">
                      URL *
                    </label>
                    <input
                      type="url"
                      value={formData.url}
                      onChange={(e) => setFormData({ ...formData, url: e.target.value })}
                      className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-indigo-500 focus:border-transparent"
                      required
                    />
                  </div>

                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">
                      Type *
                    </label>
                    <select
                      value={formData.type}
                      onChange={(e) => setFormData({ ...formData, type: e.target.value as 'APLIMAN' | 'COMPETITOR' })}
                      className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-indigo-500 focus:border-transparent"
                      required
                    >
                      <option value="APLIMAN">Apliman</option>
                      <option value="COMPETITOR">Competitor</option>
                    </select>
                  </div>

                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">
                      Description
                    </label>
                    <textarea
                      value={formData.description}
                      onChange={(e) => setFormData({ ...formData, description: e.target.value })}
                      className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-indigo-500 focus:border-transparent"
                      rows={3}
                    />
                  </div>

                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">
                      Priority (1-5)
                    </label>
                    <input
                      type="number"
                      min="1"
                      max="5"
                      value={formData.priority}
                      onChange={(e) => setFormData({ ...formData, priority: parseInt(e.target.value) })}
                      className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-indigo-500 focus:border-transparent"
                      required
                    />
                  </div>

                  <div className="flex items-center">
                    <input
                      type="checkbox"
                      id="isActive"
                      checked={formData.isActive}
                      onChange={(e) => setFormData({ ...formData, isActive: e.target.checked })}
                      className="h-4 w-4 text-indigo-600 focus:ring-indigo-500 border-gray-300 rounded"
                    />
                    <label htmlFor="isActive" className="ml-2 block text-sm text-gray-900">
                      Active
                    </label>
                  </div>

                  <div className="flex gap-3 justify-end pt-4 border-t">
                    <button
                      type="button"
                      onClick={closeModal}
                      className="px-4 py-2 border border-gray-300 rounded-lg text-gray-700 hover:bg-gray-50"
                    >
                      Cancel
                    </button>
                    <button
                      type="submit"
                      className="px-4 py-2 bg-indigo-600 text-white rounded-lg hover:bg-indigo-700"
                    >
                      {editingSource ? 'Update' : 'Create'}
                    </button>
                  </div>
                </form>
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

