import { useState, type FormEvent } from 'react';
import axios from 'axios';
import { motion, AnimatePresence, type Variants } from 'framer-motion';
import { 
    User, 
    BookOpen, 
    Send, 
    ArrowLeft, 
    CheckCircle2, 
    Mail,
    Phone,
    MapPin,
    FileText,
    Upload,
    Trash2,
    Loader2,
    ShieldCheck,
    Briefcase
} from 'lucide-react';
import ThemeToggle from './ThemeToggle';
import Toast from './Toast';
import ApplicationStatusTracker from './ApplicationStatusTracker';
import { bindPopup } from '../utils/popupDismiss';

interface PublicApplicationProps {
    onBackToLogin: () => void;
}

type ApplicationStatus = {
    loading: boolean;
    success: boolean;
    error: string;
};

const YEAR_LEVELS = ['1st Year', '2nd Year', '3rd Year', '4th Year'];
const GENDERS = ['Male', 'Female', 'Prefer not to say'];

const containerVariants: Variants = {
    hidden: { opacity: 0 },
    show: { opacity: 1, transition: { staggerChildren: 0.1 } }
};

const sectionVariants: Variants = {
    hidden: { opacity: 0, y: 20 },
    show: { opacity: 1, y: 0, transition: { type: 'spring', stiffness: 300, damping: 24 } }
};

// UPGRADED: Modern Floating Input with Icons
const FloatingInput = ({ id, type = 'text', label, icon: Icon, required = true, className = '', ...props }: any) => (
    <div className={`relative group ${className}`}>
        {Icon && (
            <div className="absolute inset-y-0 left-0 pl-4 flex items-center pointer-events-none z-10">
                <Icon className="h-5 w-5 text-slate-400 group-focus-within:text-indigo-600 transition-colors" />
            </div>
        )}
        <input
            id={id}
            type={type}
            required={required}
            className={`block ${Icon ? 'pl-12' : 'pl-4'} pr-4 pb-3 pt-6 w-full text-base font-bold text-slate-900 bg-slate-50/50 border border-slate-200 rounded-2xl appearance-none focus:outline-none focus:ring-4 focus:ring-indigo-600/10 focus:border-indigo-600 focus:bg-white peer transition-all shadow-sm`}
            placeholder=" "
            {...props}
        />
        <label
            htmlFor={id}
            className={`absolute text-base text-slate-500 duration-300 transform -translate-y-3 scale-75 top-4 z-10 origin-left ${Icon ? 'left-12' : 'left-4'} peer-placeholder-shown:scale-100 peer-placeholder-shown:translate-y-0 peer-focus:scale-75 peer-focus:-translate-y-3 peer-focus:text-indigo-600 font-medium cursor-text`}
        >
            {label}
        </label>
    </div>
);

// NEW: Modern Floating Select for Dropdowns
const FloatingSelect = ({ id, label, icon: Icon, required = true, options, value, onChange, className = '' }: any) => (
    <div className={`relative group ${className}`}>
        {Icon && (
            <div className="absolute inset-y-0 left-0 pl-4 flex items-center pointer-events-none z-20">
                <Icon className="h-5 w-5 text-slate-400 group-focus-within:text-indigo-600 transition-colors" />
            </div>
        )}
        <select
            id={id}
            required={required}
            value={value}
            onChange={onChange}
            className={`block ${Icon ? 'pl-12' : 'pl-4'} pr-10 pb-3 pt-6 w-full text-base font-bold text-slate-900 bg-slate-50/50 border border-slate-200 rounded-2xl appearance-none focus:outline-none focus:ring-4 focus:ring-indigo-600/10 focus:border-indigo-600 focus:bg-white peer transition-all shadow-sm cursor-pointer relative z-10`}
        >
            <option value="" disabled className="text-slate-400 font-medium">Select {label}</option>
            {options.map((opt: string) => (
                <option key={opt} value={opt} className="text-slate-900 font-bold">{opt}</option>
            ))}
        </select>
        <label
            htmlFor={id}
            className={`absolute text-base text-slate-500 duration-300 transform -translate-y-3 scale-75 top-4 z-20 origin-left ${Icon ? 'left-12' : 'left-4'} peer-focus:scale-75 peer-focus:-translate-y-3 peer-focus:text-indigo-600 font-medium pointer-events-none`}
        >
            {label}
        </label>
        <div className="absolute inset-y-0 right-0 pr-4 flex items-center pointer-events-none z-20">
            <svg className="w-5 h-5 text-slate-400 group-focus-within:text-indigo-600 transition-colors" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2.5" d="M19 9l-7 7-7-7"></path></svg>
        </div>
    </div>
);

const PublicApplication = ({ onBackToLogin }: PublicApplicationProps) => {
    const [formData, setFormData] = useState({
        first_name: '',
        middle_name: '',
        last_name: '',
        email: '',
        age: '',
        gender: '',
        address: '',
        contact_number: '',
        year_level: '',
    });
    const [documents, setDocuments] = useState<File[]>([]);
    
    const [status, setStatus] = useState<ApplicationStatus>({
        loading: false,
        success: false,
        error: '',
    });
    const [receipt, setReceipt] = useState<{ tracking_code?: string; tracker?: Record<string, unknown> } | null>(null);
    const [leavePrompt, setLeavePrompt] = useState(false);

    const hasDraft = !status.success && (
        documents.length > 0
        || Object.values(formData).some((value) => String(value).trim() !== '')
    );

    const requestLeave = () => {
        if (hasDraft) {
            setLeavePrompt(true);
            return;
        }
        onBackToLogin();
    };

    const addDocuments = (incoming: FileList | null) => {
        if (!incoming) return;
        const next = [...documents];
        Array.from(incoming).forEach((file) => {
            if (next.length >= 5) return;
            const duplicate = next.some((existing) => existing.name === file.name && existing.size === file.size);
            if (!duplicate) next.push(file);
        });
        setDocuments(next.slice(0, 5));
    };

    const removeDocument = (index: number) => {
        setDocuments((current) => current.filter((_, fileIndex) => fileIndex !== index));
    };

    const handleSubmit = async (e: FormEvent) => {
        e.preventDefault();
        if (documents.length < 3 || documents.length > 5) {
            setStatus({ loading: false, success: false, error: 'Please attach 3 to 5 supporting documents.' });
            return;
        }

        setStatus({ loading: true, success: false, error: '' });

        try {
            const payload = new FormData();
            payload.append('first_name', formData.first_name);
            payload.append('middle_name', formData.middle_name);
            payload.append('last_name', formData.last_name);
            payload.append('email', formData.email);
            payload.append('age', formData.age);
            payload.append('gender', formData.gender);
            payload.append('address', formData.address);
            payload.append('contact_number', formData.contact_number);
            payload.append('year_level', formData.year_level);
            documents.forEach((file) => payload.append('documents[]', file));

            const response = await axios.post('/api/apply', payload);
            setReceipt(response.data);
            setStatus({ loading: false, success: true, error: '' });
        } catch (err: any) {
            const statusCode = err.response?.status;
            const validationError = Object.values(err.response?.data?.errors || {}).flat()[0];
            const oversized = statusCode === 413 || err.message?.includes('413');
            setStatus({
                loading: false,
                success: false,
                error: oversized
                    ? 'The attached files are too large. Use PDF/JPG/PNG files under 4MB each, then submit again.'
                    : err.response?.data?.message || (typeof validationError === 'string' ? validationError : null) || 'Failed to submit application. Please try again.',
            });
        }
    };

    return (
        <div className="min-h-screen bg-slate-50 font-sans selection:bg-indigo-200 selection:text-indigo-900 relative overflow-x-hidden flex flex-col">
            
            {/* Minimal Top Nav */}
            <div className="bg-white/80 backdrop-blur-md border-b border-slate-200/80 shadow-sm relative z-40 shrink-0 sticky top-0">
                <div className="max-w-5xl mx-auto px-4 sm:px-6 py-4 flex items-center justify-between">
                    <div className="flex items-center gap-3">
                        <img src="/logo.jpg" alt="TechHRM Logo" className="w-10 h-10 rounded-xl border border-slate-100 shadow-sm" />
                        <span className="font-semibold bg-gradient-to-br from-slate-900 to-slate-700 bg-clip-text text-transparent text-xl tracking-tight hidden sm:block">TechHRM</span>
                    </div>
                    <div className="flex items-center gap-4">
                        <ThemeToggle />
                        <button 
                            type="button"
                            onClick={requestLeave}
                            className="flex items-center gap-2 px-4 py-2.5 text-sm font-bold text-slate-600 bg-slate-100 hover:bg-slate-200 rounded-xl transition-colors"
                        >
                            <ArrowLeft className="w-4 h-4" /> <span className="hidden sm:inline">Back to Sign In</span>
                        </button>
                    </div>
                </div>
            </div>

            <main className="flex-1 overflow-y-auto p-4 sm:p-8 relative z-10 custom-scrollbar">
                <div className="max-w-4xl mx-auto space-y-8">
                    
                    {/* SECURE GATEWAY HEADER */}
                    {!status.success && (
                        <motion.div 
                            initial={{ opacity: 0, y: -20 }}
                            animate={{ opacity: 1, y: 0 }}
                        >
                            <div className="mb-3 inline-flex items-center gap-2 text-sm font-medium text-slate-500">
                                <ShieldCheck className="h-4 w-4 text-emerald-600" />
                                Official enrollment
                            </div>
                            <h1 className="text-3xl font-semibold tracking-tight text-slate-900 sm:text-4xl">
                                Work-Study Application
                            </h1>
                            <p className="mt-2 max-w-xl text-sm leading-relaxed text-slate-500">
                                Join the Filamer Christian University Work-Study Program. Please complete the form below accurately to initiate your evaluation and placement process.
                            </p>
                        </motion.div>
                    )}

                    <AnimatePresence mode="wait">
                        {status.success ? (
                            /* SUCCESS SCREEN */
                            <motion.div
                                key="success"
                                initial={{ opacity: 0, scale: 0.95 }}
                                animate={{ opacity: 1, scale: 1 }}
                                className="space-y-6 max-w-2xl mx-auto mt-10"
                            >
                                <div className="bg-white p-8 sm:p-12 rounded-3xl shadow-2xl border border-emerald-100 text-center flex flex-col items-center relative overflow-hidden">
                                    <div className="absolute top-0 inset-x-0 h-2 bg-gradient-to-r from-emerald-400 to-emerald-600"></div>
                                    <div className="w-24 h-24 bg-emerald-50 text-emerald-600 rounded-full flex items-center justify-center mb-6 shadow-sm border-4 border-white relative z-10">
                                        <CheckCircle2 className="w-12 h-12" />
                                    </div>
                                    <h2 className="text-3xl font-semibold text-slate-900 tracking-tight mb-4">Application Submitted!</h2>
                                    <p className="text-slate-600 font-medium leading-relaxed max-w-md">
                                        Your application is now under review. Please keep your tracking code secure. You can check your placement status at any time from the homepage.
                                    </p>
                                    
                                    {receipt?.tracking_code && (
                                        <div className="mt-8 w-full max-w-sm rounded-2xl border border-indigo-100 bg-indigo-50/50 p-6 relative overflow-hidden group">
                                            <div className="absolute top-0 right-0 w-32 h-32 bg-indigo-500 rounded-full blur-3xl opacity-10"></div>
                                            <p className="text-[10px] font-semibold uppercase tracking-widest text-indigo-500 mb-2 relative z-10">Official Tracking Reference</p>
                                            <p className="font-mono text-3xl font-semibold text-indigo-700 tracking-wider relative z-10 select-all">{receipt.tracking_code}</p>
                                            <p className="mt-3 text-xs font-bold text-slate-500 relative z-10 flex items-center justify-center gap-1">
                                                <Mail className="w-3.5 h-3.5" /> Registered to: {formData.email}
                                            </p>
                                        </div>
                                    )}
                                    
                                    <div className="mt-8 pt-8 border-t border-slate-100 w-full">
                                        <button
                                            onClick={onBackToLogin}
                                            className="w-full sm:w-auto px-8 py-4 bg-slate-900 hover:bg-slate-800 text-white font-bold rounded-2xl shadow-xl shadow-slate-900/20 transition-all flex items-center justify-center gap-2"
                                        >
                                            <ArrowLeft className="w-5 h-5" /> Return to Secure Portal
                                        </button>
                                    </div>
                                </div>

                                {receipt?.tracker && (
                                    <div className="mt-8">
                                        <ApplicationStatusTracker application={receipt.tracker} />
                                    </div>
                                )}
                            </motion.div>
                        ) : (
                            /* APPLICATION FORM */
                            <motion.form 
                                key="form"
                                variants={containerVariants} 
                                initial="hidden" 
                                animate="show"
                                onSubmit={handleSubmit} 
                                className="space-y-6"
                            >
                                <Toast
                                    message={status.error || null}
                                    type="error"
                                    onClose={() => setStatus((prev) => ({ ...prev, error: '' }))}
                                />

                                {/* SECTION 1: Personal Information */}
                                <motion.section variants={sectionVariants} className="bg-white rounded-2xl border border-slate-200/80 p-6 shadow-[0_1px_2px_rgba(15,23,42,0.04)] sm:p-10">
                                    <div className="flex items-center gap-3 mb-8 border-b border-slate-100 pb-4">
                                        <div className="p-2.5 bg-indigo-50 rounded-xl">
                                            <User className="w-5 h-5 text-indigo-600" />
                                        </div>
                                        <h2 className="text-xl font-semibold text-slate-900 tracking-tight">Personal Information</h2>
                                    </div>
                                    <div className="grid grid-cols-1 md:grid-cols-3 gap-5 sm:gap-6">
                                        <FloatingInput id="first_name" label="First Name" value={formData.first_name} onChange={(e: any) => setFormData({ ...formData, first_name: e.target.value })} />
                                        <FloatingInput id="middle_name" label="Middle Name" required={false} value={formData.middle_name} onChange={(e: any) => setFormData({ ...formData, middle_name: e.target.value })} />
                                        <FloatingInput id="last_name" label="Last Name" value={formData.last_name} onChange={(e: any) => setFormData({ ...formData, last_name: e.target.value })} />
                                    </div>
                                    <div className="grid grid-cols-1 md:grid-cols-2 gap-5 sm:gap-6 mt-5 sm:mt-6">
                                        <FloatingInput id="email" type="email" label="Email Address" icon={Mail} value={formData.email} onChange={(e: any) => setFormData({ ...formData, email: e.target.value })} />
                                        <FloatingInput id="contact_number" type="tel" label="Contact Number" icon={Phone} value={formData.contact_number} onChange={(e: any) => setFormData({ ...formData, contact_number: e.target.value })} />
                                    </div>
                                    <div className="grid grid-cols-1 md:grid-cols-4 gap-5 sm:gap-6 mt-5 sm:mt-6">
                                        <div className="md:col-span-1">
                                            <FloatingInput id="age" type="number" label="Age" value={formData.age} onChange={(e: any) => setFormData({ ...formData, age: e.target.value })} />
                                        </div>
                                        <div className="md:col-span-1">
                                            <FloatingSelect 
                                                id="gender" 
                                                label="Gender" 
                                                options={GENDERS} 
                                                value={formData.gender} 
                                                onChange={(e: any) => setFormData({ ...formData, gender: e.target.value })} 
                                            />
                                        </div>
                                        <div className="md:col-span-2">
                                            <FloatingInput id="address" label="Complete Permanent Address" icon={MapPin} value={formData.address} onChange={(e: any) => setFormData({ ...formData, address: e.target.value })} />
                                        </div>
                                    </div>
                                </motion.section>

                                {/* SECTION 2: Academic Details */}
                                <motion.section variants={sectionVariants} className="bg-white rounded-2xl border border-slate-200/80 p-6 shadow-[0_1px_2px_rgba(15,23,42,0.04)] sm:p-10">
                                    <div className="flex items-center gap-3 mb-8 border-b border-slate-100 pb-4">
                                        <div className="p-2.5 bg-indigo-50 rounded-xl">
                                            <BookOpen className="w-5 h-5 text-indigo-600" />
                                        </div>
                                        <h2 className="text-xl font-semibold text-slate-900 tracking-tight">Academic Details</h2>
                                    </div>
                                    <div className="max-w-sm">
                                        <FloatingSelect 
                                            id="year_level" 
                                            label="Current Year Level" 
                                            icon={Briefcase}
                                            options={YEAR_LEVELS} 
                                            value={formData.year_level} 
                                            onChange={(e: any) => setFormData({ ...formData, year_level: e.target.value })} 
                                        />
                                    </div>
                                </motion.section>

                                {/* SECTION 3: Supporting Documents */}
                                <motion.section variants={sectionVariants} className="bg-white rounded-2xl border border-slate-200/80 p-6 shadow-[0_1px_2px_rgba(15,23,42,0.04)] sm:p-10">
                                    <div className="flex items-center gap-3 mb-6 border-b border-slate-100 pb-4">
                                        <div className="p-2.5 bg-indigo-50 rounded-xl">
                                            <FileText className="w-5 h-5 text-indigo-600" />
                                        </div>
                                        <h2 className="text-xl font-semibold text-slate-900 tracking-tight">Supporting Documents</h2>
                                    </div>
                                    
                                    <div className="bg-indigo-50/50 border border-indigo-100 p-4 rounded-2xl mb-6">
                                        <p className="text-sm font-medium text-indigo-900">
                                            Please attach <span className="font-bold">3 to 5</span> valid supporting documents (PDF, JPG, or PNG, max 4MB each). Required examples include Certificate of Enrollment, PSA Birth Certificate, Certificate of Indigency, or latest academic grades.
                                        </p>
                                    </div>

                                    <label className="flex flex-col items-center justify-center gap-3 w-full p-8 border-2 border-dashed border-indigo-200 rounded-3xl bg-slate-50 hover:border-indigo-400 hover:bg-indigo-50/30 cursor-pointer transition-all group">
                                        <div className="w-14 h-14 bg-white rounded-full shadow-sm flex items-center justify-center group-hover:scale-110 transition-transform duration-300">
                                            <Upload className="w-6 h-6 text-indigo-600" />
                                        </div>
                                        <div className="text-center">
                                            <span className="text-base font-bold text-slate-800 block">Click to upload documents</span>
                                            <span className="text-xs font-bold uppercase tracking-widest text-slate-400 mt-1 block">
                                                {documents.length} of 5 selected • Minimum 3 required
                                            </span>
                                        </div>
                                        <input
                                            type="file"
                                            accept=".pdf,.jpg,.jpeg,.png,application/pdf,image/jpeg,image/png"
                                            multiple
                                            className="hidden"
                                            onChange={(e) => {
                                                addDocuments(e.target.files);
                                                e.target.value = '';
                                            }}
                                        />
                                    </label>

                                    {documents.length > 0 && (
                                        <ul className="mt-6 grid grid-cols-1 sm:grid-cols-2 gap-3">
                                            {documents.map((file, index) => (
                                                <li key={`${file.name}-${index}`} className="flex items-center justify-between gap-3 px-4 py-3.5 rounded-2xl border border-slate-200 bg-white shadow-sm hover:border-indigo-300 transition-colors">
                                                    <div className="min-w-0 flex items-center gap-3">
                                                        <FileText className="w-5 h-5 text-indigo-500 shrink-0" />
                                                        <div>
                                                            <p className="text-sm font-bold text-slate-800 truncate pr-4">{file.name}</p>
                                                            <p className="text-[11px] font-bold text-slate-400 uppercase tracking-widest mt-0.5">{(file.size / 1024).toFixed(0)} KB</p>
                                                        </div>
                                                    </div>
                                                    <button type="button" onClick={() => removeDocument(index)} className="p-2.5 text-slate-400 hover:text-red-600 hover:bg-red-50 rounded-xl transition-colors shrink-0" title="Remove document">
                                                        <Trash2 className="w-4 h-4" />
                                                    </button>
                                                </li>
                                            ))}
                                        </ul>
                                    )}
                                </motion.section>

                                {/* Submit Actions */}
                                <motion.div variants={sectionVariants} className="pt-4 pb-12">
                                    <button
                                        type="submit"
                                        disabled={status.loading || documents.length < 3}
                                        className="w-full py-4.5 bg-gradient-to-r from-indigo-600 to-blue-600 hover:from-indigo-700 hover:to-blue-700 text-white font-semibold rounded-2xl shadow-xl shadow-indigo-600/20 transition-all disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-3 text-lg group hover:-translate-y-0.5"
                                    >
                                        {status.loading ? (
                                            <>
                                                <Loader2 className="w-6 h-6 animate-spin" /> Processing Secure Application...
                                            </>
                                        ) : (
                                            <>
                                                Transmit Application <Send className="w-5 h-5 transition-transform group-hover:translate-x-1" />
                                            </>
                                        )}
                                    </button>
                                </motion.div>
                            </motion.form>
                        )}
                    </AnimatePresence>
                </div>
            </main>

            <AnimatePresence>
                {leavePrompt && (
                    <motion.div
                        initial={{ opacity: 0 }}
                        animate={{ opacity: 1 }}
                        exit={{ opacity: 0 }}
                        className="fixed inset-0 bg-slate-900/50 backdrop-blur-sm z-[80] flex items-center justify-center p-4"
                        {...bindPopup(() => setLeavePrompt(false))}
                    >
                        <motion.div
                            initial={{ scale: 0.95, opacity: 0, y: 16 }}
                            animate={{ scale: 1, opacity: 1, y: 0 }}
                            exit={{ scale: 0.95, opacity: 0, y: 16 }}
                            className="bg-white rounded-3xl shadow-2xl w-full max-w-md overflow-hidden"
                            role="dialog"
                            aria-modal="true"
                            aria-labelledby="leave-signup-title"
                        >
                            <div className="p-6 sm:p-8 border-b border-slate-100 bg-slate-50">
                                <h3 id="leave-signup-title" className="text-xl font-semibold text-slate-900">Leave this signup?</h3>
                            </div>
                            <div className="p-6 sm:p-8 space-y-6">
                                <p className="text-sm font-medium text-slate-600 leading-relaxed">
                                    You already entered information on this application. Discard it and return to sign in, or continue filling it out.
                                </p>
                                <div className="flex flex-col-reverse sm:flex-row sm:justify-end gap-3">
                                    <button
                                        type="button"
                                        onClick={() => setLeavePrompt(false)}
                                        className="px-5 py-2.5 text-sm font-bold text-slate-700 bg-slate-100 hover:bg-slate-200 rounded-xl transition-colors"
                                    >
                                        Continue signup
                                    </button>
                                    <button
                                        type="button"
                                        onClick={onBackToLogin}
                                        className="px-5 py-2.5 text-sm font-bold text-white bg-red-600 hover:bg-red-700 rounded-xl shadow-lg shadow-red-600/20 transition-colors"
                                    >
                                        Discard signup
                                    </button>
                                </div>
                            </div>
                        </motion.div>
                    </motion.div>
                )}
            </AnimatePresence>
        </div>
    );
};

export default PublicApplication;