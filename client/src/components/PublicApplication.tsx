import { useState, type FormEvent } from 'react';
import axios from 'axios';
import { motion, AnimatePresence, type Variants } from 'framer-motion';
import { 
    User, 
    BookOpen, 
    Send, 
    ArrowLeft, 
    CheckCircle2, 
    AlertCircle,
    Mail,
    Phone,
    MapPin,
    FileText,
    Upload,
    Trash2,
    Loader2
} from 'lucide-react';

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

const FloatingInput = ({ id, type = 'text', label, icon: Icon, required = true, ...props }: any) => (
    <div className="relative group">
        <input
            id={id}
            type={type}
            required={required}
            className="block px-4 pb-3 pt-6 w-full text-sm text-slate-900 bg-slate-50 border border-slate-200 rounded-xl appearance-none focus:outline-none focus:ring-2 focus:ring-blue-600 focus:border-transparent focus:bg-white peer transition-all shadow-sm"
            placeholder=" "
            {...props}
        />
        <label
            htmlFor={id}
            className="absolute text-sm text-slate-500 duration-300 transform -translate-y-3 scale-75 top-4 z-10 origin-[0] left-4 peer-placeholder-shown:scale-100 peer-placeholder-shown:translate-y-0 peer-focus:scale-75 peer-focus:-translate-y-3 peer-focus:text-blue-600 font-medium flex items-center gap-1.5 cursor-text"
        >
            {Icon && <Icon className="w-4 h-4" />}
            {label}
        </label>
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

            await axios.post('/api/apply', payload);
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
            // Auto-hide error after 5 seconds
            setTimeout(() => setStatus(prev => ({ ...prev, error: '' })), 5000);
        }
    };

    return (
        <div className="min-h-screen bg-slate-50 font-sans selection:bg-blue-200 selection:text-blue-900 relative overflow-hidden flex flex-col">
            
            {/* Background Decorations */}
            <div className="absolute top-0 right-0 -mr-32 -mt-32 w-96 h-96 bg-blue-300 rounded-full mix-blend-multiply filter blur-3xl opacity-20 animate-blob"></div>
            <div className="absolute top-40 left-0 -ml-32 w-96 h-96 bg-indigo-300 rounded-full mix-blend-multiply filter blur-3xl opacity-20 animate-blob animation-delay-2000"></div>

            {/* Header */}
            <div className="bg-white border-b border-slate-200 shadow-sm relative z-20 shrink-0">
                <div className="max-w-4xl mx-auto px-6 py-4 flex items-center justify-between">
                    <div className="flex items-center gap-3">
                        <img src="/logo.jpg" alt="TechHRM Logo" className="w-10 h-10 rounded-full border border-slate-100 shadow-sm" />
                        <span className="font-black text-blue-950 text-xl tracking-tight hidden sm:block">TechHRM</span>
                    </div>
                    <button 
                        onClick={onBackToLogin}
                        className="flex items-center gap-2 text-sm font-bold text-slate-500 hover:text-blue-600 transition-colors"
                    >
                        <ArrowLeft className="w-4 h-4" /> Back to Login
                    </button>
                </div>
            </div>

            <main className="flex-1 overflow-y-auto p-4 sm:p-8 relative z-10 custom-scrollbar">
                <div className="max-w-4xl mx-auto">
                    
                    {/* Header Text */}
                    <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} className="mb-10 text-center sm:text-left">
                        <h1 className="text-3xl sm:text-4xl font-black text-slate-900 tracking-tight">Work-Study Application</h1>
                        <p className="mt-2 text-slate-500 font-medium">Join the Filamer Christian University Work-Study Program. Fill out the form below to initiate your application.</p>
                    </motion.div>

                    <AnimatePresence mode="wait">
                        {status.success ? (
                            /* SUCCESS SCREEN */
                            <motion.div 
                                key="success"
                                initial={{ opacity: 0, scale: 0.95 }} 
                                animate={{ opacity: 1, scale: 1 }} 
                                className="bg-white p-10 sm:p-16 rounded-3xl shadow-xl border border-slate-200 text-center flex flex-col items-center max-w-2xl mx-auto"
                            >
                                <div className="w-24 h-24 bg-emerald-100 text-emerald-600 rounded-full flex items-center justify-center mb-6 shadow-inner relative">
                                    <div className="absolute inset-0 bg-emerald-400 rounded-full blur-xl opacity-30 animate-pulse"></div>
                                    <CheckCircle2 className="w-12 h-12 relative z-10" />
                                </div>
                                <h2 className="text-3xl font-black text-slate-900 tracking-tight mb-4">Application Submitted!</h2>
                                <p className="text-slate-500 font-medium text-lg mb-8 leading-relaxed">
                                    Thank you for applying. Your personal profile and university details are on file. A username and password are issued only after WSPO finalizes your placement.
                                </p>
                                <button 
                                    onClick={onBackToLogin}
                                    className="px-8 py-3.5 bg-slate-900 hover:bg-slate-800 text-white font-bold rounded-xl shadow-lg transition-all flex items-center gap-2"
                                >
                                    <ArrowLeft className="w-5 h-5" /> Return to Homepage
                                </button>
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
                                {/* Error Toast */}
                                <AnimatePresence>
                                    {status.error && (
                                        <motion.div initial={{ opacity: 0, y: -10 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, height: 0 }} className="p-4 bg-red-50 border border-red-200 rounded-xl flex items-center gap-3 shadow-sm">
                                            <AlertCircle className="w-5 h-5 text-red-600 shrink-0" />
                                            <span className="text-sm font-bold text-red-800">{status.error}</span>
                                        </motion.div>
                                    )}
                                </AnimatePresence>

                                {/* SECTION 1: Personal Information */}
                                <motion.section variants={sectionVariants} className="bg-white p-6 sm:p-8 rounded-3xl shadow-sm border border-slate-200">
                                    <div className="flex items-center gap-2 mb-6 border-b border-slate-100 pb-4">
                                        <User className="w-5 h-5 text-blue-600" />
                                        <h2 className="text-xl font-black text-slate-900">Personal Information</h2>
                                    </div>
                                    <div className="grid grid-cols-1 md:grid-cols-3 gap-5">
                                        <FloatingInput id="first_name" label="First Name" value={formData.first_name} onChange={(e: any) => setFormData({ ...formData, first_name: e.target.value })} />
                                        <FloatingInput id="middle_name" label="Middle Name" required={false} value={formData.middle_name} onChange={(e: any) => setFormData({ ...formData, middle_name: e.target.value })} />
                                        <FloatingInput id="last_name" label="Last Name" value={formData.last_name} onChange={(e: any) => setFormData({ ...formData, last_name: e.target.value })} />
                                    </div>
                                    <div className="grid grid-cols-1 md:grid-cols-2 gap-5 mt-5">
                                        <FloatingInput id="email" type="email" label="Email Address" icon={Mail} value={formData.email} onChange={(e: any) => setFormData({ ...formData, email: e.target.value })} />
                                        <FloatingInput id="contact_number" type="tel" label="Contact Number" icon={Phone} value={formData.contact_number} onChange={(e: any) => setFormData({ ...formData, contact_number: e.target.value })} />
                                    </div>
                                    <div className="grid grid-cols-1 md:grid-cols-4 gap-5 mt-5">
                                        <div className="md:col-span-1">
                                            <FloatingInput id="age" type="number" label="Age" value={formData.age} onChange={(e: any) => setFormData({ ...formData, age: e.target.value })} />
                                        </div>
                                        <div className="md:col-span-1 relative group">
                                            <select
                                                id="gender"
                                                required
                                                value={formData.gender}
                                                onChange={(e) => setFormData({ ...formData, gender: e.target.value })}
                                                className="block px-4 pb-3 pt-6 w-full text-sm font-bold text-slate-900 bg-slate-50 border border-slate-200 rounded-xl appearance-none focus:outline-none focus:ring-2 focus:ring-blue-600 focus:border-transparent focus:bg-white transition-all shadow-sm cursor-pointer"
                                            >
                                                <option value="" disabled>Select gender</option>
                                                {GENDERS.map((gender) => (
                                                    <option key={gender} value={gender}>{gender}</option>
                                                ))}
                                            </select>
                                            <label
                                                htmlFor="gender"
                                                className="absolute text-sm text-slate-500 duration-300 transform -translate-y-3 scale-75 top-4 z-10 origin-[0] left-4 font-medium pointer-events-none"
                                            >
                                                Gender
                                            </label>
                                        </div>
                                        <div className="md:col-span-2">
                                            <FloatingInput id="address" label="Complete Address" icon={MapPin} value={formData.address} onChange={(e: any) => setFormData({ ...formData, address: e.target.value })} />
                                        </div>
                                    </div>
                                </motion.section>

                                {/* SECTION 2: Academic Details */}
                                <motion.section variants={sectionVariants} className="bg-white p-6 sm:p-8 rounded-3xl shadow-sm border border-slate-200">
                                    <div className="flex items-center gap-2 mb-6 border-b border-slate-100 pb-4">
                                        <BookOpen className="w-5 h-5 text-blue-600" />
                                        <h2 className="text-xl font-black text-slate-900">Academic Details</h2>
                                    </div>
                                    <div className="max-w-xs space-y-2">
                                        <label className="block text-xs font-bold text-slate-500 uppercase tracking-wider ml-1">Year Level</label>
                                        <select required value={formData.year_level} onChange={(e) => setFormData({ ...formData, year_level: e.target.value })} className="w-full p-3.5 bg-slate-50 border border-slate-200 rounded-xl text-sm font-bold text-slate-700 focus:ring-2 focus:ring-blue-600 focus:bg-white outline-none transition-all appearance-none cursor-pointer">
                                            <option value="" disabled>Select Year</option>
                                            {YEAR_LEVELS.map((y) => <option key={y} value={y}>{y}</option>)}
                                        </select>
                                    </div>
                                </motion.section>

                                {/* SECTION 4: Supporting Documents */}
                                <motion.section variants={sectionVariants} className="bg-white p-6 sm:p-8 rounded-3xl shadow-sm border border-slate-200">
                                    <div className="flex items-center gap-2 mb-6 border-b border-slate-100 pb-4">
                                        <FileText className="w-5 h-5 text-blue-600" />
                                        <h2 className="text-xl font-black text-slate-900">Supporting Documents</h2>
                                    </div>
                                    <p className="text-sm font-medium text-slate-500 mb-4">
                                        Attach <span className="font-bold text-slate-800">3 to 5</span> documents (PDF, JPG, or PNG, 4MB each). Examples: Certificate of Enrollment, PSA Birth Certificate, Certificate of Indigency, or latest grades.
                                    </p>
                                    <label className="flex flex-col items-center justify-center gap-2 w-full p-6 border-2 border-dashed border-slate-200 rounded-2xl bg-slate-50 hover:border-blue-300 hover:bg-blue-50/40 cursor-pointer transition-colors">
                                        <Upload className="w-6 h-6 text-blue-600" />
                                        <span className="text-sm font-bold text-slate-700">Add documents</span>
                                        <span className="text-xs font-medium text-slate-400">{documents.length} of 5 selected · minimum 3 required</span>
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
                                        <ul className="mt-4 space-y-2">
                                            {documents.map((file, index) => (
                                                <li key={`${file.name}-${index}`} className="flex items-center justify-between gap-3 px-4 py-3 rounded-xl border border-slate-200 bg-white">
                                                    <div className="min-w-0">
                                                        <p className="text-sm font-bold text-slate-800 truncate">{file.name}</p>
                                                        <p className="text-[11px] font-medium text-slate-400">{(file.size / 1024).toFixed(0)} KB</p>
                                                    </div>
                                                    <button type="button" onClick={() => removeDocument(index)} className="p-2 text-slate-400 hover:text-red-600 hover:bg-red-50 rounded-lg transition-colors" title="Remove document">
                                                        <Trash2 className="w-4 h-4" />
                                                    </button>
                                                </li>
                                            ))}
                                        </ul>
                                    )}
                                </motion.section>

                                {/* Submit Actions */}
                                <motion.div variants={sectionVariants} className="pt-2 pb-10">
                                    <button
                                        type="submit"
                                        disabled={status.loading || documents.length < 3}
                                        className="w-full py-4 bg-gradient-to-r from-blue-600 to-blue-700 hover:from-blue-700 hover:to-blue-800 text-white font-black rounded-xl shadow-xl shadow-blue-600/20 transition-all disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-2 text-lg"
                                    >
                                        {status.loading ? (
                                            <>
                                                <Loader2 className="w-5 h-5 animate-spin" /> Submitting Application...
                                            </>
                                        ) : (
                                            <>
                                                Submit Final Application <Send className="w-5 h-5" />
                                            </>
                                        )}
                                    </button>
                                </motion.div>
                            </motion.form>
                        )}
                    </AnimatePresence>
                </div>
            </main>
        </div>
    );
};

export default PublicApplication;