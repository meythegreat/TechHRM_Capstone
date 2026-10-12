import { useState, type FormEvent } from 'react';
import axios from 'axios';
import { motion, AnimatePresence, type Variants } from 'framer-motion';
import { ArrowLeft, Loader2, Search, ShieldCheck, Mail, FileText, ArrowRight } from 'lucide-react';
import ThemeToggle from './ThemeToggle';
import Toast from './Toast';
import ApplicationStatusTracker from './ApplicationStatusTracker';

interface ApplicationStatusLookupProps {
    onBackToLogin: () => void;
    onNavigateToApply: () => void;
}

// MODERN FLOATING INPUT COMPONENT
const FloatingInput = ({ id, type = 'text', label, icon: Icon, required = true, className = '', inputClassName = '', ...props }: any) => (
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
            className={`block ${Icon ? 'pl-12' : 'pl-4'} pr-4 pb-3 pt-6 w-full text-base font-bold text-slate-900 bg-slate-50/50 border border-slate-200 rounded-2xl appearance-none focus:outline-none focus:ring-4 focus:ring-indigo-600/10 focus:border-indigo-600 focus:bg-white peer transition-all shadow-sm ${inputClassName}`}
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

const containerVariants: Variants = {
    hidden: { opacity: 0 },
    show: { opacity: 1, transition: { staggerChildren: 0.1 } }
};

const sectionVariants: Variants = {
    hidden: { opacity: 0, y: 20 },
    show: { opacity: 1, y: 0, transition: { type: 'spring', stiffness: 300, damping: 24 } }
};

const ApplicationStatusLookup = ({ onBackToLogin, onNavigateToApply }: ApplicationStatusLookupProps) => {
    const [email, setEmail] = useState('');
    const [trackingCode, setTrackingCode] = useState('');
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState('');
    const [tracker, setTracker] = useState<Record<string, unknown> | null>(null);

    const handleSubmit = async (event: FormEvent) => {
        event.preventDefault();
        setLoading(true);
        setError('');
        setTracker(null);
        try {
            const response = await axios.post('/api/apply/status', {
                email: email.trim(),
                tracking_code: trackingCode.trim(),
            });
            setTracker(response.data);
        } catch (err: any) {
            setError(err.response?.data?.message || 'We could not find that application. Check the email and tracking code.');
        } finally {
            setLoading(false);
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
                            onClick={onBackToLogin}
                            className="flex items-center gap-2 px-4 py-2.5 text-sm font-bold text-slate-600 bg-slate-100 hover:bg-slate-200 rounded-xl transition-colors"
                        >
                            <ArrowLeft className="w-4 h-4" /> <span className="hidden sm:inline">Back to Sign In</span>
                        </button>
                    </div>
                </div>
            </div>

            <main className="flex-1 overflow-y-auto p-4 sm:p-8 relative z-10 custom-scrollbar">
                <motion.div 
                    variants={containerVariants}
                    initial="hidden"
                    animate="show"
                    className="max-w-4xl mx-auto space-y-8"
                >
                    
                    {/* SECURE GATEWAY HEADER */}
                    <motion.div variants={sectionVariants}>
                        <div className="mb-3 inline-flex items-center gap-2 text-sm font-medium text-slate-500">
                            <ShieldCheck className="h-4 w-4 text-emerald-600" />
                            Application tracking
                        </div>
                        <h1 className="text-3xl font-semibold tracking-tight text-slate-900 sm:text-4xl">
                            Track your application
                        </h1>
                        <p className="mt-2 max-w-xl text-sm leading-relaxed text-slate-500">
                            Use your registered email and tracking code to monitor your application's real-time progress through the WSPO placement pipeline.
                        </p>
                    </motion.div>

                    {/* SEARCH FORM */}
                    <motion.form 
                        variants={sectionVariants}
                        onSubmit={handleSubmit} 
                        className="bg-white rounded-2xl border border-slate-200/80 p-6 shadow-[0_1px_2px_rgba(15,23,42,0.04)] sm:p-10 space-y-6"
                    >
                        <Toast message={error || null} type="error" onClose={() => setError('')} />
                        
                        <div className="grid grid-cols-1 md:grid-cols-2 gap-5 sm:gap-6">
                            <FloatingInput 
                                id="email" 
                                type="email" 
                                label="Registered Email" 
                                icon={Mail} 
                                value={email} 
                                onChange={(event: any) => setEmail(event.target.value)} 
                            />
                            <FloatingInput 
                                id="tracking_code" 
                                label="Tracking Code" 
                                icon={FileText} 
                                inputClassName="uppercase font-mono tracking-wider"
                                value={trackingCode} 
                                onChange={(event: any) => setTrackingCode(event.target.value.toUpperCase())} 
                            />
                        </div>

                        <div className="pt-2 flex flex-col sm:flex-row items-center gap-4">
                            <button
                                type="submit"
                                disabled={loading || !email || !trackingCode}
                                className="w-full sm:w-auto flex-1 py-4 bg-gradient-to-r from-indigo-600 to-blue-600 hover:from-indigo-700 hover:to-blue-700 text-white font-semibold rounded-2xl shadow-xl shadow-indigo-600/20 transition-all disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-3 text-lg group hover:-translate-y-0.5"
                            >
                                {loading ? (
                                    <>
                                        <Loader2 className="w-6 h-6 animate-spin" /> Verifying Records...
                                    </>
                                ) : (
                                    <>
                                        Check Status <Search className="w-5 h-5 transition-transform group-hover:scale-110" />
                                    </>
                                )}
                            </button>
                        </div>

                        <div className="pt-6 border-t border-slate-100 text-center">
                            <button
                                type="button"
                                onClick={onNavigateToApply}
                                className="inline-flex items-center gap-2 text-sm font-bold text-indigo-700 hover:text-indigo-800 transition-colors group"
                            >
                                Need to submit an application instead?
                                <ArrowRight className="w-4 h-4 transition-transform group-hover:translate-x-1" />
                            </button>
                        </div>
                    </motion.form>

                    {/* RESULTS TRACKER */}
                    <AnimatePresence>
                        {tracker && (
                            <motion.div 
                                initial={{ opacity: 0, y: 20 }} 
                                animate={{ opacity: 1, y: 0 }}
                                exit={{ opacity: 0, y: -20 }}
                                transition={{ type: 'spring', stiffness: 300, damping: 25 }}
                            >
                                <ApplicationStatusTracker application={tracker} />
                            </motion.div>
                        )}
                    </AnimatePresence>

                </motion.div>
            </main>
        </div>
    );
};

export default ApplicationStatusLookup;