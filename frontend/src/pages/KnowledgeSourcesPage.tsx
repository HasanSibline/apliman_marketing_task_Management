import { useState, useEffect } from 'react';
import { confirmDialog } from '@/components/ui/confirm'
import {
  PlusIcon as Plus,
  ArrowPathIcon as RefreshCw,
  PencilSquareIcon as Edit,
  TrashIcon as Trash2,
  GlobeAltIcon as Globe,
  ExclamationCircleIcon as AlertCircle,
  CheckCircleIcon as CheckCircle,
  ClockIcon as Clock,
} from '@heroicons/react/24/outline';
import api from '@/services/api';
import toast from 'react-hot-toast';
import Select from '@/components/ui/Select'

/**
 * Turns a failed scrape into something worth reading.
 *
 * Scraping runs through the AI service, so these calls can fail for reasons no amount
 * of retrying will fix: no provider configured, a budget spent, a key the provider
 * rejects. Both handlers here used to throw the response away and toast a fixed
 * "Failed to scrape knowledge source", while the shared axios interceptor added its
 * own "please try again in a moment" on top for anything 5xx. So the two things on
 * screen were a message that said nothing and a message that said the wrong thing,
 * and the one sentence that would have told an administrator what to go and fix was
 * the one that got dropped.
 *
 * Same shape as the ladder in components/chat/AuraAssist.tsx. The server writes these
 * messages for the reader, so they are shown as sent rather than reworded here.
 */
function describeScrapeFailure(error: any, fallback: string) {
  const kind: string | undefined = error?.response?.data?.kind
  const detail = error?.response?.data?.detail
  const serverMessage: string | undefined =
    (typeof error?.response?.data?.message === 'string' ? error.response.data.message : undefined) ||
    (typeof detail === 'string' ? detail : undefined) ||
    (typeof detail?.message === 'string' ? detail.message : undefined)

  /** States that need someone with access to settings. Never say "try again" for these. */
  const permanent =
    kind === 'NOT_CONFIGURED' ||
    kind === 'BUDGET_EXHAUSTED' ||
    kind === 'INVALID_API_KEY' ||
    kind === 'AUTHENTICATION_ERROR' ||
    kind === 'ENDPOINT_NOT_FOUND'

  let message: string
  if (error?.code === 'ECONNABORTED') {
    message = 'That took longer than the server would wait. Try one source at a time.'
  } else if (!error?.response || error?.message === 'Network Error') {
    message = 'Could not reach the server. Please try again in a moment.'
  } else if (serverMessage && kind) {
    message = serverMessage
  } else {
    message = serverMessage || fallback
  }

  // A state only an administrator can clear is worth leaving on screen long enough
  // to read and act on, rather than for the four seconds a toast normally lasts.
  return { message, permanent }
}

interface KnowledgeSource {
  id: string;
  name: string;
  url: string;
  type: 'OWN_COMPANY' | 'COMPETITOR';
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
  /**
   * Null while unknown, and never guessed.
   *
   * This used to start at the literal string "Your Company" and keep it when the
   * lookup failed. That string is not only in the subtitle: it is the type badge on
   * every source the company owns, and the label of an option in the create form. So
   * a failed lookup put a placeholder where a real company name goes, in a spot where
   * it reads exactly like data.
   */
  const [companyName, setCompanyName] = useState<string | null>(null);
  const [sources, setSources] = useState<KnowledgeSource[]>([]);
  const [loading, setLoading] = useState(true);
  /**
   * A failed list request is not an empty list.
   *
   * The catch below wrote to the console and nowhere else, so the page rendered "No
   * Knowledge Sources" with an "Add First Source" button. Someone whose sources
   * failed to load was told they had none and invited to recreate them, which is how
   * you end up with a duplicate of every source the company already had.
   */
  const [loadError, setLoadError] = useState(false);
  const [showModal, setShowModal] = useState(false);
  const [editingSource, setEditingSource] = useState<KnowledgeSource | null>(null);
  const [scraping, setScraping] = useState<string | null>(null);
  const [scrapingAll, setScrapingAll] = useState(false);

  const [formData, setFormData] = useState({
    name: '',
    url: '',
    type: 'OWN_COMPANY' as 'OWN_COMPANY' | 'COMPETITOR',
    description: '',
    isActive: true,
    priority: 3,
  });

  useEffect(() => {
    fetchCompanyName();
    fetchSources();
  }, []);

  const fetchCompanyName = async () => {
    try {
      // Fetch current user's company information
      const response = await api.get('/companies/my-company');
      setCompanyName(response.data?.name || null);
    } catch (error) {
      console.error('Error fetching company name:', error);
      // Left null. The render says "your company" in lower case, as a description
      // rather than as a name, wherever this would have gone.
    }
  };

  const fetchSources = async () => {
    try {
      setLoading(true);
      setLoadError(false);
      const response = await api.get('/knowledge-sources');
      // The endpoint returns a bare array today. Guarded because the raw body went
      // straight into state and every read below is a .length or a .map on it, so an
      // envelope on the other end would white-screen the route rather than show one
      // wrong number.
      setSources(Array.isArray(response.data) ? response.data : response.data?.sources ?? []);
    } catch (error) {
      console.error('Error fetching knowledge sources:', error);
      setLoadError(true);
      setSources([]);
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
      toast.error('Failed to save knowledge source');
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
    if (!(await confirmDialog({
      title: 'Delete this knowledge source?',
      description: 'Aura will stop drawing on it when it answers questions.',
      confirmText: 'Delete',
      variant: 'danger',
    }))) return;
    
    try {
      await api.delete(`/knowledge-sources/${id}`);
      fetchSources();
    } catch (error) {
      console.error('Error deleting knowledge source:', error);
      toast.error('Failed to delete knowledge source');
    }
  };

  const handleScrape = async (id: string) => {
    try {
      setScraping(id);
      // quiet, so the interceptor's generic "try again later" does not land on top of
      // the specific reason below.
      await api.post(`/knowledge-sources/${id}/scrape`, undefined, { quiet: true });
      toast.success('Source scraped');
      fetchSources();
    } catch (error) {
      console.error('Error scraping knowledge source:', error);
      const { message, permanent } = describeScrapeFailure(error, 'Could not scrape that source.');
      toast.error(message, permanent ? { duration: 8000 } : undefined);
    } finally {
      setScraping(null);
    }
  };

  const handleScrapeAll = async () => {
    try {
      setScrapingAll(true);
      const response = await api.post('/knowledge-sources/scrape-all', undefined, { quiet: true });
      // Defaulted, because the counts were read straight off the body and a shape
      // change reported "undefined successful, undefined failed" as if it were news.
      const successful = response.data?.successful ?? 0;
      const failed = response.data?.failed ?? 0;
      if (failed === 0) {
        toast.success(`Scraped ${successful} source${successful === 1 ? '' : 's'}.`);
      } else {
        toast(`Scraped ${successful}, failed on ${failed}. The failures are listed on the cards below.`, {
          icon: '📊',
        });
      }
      fetchSources();
    } catch (error) {
      console.error('Error scraping all sources:', error);
      const { message, permanent } = describeScrapeFailure(error, 'Could not scrape the sources.');
      toast.error(message, permanent ? { duration: 8000 } : undefined);
    } finally {
      setScrapingAll(false);
    }
  };

  const resetForm = () => {
    setFormData({
      name: '',
      url: '',
      type: 'OWN_COMPANY',
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
    return <div title="Not scraped yet"><Clock className="w-5 h-5 text-gray-500 dark:text-gray-400" /></div>;
  };

  const formatDate = (dateString?: string) => {
    if (!dateString) return 'Never';
    return new Date(dateString).toLocaleString();
  };

  return (
    <div className="min-h-screen bg-gray-50 dark:bg-gray-900/40 p-8">
      <div className="max-w-7xl mx-auto">
        {/* Header */}
        <div className="flex justify-between items-center mb-8">
          <div>
            <h1 className="text-3xl font-bold text-gray-900 dark:text-white">Knowledge Sources</h1>
            <p className="text-gray-600 dark:text-gray-300 mt-2">
              Manage {companyName ?? 'your company'} and competitor URLs that Aura draws on when it
              writes.
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
        ) : loadError ? (
          <div className="bg-white dark:bg-gray-800 rounded-lg shadow p-12 text-center">
            <AlertCircle className="w-16 h-16 text-error-500 mx-auto mb-4" />
            <h3 className="text-xl font-semibold text-gray-900 dark:text-white mb-2">
              Your sources could not be loaded
            </h3>
            <p className="text-gray-600 dark:text-gray-300 mb-6">
              The server did not answer. Anything already saved is still there, so do not add
              it again from here.
            </p>
            <button onClick={fetchSources} className="btn-primary">Try again</button>
          </div>
        ) : sources.length === 0 ? (
          <div className="bg-white dark:bg-gray-800 rounded-lg shadow p-12 text-center">
            <Globe className="w-16 h-16 text-gray-500 dark:text-gray-400 mx-auto mb-4" />
            <h3 className="text-xl font-semibold text-gray-900 dark:text-white mb-2">No knowledge sources yet</h3>
            <p className="text-gray-600 dark:text-gray-300 mb-6">
              A knowledge source is a page Aura reads before it writes for you.
            </p>
            <button
              onClick={() => setShowModal(true)}
              className="px-6 py-3 bg-indigo-600 text-white rounded-lg hover:bg-indigo-700"
            >
              Add first source
            </button>
          </div>
        ) : (
          <div className="grid grid-cols-1 gap-6">
            {sources.map((source) => (
              <div
                key={source.id}
                className="bg-white dark:bg-gray-800 rounded-lg shadow hover:shadow-lg transition-shadow p-6"
              >
                <div className="flex items-start justify-between">
                  <div className="flex-1">
                    <div className="flex items-center gap-3 mb-2">
                      {getStatusIcon(source)}
                      <h3 className="text-xl font-semibold text-gray-900 dark:text-white">{source.name}</h3>
                      <span
                        className={`px-3 py-1 rounded-full text-xs font-semibold ${
                          source.type === 'OWN_COMPANY'
                            ? 'bg-indigo-100 dark:bg-indigo-900/30 text-indigo-800 dark:text-indigo-300'
                            : 'bg-orange-100 dark:bg-orange-900/30 text-orange-800 dark:text-orange-300'
                        }`}
                      >
                        {source.type === 'OWN_COMPANY' ? companyName ?? 'OUR COMPANY' : 'COMPETITOR'}
                      </span>
                      <span
                        className={`px-3 py-1 rounded-full text-xs font-semibold ${
                          source.isActive
                            ? 'bg-green-100 text-green-800'
                            : 'bg-gray-100 dark:bg-gray-800 text-gray-800 dark:text-gray-100'
                        }`}
                      >
                        {source.isActive ? 'Active' : 'Inactive'}
                      </span>
                      <span className="px-3 py-1 bg-purple-100 dark:bg-purple-900/30 text-purple-800 dark:text-purple-300 rounded-full text-xs font-semibold">
                        Priority: {source.priority}
                      </span>
                    </div>
                    
                    <a
                      href={source.url}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="text-blue-600 dark:text-blue-400 hover:underline text-sm mb-2 block"
                    >
                      {source.url}
                    </a>

                    {source.description && (
                      <p className="text-gray-600 dark:text-gray-300 text-sm mb-3">{source.description}</p>
                    )}

                    <div className="flex items-center gap-4 text-xs text-gray-500 dark:text-gray-400">
                      <span>Last scraped: {formatDate(source.lastScraped)}</span>
                      {source.content && (
                        <span>Content: {source.content.length} characters</span>
                      )}
                      {/* Optional because it is a join. A source whose author has since been
                          deleted used to throw here, inside the map, and take the whole
                          page down rather than one line of one card. */}
                      <span>Created by: {source.createdBy?.name ?? 'Unknown'}</span>
                    </div>

                    {source.scrapingError && (
                      <div className="mt-3 p-3 bg-red-50 dark:bg-red-900/30 border border-red-200 rounded-lg">
                        <p className="text-sm text-red-800 dark:text-red-300">
                          <strong>Error:</strong> {source.scrapingError}
                        </p>
                      </div>
                    )}
                  </div>

                  <div className="flex gap-2 ml-4">
                    <button
                      onClick={() => handleScrape(source.id)}
                      disabled={scraping === source.id}
                      className="p-2 text-blue-600 dark:text-blue-400 hover:bg-blue-50 dark:hover:bg-blue-900/30 rounded-lg disabled:opacity-50 disabled:cursor-not-allowed"
                      title="Scrape content"
                    >
                      <RefreshCw className={`w-5 h-5 ${scraping === source.id ? 'animate-spin' : ''}`} />
                    </button>
                    <button
                      onClick={() => handleEdit(source)}
                      className="p-2 text-gray-600 dark:text-gray-300 hover:bg-gray-50 dark:hover:bg-gray-700 rounded-lg"
                      title="Edit"
                    >
                      <Edit className="w-5 h-5" />
                    </button>
                    <button
                      onClick={() => handleDelete(source.id)}
                      className="p-2 text-red-600 dark:text-red-400 hover:bg-red-50 dark:hover:bg-red-900/30 rounded-lg"
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
            <div className="bg-white dark:bg-gray-800 rounded-lg shadow-md max-w-2xl w-full max-h-[90vh] overflow-y-auto">
              <div className="p-6">
                <h2 className="text-2xl font-bold text-gray-900 dark:text-white mb-6">
                  {editingSource ? 'Edit Knowledge Source' : 'Add Knowledge Source'}
                </h2>

                <form onSubmit={handleSubmit} className="space-y-4">
                  <div>
                    <label className="block text-sm font-medium text-gray-700 dark:text-gray-200 mb-1">
                      Name *
                    </label>
                    <input
                      type="text"
                      value={formData.name}
                      onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                      className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg focus:ring-2 focus:ring-primary-500 focus:border-transparent"
                      required
                    />
                  </div>

                  <div>
                    <label className="block text-sm font-medium text-gray-700 dark:text-gray-200 mb-1">
                      URL *
                    </label>
                    <input
                      type="url"
                      value={formData.url}
                      onChange={(e) => setFormData({ ...formData, url: e.target.value })}
                      className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg focus:ring-2 focus:ring-primary-500 focus:border-transparent"
                      required
                    />
                  </div>

                  <div>
                    <label className="block text-sm font-medium text-gray-700 dark:text-gray-200 mb-1">
                      Type *
                    </label>
                    <Select
                      value={formData.type}
                      onChange={(e) => setFormData({ ...formData, type: e.target.value as 'OWN_COMPANY' | 'COMPETITOR' })}
                      className="select-field w-full"
                      required
                    >
                      <option value="OWN_COMPANY">{companyName ?? 'Our company'}</option>
                      <option value="COMPETITOR">Competitor</option>
                    </Select>
                  </div>

                  <div>
                    <label className="block text-sm font-medium text-gray-700 dark:text-gray-200 mb-1">
                      Description
                    </label>
                    <textarea
                      value={formData.description}
                      onChange={(e) => setFormData({ ...formData, description: e.target.value })}
                      className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg focus:ring-2 focus:ring-primary-500 focus:border-transparent"
                      rows={3}
                    />
                  </div>

                  <div>
                    <label className="block text-sm font-medium text-gray-700 dark:text-gray-200 mb-1">
                      Priority (1-5)
                    </label>
                    <input
                      type="number"
                      min="1"
                      max="5"
                      value={formData.priority}
                      // An empty box parses to NaN, which React then sets as the input's
                      // value and the field stops accepting typing altogether.
                      onChange={(e) =>
                        setFormData({ ...formData, priority: Number.parseInt(e.target.value, 10) || 3 })
                      }
                      className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg focus:ring-2 focus:ring-primary-500 focus:border-transparent"
                      required
                    />
                  </div>

                  <div className="flex items-center">
                    <input
                      type="checkbox"
                      id="isActive"
                      checked={formData.isActive}
                      onChange={(e) => setFormData({ ...formData, isActive: e.target.checked })}
                      className="h-4 w-4 text-indigo-600 dark:text-indigo-400 focus:ring-primary-500 border-gray-300 dark:border-gray-600 rounded"
                    />
                    <label htmlFor="isActive" className="ml-2 block text-sm text-gray-900 dark:text-white">
                      Active
                    </label>
                  </div>

                  <div className="flex gap-3 justify-end pt-4 border-t">
                    <button
                      type="button"
                      onClick={closeModal}
                      className="px-4 py-2 border border-gray-300 dark:border-gray-600 rounded-lg text-gray-700 dark:text-gray-200 hover:bg-gray-50 dark:hover:bg-gray-700"
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

