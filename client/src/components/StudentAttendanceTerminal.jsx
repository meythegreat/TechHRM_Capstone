import React, { useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import axios from 'axios';
import { Html5Qrcode } from 'html5-qrcode';
import { motion, AnimatePresence } from 'framer-motion';
import { 
    Clock, 
    KeyRound, 
    Briefcase, 
    History, 
    AlertCircle, 
    CheckCircle2, 
    LogIn, 
    LogOut, 
    ShieldCheck, 
    Timer,
    Activity,
    CalendarRange,
    Eye,
    X,
    QrCode
} from 'lucide-react';
import {
    fetchWorkHourSummary,
    submitSecureClockIn,
    submitSecureClockOut,
} from '../services/advancedAttendanceService';
import TimesheetPrintView from './TimesheetPrintView';

const padMonth = (n) => String(n).padStart(2, '0');

const currentYearMonth = () => {
    const today = new Date();
    return `${today.getFullYear()}-${padMonth(today.getMonth() + 1)}`;
};

const monthBounds = (yearMonth) => {
    const [year, month] = yearMonth.split('-').map(Number);
    const start = `${yearMonth}-01`;
    const lastDay = new Date(year, month, 0).getDate();
    const end = `${yearMonth}-${padMonth(lastDay)}`;
    return { start, end };
};

const StudentAttendanceTerminal = () => {
    const [summary, setSummary] = useState({
        total_rendered: 0,
        remaining_hours: 100,
        target_hours: 100,
        history: [],
    });
    
    const [tokenInput, setTokenInput] = useState('');
    const [checkInMethod, setCheckInMethod] = useState('passcode');
    const [dutyType, setDutyType] = useState('Regular');
    const scanBusy = useRef(false);
    const actionRef = useRef(null);
    const scannerRef = useRef(null);
    const [cameraLive, setCameraLive] = useState(false);
    const [cameraStarting, setCameraStarting] = useState(false);
    const insecureCamera = typeof window !== 'undefined' && !window.isSecureContext;
    const [activeShift, setActiveShift] = useState(null);
    const [errorMsg, setErrorMsg] = useState('');
    const [successMsg, setSuccessMsg] = useState('');
    const [isLoading, setIsLoading] = useState(false);
    
    const assignedDepartment = localStorage.getItem('assigned_office') || 'Unassigned';
    const [dtrMonth, setDtrMonth] = useState(currentYearMonth());
    const { start: dtrStart, end: dtrEnd } = monthBounds(dtrMonth);
    const [dtrHistory, setDtrHistory] = useState([]);
    const [dtrHolidays, setDtrHolidays] = useState([]);
    const [dtrPenaltyHours, setDtrPenaltyHours] = useState(0);
    const [dtrPreviewOpen, setDtrPreviewOpen] = useState(false);
    const [fullName, setFullName] = useState(localStorage.getItem('user_name') || 'Student');
    const [studentProfile, setStudentProfile] = useState({
        student_id_number: '',
        course: '',
        year_level: '',
        assigned_office: assignedDepartment,
        duty_type: '',
        supervisors: [],
    });
    
    // Real-time clock state
    const [currentTime, setCurrentTime] = useState(new Date());

    const formatHours = (value) => Number(value || 0).toFixed(2);

    useEffect(() => {
        // Update clock every second
        const timer = setInterval(() => setCurrentTime(new Date()), 1000);
        return () => clearInterval(timer);
    }, []);

    useEffect(() => {
        loadSummary();
        loadProfile();
        
        // BULLETPROOF LOCAL STORAGE CHECK
        try {
            const localShift = localStorage.getItem('active_shift_segment');
            if (localShift && localShift !== 'undefined' && localShift !== 'null') {
                setActiveShift(JSON.parse(localShift));
            }
        } catch (e) {
            console.warn("Cleared corrupted active shift data.");
            localStorage.removeItem('active_shift_segment');
        }
    }, []);

    useEffect(() => {
        loadDtr();
    }, [dtrStart, dtrEnd]);

    const loadSummary = async () => {
        try {
            const res = await fetchWorkHourSummary();
            setSummary(res.data);
            const openShift = res.data.history?.find((log) => !log.time_out);
            if (openShift) {
                setActiveShift(openShift);
                localStorage.setItem('active_shift_segment', JSON.stringify(openShift));
            } else {
                setActiveShift(null);
                localStorage.removeItem('active_shift_segment');
            }
        } catch (err) {
            console.error('Failed to load hour summary', err);
        }
    };

    const clockInWith = async (code, method) => {
        setErrorMsg('');
        setSuccessMsg('');
        setIsLoading(true);

        try {
            await submitSecureClockIn(code, dutyType, method);
            setSuccessMsg(method === 'qr' ? 'QR check-in accepted. Your shift has started.' : 'Shift started successfully! Work hard and stay safe.');
            setTokenInput('');
            await loadSummary();
            await loadDtr();
        } catch (err) {
            scanBusy.current = false;
            setErrorMsg(err.response?.data?.message || 'Failed to verify token and clock in.');
        } finally {
            setIsLoading(false);
            setTimeout(() => setSuccessMsg(''), 4000);
        }
    };

    const handleClockIn = async (e) => {
        e.preventDefault();
        await clockInWith(tokenInput.trim().toUpperCase(), 'passcode');
    };

    const clockOutWith = async (code, method) => {
        if (!activeShift) return;
        setErrorMsg('');
        setSuccessMsg('');
        setIsLoading(true);

        try {
            await submitSecureClockOut(activeShift.id, code, method);
            setSuccessMsg(method === 'qr' ? 'QR clock-out accepted. Your shift has ended.' : 'Shift ended successfully! Great job today.');
            setTokenInput('');
            await loadSummary();
            await loadDtr();
        } catch (err) {
            scanBusy.current = false;
            setErrorMsg(err.response?.data?.message || 'Failed to verify token and clock out.');
        } finally {
            setIsLoading(false);
            setTimeout(() => setSuccessMsg(''), 4000);
        }
    };

    const handleClockOut = async (e) => {
        e.preventDefault();
        await clockOutWith(tokenInput.trim().toUpperCase(), 'passcode');
    };

    actionRef.current = activeShift ? clockOutWith : clockInWith;

    useEffect(() => {
        setCameraLive(false);
        return () => {
            scanBusy.current = false;
            const scanner = scannerRef.current;
            scannerRef.current = null;
            if (scanner?.isScanning) {
                scanner.stop().catch(() => {});
            }
        };
    }, [checkInMethod, activeShift]);

    const startCamera = async () => {
        if (!window.isSecureContext || !navigator.mediaDevices?.getUserMedia) {
            setErrorMsg(`The browser will not ask for the camera on http://${window.location.host}. Open https://${window.location.host}, accept the certificate warning, then tap Turn on camera.`);
            return;
        }

        setCameraStarting(true);
        setErrorMsg('');
        try {
            let stream;
            try {
                stream = await navigator.mediaDevices.getUserMedia({ video: { facingMode: 'environment' }, audio: false });
            } catch {
                stream = await navigator.mediaDevices.getUserMedia({ video: true, audio: false });
            }
            stream.getTracks().forEach((track) => track.stop());
            await new Promise((resolve) => setTimeout(resolve, 300));

            const scanner = new Html5Qrcode('student-qr-reader');
            scannerRef.current = scanner;
            await scanner.start(
                { facingMode: 'environment' },
                { fps: 8, qrbox: { width: 220, height: 220 } },
                (decoded) => {
                    if (scanBusy.current) return;
                    const raw = String(decoded || '').trim();
                    if (!raw.startsWith('THRM1|')) return;
                    const code = raw.slice(6).trim();
                    if (code.length < 16) return;
                    scanBusy.current = true;
                    actionRef.current?.(code, 'qr');
                },
                () => {}
            );
            setCameraLive(true);
        } catch (err) {
            console.error('QR scanner failed', err);
            const name = err?.name || '';
            if (name === 'NotAllowedError' || name === 'PermissionDeniedError') {
                setErrorMsg('Camera permission was blocked. Allow the camera for this site in the browser settings, then tap Turn on camera again.');
            } else if (name === 'NotFoundError' || name === 'DevicesNotFoundError') {
                setErrorMsg('No camera was found on this device. Use the passcode instead.');
            } else {
                setErrorMsg('The camera could not start. Allow camera access, or use the passcode instead.');
            }
        } finally {
            setCameraStarting(false);
        }
    };

    const loadProfile = async () => {
        try {
            const response = await axios.get('/api/user');
            const user = response.data;
            if (user.name) setFullName(user.name);
            setStudentProfile({
                student_id_number: user.profile?.student_id_number || 'Not Assigned',
                course: user.profile?.course || 'Not Assigned',
                year_level: user.profile?.year_level || 'N/A',
                assigned_office: user.profile?.assigned_office || assignedDepartment,
                duty_type: user.profile?.duty_type || '',
                supervisors: Array.isArray(user.department_supervisors) ? user.department_supervisors : [],
            });
        } catch (err) {
            console.error('Failed to load profile for DTR', err);
        }
    };

    const loadDtr = async () => {
        try {
            const response = await axios.get('/api/attendance/my-history', {
                params: { start: dtrStart, end: dtrEnd },
            });
            const payload = response.data;
            setDtrHistory(Array.isArray(payload) ? payload : (payload.history ?? []));
            setDtrPenaltyHours(Number(payload?.duty_deduction_hours || 0));
        } catch (err) {
            console.error('Failed to load DTR', err);
        }
        try {
            const holidayResponse = await axios.get('/api/holidays', {
                params: { start: dtrStart, end: dtrEnd },
            });
            setDtrHolidays(Array.isArray(holidayResponse.data) ? holidayResponse.data : []);
        } catch (err) {
            console.error('Failed to load DTR holidays', err);
            setDtrHolidays([]);
        }
    };

    const hoursFor = (log) => Number(log.computed_hours || log.rendered_hours || 0);
    const dtrTotalHours = dtrHistory.reduce((sum, log) => sum + hoursFor(log), 0);

    // ANIMATION VARIANTS
    const containerVariants = {
        hidden: { opacity: 0 },
        show: { opacity: 1, transition: { staggerChildren: 0.1 } }
    };

    const itemVariants = {
        hidden: { opacity: 0, y: 20 },
        show: { opacity: 1, y: 0, transition: { type: 'spring', stiffness: 300, damping: 24 } }
    };

    return (
        <>
        <div className="max-w-5xl mx-auto space-y-8 font-sans">
            
            {/* Header with Live Clock */}
            <motion.div 
                initial={{ opacity: 0, y: -20 }}
                animate={{ opacity: 1, y: 0 }}
                className="flex flex-col md:flex-row md:items-end justify-between gap-4 bg-slate-900 p-6 sm:p-8 rounded-3xl shadow-xl overflow-hidden relative"
            >
                {/* Background Decoration */}
                <div className="absolute top-0 right-0 -mt-16 -mr-16 w-64 h-64 bg-blue-500 rounded-full mix-blend-multiply filter blur-3xl opacity-20"></div>
                <div className="absolute bottom-0 right-32 -mb-16 -mr-16 w-64 h-64 bg-emerald-500 rounded-full mix-blend-multiply filter blur-3xl opacity-20"></div>

                <div className="relative z-10">
                    <div className="flex items-center gap-2 mb-2">
                        <ShieldCheck className="w-5 h-5 text-blue-400" />
                        <span className="text-xs font-bold text-blue-400 uppercase tracking-widest">Secure Terminal</span>
                    </div>
                    <h1 className="text-3xl sm:text-4xl font-black text-white tracking-tight">
                        Attendance Entry
                    </h1>
                    <p className="mt-2 text-slate-400 font-medium max-w-md">
                        Use your department supervisor&apos;s passcode or QR code to clock in and clock out.
                    </p>
                    <p className="mt-2 inline-flex items-center gap-2 px-3 py-1.5 bg-white/10 border border-white/10 rounded-lg text-sm font-bold text-blue-200">
                        Your department: <span className="text-white">{assignedDepartment}</span>
                    </p>
                </div>

                <div className="relative z-10 bg-black/40 backdrop-blur-md border border-white/10 px-6 py-4 rounded-2xl flex flex-col items-center sm:items-end text-right">
                    <span className="text-xs font-bold text-slate-400 uppercase tracking-wider mb-1">Current System Time</span>
                    <div className="text-3xl font-black text-white font-mono tracking-tight flex items-center gap-2">
                        <Clock className="w-6 h-6 text-blue-400" />
                        {currentTime.toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit', second: '2-digit' })}
                    </div>
                    <span className="text-sm font-medium text-slate-300 mt-1">
                        {currentTime.toLocaleDateString('en-US', { weekday: 'long', month: 'long', day: 'numeric' })}
                    </span>
                </div>
            </motion.div>

            {/* Error/Success Toasts */}
            <AnimatePresence mode="wait">
                {errorMsg && (
                    <motion.div initial={{ opacity: 0, height: 0 }} animate={{ opacity: 1, height: 'auto' }} exit={{ opacity: 0, height: 0 }} className="overflow-hidden">
                        <div className="mb-6 p-4 bg-red-50 border border-red-200 rounded-xl flex items-center gap-3 shadow-sm">
                            <AlertCircle className="w-5 h-5 text-red-600 shrink-0" />
                            <span className="text-sm font-bold text-red-800">{errorMsg}</span>
                        </div>
                    </motion.div>
                )}
                {successMsg && (
                    <motion.div initial={{ opacity: 0, height: 0 }} animate={{ opacity: 1, height: 'auto' }} exit={{ opacity: 0, height: 0 }} className="overflow-hidden">
                        <div className="mb-6 p-4 bg-emerald-50 border border-emerald-200 rounded-xl flex items-center gap-3 shadow-sm">
                            <CheckCircle2 className="w-5 h-5 text-emerald-600 shrink-0" />
                            <span className="text-sm font-bold text-emerald-800">{successMsg}</span>
                        </div>
                    </motion.div>
                )}
            </AnimatePresence>

            <motion.div 
                variants={containerVariants}
                initial="hidden"
                animate="show"
                className="grid grid-cols-1 lg:grid-cols-3 gap-8"
            >
                {/* --- LEFT COLUMN: ACTION TERMINAL --- */}
                <motion.div variants={itemVariants} className="lg:col-span-1">
                    <AnimatePresence mode="wait">
                        {!activeShift ? (
                            /* CLOCK IN FORM */
                            <motion.div 
                                key="clock-in"
                                initial={{ opacity: 0, x: -20 }}
                                animate={{ opacity: 1, x: 0 }}
                                exit={{ opacity: 0, x: -20, transition: { duration: 0.2 } }}
                                className="bg-white rounded-3xl p-6 sm:p-8 shadow-sm border border-slate-200 relative overflow-hidden"
                            >
                                <div className="flex items-center gap-3 mb-6">
                                    <div className="w-10 h-10 rounded-xl bg-blue-50 flex items-center justify-center text-blue-600">
                                        <LogIn className="w-5 h-5" />
                                    </div>
                                    <h2 className="text-xl font-extrabold text-slate-900">Start Shift</h2>
                                </div>

                                <form onSubmit={handleClockIn} className="space-y-5">
                                    <div>
                                        <label className="block text-xs font-bold text-slate-500 uppercase tracking-wider mb-2">Duty Type</label>
                                        <div className="relative">
                                            <div className="absolute inset-y-0 left-0 pl-3.5 flex items-center pointer-events-none">
                                                <Briefcase className="h-5 w-5 text-slate-400" />
                                            </div>
                                            <select
                                                value={dutyType}
                                                onChange={(e) => setDutyType(e.target.value)}
                                                className="block w-full pl-11 pr-4 py-3 bg-slate-50 border border-slate-200 rounded-xl text-sm font-bold text-slate-700 focus:ring-2 focus:ring-blue-600 focus:bg-white outline-none transition-all cursor-pointer appearance-none"
                                            >
                                                <option value="Regular">Regular Duty</option>
                                                <option value="Cleaning">Cleaning Duty</option>
                                                <option value="Meeting">Meeting</option>
                                            </select>
                                        </div>
                                    </div>

                                    <div>
                                        <label className="block text-xs font-bold text-slate-500 uppercase tracking-wider mb-2">Check-in method</label>
                                        <div className="grid grid-cols-2 gap-2 p-1 bg-slate-100 rounded-xl">
                                            <button
                                                type="button"
                                                onClick={() => setCheckInMethod('passcode')}
                                                className={`py-2.5 rounded-lg text-sm font-bold transition-all ${checkInMethod === 'passcode' ? 'bg-white text-slate-900 shadow-sm' : 'text-slate-500'}`}
                                            >
                                                Passcode
                                            </button>
                                            <button
                                                type="button"
                                                onClick={() => setCheckInMethod('qr')}
                                                className={`py-2.5 rounded-lg text-sm font-bold transition-all ${checkInMethod === 'qr' ? 'bg-white text-slate-900 shadow-sm' : 'text-slate-500'}`}
                                            >
                                                Scan QR
                                            </button>
                                        </div>
                                    </div>

                                    {checkInMethod === 'passcode' ? (
                                        <>
                                            <div>
                                                <label className="block text-xs font-bold text-slate-500 uppercase tracking-wider mb-2">Verification Token</label>
                                                <div className="relative">
                                                    <div className="absolute inset-y-0 left-0 pl-3.5 flex items-center pointer-events-none">
                                                        <KeyRound className="h-5 w-5 text-slate-400" />
                                                    </div>
                                                    <input
                                                        type="text"
                                                        required
                                                        value={tokenInput}
                                                        onChange={(e) => setTokenInput(e.target.value.toUpperCase())}
                                                        placeholder="Enter supervisor token..."
                                                        className="block w-full pl-11 pr-4 py-3 bg-slate-50 border border-slate-200 rounded-xl text-sm font-bold text-slate-900 focus:ring-2 focus:ring-blue-600 focus:bg-white outline-none transition-all placeholder:text-slate-400 placeholder:font-medium uppercase tracking-widest"
                                                    />
                                                </div>
                                                <p className="mt-2 text-xs font-medium text-slate-500">
                                                    The passcode changes every 30 seconds. Use the one currently on your supervisor&apos;s screen.
                                                </p>
                                            </div>

                                            <motion.button
                                                whileHover={{ scale: 1.02 }}
                                                whileTap={{ scale: 0.98 }}
                                                type="submit"
                                                disabled={isLoading || !tokenInput}
                                                className="w-full py-3.5 mt-2 bg-linear-to-r from-blue-600 to-blue-700 hover:from-blue-700 hover:to-blue-800 text-white font-bold rounded-xl shadow-lg shadow-blue-600/25 transition-all flex justify-center items-center gap-2 disabled:opacity-50 disabled:cursor-not-allowed"
                                            >
                                                {isLoading ? (
                                                    <div className="w-5 h-5 border-2 border-white/30 border-t-white rounded-full animate-spin"></div>
                                                ) : (
                                                    <>Clock In Now</>
                                                )}
                                            </motion.button>
                                        </>
                                    ) : (
                                        <div className="space-y-3">
                                            {insecureCamera && (
                                                <p className="text-xs font-bold text-amber-800 bg-amber-50 border border-amber-200 rounded-xl p-3">
                                                    This page is open over http, so the phone will not ask for the camera. Open https://{window.location.host}, accept the certificate warning, then turn the camera on.
                                                </p>
                                            )}
                                            {!cameraLive && (
                                                <button
                                                    type="button"
                                                    onClick={startCamera}
                                                    disabled={cameraStarting}
                                                    className="w-full py-3.5 bg-slate-900 hover:bg-blue-600 text-white font-bold rounded-xl transition-all disabled:opacity-50"
                                                >
                                                    {cameraStarting ? 'Asking for the camera…' : 'Turn on camera'}
                                                </button>
                                            )}
                                            <div id="student-qr-reader" className="overflow-hidden rounded-2xl border border-slate-200 bg-slate-900 min-h-[240px]" />
                                            <p className="text-xs font-medium text-slate-500 text-center flex items-center justify-center gap-1.5">
                                                <QrCode className="w-3.5 h-3.5" />
                                                Point the camera at the QR on your supervisor&apos;s screen. It changes every 30 seconds.
                                            </p>
                                            {isLoading && (
                                                <div className="flex justify-center">
                                                    <div className="w-5 h-5 border-2 border-blue-200 border-t-blue-600 rounded-full animate-spin"></div>
                                                </div>
                                            )}
                                        </div>
                                    )}
                                </form>
                            </motion.div>
                        ) : (
                            /* ACTIVE SHIFT DASHBOARD */
                            <motion.div 
                                key="active-shift"
                                initial={{ opacity: 0, scale: 0.95 }}
                                animate={{ opacity: 1, scale: 1 }}
                                className="bg-emerald-50 rounded-3xl p-6 sm:p-8 shadow-sm border border-emerald-200 relative overflow-hidden"
                            >
                                <div className="absolute top-0 right-0 w-32 h-32 bg-emerald-400 rounded-full mix-blend-multiply filter blur-3xl opacity-30 animate-pulse"></div>

                                <div className="flex flex-col items-center text-center relative z-10">
                                    <div className="w-16 h-16 rounded-full bg-emerald-100 flex items-center justify-center text-emerald-600 mb-4 shadow-inner">
                                        <Timer className="w-8 h-8 animate-pulse" />
                                    </div>
                                    <h2 className="text-2xl font-black text-emerald-900">Shift Active</h2>
                                    <p className="text-sm font-bold text-emerald-700 mt-1 uppercase tracking-wider">
                                        {activeShift.work_type || 'Regular Duty'}
                                    </p>
                                    
                                    <div className="mt-6 w-full p-4 bg-white/60 backdrop-blur-sm rounded-2xl border border-emerald-100">
                                        <p className="text-xs font-bold text-emerald-600 uppercase mb-1">Time In</p>
                                        <p className="text-xl font-black text-emerald-900 font-mono">
                                            {activeShift.time_in ? new Date(activeShift.time_in).toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit' }) : '--:--'}
                                        </p>
                                    </div>

                                    <form onSubmit={handleClockOut} className="w-full mt-6 space-y-4 text-left">
                                        <div>
                                            <label className="block text-xs font-bold text-emerald-800 uppercase tracking-wider mb-2">Clock-out method</label>
                                            <div className="grid grid-cols-2 gap-2 p-1 bg-white/70 rounded-xl">
                                                <button
                                                    type="button"
                                                    onClick={() => setCheckInMethod('passcode')}
                                                    className={`py-2.5 rounded-lg text-sm font-bold transition-all ${checkInMethod === 'passcode' ? 'bg-white text-slate-900 shadow-sm' : 'text-slate-500'}`}
                                                >
                                                    Passcode
                                                </button>
                                                <button
                                                    type="button"
                                                    onClick={() => setCheckInMethod('qr')}
                                                    className={`py-2.5 rounded-lg text-sm font-bold transition-all ${checkInMethod === 'qr' ? 'bg-white text-slate-900 shadow-sm' : 'text-slate-500'}`}
                                                >
                                                    Scan QR
                                                </button>
                                            </div>
                                        </div>

                                        {checkInMethod === 'passcode' ? (
                                            <>
                                                <div>
                                                    <label className="block text-xs font-bold text-emerald-800 uppercase tracking-wider mb-2">Verification Token</label>
                                                    <div className="relative">
                                                        <div className="absolute inset-y-0 left-0 pl-3.5 flex items-center pointer-events-none">
                                                            <KeyRound className="h-5 w-5 text-slate-400" />
                                                        </div>
                                                        <input
                                                            type="text"
                                                            required
                                                            value={tokenInput}
                                                            onChange={(e) => setTokenInput(e.target.value.toUpperCase())}
                                                            placeholder="Enter supervisor token..."
                                                            className="block w-full pl-11 pr-4 py-3 bg-white border border-emerald-100 rounded-xl text-sm font-bold text-slate-900 focus:ring-2 focus:ring-red-500 outline-none transition-all placeholder:text-slate-400 placeholder:font-medium uppercase tracking-widest"
                                                        />
                                                    </div>
                                                    <p className="mt-2 text-xs font-medium text-emerald-800">
                                                        The passcode changes every 30 seconds. Use the one currently on your supervisor&apos;s screen.
                                                    </p>
                                                </div>
                                                <motion.button
                                                    whileHover={{ scale: 1.02 }}
                                                    whileTap={{ scale: 0.98 }}
                                                    type="submit"
                                                    disabled={isLoading || !tokenInput}
                                                    className="w-full py-4 bg-linear-to-r from-red-500 to-red-600 hover:from-red-600 hover:to-red-700 text-white font-black rounded-xl shadow-lg shadow-red-500/25 transition-all flex justify-center items-center gap-2 disabled:opacity-50 disabled:cursor-not-allowed"
                                                >
                                                    {isLoading ? (
                                                        <div className="w-5 h-5 border-2 border-white/30 border-t-white rounded-full animate-spin"></div>
                                                    ) : (
                                                        <>
                                                            <LogOut className="w-5 h-5" />
                                                            Clock Out
                                                        </>
                                                    )}
                                                </motion.button>
                                            </>
                                        ) : (
                                            <div className="space-y-3">
                                                {insecureCamera && (
                                                    <p className="text-xs font-bold text-amber-800 bg-amber-50 border border-amber-200 rounded-xl p-3">
                                                        This page is open over http, so the phone will not ask for the camera. Open https://{window.location.host}, accept the certificate warning, then turn the camera on.
                                                    </p>
                                                )}
                                                {!cameraLive && (
                                                    <button
                                                        type="button"
                                                        onClick={startCamera}
                                                        disabled={cameraStarting}
                                                        className="w-full py-3.5 bg-slate-900 hover:bg-red-600 text-white font-bold rounded-xl transition-all disabled:opacity-50"
                                                    >
                                                        {cameraStarting ? 'Asking for the camera…' : 'Turn on camera'}
                                                    </button>
                                                )}
                                                <div id="student-qr-reader" className="overflow-hidden rounded-2xl border border-emerald-100 bg-slate-900 min-h-[240px]" />
                                                <p className="text-xs font-medium text-emerald-800 text-center flex items-center justify-center gap-1.5">
                                                    <QrCode className="w-3.5 h-3.5" />
                                                    Scan the live QR on your supervisor&apos;s screen to clock out. It changes every 30 seconds.
                                                </p>
                                                {isLoading && (
                                                    <div className="flex justify-center">
                                                        <div className="w-5 h-5 border-2 border-red-200 border-t-red-600 rounded-full animate-spin"></div>
                                                    </div>
                                                )}
                                            </div>
                                        )}
                                    </form>
                                </div>
                            </motion.div>
                        )}
                    </AnimatePresence>
                </motion.div>

                {/* --- RIGHT COLUMN: STATS & HISTORY --- */}
                <motion.div variants={itemVariants} className="lg:col-span-2 space-y-8">
                    
                    {/* Stat Cards */}
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                        <div className="bg-white p-6 rounded-2xl shadow-sm border border-slate-200">
                            <p className="text-sm font-bold text-slate-500 uppercase tracking-wider mb-1">Total Rendered</p>
                            <h3 className="text-3xl font-black text-blue-600">
                                {formatHours(summary.total_rendered)} <span className="text-sm font-bold text-slate-400 uppercase tracking-normal">hrs</span>
                            </h3>
                            <div className="w-full bg-slate-100 rounded-full h-1.5 mt-4 overflow-hidden">
                                <motion.div 
                                    initial={{ width: 0 }}
                                    animate={{ width: `${Math.min(((summary.total_rendered || 0) / summary.target_hours) * 100, 100)}%` }}
                                    transition={{ duration: 1 }}
                                    className="bg-blue-600 h-1.5 rounded-full"
                                />
                            </div>
                        </div>
                        
                        <div className="bg-white p-6 rounded-2xl shadow-sm border border-slate-200">
                            <p className="text-sm font-bold text-slate-500 uppercase tracking-wider mb-1">Remaining Hours</p>
                            <h3 className="text-3xl font-black text-slate-900">
                                {formatHours(summary.remaining_hours)} <span className="text-sm font-bold text-slate-400 uppercase tracking-normal">hrs</span>
                            </h3>
                            <p className="text-xs font-bold text-emerald-600 mt-3 flex items-center gap-1">
                                <CheckCircle2 className="w-4 h-4" /> Target: {summary.target_hours} hrs
                            </p>
                        </div>
                    </div>

                    {/* Recent History List */}
                    <div className="bg-white rounded-3xl shadow-sm border border-slate-200 overflow-hidden">
                        <div className="p-6 border-b border-slate-100 bg-slate-50/50 flex items-center gap-3">
                            <History className="w-5 h-5 text-slate-400" />
                            <h3 className="text-lg font-extrabold text-slate-900">Recent Logs</h3>
                        </div>
                        
                        <div className="p-0">
                            {(!summary.history || summary.history.length === 0) ? (
                                <div className="p-12 text-center text-slate-400 flex flex-col items-center">
                                    <Activity className="w-12 h-12 mb-3 opacity-20" />
                                    <p className="font-semibold text-slate-600 text-base">No history yet</p>
                                    <p className="text-sm">Your verified attendance records will appear here.</p>
                                </div>
                            ) : (
                                <div className="divide-y divide-slate-100">
                                    {summary.history.slice(0, 5).map((log) => (
                                        <div key={log.id} className="p-6 flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4 hover:bg-slate-50 transition-colors">
                                            <div className="flex items-start gap-4">
                                                <div className={`mt-1 w-2.5 h-2.5 rounded-full shrink-0 ${log.time_out ? 'bg-slate-300' : 'bg-emerald-500 animate-pulse shadow-[0_0_8px_rgba(16,185,129,0.6)]'}`}></div>
                                                <div>
                                                    <p className="font-bold text-slate-900 text-base mb-1">
                                                        {log.time_in ? new Date(log.time_in).toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric' }) : 'Unknown Date'}
                                                    </p>
                                                    <div className="text-sm font-medium text-slate-600 flex flex-col sm:flex-row sm:items-center gap-1 sm:gap-3">
                                                        <span className="flex items-center gap-1">
                                                            <LogIn className="w-3.5 h-3.5 text-blue-500" /> 
                                                            {log.time_in ? new Date(log.time_in).toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit' }) : '--:--'}
                                                        </span>
                                                        {log.time_out && (
                                                            <>
                                                                <span className="hidden sm:inline text-slate-300">→</span>
                                                                <span className="flex items-center gap-1">
                                                                    <LogOut className="w-3.5 h-3.5 text-slate-500" /> 
                                                                    {new Date(log.time_out).toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit' })}
                                                                </span>
                                                            </>
                                                        )}
                                                    </div>
                                                </div>
                                            </div>
                                            
                                            <div className="flex flex-col items-start sm:items-end w-full sm:w-auto pl-6 sm:pl-0">
                                                <span className="text-lg font-black text-slate-900">
                                                    {formatHours(log.computed_hours || log.rendered_hours)} <span className="text-xs text-slate-500 font-bold">hrs</span>
                                                </span>
                                                {(log.check_in_method === 'qr' || log.verification_code_used) && (
                                                    <span className="text-[10px] font-bold text-slate-400 uppercase tracking-wider mt-1">
                                                        {log.check_in_method === 'qr' ? 'Checked in with QR' : `Passcode: ${log.verification_code_used}`}
                                                    </span>
                                                )}
                                                {log.is_anomaly && (
                                                    <span className="mt-2 px-2 py-0.5 bg-red-100 text-red-700 text-[10px] font-bold uppercase tracking-wider rounded-md border border-red-200">
                                                        Anomaly Flagged
                                                    </span>
                                                )}
                                            </div>
                                        </div>
                                    ))}
                                </div>
                            )}
                        </div>
                    </div>
                </motion.div>
            </motion.div>

            <div className="bg-white rounded-3xl shadow-sm border border-slate-200 overflow-hidden">
                <div className="p-6 border-b border-slate-100 bg-slate-50/50 flex flex-col lg:flex-row lg:items-center justify-between gap-4">
                    <div className="flex items-center gap-3">
                        <CalendarRange className="w-5 h-5 text-slate-400" />
                        <div>
                            <h3 className="text-lg font-extrabold text-slate-900">Daily Time Record</h3>
                            <p className="text-xs font-medium text-slate-500">Official WSPO DTR for the selected month. View your own record only.</p>
                        </div>
                    </div>
                    <div className="flex flex-col sm:flex-row items-stretch sm:items-center gap-3">
                        <input
                            type="month"
                            value={dtrMonth}
                            onChange={(e) => setDtrMonth(e.target.value)}
                            className="px-3 py-2 bg-white border border-slate-200 rounded-xl text-sm font-bold text-slate-700 outline-none focus:ring-2 focus:ring-blue-600"
                        />
                        <button
                            type="button"
                            onClick={() => setDtrPreviewOpen(true)}
                            className="inline-flex items-center justify-center gap-2 px-4 py-2.5 bg-slate-900 hover:bg-slate-800 text-white text-sm font-bold rounded-xl shadow-sm transition-colors"
                        >
                            <Eye className="w-4 h-4" />
                            View DTR
                        </button>
                    </div>
                </div>

                <div className="overflow-x-auto">
                    <table className="w-full text-sm">
                        <thead>
                            <tr className="bg-slate-900 text-white">
                                <th className="px-4 py-3 text-left font-bold uppercase tracking-wider text-xs">Date</th>
                                <th className="px-4 py-3 text-center font-bold uppercase tracking-wider text-xs">Time In</th>
                                <th className="px-4 py-3 text-center font-bold uppercase tracking-wider text-xs">Time Out</th>
                                <th className="px-4 py-3 text-left font-bold uppercase tracking-wider text-xs">Duty</th>
                                <th className="px-4 py-3 text-center font-bold uppercase tracking-wider text-xs">Status</th>
                                <th className="px-4 py-3 text-right font-bold uppercase tracking-wider text-xs">Hours</th>
                            </tr>
                        </thead>
                        <tbody>
                            {dtrHistory.length === 0 ? (
                                <tr>
                                    <td colSpan={6} className="px-4 py-12 text-center text-slate-500 font-medium">
                                        No DTR records found for this period.
                                    </td>
                                </tr>
                            ) : (
                                dtrHistory.map((log) => (
                                    <tr key={log.id} className="border-t border-slate-100 hover:bg-slate-50">
                                        <td className="px-4 py-3 font-bold text-slate-900 whitespace-nowrap">
                                            {log.time_in ? new Date(log.time_in).toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric', year: 'numeric' }) : '—'}
                                        </td>
                                        <td className="px-4 py-3 text-center font-mono text-slate-700">
                                            {log.time_in ? new Date(log.time_in).toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' }) : '--:--'}
                                        </td>
                                        <td className="px-4 py-3 text-center font-mono text-slate-700">
                                            {log.time_out ? new Date(log.time_out).toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' }) : '--:--'}
                                        </td>
                                        <td className="px-4 py-3 text-slate-700">
                                            <div>{log.work_type || log.attendance_type || 'Regular Duty'}</div>
                                            {log.check_in_method && (
                                                <div className="mt-1 text-[10px] font-bold uppercase tracking-wider text-slate-400">
                                                    {log.check_in_method === 'qr' ? 'QR' : 'Passcode'}
                                                </div>
                                            )}
                                        </td>
                                        <td className="px-4 py-3 text-center">
                                            <span className={`inline-flex px-2 py-0.5 rounded-md text-[10px] font-bold uppercase tracking-wider ${['approved', 'accepted'].includes(String(log.status).toLowerCase()) ? 'bg-emerald-50 text-emerald-700 border border-emerald-200' : String(log.status).toLowerCase() === 'rejected' ? 'bg-red-50 text-red-700 border border-red-200' : 'bg-amber-50 text-amber-700 border border-amber-200'}`}>
                                                {['approved', 'accepted'].includes(String(log.status).toLowerCase()) ? 'Accepted' : String(log.status).toLowerCase() === 'rejected' ? 'Rejected' : (log.time_out ? 'Pending' : 'Timed in')}
                                            </span>
                                        </td>
                                        <td className="px-4 py-3 text-right font-black font-mono text-slate-900">
                                            {hoursFor(log).toFixed(2)}
                                        </td>
                                    </tr>
                                ))
                            )}
                        </tbody>
                        <tfoot>
                            <tr className="bg-slate-50 border-t border-slate-200">
                                <td colSpan={5} className="px-4 py-3 text-right font-black uppercase tracking-wider text-xs text-slate-600">Total Hours</td>
                                <td className="px-4 py-3 text-right font-black font-mono text-slate-900">{dtrTotalHours.toFixed(2)}</td>
                            </tr>
                        </tfoot>
                    </table>
                </div>
            </div>
        </div>

        {typeof document !== 'undefined' && createPortal(
            <AnimatePresence>
                {dtrPreviewOpen && (
                    <motion.div
                        initial={{ opacity: 0 }}
                        animate={{ opacity: 1 }}
                        exit={{ opacity: 0 }}
                        className="fixed inset-0 z-80 bg-slate-900/70 backdrop-blur-sm flex items-center justify-center p-4"
                        onClick={() => setDtrPreviewOpen(false)}
                    >
                        <motion.div
                            initial={{ opacity: 0, y: 16, scale: 0.98 }}
                            animate={{ opacity: 1, y: 0, scale: 1 }}
                            exit={{ opacity: 0, y: 16, scale: 0.98 }}
                            className="bg-white rounded-2xl shadow-2xl w-full max-w-4xl max-h-[92vh] flex flex-col overflow-hidden"
                            onClick={(event) => event.stopPropagation()}
                        >
                            <div className="px-5 py-4 border-b border-slate-200 flex items-center justify-between gap-3 shrink-0">
                                <div>
                                    <p className="text-sm font-black text-slate-900">Official WSPO DTR</p>
                                    <p className="text-xs font-medium text-slate-500">{fullName} · {studentProfile.student_id_number}</p>
                                </div>
                                <button
                                    type="button"
                                    onClick={() => setDtrPreviewOpen(false)}
                                    className="p-2 rounded-xl text-slate-500 hover:bg-slate-100"
                                    aria-label="Close DTR preview"
                                >
                                    <X className="w-5 h-5" />
                                </button>
                            </div>
                            <div className="overflow-y-auto bg-slate-100 p-4">
                                <div className="bg-white shadow-sm mx-auto w-fit max-w-full">
                                    <TimesheetPrintView
                                        fullName={fullName}
                                        studentProfile={studentProfile}
                                        history={dtrHistory}
                                        totalHours={dtrTotalHours}
                                        penaltyHours={dtrPenaltyHours}
                                        startDate={dtrStart}
                                        endDate={dtrEnd}
                                        holidays={dtrHolidays}
                                    />
                                </div>
                            </div>
                        </motion.div>
                    </motion.div>
                )}
            </AnimatePresence>,
            document.body
        )}
        </>
    );
};

export default StudentAttendanceTerminal;
