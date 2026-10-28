import React, { useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { motion, AnimatePresence } from 'framer-motion';
import QRCode from 'qrcode';
import { fetchAnomalyLogs, fetchLivePasscode, fetchLiveQr } from '../services/advancedAttendanceService';
import { financialService } from '../services/financialService';
import { ActivityQrCard } from './hours/ActivityQrCard';
import { AddActivityHoursDialog } from './hours/AddActivityHoursDialog';
import { CleaningGroupsDialog } from './hours/CleaningGroupsDialog';
import { 
    KeyRound, 
    QrCode,
    ShieldAlert, 
    ShieldCheck, 
    CheckCircle2, 
    AlertTriangle, 
    Clock, 
    Calendar,
    Copy,
    Activity,
    Maximize2,
    Plus,
    Users,
    X
} from 'lucide-react';

const SupervisorAttendanceHub = () => {
    const [selectedType] = useState('Daily Clock');
    const [activityEvents, setActivityEvents] = useState([]);
    const [activityEventId, setActivityEventId] = useState('');
    const [activityFormOpen, setActivityFormOpen] = useState(false);
    const [groupsOpen, setGroupsOpen] = useState(false);
    const [activityNotice, setActivityNotice] = useState('');
    const [descInput, setDescInput] = useState('');
    const [activeToken, setActiveToken] = useState(null);
    const [passcodeSeconds, setPasscodeSeconds] = useState(0);
    const [passcodeLoading, setPasscodeLoading] = useState(false);
    const [anomalies, setAnomalies] = useState([]);
    const [isLoading, setIsLoading] = useState(true);
    const [copied, setCopied] = useState(false);
    const [errorMsg, setErrorMsg] = useState('');
    const [accessMode, setAccessMode] = useState('passcode');
    const [qrSession, setQrSession] = useState(null);
    const [qrSeconds, setQrSeconds] = useState(0);
    const [qrLoading, setQrLoading] = useState(false);
    const [qrExpanded, setQrExpanded] = useState(false);
    const qrCanvasRef = useRef(null);
    const qrExpandedCanvasRef = useRef(null);
    const descRef = useRef('');
    const userRole = localStorage.getItem('user_role') || '';
    const storedOffice = localStorage.getItem('assigned_office') || 'Unassigned';
    const canIssueActivity = userRole === 'WSPO Staff' && ['WSPO Coordinator', 'WSPO Secretary', 'WSPO President', 'WSPO', 'Unassigned', ''].includes(storedOffice);
    const canManageCleaningGroups = userRole === 'WSPO Staff' && ['WSPO Coordinator', 'WSPO', ''].includes(storedOffice);
    const supervisorDepartment = userRole === 'WSPO Staff' && ['WSPO Coordinator', 'WSPO', 'Unassigned', ''].includes(storedOffice)
        ? 'WSPO'
        : storedOffice;

    const formatHours = (value) => Number(value || 0).toFixed(2);

    useEffect(() => {
        loadAnomalies();
    }, []);

    const loadActivityEvents = (preferId) => {
        const now = new Date();
        const today = new Date(now.getTime() - now.getTimezoneOffset() * 60000).toISOString().slice(0, 10);
        return financialService.getHourEvents(today, today)
            .then((res) => {
                const rows = (res.events || []).filter((event) => event.uses_attendance);
                setActivityEvents(rows);
                setActivityEventId((current) => {
                    if (preferId && rows.some((event) => String(event.id) === String(preferId))) return String(preferId);
                    if (current && rows.some((event) => String(event.id) === String(current))) return current;
                    return rows[0] ? String(rows[0].id) : '';
                });
            })
            .catch(() => setActivityEvents([]));
    };

    useEffect(() => {
        if (!canIssueActivity) return undefined;
        loadActivityEvents();
        return undefined;
    }, [canIssueActivity]);

    useEffect(() => {
        descRef.current = descInput;
    }, [descInput]);

    useEffect(() => {
        if (accessMode !== 'passcode') return undefined;

        let cancelled = false;
        let refreshTimer;

        const loadPasscode = async () => {
            setPasscodeLoading(true);
            try {
                const res = await fetchLivePasscode(selectedType, descRef.current);
                if (cancelled) return;
                setActiveToken({
                    token_code: res.data.token_code,
                    expires_at: res.data.expires_at,
                    description: res.data.description,
                });
                setCopied(false);
                setPasscodeSeconds(Number(res.data.seconds_remaining) || 0);
                setErrorMsg('');
                const waitMs = Math.max(1000, (Number(res.data.seconds_remaining) || 3) * 1000 - 400);
                refreshTimer = setTimeout(loadPasscode, waitMs);
            } catch (err) {
                if (cancelled) return;
                console.error('Failed to load live passcode', err);
                setErrorMsg(err.response?.data?.message || 'Unable to show the live passcode. Please try again.');
                refreshTimer = setTimeout(loadPasscode, 5000);
            } finally {
                if (!cancelled) setPasscodeLoading(false);
            }
        };

        loadPasscode();

        return () => {
            cancelled = true;
            clearTimeout(refreshTimer);
        };
    }, [accessMode, selectedType]);

    useEffect(() => {
        if (accessMode !== 'qr') return undefined;

        let cancelled = false;
        let refreshTimer;

        const loadQr = async () => {
            setQrLoading(true);
            try {
                const res = await fetchLiveQr(selectedType);
                if (cancelled) return;
                setQrSession(res.data);
                setQrSeconds(Number(res.data.seconds_remaining) || 0);
                setErrorMsg('');
                const waitMs = Math.max(1000, (Number(res.data.seconds_remaining) || 3) * 1000 - 400);
                refreshTimer = setTimeout(loadQr, waitMs);
            } catch (err) {
                if (cancelled) return;
                console.error('Failed to load live QR', err);
                setErrorMsg(err.response?.data?.message || 'Unable to show the live QR code. Please try again.');
                refreshTimer = setTimeout(loadQr, 5000);
            } finally {
                if (!cancelled) setQrLoading(false);
            }
        };

        loadQr();

        return () => {
            cancelled = true;
            clearTimeout(refreshTimer);
        };
    }, [accessMode, selectedType]);

    useEffect(() => {
        if (accessMode !== 'qr') setQrExpanded(false);
    }, [accessMode]);

    useEffect(() => {
        if (!qrExpanded) return undefined;
        const onKey = (event) => {
            if (event.key === 'Escape') setQrExpanded(false);
        };
        window.addEventListener('keydown', onKey);
        return () => window.removeEventListener('keydown', onKey);
    }, [qrExpanded]);

    useEffect(() => {
        if (accessMode !== 'qr' || !qrSession?.payload) return undefined;
        const draw = (canvas, width) => {
            if (!canvas) return;
            QRCode.toCanvas(canvas, qrSession.payload, {
                width,
                margin: 1,
                errorCorrectionLevel: 'M',
            }).catch((err) => {
                console.error('Failed to draw QR', err);
                setErrorMsg('Unable to draw the QR code.');
            });
        };
        draw(qrCanvasRef.current, 240);
        if (qrExpanded) {
            const size = Math.max(280, Math.min(520, window.innerWidth - 64, window.innerHeight - 220));
            draw(qrExpandedCanvasRef.current, size);
        }
        return undefined;
    }, [accessMode, qrSession?.payload, qrExpanded]);

    useEffect(() => {
        if (accessMode !== 'qr' || !qrSession) return undefined;
        const timer = setInterval(() => {
            const remaining = Math.max(0, Math.ceil((new Date(qrSession.expires_at).getTime() - Date.now()) / 1000));
            setQrSeconds(remaining);
        }, 1000);
        return () => clearInterval(timer);
    }, [accessMode, qrSession]);

    useEffect(() => {
        if (accessMode !== 'passcode' || !activeToken?.expires_at) return undefined;
        const timer = setInterval(() => {
            const remaining = Math.max(0, Math.ceil((new Date(activeToken.expires_at).getTime() - Date.now()) / 1000));
            setPasscodeSeconds(remaining);
        }, 1000);
        return () => clearInterval(timer);
    }, [accessMode, activeToken]);

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

    const formatCountdown = (seconds) => `0:${String(seconds % 60).padStart(2, '0')}`;

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
                className="flex flex-col gap-5 sm:flex-row sm:items-end sm:justify-between"
            >
                <div>
                    <div className="flex items-center gap-2 mb-2">
                        <KeyRound className="w-5 h-5 text-blue-400" />
                        <span className="text-sm font-medium text-slate-500">Security & Access</span>
                    </div>
                    <h1 className="text-3xl font-semibold tracking-tight text-slate-900 sm:text-4xl">
                        Attendance Hub
                    </h1>
                    <p className="mt-2 max-w-lg text-sm leading-relaxed text-slate-500">
                        Daily clock-in can use a passcode or a QR code. Cleaning, devotional, and assembly attendance use a passcode or QR issued by the WSPO coordinator, secretary, or president. Cleaning group leaders can also show codes for their group&apos;s daily cleaning.
                    </p>
                    <p className="mt-2 inline-flex items-center gap-2 rounded-full bg-slate-100 px-3 py-1 text-sm text-slate-600">
                        Token scope: <span className="font-semibold text-slate-900">{supervisorDepartment}</span> students only
                    </p>
                </div>

                <div className="shrink-0 rounded-2xl border border-slate-200/80 bg-white px-4 py-3 shadow-[0_1px_2px_rgba(15,23,42,0.04)] flex items-center gap-4">
                    <div className={`w-10 h-10 rounded-full flex items-center justify-center ${anomalies.length > 0 ? 'bg-rose-50 text-rose-600' : 'bg-emerald-50 text-emerald-600'}`}>
                        {anomalies.length > 0 ? <ShieldAlert className="w-5 h-5 animate-pulse" /> : <ShieldCheck className="w-5 h-5" />}
                    </div>
                    <div className="flex flex-col text-left">
                        <span className="text-[10px] font-bold text-slate-400 uppercase tracking-widest">System Integrity</span>
                        <span className={`text-sm font-semibold ${anomalies.length > 0 ? 'text-rose-600' : 'text-emerald-600'}`}>
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
                    <div className="bg-white p-6 sm:p-8 rounded-2xl border border-slate-200/80 shadow-[0_1px_2px_rgba(15,23,42,0.04)]">
                        <h3 className="text-xl font-semibold text-slate-900 mb-6 flex items-center gap-2 tracking-tight">
                            {accessMode === 'qr' ? <QrCode className="w-5 h-5 text-blue-600" /> : <KeyRound className="w-5 h-5 text-blue-600" />}
                            {accessMode === 'qr' ? 'Live QR' : 'Passcode'}
                        </h3>

                        <div className="grid grid-cols-2 gap-2 p-1 mb-6 bg-slate-100 rounded-xl">
                            <button
                                type="button"
                                onClick={() => setAccessMode('passcode')}
                                className={`py-2.5 rounded-lg text-sm font-bold transition-all ${accessMode === 'passcode' ? 'bg-white text-slate-900 shadow-sm' : 'text-slate-500 hover:text-slate-700'}`}
                            >
                                Passcode
                            </button>
                            <button
                                type="button"
                                onClick={() => setAccessMode('qr')}
                                className={`py-2.5 rounded-lg text-sm font-bold transition-all ${accessMode === 'qr' ? 'bg-white text-slate-900 shadow-sm' : 'text-slate-500 hover:text-slate-700'}`}
                            >
                                QR code
                            </button>
                        </div>
                        
                        {accessMode === 'passcode' ? (
                        <div className="space-y-5">
                            <div>
                                <label className="block text-xs font-bold text-slate-500 uppercase tracking-wider mb-2">Shift Type</label>
                                <div className="w-full p-3.5 bg-slate-50 border border-slate-200 rounded-xl text-sm font-bold text-slate-700">
                                    Daily Clock
                                </div>
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
                                <p className="mt-2 text-xs font-medium text-slate-500">
                                    Saved on the next passcode, which replaces the current one every 30 seconds.
                                </p>
                            </div>
                        </div>
                        ) : (
                        <div className="space-y-5">
                            <div>
                                <label className="block text-xs font-bold text-slate-500 uppercase tracking-wider mb-2">Shift Type</label>
                                <div className="w-full p-3.5 bg-slate-50 border border-slate-200 rounded-xl text-sm font-bold text-slate-700">
                                    Daily Clock
                                </div>
                            </div>
                            <div
                                className="flex flex-col items-center rounded-2xl border border-slate-200 bg-slate-50 p-5 select-none"
                                onContextMenu={(e) => e.preventDefault()}
                                onCopy={(e) => e.preventDefault()}
                                onCut={(e) => e.preventDefault()}
                                onDragStart={(e) => e.preventDefault()}
                                style={{ WebkitTouchCallout: 'none', WebkitUserSelect: 'none' }}
                            >
                                <div className="relative rounded-xl bg-white">
                                    <canvas
                                        ref={qrCanvasRef}
                                        draggable={false}
                                        aria-label="Live attendance QR code"
                                        className="pointer-events-none rounded-xl select-none"
                                    />
                                    <div
                                        className="absolute inset-0"
                                        aria-hidden="true"
                                        onContextMenu={(e) => e.preventDefault()}
                                    />
                                </div>
                                <p className="mt-4 text-sm font-semibold text-slate-900">
                                    {qrLoading && !qrSession ? 'Preparing QR…' : `Refreshes in ${formatCountdown(qrSeconds)}`}
                                </p>
                                <p className="mt-2 text-center text-xs font-medium text-slate-500">
                                    Students scan this on the screen. It cannot be saved, copied, or downloaded, and a photo stops working when it refreshes.
                                </p>
                                <button
                                    type="button"
                                    onClick={() => setQrExpanded(true)}
                                    disabled={!qrSession?.payload}
                                    className="mt-4 inline-flex items-center justify-center gap-2 w-full py-3 bg-white border border-slate-200 hover:border-blue-300 hover:text-blue-700 text-slate-800 text-sm font-bold rounded-xl transition-colors disabled:opacity-50"
                                >
                                    <Maximize2 className="w-4 h-4" />
                                    Expand QR
                                </button>
                            </div>
                        </div>
                        )}
                    </div>

                    {/* ACTIVE TOKEN DISPLAY */}
                    <AnimatePresence>
                        {accessMode === 'passcode' && (activeToken || passcodeLoading) && (
                            <motion.div 
                                initial={{ opacity: 0, scale: 0.95, y: 10 }}
                                animate={{ opacity: 1, scale: 1, y: 0 }}
                                className="rounded-2xl border border-slate-200/80 bg-white p-6 shadow-[0_1px_2px_rgba(15,23,42,0.04)]"
                            >
                                <h4 className="mb-3 text-sm font-medium text-slate-500">Active verification code</h4>
                                <div className="flex items-center justify-between rounded-xl border border-slate-200 bg-slate-50 p-4">
                                    <span className="text-3xl font-semibold tracking-widest font-mono text-slate-900 select-all">
                                        {passcodeLoading && !activeToken ? '······' : activeToken?.token_code}
                                    </span>
                                    <button 
                                        onClick={copyToClipboard}
                                        className="rounded-xl border border-slate-200 bg-white p-3 text-slate-500 transition-colors hover:text-blue-600"
                                        title="Copy to clipboard"
                                    >
                                        {copied ? <CheckCircle2 className="w-5 h-5 text-emerald-600" /> : <Copy className="w-5 h-5" />}
                                    </button>
                                </div>
                                <p className="mt-4 text-center text-sm font-semibold tabular-nums text-slate-900">
                                    {passcodeLoading && !activeToken ? 'Preparing passcode…' : `Refreshes in ${formatCountdown(passcodeSeconds)}`}
                                </p>
                                <p className="mt-2 text-center text-xs text-slate-500">
                                    A new passcode replaces this one every 30 seconds. Students must use the code on screen.
                                </p>
                            </motion.div>
                        )}
                    </AnimatePresence>
                </motion.div>

                {canIssueActivity && (
                    <section className="lg:col-span-2 bg-white rounded-2xl border border-slate-200/80 shadow-[0_1px_2px_rgba(15,23,42,0.04)] p-6 sm:p-8 space-y-4">
                        <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
                            <div>
                                <h2 className="text-xl font-semibold text-slate-900 flex items-center gap-2">
                                    <QrCode className="w-5 h-5 text-blue-600" />
                                    Activity access
                                </h2>
                                <p className="mt-1 text-sm text-slate-500">
                                    Create daily cleaning, general cleaning, a devotional, an assembly, or a special request here, then show today&apos;s passcode or QR. Cleaning group leaders can show codes for their own daily cleaning from Attendance / DTR.
                                </p>
                            </div>
                            <div className="flex flex-wrap gap-2 shrink-0">
                                {canManageCleaningGroups && (
                                    <button
                                        type="button"
                                        onClick={() => setGroupsOpen(true)}
                                        className="px-4 py-2.5 bg-white border border-slate-200 hover:border-blue-300 text-slate-800 text-sm font-bold rounded-xl inline-flex items-center gap-2"
                                    >
                                        <Users className="w-4 h-4" /> Cleaning groups
                                    </button>
                                )}
                                <button
                                    type="button"
                                    onClick={() => {
                                        setActivityNotice('');
                                        setActivityFormOpen(true);
                                    }}
                                    className="px-4 py-2.5 bg-blue-600 hover:bg-blue-500 text-white text-sm font-bold rounded-xl inline-flex items-center gap-2"
                                >
                                    <Plus className="w-4 h-4" /> Add activity
                                </button>
                            </div>
                        </div>
                        {activityNotice && (
                            <div className="bg-blue-50 border border-blue-200 text-blue-800 text-sm font-semibold rounded-2xl px-5 py-3">{activityNotice}</div>
                        )}
                        {activityEvents.length === 0 ? (
                            <p className="text-sm text-slate-500">No activity attendance is scheduled for today.</p>
                        ) : (
                            <div className="space-y-4">
                                <label className="block text-xs font-bold uppercase tracking-wide text-slate-500">
                                    Today&apos;s activity
                                    <select
                                        value={activityEventId}
                                        onChange={(event) => setActivityEventId(event.target.value)}
                                        className="mt-1 w-full p-3 bg-slate-50 border border-slate-200 rounded-xl text-sm font-bold text-slate-800"
                                    >
                                        {activityEvents.map((event) => (
                                            <option key={event.id} value={event.id}>
                                                {event.title} · {event.hours} hrs
                                            </option>
                                        ))}
                                    </select>
                                </label>
                                {activityEventId && <ActivityQrCard eventId={Number(activityEventId)} />}
                            </div>
                        )}
                    </section>
                )}

                {groupsOpen && <CleaningGroupsDialog onClose={() => setGroupsOpen(false)} />}

                {activityFormOpen && (
                    <AddActivityHoursDialog
                        onClose={() => setActivityFormOpen(false)}
                        onSaved={(event) => {
                            setActivityFormOpen(false);
                            const now = new Date();
                            const today = new Date(now.getTime() - now.getTimezoneOffset() * 60000).toISOString().slice(0, 10);
                            const showsToday = event?.uses_attendance && event?.event_date === today;
                            setActivityNotice(showsToday
                                ? 'Activity saved. Its passcode and QR are ready below.'
                                : 'Activity saved. It appears in Hours Rendered. Today’s access list updates when the activity date is today.');
                            loadActivityEvents(showsToday ? event.id : undefined);
                        }}
                    />
                )}

                {/* RIGHT COLUMN: ANOMALY RADAR */}
                <div className={canIssueActivity ? 'lg:col-span-3' : 'lg:col-span-2'}>
                    <div className="bg-white rounded-2xl border border-slate-200/80 shadow-[0_1px_2px_rgba(15,23,42,0.04)] overflow-hidden flex flex-col min-h-[500px]">
                        <div className="p-6 border-b border-slate-100 flex justify-between items-center bg-slate-50/50">
                            <h3 className="text-lg font-semibold text-slate-900 flex items-center gap-2 tracking-tight">
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
                                    <p className="text-lg font-semibold text-slate-700">No Anomalies Detected</p>
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
                                                    {(item.account_deleted || item.user?.deleted_at) && (
                                                        <span className="mt-1 inline-flex px-2 py-0.5 rounded-md text-[10px] font-bold uppercase tracking-wider bg-slate-100 text-slate-600 border border-slate-200">
                                                            Account deleted
                                                        </span>
                                                    )}
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
                                                <span className="text-lg bg-red-100 text-red-800 font-semibold px-3 py-1 rounded-lg shrink-0 border border-red-200 shadow-sm">
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

            {qrExpanded && createPortal(
                <div
                    className="fixed inset-0 z-[80] bg-slate-950/80 flex items-center justify-center p-4 select-none"
                    onClick={() => setQrExpanded(false)}
                    onContextMenu={(e) => e.preventDefault()}
                    onCopy={(e) => e.preventDefault()}
                    onCut={(e) => e.preventDefault()}
                    onDragStart={(e) => e.preventDefault()}
                    style={{ WebkitTouchCallout: 'none', WebkitUserSelect: 'none' }}
                    role="dialog"
                    aria-modal="true"
                    aria-label="Expanded attendance QR code"
                >
                    <div
                        className="bg-white rounded-3xl p-6 sm:p-8 shadow-2xl max-w-full flex flex-col items-center"
                        onClick={(e) => e.stopPropagation()}
                    >
                        <div className="w-full flex items-center justify-between gap-4 mb-5">
                            <div>
                                <p className="text-xs font-bold text-blue-600 uppercase tracking-widest">Live QR</p>
                                <p className="text-lg font-semibold text-slate-900">{selectedType}</p>
                            </div>
                            <button
                                type="button"
                                onClick={() => setQrExpanded(false)}
                                className="p-2.5 rounded-xl bg-slate-100 hover:bg-slate-200 text-slate-700"
                                aria-label="Close expanded QR"
                            >
                                <X className="w-5 h-5" />
                            </button>
                        </div>
                        <p className="mb-5 text-center text-2xl font-semibold text-slate-900">Scan this QR code for attendance.</p>
                        <div className="relative rounded-2xl bg-white">
                            <canvas
                                ref={qrExpandedCanvasRef}
                                draggable={false}
                                aria-label="Expanded live attendance QR code"
                                className="pointer-events-none rounded-2xl select-none max-w-full"
                            />
                            <div className="absolute inset-0" aria-hidden="true" onContextMenu={(e) => e.preventDefault()} />
                        </div>
                        <p className="mt-5 text-2xl font-semibold text-slate-900 tabular-nums">
                            {`Refreshes in ${formatCountdown(qrSeconds)}`}
                        </p>
                        <p className="mt-2 text-center text-sm font-medium text-slate-500 max-w-sm">
                            Hold this up for students to scan. It still cannot be saved or copied.
                        </p>
                    </div>
                </div>,
                document.body
            )}
        </div>
    );
};

export default SupervisorAttendanceHub;
