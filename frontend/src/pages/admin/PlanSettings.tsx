import React, { useState, useEffect } from 'react';
import {
    UsersIcon,
    ClipboardDocumentCheckIcon,
    CircleStackIcon,
    SparklesIcon,
    PlusIcon,
    PencilSquareIcon,
    TrashIcon
} from '@heroicons/react/24/outline';
import toast from 'react-hot-toast';
import api from '@/services/api';

interface Plan {
    id: string;
    name: string;
    maxUsers: number;
    maxTasks: number;
    maxStorage: number;
    price: number;
    aiEnabled: boolean;
}

const PlanSettings: React.FC = () => {
    const [plans, setPlans] = useState<Plan[]>([]);
    const [loading, setLoading] = useState(true);
    const [isEditing, setIsEditing] = useState(false);
    const [currentPlan, setCurrentPlan] = useState<Partial<Plan>>({});

    useEffect(() => {
        fetchPlans();
    }, []);

    const fetchPlans = async () => {
        try {
            setLoading(true);
            const response = await api.get('/plans');
            setPlans(response.data);
        } catch (error) {
            toast.error('Failed to load plans');
        } finally {
            setLoading(false);
        }
    };

    const handleEdit = (plan: Plan) => {
        setCurrentPlan(plan);
        setIsEditing(true);
    };

    const handleAddNew = () => {
        setCurrentPlan({
            name: '',
            maxUsers: 10,
            maxTasks: 1000,
            maxStorage: 5,
            price: 0,
            aiEnabled: false
        });
        setIsEditing(true);
    };

    const handleDelete = async (id: string, name: string) => {
        if (!window.confirm(`Are you sure you want to delete the "${name}" plan? This cannot be undone if no companies are using it.`)) return;

        try {
            await api.delete(`/plans/${id}`);
            toast.success('Plan deleted successfully');
            fetchPlans();
        } catch (error: any) {
            toast.error(error.response?.data?.message || 'Failed to delete plan');
        }
    };

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault();
        try {
            if (currentPlan.id) {
                await api.patch(`/plans/${currentPlan.id}`, currentPlan);
                toast.success('Plan updated successfully');
            } else {
                await api.post('/plans', currentPlan);
                toast.success('Plan created successfully');
            }
            setIsEditing(false);
            fetchPlans();
        } catch (error) {
            toast.error('Failed to save plan');
        }
    };

    if (loading) {
        return <div className="flex justify-center items-center h-64"><div className="animate-spin rounded-full h-12 w-12 border-b-2 border-indigo-600"></div></div>;
    }

    return (
        <div className="max-w-7xl mx-auto py-6 px-4 sm:px-6 lg:px-8">
            <div className="md:flex md:items-center md:justify-between mb-8">
                <div className="flex-1 min-w-0">
                    <h2 className="text-2xl font-bold leading-7 text-gray-900 sm:text-3xl sm:truncate">
                        Subscription Plans
                    </h2>
                    <p className="mt-1 text-sm text-gray-500">
                        Manage global limits and pricing for each subscription level.
                    </p>
                </div>
                <div className="mt-4 flex md:mt-0 md:ml-4">
                    <button
                        onClick={handleAddNew}
                        className="inline-flex items-center px-4 py-2 border border-transparent rounded-md shadow-sm text-sm font-medium text-white bg-indigo-600 hover:bg-indigo-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-indigo-500"
                    >
                        <PlusIcon className="-ml-1 mr-2 h-5 w-5" />
                        Add New Plan
                    </button>
                </div>
            </div>

            <div className="grid grid-cols-1 gap-6 sm:grid-cols-2 lg:grid-cols-3">
                {plans.map((plan) => (
                    <div key={plan.id} className="bg-white overflow-hidden shadow rounded-lg border border-gray-200 hover:border-indigo-300 transition-all">
                        <div className="p-6">
                            <div className="flex items-center justify-between mb-4">
                                <h3 className="text-lg font-bold text-gray-900">{plan.name}</h3>
                                <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium bg-indigo-100 text-indigo-800">
                                    ${plan.price}/mo
                                </span>
                            </div>

                            <ul className="space-y-3 mb-6">
                                <li className="flex items-center text-sm text-gray-600">
                                    <UsersIcon className="h-5 w-5 mr-2 text-gray-400" />
                                    Max Users: <span className="ml-1 font-semibold">{plan.maxUsers === -1 ? 'Unlimited' : plan.maxUsers}</span>
                                </li>
                                <li className="flex items-center text-sm text-gray-600">
                                    <ClipboardDocumentCheckIcon className="h-5 w-5 mr-2 text-gray-400" />
                                    Max Tasks: <span className="ml-1 font-semibold">{plan.maxTasks === -1 ? 'Unlimited' : plan.maxTasks}</span>
                                </li>
                                <li className="flex items-center text-sm text-gray-600">
                                    <CircleStackIcon className="h-5 w-5 mr-2 text-gray-400" />
                                    Storage: <span className="ml-1 font-semibold">{plan.maxStorage === -1 ? 'Unlimited' : `${plan.maxStorage} GB`}</span>
                                </li>
                                <li className="flex items-center text-sm text-gray-600">
                                    <SparklesIcon className={`h-5 w-5 mr-2 ${plan.aiEnabled ? 'text-amber-500' : 'text-gray-300'}`} />
                                    AI Features: <span className={`ml-1 font-semibold ${plan.aiEnabled ? 'text-amber-600' : 'text-gray-400'}`}>{plan.aiEnabled ? 'Enabled' : 'Disabled'}</span>
                                </li>
                            </ul>

                            <div className="flex space-x-2 mt-4 border-t pt-4">
                                <button
                                    onClick={() => handleEdit(plan)}
                                    className="flex-1 inline-flex justify-center items-center px-4 py-2 border border-gray-300 shadow-sm text-sm font-medium rounded-md text-gray-700 bg-white hover:bg-gray-50 focus:outline-none"
                                >
                                    <PencilSquareIcon className="h-4 w-4 mr-2" />
                                    Edit
                                </button>
                                <button
                                    onClick={() => handleDelete(plan.id, plan.name)}
                                    className="inline-flex items-center p-2 border border-red-200 text-red-600 rounded-md hover:bg-red-50"
                                    title="Delete Plan"
                                >
                                    <TrashIcon className="h-5 w-5" />
                                </button>
                            </div>
                        </div>
                    </div>
                ))}
            </div>

            {/* Edit/Create Modal */}
            {isEditing && (
                <div className="fixed inset-0 z-10 overflow-y-auto">
                    <div className="flex items-center justify-center min-h-screen pt-4 px-4 pb-20 text-center sm:block sm:p-0">
                        <div className="fixed inset-0 transition-opacity" aria-hidden="true">
                            <div className="absolute inset-0 bg-gray-500 opacity-75"></div>
                        </div>
                        <span className="hidden sm:inline-block sm:align-middle sm:h-screen" aria-hidden="true">&#8203;</span>
                        <div className="inline-block align-bottom bg-white rounded-lg px-4 pt-5 pb-4 text-left overflow-hidden shadow-xl transform transition-all sm:my-8 sm:align-middle sm:max-w-lg sm:w-full sm:p-6">
                            <div>
                                <h3 className="text-lg leading-6 font-medium text-gray-900 mb-4">
                                    {currentPlan.id ? `Edit ${currentPlan.name} Plan` : 'Create New Plan'}
                                </h3>
                                <form onSubmit={handleSubmit} className="space-y-4">
                                    <div>
                                        <label className="block text-sm font-medium text-gray-700">Plan Name</label>
                                        <input
                                            type="text"
                                            required
                                            value={currentPlan.name || ''}
                                            onChange={(e) => setCurrentPlan({ ...currentPlan, name: e.target.value })}
                                            className="mt-1 block w-full border-gray-300 rounded-md shadow-sm focus:ring-indigo-500 focus:border-indigo-500 sm:text-sm"
                                        />
                                    </div>
                                    <div className="grid grid-cols-2 gap-4">
                                        <div>
                                            <label className="block text-sm font-medium text-gray-700">Price ($/mo)</label>
                                            <input
                                                type="number"
                                                required
                                                value={currentPlan.price || 0}
                                                onChange={(e) => setCurrentPlan({ ...currentPlan, price: parseFloat(e.target.value) })}
                                                className="mt-1 block w-full border-gray-300 rounded-md shadow-sm focus:ring-indigo-500 focus:border-indigo-500 sm:text-sm"
                                            />
                                        </div>
                                        <div>
                                            <label className="block text-sm font-medium text-gray-700">Max Users (-1 = unlimited)</label>
                                            <input
                                                type="number"
                                                required
                                                value={currentPlan.maxUsers || 0}
                                                onChange={(e) => setCurrentPlan({ ...currentPlan, maxUsers: parseInt(e.target.value) })}
                                                className="mt-1 block w-full border-gray-300 rounded-md shadow-sm focus:ring-indigo-500 focus:border-indigo-500 sm:text-sm"
                                            />
                                        </div>
                                    </div>
                                    <div className="grid grid-cols-2 gap-4">
                                        <div>
                                            <label className="block text-sm font-medium text-gray-700">Max Tasks (-1 = unlimited)</label>
                                            <input
                                                type="number"
                                                required
                                                value={currentPlan.maxTasks || 0}
                                                onChange={(e) => setCurrentPlan({ ...currentPlan, maxTasks: parseInt(e.target.value) })}
                                                className="mt-1 block w-full border-gray-300 rounded-md shadow-sm focus:ring-indigo-500 focus:border-indigo-500 sm:text-sm"
                                            />
                                        </div>
                                        <div>
                                            <label className="block text-sm font-medium text-gray-700">Storage (GB, -1 = unlimited)</label>
                                            <input
                                                type="number"
                                                required
                                                value={currentPlan.maxStorage || 0}
                                                onChange={(e) => setCurrentPlan({ ...currentPlan, maxStorage: parseInt(e.target.value) })}
                                                className="mt-1 block w-full border-gray-300 rounded-md shadow-sm focus:ring-indigo-500 focus:border-indigo-500 sm:text-sm"
                                            />
                                        </div>
                                    </div>
                                    <div className="flex items-center">
                                        <input
                                            id="aiEnabled"
                                            type="checkbox"
                                            checked={currentPlan.aiEnabled || false}
                                            onChange={(e) => setCurrentPlan({ ...currentPlan, aiEnabled: e.target.checked })}
                                            className="h-4 w-4 text-indigo-600 focus:ring-indigo-500 border-gray-300 rounded"
                                        />
                                        <label htmlFor="aiEnabled" className="ml-2 block text-sm text-gray-900 font-medium">
                                            Enable AI Features for this plan
                                        </label>
                                    </div>
                                    <div className="mt-5 sm:mt-6 sm:grid sm:grid-cols-2 sm:gap-3 sm:grid-flow-row-dense">
                                        <button
                                            type="submit"
                                            className="w-full inline-flex justify-center rounded-md border border-transparent shadow-sm px-4 py-2 bg-indigo-600 text-base font-medium text-white hover:bg-indigo-700 focus:outline-none sm:col-start-2 sm:text-sm"
                                        >
                                            Save Plan
                                        </button>
                                        <button
                                            type="button"
                                            onClick={() => setIsEditing(false)}
                                            className="mt-3 w-full inline-flex justify-center rounded-md border border-gray-300 shadow-sm px-4 py-2 bg-white text-base font-medium text-gray-700 hover:bg-gray-50 focus:outline-none sm:mt-0 sm:col-start-1 sm:text-sm"
                                        >
                                            Cancel
                                        </button>
                                    </div>
                                </form>
                            </div>
                        </div>
                    </div>
                </div>
            )}
        </div>
    );
};

export default PlanSettings;
