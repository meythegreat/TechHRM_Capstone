import { useState, useEffect } from 'react';
import axios from 'axios';
import { openSecureFile } from '../utils/secureFile';

interface Requirement {
    id: number;
    document_type: string;
    file_path: string;
    status: string;
    remarks: string | null;
    created_at: string;
    user?: {
        name: string;
        profile?: {
            student_id_number: string;
            assigned_office: string;
        }
    }
}

const RequirementManagement = () => {
    const [requirements, setRequirements] = useState<Requirement[]>([]);
    const [isLoading, setIsLoading] = useState(true);
    const [toastMsg, setToastMsg] = useState<{text: string, type: 'success' | 'error'} | null>(null);

    // Reject Modal State
    const [isRejectModalOpen, setIsRejectModalOpen] = useState(false);
    const [selectedReqId, setSelectedReqId] = useState<number | null>(null);
    const [rejectRemarks, setRejectRemarks] = useState('');

    useEffect(() => {
        fetchRequirements();
    }, []);

    const fetchRequirements = async () => {
        setIsLoading(true);
        try {
            const res = await axios.get('/api/requirements');
            setRequirements(res.data);
        } catch (error) {
            console.error("Failed to fetch requirements", error);
        } finally {
            setIsLoading(false);
        }
    };

    const handleUpdateStatus = async (id: number, status: 'verified' | 'rejected', remarks: string = '') => {
        try {
            await axios.patch(`/api/requirements/${id}/status`, { status, remarks });
            setToastMsg({ text: `Document successfully ${status}!`, type: 'success' });
            
            // Close modal if it was a rejection
            setIsRejectModalOpen(false);
            setRejectRemarks('');
            setSelectedReqId(null);
            
            fetchRequirements(); // Refresh the list
        } catch (error) {
            setToastMsg({ text: 'Failed to update document status.', type: 'error' });
        } finally {
            setTimeout(() => setToastMsg(null), 3000);
        }
    };

    const openRejectModal = (id: number) => {
        setSelectedReqId(id);
        setIsRejectModalOpen(true);
    };

    return (
        <div className="space-y-6 fade-in font-sans relative pb-10">
            {/* GLOBAL TOAST */}
            {toastMsg && (
                <div className={`p-4 rounded-xl border font-bold text-sm flex items-center gap-2 shadow-sm ${toastMsg.type === 'success' ? 'bg-green-50 text-green-700 border-green-200' : 'bg-red-50 text-red-700 border-red-200'}`}>
                    <span>{toastMsg.text}</span>
                </div>
            )}

            <div className="bg-white p-6 rounded-2xl shadow-sm border border-gray-200 flex justify-between items-center">
                <div>
                    <h2 className="text-2xl font-extrabold text-gray-900 tracking-tight">Document Verification</h2>
                    <p className="text-sm font-medium text-gray-500 mt-1">Review and verify student WSPO requirements.</p>
                </div>
                <div className="bg-blue-50 text-blue-700 px-4 py-2 rounded-lg font-bold text-sm border border-blue-100">
                    {requirements.filter(r => r.status === 'pending').length} Pending Review
                </div>
            </div>

            <div className="bg-white rounded-2xl shadow-sm border border-gray-200 overflow-hidden">
                <div className="overflow-x-auto">
                    <table className="min-w-full divide-y divide-gray-200">
                        <thead className="bg-gray-50">
                            <tr>
                                <th className="px-6 py-4 text-left text-xs font-bold text-gray-500 uppercase">Student</th>
                                <th className="px-6 py-4 text-left text-xs font-bold text-gray-500 uppercase">Document</th>
                                <th className="px-6 py-4 text-left text-xs font-bold text-gray-500 uppercase">Status</th>
                                <th className="px-6 py-4 text-right text-xs font-bold text-gray-500 uppercase">Actions</th>
                            </tr>
                        </thead>
                        <tbody className="bg-white divide-y divide-gray-100">
                            {isLoading ? (
                                <tr><td colSpan={4} className="px-6 py-8 text-center text-gray-500">Loading documents...</td></tr>
                            ) : requirements.length === 0 ? (
                                <tr><td colSpan={4} className="px-6 py-8 text-center text-gray-500 font-medium">No documents uploaded yet.</td></tr>
                            ) : (
                                requirements.map((req) => (
                                    <tr key={req.id} className="hover:bg-gray-50 transition-colors">
                                        <td className="px-6 py-4">
                                            <div className="font-bold text-gray-900">{req.user?.name || 'Unknown User'}</div>
                                            <div className="text-xs text-gray-500 font-mono mt-0.5">
                                                {req.user?.profile?.student_id_number || 'No ID'} • {req.user?.profile?.assigned_office || 'Unassigned'}
                                            </div>
                                        </td>
                                        <td className="px-6 py-4">
                                            <div className="font-bold text-gray-900">{req.document_type}</div>
                                            <div className="text-xs font-medium text-gray-500 mt-0.5 mb-1">Uploaded: {new Date(req.created_at).toLocaleDateString()}</div>
                                            <button
                                                type="button"
                                                onClick={() => openSecureFile(req.file_path)}
                                                className="text-xs font-bold text-blue-600 hover:text-blue-800 underline"
                                            >
                                                View File
                                            </button>
                                        </td>
                                        <td className="px-6 py-4 whitespace-nowrap">
                                            <span className={`inline-flex items-center px-2.5 py-1 rounded-full text-xs font-bold uppercase tracking-wider border ${
                                                req.status === 'verified' ? 'bg-green-100 text-green-800 border-green-200' : 
                                                req.status === 'rejected' ? 'bg-red-100 text-red-800 border-red-200' : 
                                                'bg-yellow-100 text-yellow-800 border-yellow-200'
                                            }`}>
                                                {req.status}
                                            </span>
                                            {req.status === 'rejected' && req.remarks && (
                                                <div className="text-[10px] text-red-600 font-medium mt-1 max-w-[150px] truncate" title={req.remarks}>
                                                    Reason: {req.remarks}
                                                </div>
                                            )}
                                        </td>
                                        <td className="px-6 py-4 whitespace-nowrap text-right space-x-2">
                                            {req.status === 'pending' && (
                                                <>
                                                    <button onClick={() => handleUpdateStatus(req.id, 'verified')} className="px-3 py-1.5 bg-green-50 text-green-700 hover:bg-green-100 font-bold text-xs rounded border border-green-200 transition-colors">
                                                        Verify
                                                    </button>
                                                    <button onClick={() => openRejectModal(req.id)} className="px-3 py-1.5 bg-red-50 text-red-700 hover:bg-red-100 font-bold text-xs rounded border border-red-200 transition-colors">
                                                        Reject
                                                    </button>
                                                </>
                                            )}
                                            {req.status !== 'pending' && (
                                                <span className="text-xs font-bold text-gray-400">Reviewed</span>
                                            )}
                                        </td>
                                    </tr>
                                ))
                            )}
                        </tbody>
                    </table>
                </div>
            </div>

            {/* REJECT MODAL */}
            {isRejectModalOpen && (
                <div className="fixed inset-0 bg-gray-900/50 backdrop-blur-sm z-50 flex items-center justify-center p-4">
                    <div className="bg-white rounded-2xl shadow-xl w-full max-w-md p-6 slide-up">
                        <h3 className="text-lg font-bold text-gray-900 mb-2">Reject Document</h3>
                        <p className="text-sm text-gray-500 mb-4">Please provide a reason so the student knows what to fix.</p>
                        
                        <textarea 
                            value={rejectRemarks}
                            onChange={(e) => setRejectRemarks(e.target.value)}
                            placeholder="e.g., Image is too blurry, missing signature..."
                            className="w-full p-3 border border-gray-300 rounded-lg h-28 resize-none focus:ring-2 focus:ring-red-500 outline-none mb-4 text-sm font-medium"
                        />
                        
                        <div className="flex justify-end gap-3">
                            <button onClick={() => setIsRejectModalOpen(false)} className="px-4 py-2 text-sm font-bold text-gray-600 hover:bg-gray-100 rounded-lg">
                                Cancel
                            </button>
                            <button 
                                onClick={() => selectedReqId && handleUpdateStatus(selectedReqId, 'rejected', rejectRemarks)}
                                disabled={!rejectRemarks.trim()}
                                className="px-5 py-2 text-sm font-bold text-white bg-red-600 hover:bg-red-700 rounded-lg disabled:bg-red-300"
                            >
                                Confirm Rejection
                            </button>
                        </div>
                    </div>
                </div>
            )}
        </div>
    );
};

export default RequirementManagement;