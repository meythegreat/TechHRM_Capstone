import { useEffect, useMemo, useState } from 'react';
import axios from 'axios';
import { motion, AnimatePresence, type Variants } from 'framer-motion';
import { 
    Building2, 
    CheckCircle2, 
    AlertCircle, 
    Pencil, 
    Plus, 
    Search, 
    Trash2, 
    X,
    ShieldCheck,
    MapPin,
    Users,
    UserCheck
} from 'lucide-react';

interface OfficeRecord {
    id: number;
    name: string;
    student_count: number;
    supervisor_count: number;
}

const errorMessage = (error: unknown, fallback: string) => {
    if (!axios.isAxiosError(error)) return fallback;
    const data = error.response?.data;
    if (typeof data?.message === 'string' && data.message !== '') return data.message;
    const first = data?.errors && Object.values(data.errors)[0];
    if (Array.isArray(first) && typeof first[0] === 'string') return first[0];
    return fallback;
};

const OfficeDirectory = () => {
    const canEdit = localStorage.getItem('user_role') === 'Super Admin';
    const [offices, setOffices] = useState<OfficeRecord[]>([]);
    const [isLoading, setIsLoading] = useState(true);
    const [searchQuery, setSearchQuery] = useState('');
    const [newName, setNewName] = useState('');
    const [editingId, setEditingId] = useState<number | null>(null);
    const [editingName, setEditingName] = useState('');
    const [busyId, setBusyId] = useState<number | 'new' | null>(null);
    const [toast, setToast] = useState<{ text: string; type: 'success' | 'error' } | null>(null);

    const showToast = (text: string, type: 'success' | 'error') => {
        setToast({ text, type });
        window.setTimeout(() => setToast(null), 3200);
    };

    const loadOffices = async () => {
        setIsLoading(true);
        try {
            const response = await axios.get('/api/offices');
            setOffices(Array.isArray(response.data) ? response.data : []);
        } catch (error) {
            showToast(errorMessage(error, 'Could not load offices.'), 'error');
        } finally {
            setIsLoading(false);
        }
    };

    useEffect(() => {
        void loadOffices();
    }, []);

    const visibleOffices = useMemo(() => {
        const query = searchQuery.trim().toLowerCase();
        if (!query) return offices;
        return offices.filter((office) => office.name.toLowerCase().includes(query));
    }, [offices, searchQuery]);

    const createOffice = async () => {
        const name = newName.trim();
        if (!name) return;
        setBusyId('new');
        try {
            await axios.post('/api/offices', { name });
            setNewName('');
            showToast('Office successfully added.', 'success');
            await loadOffices();
        } catch (error) {
            showToast(errorMessage(error, 'Could not add that office.'), 'error');
        } finally {
            setBusyId(null);
        }
    };

    const saveOffice = async (office: OfficeRecord) => {
        const name = editingName.trim();
        if (!name || name === office.name) {
            setEditingId(null);
            return;
        }
        setBusyId(office.id);
        try {
            await axios.put(`/api/offices/${office.id}`, { name });
            setEditingId(null);
            showToast('Office updated. Student and supervisor assignments were updated automatically.', 'success');
            await loadOffices();
        } catch (error) {
            showToast(errorMessage(error, 'Could not update that office.'), 'error');
        } finally {
            setBusyId(null);
        }
    };

    const removeOffice = async (office: OfficeRecord) => {
        if (office.student_count > 0 || office.supervisor_count > 0) {
            showToast('Please reassign the students and supervisors linked to this office before removing it.', 'error');
            return;
        }
        if (!window.confirm(`Are you sure you want to permanently remove ${office.name}?`)) return;
        setBusyId(office.id);
        try {
            await axios.delete(`/api/offices/${office.id}`);
            showToast('Office permanently removed.', 'success');
            await loadOffices();
        } catch (error) {
            showToast(errorMessage(error, 'Could not remove that office.'), 'error');
        } finally {
            setBusyId(null);
        }
    };

    // STRICT TYPESCRIPT VARIANTS
    const containerVariants: Variants = {
        hidden: { opacity: 0 },
        show: { opacity: 1, transition: { staggerChildren: 0.05 } }
    };

    const rowVariants: Variants = {
        hidden: { opacity: 0, y: 10 },
        show: { opacity: 1, y: 0, transition: { type: 'spring', stiffness: 300, damping: 24 } }
    };

    return (
        <div className="max-w-7xl mx-auto space-y-6 font-sans p-4 sm:p-8">
            
            {/* DARK THEME HEADER - INFRASTRUCTURE COMMAND CENTER */}
            <motion.div 
                initial={{ opacity: 0, y: -20 }}
                animate={{ opacity: 1, y: 0 }}
                className="flex flex-col md:flex-row md:items-end justify-between gap-6 bg-slate-900 p-6 sm:p-8 rounded-3xl shadow-xl overflow-hidden relative"
            >
                {/* Glowing Orbs */}
                <div className="absolute top-0 right-0 -mt-16 -mr-16 w-64 h-64 bg-indigo-500 rounded-full mix-blend-multiply filter blur-3xl opacity-20 animate-pulse"></div>
                <div className="absolute bottom-0 left-10 -mb-16 -ml-16 w-64 h-64 bg-blue-500 rounded-full mix-blend-multiply filter blur-3xl opacity-10"></div>

                <div className="relative z-10">
                    <div className="flex items-center gap-2 mb-2">
                        <Building2 className="w-5 h-5 text-indigo-400" />
                        <span className="text-xs font-bold text-indigo-400 uppercase tracking-widest">University Infrastructure</span>
                    </div>
                    <h1 className="text-3xl sm:text-4xl font-black text-white tracking-tight">
                        Office Directory
                    </h1>
                    <p className="mt-2 text-slate-400 font-medium max-w-md">
                        {canEdit 
                            ? 'Manage the official list of university offices and departments used for student placement.'
                            : 'View the official list of university offices used for student placement. Only Super Admins can modify this directory.'}
                    </p>
                </div>

                <div className="relative z-10 bg-black/40 backdrop-blur-md border border-white/10 px-6 py-4 rounded-2xl flex items-center gap-4">
                    <div className="w-10 h-10 rounded-full bg-indigo-500/20 flex items-center justify-center text-indigo-400 shadow-[0_0_15px_rgba(99,102,241,0.3)]">
                        <MapPin className="w-5 h-5" />
                    </div>
                    <div className="flex flex-col text-left">
                        <span className="text-[10px] font-bold text-slate-400 uppercase tracking-widest">Active Locations</span>
                        <span className="text-sm font-extrabold text-indigo-400">
                            {offices.length} Registered Office{offices.length === 1 ? '' : 's'}
                        </span>
                    </div>
                </div>
            </motion.div>

            {/* ACTION BAR (SEARCH & ADD) */}
            <motion.div 
                initial={{ opacity: 0, y: 10 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: 0.2 }}
                className="flex flex-col md:flex-row gap-4"
            >
                {/* Search Bar */}
                <div className="bg-white p-2 rounded-2xl shadow-sm border border-slate-200 flex items-center relative flex-1">
                    <Search className="absolute left-4 top-1/2 -translate-y-1/2 w-5 h-5 text-slate-400" />
                    <input 
                        type="text" 
                        placeholder="Search offices by name..."
                        value={searchQuery}
                        onChange={(event) => setSearchQuery(event.target.value)}
                        className="w-full pl-12 pr-4 py-2.5 bg-transparent font-medium text-slate-900 outline-none placeholder:text-slate-400"
                    />
                    {searchQuery && (
                        <button onClick={() => setSearchQuery('')} className="p-2 mr-2 text-slate-400 hover:text-slate-600 hover:bg-slate-100 rounded-lg transition-colors">
                            <X className="w-4 h-4" />
                        </button>
                    )}
                </div>

                {/* Add Office Form (Super Admin Only) */}
                {canEdit && (
                    <form 
                        onSubmit={(e) => { e.preventDefault(); void createOffice(); }}
                        className="bg-white p-2 rounded-2xl shadow-sm border border-slate-200 flex items-center gap-2 md:w-[450px]"
                    >
                        <input
                            value={newName}
                            onChange={(e) => setNewName(e.target.value)}
                            placeholder="Add new office name..."
                            className="w-full px-4 py-2.5 bg-slate-50 border border-slate-100 rounded-xl font-bold text-slate-900 outline-none focus:bg-white focus:border-indigo-300 transition-all placeholder:text-slate-400 placeholder:font-medium"
                        />
                        <button
                            type="submit"
                            disabled={busyId === 'new' || newName.trim() === ''}
                            className="px-5 py-2.5 bg-indigo-600 hover:bg-indigo-500 text-white font-bold rounded-xl shadow-md shadow-indigo-600/20 disabled:opacity-50 transition-all flex items-center gap-2 shrink-0"
                        >
                            <Plus className="w-4 h-4" /> Add
                        </button>
                    </form>
                )}
            </motion.div>

            {/* ANIMATED TOASTS */}
            <AnimatePresence>
                {toast && (
                    <motion.div 
                        initial={{ opacity: 0, y: -20 }}
                        animate={{ opacity: 1, y: 0 }}
                        exit={{ opacity: 0, y: -20 }}
                        className={`p-4 rounded-xl border flex items-center gap-3 shadow-sm ${
                            toast.type === 'success' ? 'bg-emerald-50 border-emerald-100' : 'bg-red-50 border-red-100'
                        }`}
                    >
                        {toast.type === 'success' 
                            ? <CheckCircle2 className="w-5 h-5 text-emerald-600 shrink-0" />
                            : <AlertCircle className="w-5 h-5 text-red-600 shrink-0" />
                        }
                        <span className={`text-sm font-bold ${toast.type === 'success' ? 'text-emerald-800' : 'text-red-800'}`}>
                            {toast.text}
                        </span>
                    </motion.div>
                )}
            </AnimatePresence>

            {/* MAIN DATA TABLE */}
            <div className="bg-white rounded-3xl shadow-sm border border-slate-200 overflow-hidden relative min-h-[400px]">
                
                {isLoading && (
                    <div className="absolute inset-0 bg-white/60 backdrop-blur-[2px] z-10 flex items-center justify-center">
                        <div className="flex flex-col items-center gap-3">
                            <div className="w-10 h-10 border-4 border-indigo-200 border-t-indigo-600 rounded-full animate-spin"></div>
                            <span className="text-sm font-bold text-indigo-700 animate-pulse">Loading directory...</span>
                        </div>
                    </div>
                )}

                <div className="overflow-x-auto custom-scrollbar">
                    <table className="w-full text-left border-collapse">
                        <thead>
                            <tr className="bg-slate-50/80 border-b border-slate-200">
                                <th className="px-6 py-4 text-xs font-extrabold text-slate-500 uppercase tracking-wider">Office / Department Name</th>
                                <th className="px-6 py-4 text-xs font-extrabold text-slate-500 uppercase tracking-wider w-32">Students</th>
                                <th className="px-6 py-4 text-xs font-extrabold text-slate-500 uppercase tracking-wider w-32">Supervisors</th>
                                {canEdit && <th className="px-6 py-4 text-xs font-extrabold text-slate-500 uppercase tracking-wider text-right w-40">Actions</th>}
                            </tr>
                        </thead>
                        <motion.tbody 
                            variants={containerVariants}
                            initial="hidden"
                            animate={!isLoading ? "show" : "hidden"}
                            className="divide-y divide-slate-100"
                        >
                            {!isLoading && visibleOffices.length === 0 ? (
                                <tr>
                                    <td colSpan={canEdit ? 4 : 3} className="px-6 py-16 text-center text-slate-400">
                                        <Building2 className="w-12 h-12 mx-auto mb-3 opacity-20" />
                                        <p className="text-base font-semibold text-slate-600">No offices found</p>
                                        <p className="text-sm font-medium">{searchQuery ? 'Try a different search term.' : 'Use the form above to add a new office.'}</p>
                                    </td>
                                </tr>
                            ) : (
                                visibleOffices.map((office) => {
                                    const inUse = office.student_count > 0 || office.supervisor_count > 0;
                                    const isEditing = editingId === office.id;
                                    
                                    return (
                                        <motion.tr variants={rowVariants} key={office.id} className="hover:bg-slate-50 transition-colors group">
                                            <td className="px-6 py-5 align-top">
                                                {isEditing ? (
                                                    <input
                                                        autoFocus
                                                        value={editingName}
                                                        onChange={(event) => setEditingName(event.target.value)}
                                                        onKeyDown={(e) => { if(e.key === 'Enter') void saveOffice(office); }}
                                                        className="w-full rounded-xl border border-slate-200 bg-white px-4 py-2 font-bold text-slate-900 outline-none focus:ring-2 focus:ring-indigo-600 transition-all shadow-sm"
                                                    />
                                                ) : (
                                                    <div className="flex items-center gap-3">
                                                        <div className="w-10 h-10 rounded-xl bg-indigo-50 text-indigo-700 flex items-center justify-center font-black shrink-0 border border-indigo-100 shadow-inner">
                                                            {office.name.charAt(0)}
                                                        </div>
                                                        <p className="font-bold text-slate-900 group-hover:text-indigo-700 transition-colors">
                                                            {office.name}
                                                        </p>
                                                    </div>
                                                )}
                                            </td>

                                            <td className="px-6 py-5 align-middle">
                                                <div className="inline-flex items-center gap-1.5 px-3 py-1.5 bg-slate-100 text-slate-700 rounded-lg text-xs font-black border border-slate-200 shadow-sm">
                                                    <Users className="w-3.5 h-3.5 text-slate-500" />
                                                    {office.student_count}
                                                </div>
                                            </td>

                                            <td className="px-6 py-5 align-middle">
                                                <div className="inline-flex items-center gap-1.5 px-3 py-1.5 bg-slate-100 text-slate-700 rounded-lg text-xs font-black border border-slate-200 shadow-sm">
                                                    <UserCheck className="w-3.5 h-3.5 text-slate-500" />
                                                    {office.supervisor_count}
                                                </div>
                                            </td>

                                            {canEdit && (
                                                <td className="px-6 py-5 align-middle text-right">
                                                    <div className="flex items-center justify-end gap-2">
                                                        {isEditing ? (
                                                            <>
                                                                <button
                                                                    type="button"
                                                                    disabled={busyId === office.id}
                                                                    onClick={() => void saveOffice(office)}
                                                                    className="px-4 py-2 bg-indigo-600 hover:bg-indigo-700 text-white rounded-xl text-xs font-bold transition-colors shadow-sm disabled:opacity-50"
                                                                >
                                                                    Save
                                                                </button>
                                                                <button 
                                                                    type="button" 
                                                                    onClick={() => setEditingId(null)} 
                                                                    className="px-4 py-2 bg-slate-100 hover:bg-slate-200 text-slate-600 rounded-xl text-xs font-bold transition-colors"
                                                                >
                                                                    Cancel
                                                                </button>
                                                            </>
                                                        ) : (
                                                            <>
                                                                <button
                                                                    type="button"
                                                                    onClick={() => { setEditingId(office.id); setEditingName(office.name); }}
                                                                    className="p-2 text-slate-400 hover:text-indigo-600 hover:bg-indigo-50 rounded-lg transition-colors"
                                                                    title="Rename office"
                                                                >
                                                                    <Pencil className="w-5 h-5" />
                                                                </button>
                                                                <button
                                                                    type="button"
                                                                    disabled={busyId === office.id || inUse}
                                                                    onClick={() => void removeOffice(office)}
                                                                    className="p-2 text-slate-400 hover:text-red-600 hover:bg-red-50 rounded-lg transition-colors disabled:cursor-not-allowed disabled:opacity-40"
                                                                    title={inUse ? 'Cannot delete: Office is currently assigned to users.' : 'Remove office'}
                                                                >
                                                                    <Trash2 className="w-5 h-5" />
                                                                </button>
                                                            </>
                                                        )}
                                                    </div>
                                                </td>
                                            )}
                                        </motion.tr>
                                    );
                                })
                            )}
                        </motion.tbody>
                    </table>
                </div>
            </div>
        </div>
    );
};

export default OfficeDirectory;