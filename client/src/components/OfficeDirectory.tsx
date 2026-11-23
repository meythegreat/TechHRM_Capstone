import { useEffect, useMemo, useState } from 'react';
import axios from 'axios';
import { AnimatePresence, motion, type Variants } from 'framer-motion';
import Toast from './Toast';
import AuditPager, { pageSlice } from './AuditPager';
import { bindPopup } from '../utils/popupDismiss';
import {
    Building2,
    Pencil,
    Plus,
    Search,
    Trash2,
    X,
    MapPin,
    Users,
    UserCheck,
    Briefcase,
    Check,
} from 'lucide-react';

interface OfficeRecord {
    id: number;
    name: string;
    abbreviation?: string | null;
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
    const role = localStorage.getItem('user_role');
    const canEdit = role === 'Super Admin' || role === 'WSPO Staff';
    const canDelete = role === 'Super Admin';
    const [offices, setOffices] = useState<OfficeRecord[]>([]);
    const [isLoading, setIsLoading] = useState(true);
    const [searchQuery, setSearchQuery] = useState('');
    const [officePage, setOfficePage] = useState(1);
    const [newName, setNewName] = useState('');
    const [newAbbreviation, setNewAbbreviation] = useState('');
    const [editingId, setEditingId] = useState<number | null>(null);
    const [editingName, setEditingName] = useState('');
    const [editingAbbreviation, setEditingAbbreviation] = useState('');
    const [busyId, setBusyId] = useState<number | 'new' | null>(null);
    const [toast, setToast] = useState<{ text: string; type: 'success' | 'error' } | null>(null);
    const [breakdown, setBreakdown] = useState<{
        office: string;
        supervisors: { id: number; name: string; absent_today?: boolean }[];
        secretaries?: { id: number; name: string }[];
        students: {
            id: number;
            name: string;
            student_id_number?: string | null;
            course?: string | null;
            assignment_label?: string | null;
            special_hours_request?: boolean;
        }[];
        requests: {
            id: number;
            duty_type: string;
            quantity: number;
            status: string;
            requester?: string | null;
            duty_request?: string | null;
        }[];
    } | null>(null);
    const [breakdownLoading, setBreakdownLoading] = useState(false);

    const openBreakdown = async (office: OfficeRecord) => {
        setBreakdown({
            office: office.name,
            supervisors: [],
            secretaries: [],
            students: [],
            requests: [],
        });
        setBreakdownLoading(true);
        try {
            const response = await axios.get(`/api/offices/${office.id}/breakdown`);
            setBreakdown(response.data);
        } catch (error) {
            showToast(errorMessage(error, 'Could not load that office.'), 'error');
            setBreakdown(null);
        } finally {
            setBreakdownLoading(false);
        }
    };

    const showToast = (text: string, type: 'success' | 'error') => {
        setToast({ text, type });
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
        return offices.filter(
            (office) =>
                office.name.toLowerCase().includes(query) ||
                (office.abbreviation || '').toLowerCase().includes(query)
        );
    }, [offices, searchQuery]);

    const pagedOffices = pageSlice(visibleOffices, officePage);

    useEffect(() => {
        setOfficePage(1);
    }, [searchQuery]);

    const createOffice = async () => {
        const name = newName.trim();
        if (!name) return;
        setBusyId('new');
        try {
            await axios.post('/api/offices', {
                name,
                abbreviation: newAbbreviation.trim() || null,
            });
            setNewName('');
            setNewAbbreviation('');
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
        const abbreviation = editingAbbreviation.trim();
        if (!name) return;
        if (name === office.name && abbreviation === (office.abbreviation || '')) {
            setEditingId(null);
            return;
        }
        setBusyId(office.id);
        try {
            await axios.put(`/api/offices/${office.id}`, {
                name,
                abbreviation: abbreviation || null,
            });
            setEditingId(null);
            showToast(
                name === office.name
                    ? 'Office abbreviation updated.'
                    : 'Office updated. Student and supervisor assignments were updated automatically.',
                'success'
            );
            await loadOffices();
        } catch (error) {
            showToast(errorMessage(error, 'Could not update that office.'), 'error');
        } finally {
            setBusyId(null);
        }
    };

    const removeOffice = async (office: OfficeRecord) => {
        if (office.student_count > 0 || office.supervisor_count > 0) {
            showToast(
                'Please reassign the students and supervisors linked to this office before removing it.',
                'error'
            );
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

    const containerVariants: Variants = {
        hidden: { opacity: 0 },
        show: { opacity: 1, transition: { staggerChildren: 0.04 } },
    };

    const rowVariants: Variants = {
        hidden: { opacity: 0, y: 8 },
        show: {
            opacity: 1,
            y: 0,
            transition: { duration: 0.28, ease: [0.22, 1, 0.36, 1] },
        },
    };

    return (
        <div className="mx-auto max-w-7xl space-y-6 p-4 font-sans sm:p-8">
            {/* OBSIDIAN INFRASTRUCTURE HERO */}
            <motion.header
                initial={{ opacity: 0, y: -12 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ duration: 0.4, ease: [0.22, 1, 0.36, 1] }}
                className="relative overflow-hidden rounded-[2rem] border border-slate-800 bg-slate-950 p-6 text-white shadow-2xl shadow-slate-900/20 sm:p-8"
            >
                <div
                    className="pointer-events-none absolute inset-0 opacity-20"
                    style={{
                        backgroundImage:
                            'radial-gradient(rgba(148,163,184,0.4) 1px, transparent 1px)',
                        backgroundSize: '20px 20px',
                    }}
                    aria-hidden="true"
                />
                <div
                    className="pointer-events-none absolute -right-20 -top-20 h-72 w-72 rounded-full bg-indigo-600/25 blur-3xl"
                    aria-hidden="true"
                />
                <div
                    className="pointer-events-none absolute -bottom-24 left-1/4 h-64 w-64 rounded-full bg-blue-500/20 blur-3xl"
                    aria-hidden="true"
                />

                <div className="relative z-10 flex flex-col gap-6 lg:flex-row lg:items-end lg:justify-between">
                    <div className="min-w-0 max-w-2xl">
                        <span className="inline-flex items-center gap-1.5 rounded-full border border-indigo-400/25 bg-indigo-500/15 px-3 py-1 text-[11px] font-bold uppercase tracking-widest text-indigo-300">
                            <Building2 className="h-3.5 w-3.5 text-indigo-400" />
                            University Infrastructure
                        </span>
                        <h1 className="mt-3.5 text-3xl font-black tracking-tight text-white sm:text-4xl">
                            Office Directory
                        </h1>
                        <p className="mt-2 text-sm font-medium leading-relaxed text-slate-300">
                            {canEdit
                                ? 'Add or edit the official list of university offices and departments used for student placement.'
                                : 'View the official list of university offices used for student placement.'}
                        </p>
                    </div>

                    <div className="flex shrink-0 items-center gap-3.5 self-start rounded-2xl border border-white/10 bg-white/[0.06] px-5 py-4 backdrop-blur-xl lg:self-auto">
                        <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-indigo-500/20 text-indigo-300 ring-1 ring-indigo-400/30">
                            <MapPin className="h-5 w-5" />
                        </div>
                        <div>
                            <p className="text-[10px] font-extrabold uppercase tracking-widest text-slate-400">
                                Active Locations
                            </p>
                            <p className="mt-0.5 text-sm font-black text-white">
                                {offices.length} Registered Office{offices.length === 1 ? '' : 's'}
                            </p>
                        </div>
                    </div>
                </div>
            </motion.header>

            {/* ACTION BAR (SEARCH & ADD) */}
            <motion.div
                initial={{ opacity: 0, y: 10 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: 0.08 }}
                className="flex flex-col gap-4 lg:flex-row"
            >
                {/* Search Bar */}
                <div className="relative flex flex-1 items-center rounded-2xl border border-slate-200/90 bg-white p-2 shadow-sm">
                    <Search className="pointer-events-none absolute left-4 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
                    <input
                        type="text"
                        placeholder="Search offices by name or abbreviation…"
                        value={searchQuery}
                        onChange={(event) => setSearchQuery(event.target.value)}
                        className="w-full bg-transparent py-2.5 pl-10 pr-10 text-sm font-semibold text-slate-900 outline-none placeholder:font-medium placeholder:text-slate-400"
                    />
                    {searchQuery && (
                        <button
                            onClick={() => setSearchQuery('')}
                            className="absolute right-2.5 rounded-xl p-1.5 text-slate-400 transition hover:bg-slate-100 hover:text-slate-700"
                            aria-label="Clear search"
                        >
                            <X className="h-4 w-4" />
                        </button>
                    )}
                </div>

                {/* Add Office Form */}
                {canEdit && (
                    <form
                        onSubmit={(e) => {
                            e.preventDefault();
                            void createOffice();
                        }}
                        className="flex flex-col gap-2 rounded-2xl border border-slate-200/90 bg-white p-2 shadow-sm sm:flex-row sm:items-center lg:w-[600px]"
                    >
                        <input
                            value={newName}
                            onChange={(e) => setNewName(e.target.value)}
                            placeholder="New office or department name…"
                            className="w-full rounded-xl border border-slate-200 bg-slate-50 px-3.5 py-2.5 text-sm font-bold text-slate-900 outline-none transition placeholder:font-medium placeholder:text-slate-400 focus:border-indigo-500 focus:bg-white focus:ring-2 focus:ring-indigo-500/20"
                        />
                        <input
                            value={newAbbreviation}
                            onChange={(e) => setNewAbbreviation(e.target.value)}
                            placeholder="Abbrev. (opt.)"
                            maxLength={32}
                            className="w-full shrink-0 rounded-xl border border-slate-200 bg-slate-50 px-3.5 py-2.5 text-sm font-bold text-slate-900 outline-none transition placeholder:font-medium placeholder:text-slate-400 focus:border-indigo-500 focus:bg-white focus:ring-2 focus:ring-indigo-500/20 sm:w-36"
                        />
                        <button
                            type="submit"
                            disabled={busyId === 'new' || newName.trim() === ''}
                            className="inline-flex shrink-0 items-center justify-center gap-1.5 rounded-xl bg-slate-900 px-5 py-2.5 text-xs font-extrabold uppercase tracking-wider text-white shadow-sm transition hover:bg-indigo-600 disabled:opacity-45"
                        >
                            <Plus className="h-4 w-4" />
                            Add
                        </button>
                    </form>
                )}
            </motion.div>

            <Toast
                message={toast?.text ?? null}
                type={toast?.type}
                onClose={() => setToast(null)}
            />

            {/* MAIN DIRECTORY TABLE */}
            <section className="relative min-h-[400px] overflow-hidden rounded-[1.75rem] border border-slate-200/90 bg-white shadow-sm">
                {isLoading && (
                    <div className="absolute inset-0 z-10 flex items-center justify-center bg-white/70 backdrop-blur-[2px]">
                        <div className="flex flex-col items-center gap-3">
                            <div className="h-9 w-9 animate-spin rounded-full border-4 border-indigo-200 border-t-indigo-600" />
                            <span className="text-xs font-extrabold uppercase tracking-widest text-indigo-700">
                                Loading directory…
                            </span>
                        </div>
                    </div>
                )}

                <div className="custom-scrollbar overflow-x-auto">
                    <table className="app-data-table w-full border-collapse text-left">
                        <thead>
                            <tr className="bg-slate-950 text-white">
                                <th className="px-6 py-4 text-[11px] font-extrabold uppercase tracking-widest">
                                    Office / Department Name
                                </th>
                                <th className="w-40 px-6 py-4 text-[11px] font-extrabold uppercase tracking-widest">
                                    Abbreviation
                                </th>
                                <th className="w-32 px-6 py-4 text-[11px] font-extrabold uppercase tracking-widest">
                                    Students
                                </th>
                                <th className="w-32 px-6 py-4 text-[11px] font-extrabold uppercase tracking-widest">
                                    Supervisors
                                </th>
                                {canEdit && (
                                    <th className="w-40 px-6 py-4 text-right text-[11px] font-extrabold uppercase tracking-widest">
                                        Actions
                                    </th>
                                )}
                            </tr>
                        </thead>

                        <motion.tbody
                            variants={containerVariants}
                            initial="hidden"
                            animate={!isLoading ? 'show' : 'hidden'}
                            className="divide-y divide-slate-100"
                        >
                            {!isLoading && pagedOffices.rows.length === 0 ? (
                                <tr>
                                    <td
                                        colSpan={canEdit ? 5 : 4}
                                        className="px-6 py-16 text-center text-slate-400"
                                    >
                                        <div className="mx-auto mb-3 flex h-14 w-14 items-center justify-center rounded-2xl bg-slate-100 text-slate-400">
                                            <Building2 className="h-7 w-7" />
                                        </div>
                                        <p className="text-sm font-extrabold text-slate-700">
                                            No offices found
                                        </p>
                                        <p className="mt-1 text-xs font-medium text-slate-400">
                                            {searchQuery
                                                ? 'Try a different search term.'
                                                : 'Use the form above to add a new office.'}
                                        </p>
                                    </td>
                                </tr>
                            ) : (
                                pagedOffices.rows.map((office) => {
                                    const inUse =
                                        office.student_count > 0 || office.supervisor_count > 0;
                                    const isEditing = editingId === office.id;

                                    return (
                                        <motion.tr
                                            variants={rowVariants}
                                            key={office.id}
                                            onClick={() => {
                                                if (!isEditing) void openBreakdown(office);
                                            }}
                                            className="group cursor-pointer transition-colors hover:bg-slate-50/80"
                                        >
                                            <td className="px-6 py-4 align-middle">
                                                {isEditing ? (
                                                    <input
                                                        autoFocus
                                                        value={editingName}
                                                        onChange={(event) =>
                                                            setEditingName(event.target.value)
                                                        }
                                                        onKeyDown={(e) => {
                                                            if (e.key === 'Enter')
                                                                void saveOffice(office);
                                                        }}
                                                        placeholder="Office name"
                                                        className="w-full rounded-xl border border-indigo-300 bg-white px-3.5 py-2 text-sm font-bold text-slate-900 outline-none focus:ring-2 focus:ring-indigo-600/20"
                                                    />
                                                ) : (
                                                    <div className="flex items-center gap-3.5">
                                                        <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl border border-indigo-100 bg-indigo-50 text-sm font-black text-indigo-700">
                                                            {office.name.charAt(0)}
                                                        </div>
                                                        <p className="text-sm font-extrabold text-slate-900 transition-colors group-hover:text-indigo-700">
                                                            {office.name}
                                                        </p>
                                                    </div>
                                                )}
                                            </td>

                                            <td className="px-6 py-4 align-middle">
                                                {isEditing ? (
                                                    <input
                                                        value={editingAbbreviation}
                                                        onChange={(event) =>
                                                            setEditingAbbreviation(
                                                                event.target.value
                                                            )
                                                        }
                                                        onKeyDown={(e) => {
                                                            if (e.key === 'Enter')
                                                                void saveOffice(office);
                                                        }}
                                                        placeholder="Optional"
                                                        maxLength={32}
                                                        className="w-full rounded-xl border border-indigo-300 bg-white px-3.5 py-2 text-sm font-bold text-slate-900 outline-none focus:ring-2 focus:ring-indigo-600/20"
                                                    />
                                                ) : office.abbreviation ? (
                                                    <span className="rounded-lg border border-slate-200 bg-slate-50 px-2.5 py-1 font-mono text-xs font-bold text-slate-700">
                                                        {office.abbreviation}
                                                    </span>
                                                ) : (
                                                    <span className="text-xs font-medium text-slate-400">
                                                        —
                                                    </span>
                                                )}
                                            </td>

                                            <td className="px-6 py-4 align-middle">
                                                <span className="inline-flex items-center gap-1.5 rounded-lg border border-slate-200 bg-slate-50 px-2.5 py-1 font-mono text-xs font-extrabold text-slate-700">
                                                    <Users className="h-3.5 w-3.5 text-blue-500" />
                                                    {office.student_count}
                                                </span>
                                            </td>

                                            <td className="px-6 py-4 align-middle">
                                                <span className="inline-flex items-center gap-1.5 rounded-lg border border-slate-200 bg-slate-50 px-2.5 py-1 font-mono text-xs font-extrabold text-slate-700">
                                                    <UserCheck className="h-3.5 w-3.5 text-emerald-500" />
                                                    {office.supervisor_count}
                                                </span>
                                            </td>

                                            {canEdit && (
                                                <td
                                                    className="px-6 py-4 text-right align-middle"
                                                    onClick={(event) => event.stopPropagation()}
                                                >
                                                    <div className="inline-flex items-center justify-end gap-1.5">
                                                        {isEditing ? (
                                                            <>
                                                                <button
                                                                    type="button"
                                                                    disabled={busyId === office.id}
                                                                    onClick={() =>
                                                                        void saveOffice(office)
                                                                    }
                                                                    className="inline-flex items-center gap-1 rounded-xl bg-slate-900 px-3.5 py-2 text-xs font-bold text-white transition hover:bg-indigo-600 disabled:opacity-50"
                                                                >
                                                                    <Check className="h-3.5 w-3.5" />
                                                                    Save
                                                                </button>
                                                                <button
                                                                    type="button"
                                                                    onClick={() =>
                                                                        setEditingId(null)
                                                                    }
                                                                    className="rounded-xl bg-slate-100 px-3.5 py-2 text-xs font-bold text-slate-600 transition hover:bg-slate-200"
                                                                >
                                                                    Cancel
                                                                </button>
                                                            </>
                                                        ) : (
                                                            <>
                                                                <button
                                                                    type="button"
                                                                    onClick={() => {
                                                                        setEditingId(office.id);
                                                                        setEditingName(office.name);
                                                                        setEditingAbbreviation(
                                                                            office.abbreviation ||
                                                                                ''
                                                                        );
                                                                    }}
                                                                    className="rounded-xl p-2 text-slate-400 transition hover:bg-indigo-50 hover:text-indigo-600"
                                                                    aria-label="Edit office"
                                                                    title="Edit office"
                                                                >
                                                                    <Pencil className="h-4 w-4" />
                                                                </button>
                                                                {canDelete && (
                                                                    <button
                                                                        type="button"
                                                                        disabled={
                                                                            busyId === office.id ||
                                                                            inUse
                                                                        }
                                                                        onClick={() =>
                                                                            void removeOffice(
                                                                                office
                                                                            )
                                                                        }
                                                                        className="rounded-xl p-2 text-slate-400 transition hover:bg-rose-50 hover:text-rose-600 disabled:cursor-not-allowed disabled:opacity-35"
                                                                        aria-label="Remove office"
                                                                        title={
                                                                            inUse
                                                                                ? 'Cannot delete: Office is currently assigned to users.'
                                                                                : 'Remove office'
                                                                        }
                                                                    >
                                                                        <Trash2 className="h-4 w-4" />
                                                                    </button>
                                                                )}
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
                <AuditPager
                    page={pagedOffices.page}
                    totalPages={pagedOffices.totalPages}
                    total={pagedOffices.total}
                    onPage={setOfficePage}
                />
            </section>

            {/* OBSIDIAN OFFICE BREAKDOWN MODAL */}
            <AnimatePresence>
                {breakdown && (
                    <motion.div
                        initial={{ opacity: 0 }}
                        animate={{ opacity: 1 }}
                        exit={{ opacity: 0 }}
                        className="fixed inset-0 z-[80] flex items-center justify-center bg-slate-950/75 p-4 backdrop-blur-sm"
                        {...bindPopup(() => setBreakdown(null))}
                    >
                        <motion.div
                            initial={{ scale: 0.96, opacity: 0, y: 16 }}
                            animate={{ scale: 1, opacity: 1, y: 0 }}
                            exit={{ scale: 0.96, opacity: 0, y: 16 }}
                            className="flex max-h-[82vh] w-full max-w-2xl flex-col overflow-hidden rounded-[2rem] border border-slate-200 bg-white shadow-2xl"
                            onClick={(event) => event.stopPropagation()}
                        >
                            <div className="flex items-center justify-between gap-4 bg-slate-950 px-6 py-4 text-white">
                                <div className="flex items-center gap-3">
                                    <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-white/10 text-indigo-300">
                                        <Building2 className="h-4 w-4" />
                                    </span>
                                    <div>
                                        <p className="text-[10px] font-extrabold uppercase tracking-widest text-indigo-300">
                                            Office Breakdown
                                        </p>
                                        <h3 className="text-base font-black tracking-tight">
                                            {breakdown.office}
                                        </h3>
                                    </div>
                                </div>
                                <button
                                    type="button"
                                    onClick={() => setBreakdown(null)}
                                    className="rounded-xl border border-white/10 bg-white/5 p-2 text-slate-300 transition hover:bg-white/15 hover:text-white"
                                    aria-label="Close"
                                >
                                    <X className="h-4 w-4" />
                                </button>
                            </div>

                            <div className="custom-scrollbar space-y-6 overflow-y-auto p-6">
                                {breakdownLoading ? (
                                    <div className="flex justify-center py-12">
                                        <div className="h-8 w-8 animate-spin rounded-full border-4 border-indigo-200 border-t-indigo-600" />
                                    </div>
                                ) : (
                                    <>
                                        <section>
                                            <h4 className="mb-2 flex items-center gap-2 text-xs font-extrabold uppercase tracking-widest text-slate-400">
                                                <UserCheck className="h-4 w-4 text-indigo-500" />
                                                Assigned Supervisors ({breakdown.supervisors.length})
                                            </h4>
                                            {breakdown.supervisors.length === 0 ? (
                                                <p className="text-xs font-medium text-slate-500">
                                                    No supervisor assigned.
                                                </p>
                                            ) : (
                                                <ul className="divide-y divide-slate-100 rounded-2xl border border-slate-200/80">
                                                    {breakdown.supervisors.map((person) => (
                                                        <li
                                                            key={person.id}
                                                            className="flex items-center justify-between px-4 py-3 text-sm font-bold text-slate-800"
                                                        >
                                                            <span>{person.name}</span>
                                                            {person.absent_today && (
                                                                <span className="rounded-full border border-amber-200 bg-amber-50 px-2.5 py-0.5 text-[10px] font-extrabold uppercase tracking-wider text-amber-700">
                                                                    Absent today
                                                                </span>
                                                            )}
                                                        </li>
                                                    ))}
                                                </ul>
                                            )}
                                        </section>

                                        <section>
                                            <h4 className="mb-1 text-xs font-extrabold uppercase tracking-widest text-slate-400">
                                                Department Secretary
                                            </h4>
                                            <p className="mb-2.5 text-xs font-medium text-slate-500">
                                                Times students in with the same department access as the supervisor, including when the supervisor is busy.
                                            </p>
                                            {(breakdown.secretaries || []).length === 0 ? (
                                                <p className="text-xs font-medium text-slate-500">
                                                    No secretary assigned.
                                                </p>
                                            ) : (
                                                <ul className="divide-y divide-slate-100 rounded-2xl border border-slate-200/80">
                                                    {(breakdown.secretaries || []).map((person) => (
                                                        <li
                                                            key={person.id}
                                                            className="px-4 py-3 text-sm font-bold text-slate-800"
                                                        >
                                                            {person.name}
                                                        </li>
                                                    ))}
                                                </ul>
                                            )}
                                        </section>

                                        <section>
                                            <h4 className="mb-2 flex items-center gap-2 text-xs font-extrabold uppercase tracking-widest text-slate-400">
                                                <Users className="h-4 w-4 text-indigo-500" />
                                                Assigned Students ({breakdown.students.length})
                                            </h4>
                                            {breakdown.students.length === 0 ? (
                                                <p className="text-xs font-medium text-slate-500">
                                                    No students assigned.
                                                </p>
                                            ) : (
                                                <ul className="divide-y divide-slate-100 rounded-2xl border border-slate-200/80">
                                                    {breakdown.students.map((student) => (
                                                        <li
                                                            key={student.id}
                                                            className="flex items-center justify-between gap-3 px-4 py-3"
                                                        >
                                                            <span className="flex items-center gap-2 text-sm font-bold text-slate-800">
                                                                {student.name}
                                                                {student.special_hours_request && (
                                                                    <span className="rounded-md bg-violet-50 px-2 py-0.5 text-[10px] font-extrabold uppercase tracking-wider text-violet-700">
                                                                        100 hrs
                                                                    </span>
                                                                )}
                                                            </span>
                                                            <span className="font-mono text-xs font-semibold text-slate-500">
                                                                {student.assignment_label ||
                                                                    student.student_id_number ||
                                                                    student.course ||
                                                                    '—'}
                                                            </span>
                                                        </li>
                                                    ))}
                                                </ul>
                                            )}
                                        </section>

                                        <section>
                                            <h4 className="mb-2 flex items-center gap-2 text-xs font-extrabold uppercase tracking-widest text-slate-400">
                                                <Briefcase className="h-4 w-4 text-indigo-500" />
                                                Staffing Requests ({breakdown.requests.length})
                                            </h4>
                                            {breakdown.requests.length === 0 ? (
                                                <p className="text-xs font-medium text-slate-500">
                                                    No staffing requests for this office.
                                                </p>
                                            ) : (
                                                <ul className="divide-y divide-slate-100 rounded-2xl border border-slate-200/80">
                                                    {breakdown.requests.map((request) => (
                                                        <li key={request.id} className="px-4 py-3">
                                                            <p className="text-sm font-bold text-slate-800">
                                                                {request.quantity} {request.duty_type}{' '}
                                                                ·{' '}
                                                                <span className="text-indigo-700">
                                                                    {request.status}
                                                                </span>
                                                            </p>
                                                            <p className="mt-0.5 text-xs font-medium text-slate-500">
                                                                {request.requester ||
                                                                    'Unknown requester'}
                                                                {request.duty_request
                                                                    ? ` · ${request.duty_request}`
                                                                    : ''}
                                                            </p>
                                                        </li>
                                                    ))}
                                                </ul>
                                            )}
                                        </section>
                                    </>
                                )}
                            </div>
                        </motion.div>
                    </motion.div>
                )}
            </AnimatePresence>
        </div>
    );
};

export default OfficeDirectory;