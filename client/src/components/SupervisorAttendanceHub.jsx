import React, { useEffect, useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { generateSecureToken, fetchAnomalyLogs } from '../services/advancedAttendanceService';
import { 
    KeyRound, 
    ShieldAlert, 
    ShieldCheck, 
    CheckCircle2, 
    AlertTriangle, 
    Clock, 
    Calendar,
    Copy,
    Activity
} from 'lucide-react';

const SupervisorAttendanceHub = () => {
    const [selectedType, setSelectedType] = useState('Daily Clock');
    const [descInput, setDescInput] = useState('');
    const [activeToken, setActiveToken] = useState(null);
    const [anomalies, setAnomalies] = useState([]);
    const [isLoading, setIsLoading] = useState(true);
    const [isGenerating, setIsGenerating] = useState(false);
    const [copied, setCopied] = useState(false);
    const [errorMsg, setErrorMsg] = useState('');
    const supervisorDepartment = localStorage.getItem('assigned_office') || 'Unassigned';

    const formatHours = (value) => Number(value || 0).toFixed(2);

    useEffect(() => {
        loadAnomalies();
    }, []);

    const loadAnomalies = async () => {
        setIsLoading(true);
        setErrorMsg('');
        try {
            const res = await fetchAnomalyLogs();
            setAnomalies(res.data || []);
        } catch (err) {
            console.error('Failed to load anomalies', err);
            setErrorMsg(err.response?.data?.message || 'Unable to load attendance anomalies. Please refresh and try again.');
        } finally {
            setIsLoading(false);
        }
    };

    const handleCreateToken = async (e) => {
        e.preventDefault();
        setErrorMsg('');
        setIsGenerating(true);
        try {
            const res = await generateSecureToken(selectedType, descInput);
            if (!res.data?.token?.token_code) {
                throw new Error('The server did not return a verification token.');
            }
            setActiveToken(res.data.token);
            setDescInput('');
            setCopied(false);
        } catch (err) {
            console.error('Failed to generate token', err);
            setErrorMsg(err.response?.data?.message || err.message || 'Unable to generate a secure token. Please try again.');
        } finally {
            setIsGenerating(false);
        }
    };

    const copyToClipboard = async () => {
        if (activeToken?.token_code) {
            try {
                await navigator.clipboard.writeText(activeToken.token_code);
                setCopied(true);
                setTimeout(() => setCopied(false), 2000);
            } catch (err) {
                console.error('Failed to copy token', err);
                setErrorMsg('Unable to copy the token. Select the code and copy it manually.');
            }
        }
    };

    // ANIMATION VARIANTS
    const containerVariants = {
        hidden: { opacity: 0 },
        show: { opacity: 1, transition: { staggerChildren: 0.1 } }
    };

    const itemVariants = {
        hidden: { opacity: 0, y: 20 },
        show: { opacity: 1, y: 0, transition: { type: 'spring', stiffness: 300, damping: 24 } }
    };

    if (isLoading) {
        return (
            <div className="flex flex-col items-center justify-center min-h-[400px]">
                <div className="w-10 h-10 border-4 border-blue-200 border-t-blue-600 rounded-full animate-spin mb-3"></div>
                <p className="text-slate-500 font-bold animate-pulse">Loading security hub...</p>
            </div>
        );
    }

    return (
        <div className="max-w-7xl mx-auto space-y-8 font-sans p-4 sm:p-8">
            
            {/* DARK THEME HEADER - SECURITY COMMAND CENTER */}
            <motion.div 
                initial={{ opacity: 0, y: -20 }}
                animate={{ opacity: 1, y: 0 }}
                className="flex flex-col md:flex-row md:items-end justify-between gap-6 bg-slate-900 p-6 sm:p-8 rounded-3xl shadow-xl overflow-hidden relative"
            >
                {/* Glowing Orbs */}
                <div className="absolute top-0 right-0 -mt-16 -mr-16 w-64 h-64 bg-blue-500 rounded-full mix-blend-multiply filter blur-3xl opacity-20 animate-pulse"></div>
                <div className={`absolute bottom-0 left-10 -mb-16 -ml-16 w-64 h-64 rounded-full mix-blend-multiply filter blur-3xl opacity-20 ${anomalies.length > 0 ? 'bg-red-500' : 'bg-emerald-500'}`}></div>

                <div className="relative z-10">
                    <div className="flex items-center gap-2 mb-2">
                        <KeyRound className="w-5 h-5 text-blue-400" />
                        <span className="text-xs font-bold text-blue-400 uppercase tracking-widest">Security & Access</span>
                    </div>
                    <h1 className="text-3xl sm:text-4xl font-black text-white tracking-tight">
                        Attendance Hub
                    </h1>
                    <p className="mt-2 text-slate-400 font-medium max-w-md">
                        Generate secure verification tokens for student shifts and monitor the system for attendance anomalies.
                    </p>
                    <p className="mt-2 inline-flex items-center gap-2 px-3 py-1.5 bg-white/10 border border-white/10 rounded-lg text-sm font-bold text-blue-200">
                        Token scope: <span className="text-white">{supervisorDepartment}</span> students only
                    </p>
                </div>

                <div className="relative z-10 bg-black/40 backdrop-blur-md border border-white/10 px-6 py-4 rounded-2xl flex items-center gap-4">
                    <div className={`w-10 h-10 rounded-full flex items-center justify-center ${anomalies.length > 0 ? 'bg-red-500/20 text-red-400 shadow-[0_0_15px_rgba(248,113,113,0.3)]' : 'bg-emerald-500/20 text-emerald-400 shadow-[0_0_15px_rgba(16,185,129,0.3)]'}`}>
                        {anomalies.length > 0 ? <ShieldAlert className="w-5 h-5 animate-pulse" /> : <ShieldCheck className="w-5 h-5" />}
                    </div>
                    <div className="flex flex-col text-left">
                        <span className="text-[10px] font-bold text-slate-400 uppercase tracking-widest">System Integrity</span>
                        <span className={`text-sm font-extrabold ${anomalies.length > 0 ? 'text-red-400' : 'text-emerald-400'}`}>
                            {anomalies.length > 0 ? `${anomalies.length} Anomalies Found` : 'All Clear'}
                        </span>
                    </div>
                </div>
            </motion.div>

            {errorMsg && (
                <div role="alert" className="p-4 bg-red-50 border border-red-200 rounded-xl text-sm font-bold text-red-800">
                    {errorMsg}
                </div>
            )}

            <div className="grid grid-cols-1 lg:grid-cols-3 gap-8 items-start">
                
                {/* LEFT COLUMN: TOKEN GENERATOR */}
                <motion.div 
                    initial={{ opacity: 0, x: -20 }}
                    animate={{ opacity: 1, x: 0 }}
                    transition={{ delay: 0.1 }}
                    className="lg:col-span-1 space-y-6"
                >
                    <div className="bg-white p-6 sm:p-8 rounded-3xl shadow-sm border border-slate-200">
                        <h3 className="text-xl font-black text-slate-900 mb-6 flex items-center gap-2 tracking-tight">
                            <KeyRound className="w-5 h-5 text-blue-600" /> Generate Token
                        </h3>
                        
                        <form onSubmit={handleCreateToken} className="space-y-5">
                            <div>
                                <label className="block text-xs font-bold text-slate-500 uppercase tracking-wider mb-2">Shift Type</label>
                                <select 
                                    value={selectedType}
                                    onChange={(e) => setSelectedType(e.target.value)}
                                    className="w-full p-3.5 bg-slate-50 border border-slate-200 rounded-xl text-sm font-bold text-slate-700 focus:ring-2 focus:ring-blue-600 focus:bg-white outline-none transition-all appearance-none cursor-pointer"
                                >
                                    <option>Daily Clock</option>
                                    <option>Meeting</option>
                                    <option>Cleaning</option>
                                </select>
                            </div>

                            <div>
                                <label className="block text-xs font-bold text-slate-500 uppercase tracking-wider mb-2">Remarks / Location</label>
                                <input 
                                    type="text" 
                                    value={descInput}
                                    onChange={(e) => setDescInput(e.target.value)}
                                    placeholder="e.g. CCS Lab 1 Maintenance"
                                    className="w-full p-3.5 bg-slate-50 border border-slate-200 rounded-xl text-sm font-bold text-slate-900 focus:ring-2 focus:ring-blue-600 focus:bg-white outline-none transition-all placeholder:text-slate-400"
                                />
                            </div>

                            <button 
                                type="submit" 
                                disabled={isGenerating}
                                className="w-full py-3.5 bg-slate-900 hover:bg-blue-600 text-white font-bold rounded-xl shadow-lg shadow-slate-900/20 transition-all disabled:opacity-50 flex items-center justify-center gap-2"
                            >
                                {isGenerating ? 'Generating...' : <><KeyRound className="w-5 h-5" /> Generate Secure Token</>}
                            </button>
                        </form>
                    </div>

                    {/* ACTIVE TOKEN DISPLAY */}
                    <AnimatePresence>
                        {activeToken && (
                            <motion.div 
                                initial={{ opacity: 0, scale: 0.95, y: 10 }}
                                animate={{ opacity: 1, scale: 1, y: 0 }}
                                className="bg-gradient-to-br from-blue-600 to-indigo-700 p-6 sm:p-8 rounded-3xl shadow-lg shadow-blue-900/20 text-white relative overflow-hidden"
                            >
                                <div className="absolute top-0 right-0 w-32 h-32 bg-white opacity-10 rounded-full blur-2xl"></div>
                                <h4 className="text-xs font-bold text-blue-200 uppercase tracking-widest mb-3">Active Verification Code</h4>
                                <div className="flex items-center justify-between bg-black/20 p-4 rounded-2xl border border-white/10 backdrop-blur-md">
                                    <span className="text-3xl font-black tracking-widest font-mono select-all">
                                        {activeToken.token_code}
                                    </span>
                                    <button 
                                        onClick={copyToClipboard}
                                        className="p-3 bg-white/10 hover:bg-white/20 rounded-xl transition-colors"
                                        title="Copy to clipboard"
                                    >
                                        {copied ? <CheckCircle2 className="w-5 h-5 text-emerald-400" /> : <Copy className="w-5 h-5 text-white" />}
                                    </button>
                                </div>
                                <p className="text-xs font-medium text-blue-200 mt-4 text-center">
                                    Valid until {new Date(activeToken.expires_at).toLocaleString()}. Provide this code to student workers to authorize their clock-in.
                                </p>
                            </motion.div>
                        )}
                    </AnimatePresence>
                </motion.div>

                {/* RIGHT COLUMN: ANOMALY RADAR */}
                <div className="lg:col-span-2">
                    <div className="bg-white rounded-3xl shadow-sm border border-slate-200 overflow-hidden flex flex-col min-h-[500px]">
                        <div className="p-6 border-b border-slate-100 flex justify-between items-center bg-slate-50/50">
                            <h3 className="text-lg font-black text-slate-900 flex items-center gap-2 tracking-tight">
                                <Activity className="w-5 h-5 text-blue-600" />
                                Anomaly Radar
                            </h3>
                            <span className="text-xs font-bold text-slate-500 uppercase tracking-widest">
                                Auto-Detection System
                            </span>
                        </div>
                        
                        <div className="p-4 flex-1">
                            {anomalies.length === 0 ? (
                                <div className="h-full flex flex-col items-center justify-center text-center p-10 text-slate-400">
                                    <div className="w-20 h-20 bg-emerald-50 text-emerald-500 rounded-full flex items-center justify-center mb-4 border-4 border-emerald-100/50 shadow-inner">
                                        <ShieldCheck className="w-10 h-10" />
                                    </div>
                                    <p className="text-lg font-black text-slate-700">No Anomalies Detected</p>
                                    <p className="text-sm font-medium mt-1">All attendance logs conform to standard operational protocols.</p>
                                </div>
                            ) : (
                                <motion.div 
                                    variants={containerVariants}
                                    initial="hidden"
                                    animate="show"
                                    className="space-y-4"
                                >
                                    {anomalies.map((item) => (
                                        <motion.div 
                                            variants={itemVariants}
                                            key={item.id}
                                            className="p-5 border border-red-200 bg-red-50/40 rounded-2xl flex flex-col sm:flex-row justify-between sm:items-center gap-4 hover:shadow-md transition-shadow group"
                                        >
                                            <div className="flex items-start gap-4">
                                                <div className="w-12 h-12 bg-red-100 text-red-600 rounded-xl flex items-center justify-center shrink-0 border border-red-200 group-hover:scale-105 transition-transform">
                                                    <AlertTriangle className="w-6 h-6" />
                                                </div>
                                                <div>
                                                    <h4 className="font-bold text-slate-900 text-base">{item.user?.name || 'Unknown Student'}</h4>
                                                    <p className="text-sm text-red-700 font-bold mt-0.5">
                                                        Trigger: {item.anomaly_reason}
                                                    </p>
                                                    <div className="flex items-center gap-3 mt-2 text-xs font-bold text-slate-500 uppercase tracking-wider">
                                                        <span className="flex items-center gap-1"><Calendar className="w-3.5 h-3.5" /> {item.time_in ? new Date(item.time_in).toLocaleDateString() : '—'}</span>
                                                        <span className="flex items-center gap-1"><Clock className="w-3.5 h-3.5" /> {item.time_in ? new Date(item.time_in).toLocaleTimeString([], {hour: '2-digit', minute:'2-digit'}) : '—'}</span>
                                                    </div>
                                                </div>
                                            </div>
                                            
                                            <div className="flex flex-col items-start sm:items-end">
                                                <span className="text-[10px] font-bold text-slate-400 uppercase tracking-widest mb-1">Logged Time</span>
                                                <span className="text-lg bg-red-100 text-red-800 font-black px-3 py-1 rounded-lg shrink-0 border border-red-200 shadow-sm">
                                                    {formatHours(item.computed_hours || item.rendered_hours)} hrs
                                                </span>
                                            </div>
                                        </motion.div>
                                    ))}
                                </motion.div>
                            )}
                        </div>
                    </div>
                </div>
            </div>
        </div>
    );
};

export default SupervisorAttendanceHub;
