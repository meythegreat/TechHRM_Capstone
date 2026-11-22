import React, { useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { motion, AnimatePresence } from 'framer-motion';
import QRCode from 'qrcode';
import {
    fetchAnomalyLogs,
    fetchLivePasscode,
    fetchLiveQr,
} from '../services/advancedAttendanceService';
import { financialService } from '../services/financialService';
import { ActivityQrCard } from './hours/ActivityQrCard';
import { ActivityAttendanceChecker } from './hours/ActivityAttendanceChecker';
import { AddActivityHoursDialog } from './hours/AddActivityHoursDialog';
import { CleaningGroupsDialog } from './hours/CleaningGroupsDialog';
import { JanitorialGroupsDialog } from './hours/JanitorialGroupsDialog';
import { AssemblyYearRepsDialog } from './hours/AssemblyYearRepsDialog';
import {
    canCheckActivityAttendance,
    canIssueDailyAttendance,
    canManageActivityGroups,
    canManageJanitorialGroups,
    mustClockAsStudent,
} from '../utils/wspoActivityAccess';
import StudentAttendanceTerminal from './StudentAttendanceTerminal';
import ClassClockInRequestsPanel from './ClassClockInRequestsPanel';
import { HelpDisclosure } from './HelpDisclosure';
import CoverageHoldNotice from './CoverageHoldNotice';
import { secretaryCoverageLocked } from '../utils/coverageHold';
import FeatureSection from './FeatureSection';
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
    Check,
    Activity,
    Maximize2,
    Plus,
    Users,
    X,
    RefreshCw,
    Building2,
    Brush,
    AlertCircle,
} from 'lucide-react';

const SupervisorAttendanceHub = () => {
    const [selectedType] = useState('Daily Clock');
    const [activityEvents, setActivityEvents] = useState([]);
    const [activityEventId, setActivityEventId] = useState('');
    const [activityFormOpen, setActivityFormOpen] = useState(false);
    const [groupsOpen, setGroupsOpen] = useState(false);
    const [janitorialGroupsOpen, setJanitorialGroupsOpen] = useState(false);
    const [assemblyRepsOpen, setAssemblyRepsOpen] = useState(false);
    const [activityNotice, setActivityNotice] = useState('');
    const [descInput, setDescInput] = useState('');
    const [activeToken, setActiveToken] = useState(null);
    const [passcodeSeconds, setPasscodeSeconds] = useState(0);
    const [passcodeLoading, setPasscodeLoading] = useState(false);
    const [anomalies, setAnomalies] = useState([]);
    const [isLoading, setIsLoading] = useState(!secretaryCoverageLocked());
    const [coverageHold, setCoverageHold] = useState(secretaryCoverageLocked);
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
    const canIssueActivity = canCheckActivityAttendance(userRole, storedOffice);
    const canManageCleaningGroups = canManageActivityGroups(userRole, storedOffice);
    const canIssueDaily = canIssueDailyAttendance();
    const clocksAsStudent = mustClockAsStudent();
    const canManageJanitorialGroupsFlag = canManageJanitorialGroups(userRole, storedOffice);
    const supervisorDepartment = canIssueDaily
        ? storedOffice
        : canIssueActivity
          ? 'Activities'
          : storedOffice;
    const [tokenScope, setTokenScope] = useState(supervisorDepartment);

    const formatHours = (value) => Number(value || 0).toFixed(2);

    useEffect(() => {
        loadAnomalies();
    }, []);

    const loadActivityEvents = (preferId) => {
        const now = new Date();
        const today = new Date(now.getTime() - now.getTimezoneOffset() * 60000)
            .toISOString()
            .slice(0, 10);
        return financialService
            .getHourEvents(today, today)
            .then((res) => {
                const rows = (res.events || []).filter((event) => event.uses_attendance);
                setActivityEvents(rows);
                setActivityEventId((current) => {
                    if (preferId && rows.some((event) => String(event.id) === String(preferId)))
                        return String(preferId);
                    if (current && rows.some((event) => String(event.id) === String(current)))
                        return current;
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
        if (!canIssueDaily || accessMode !== 'passcode') return undefined;

        let cancelled = false;
        let refreshTimer;

        const loadPasscode = async () => {
            if (secretaryCoverageLocked()) {
                setCoverageHold(true);
                setPasscodeLoading(false);
                return;
            }
            setPasscodeLoading(true);
            try {
                const res = await fetchLivePasscode(selectedType, descRef.current);
                if (cancelled) return;
                setActiveToken({
                    token_code: res.data.token_code,
                    expires_at: res.data.expires_at,
                    description: res.data.description,
                });
                if (res.data.department) setTokenScope(res.data.department);
                setCopied(false);
                setPasscodeSeconds(Number(res.data.seconds_remaining) || 0);
                setErrorMsg('');
                const waitMs = Math.max(
                    1000,
                    (Number(res.data.seconds_remaining) || 3) * 1000 - 400
                );
                refreshTimer = setTimeout(loadPasscode, waitMs);
            } catch (err) {
                if (cancelled) return;
                if (secretaryCoverageLocked()) {
                    setCoverageHold(true);
                    return;
                }
                console.error('Failed to load live passcode', err);
                setErrorMsg(
                    err.response?.data?.message ||
                        'Unable to show the live passcode. Please try again.'
                );
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
        if (!canIssueDaily || accessMode !== 'qr') return undefined;

        let cancelled = false;
        let refreshTimer;

        const loadQr = async () => {
            if (secretaryCoverageLocked()) {
                setCoverageHold(true);
                setQrLoading(false);
                return;
            }
            setQrLoading(true);
            try {
                const res = await fetchLiveQr(selectedType);
                if (cancelled) return;
                setQrSession(res.data);
                setQrSeconds(Number(res.data.seconds_remaining) || 0);
                if (res.data.department) setTokenScope(res.data.department);
                setErrorMsg('');
                const waitMs = Math.max(
                    1000,
                    (Number(res.data.seconds_remaining) || 3) * 1000 - 400
                );
                refreshTimer = setTimeout(loadQr, waitMs);
            } catch (err) {
                if (cancelled) return;
                if (secretaryCoverageLocked()) {
                    setCoverageHold(true);
                    return;
                }
                console.error('Failed to load live QR', err);
                setErrorMsg(
                    err.response?.data?.message ||
                        'Unable to show the live QR code. Please try again.'
                );
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
            const size = Math.max(
                280,
                Math.min(520, window.innerWidth - 64, window.innerHeight - 240)
            );
            draw(qrExpandedCanvasRef.current, size);
        }
        return undefined;
    }, [accessMode, qrSession?.payload, qrExpanded]);

    useEffect(() => {
        if (accessMode !== 'qr' || !qrSession) return undefined;
        const timer = setInterval(() => {
            const remaining = Math.max(
                0,
                Math.ceil((new Date(qrSession.expires_at).getTime() - Date.now()) / 1000)
            );
            setQrSeconds(remaining);
        }, 1000);
        return () => clearInterval(timer);
    }, [accessMode, qrSession]);

    useEffect(() => {
        if (accessMode !== 'passcode' || !activeToken?.expires_at) return undefined;
        const timer = setInterval(() => {
            const remaining = Math.max(
                0,
                Math.ceil((new Date(activeToken.expires_at).getTime() - Date.now()) / 1000)
            );
            setPasscodeSeconds(remaining);
        }, 1000);
        return () => clearInterval(timer);
    }, [accessMode, activeToken]);

    const loadAnomalies = async () => {
        if (secretaryCoverageLocked()) {
            setCoverageHold(true);
            setIsLoading(false);
            return;
        }
        setIsLoading(true);
        setErrorMsg('');
        try {
            const res = await fetchAnomalyLogs();
            setAnomalies(res.data || []);
        } catch (err) {
            if (secretaryCoverageLocked()) {
                setCoverageHold(true);
                return;
            }
            console.error('Failed to load anomalies', err);
            setErrorMsg(
                err.response?.data?.message ||
                    'Unable to load attendance anomalies. Please refresh and try again.'
            );
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

    const containerVariants = {
        hidden: { opacity: 0 },
        show: { opacity: 1, transition: { staggerChildren: 0.08 } },
    };

    const itemVariants = {
        hidden: { opacity: 0, y: 14 },
        show: {
            opacity: 1,
            y: 0,
            transition: { duration: 0.36, ease: [0.22, 1, 0.36, 1] },
        },
    };

    if (coverageHold) {
        return <CoverageHoldNotice />;
    }

    if (isLoading) {
        return (
            <div
                className="mx-auto max-w-7xl space-y-6 p-4 animate-pulse sm:p-8"
                aria-busy="true"
                aria-label="Loading security hub"
            >
                <div className="h-44 rounded-[2rem] bg-slate-900/90" />
                <div className="grid grid-cols-1 gap-6 lg:grid-cols-3">
                    <div className="h-96 rounded-[1.75rem] bg-slate-200/80 lg:col-span-1" />
                    <div className="h-96 rounded-[1.75rem] bg-slate-200/80 lg:col-span-2" />
                </div>
            </div>
        );
    }

    const hasAnomalies = anomalies.length > 0;

    return (
        <div className="mx-auto max-w-7xl space-y-6 p-4 font-sans sm:p-8">
            {/* OBSIDIAN SECURITY COMMAND HERO */}
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
                    className={`pointer-events-none absolute -right-20 -top-20 h-72 w-72 rounded-full blur-3xl ${
                        hasAnomalies ? 'bg-rose-500/25' : 'bg-blue-600/25'
                    }`}
                    aria-hidden="true"
                />
                <div
                    className="pointer-events-none absolute -bottom-24 left-1/4 h-64 w-64 rounded-full bg-emerald-500/15 blur-3xl"
                    aria-hidden="true"
                />

                <div className="relative z-10 flex flex-col gap-6 lg:flex-row lg:items-end lg:justify-between">
                    <div className="min-w-0 max-w-2xl">
                        <div className="flex flex-wrap items-center gap-2.5">
                            <span className="inline-flex items-center gap-1.5 rounded-full border border-blue-400/25 bg-blue-500/15 px-3 py-1 text-[11px] font-bold uppercase tracking-widest text-blue-300">
                                <KeyRound className="h-3.5 w-3.5 text-blue-400" />
                                Security &amp; Access
                            </span>
                            {canIssueDaily && (
                                <span className="inline-flex items-center gap-1.5 rounded-full border border-white/10 bg-white/5 px-3 py-1 text-[11px] font-bold text-slate-200">
                                    <Building2 className="h-3.5 w-3.5 text-indigo-300" />
                                    Scope: {tokenScope}
                                </span>
                            )}
                        </div>

                        <h1 className="mt-3.5 text-3xl font-black tracking-tight text-white sm:text-4xl">
                            Attendance Hub
                        </h1>
                        <p className="mt-2 text-sm font-medium leading-relaxed text-slate-300">
                            {canIssueDaily
                                ? 'Generate rotating passcodes or live QR codes for daily duty and manage campus activity attendance.'
                                : 'Manage campus group activities and verify student activity attendance.'}
                        </p>
                    </div>

                    <div className="flex shrink-0 flex-col items-stretch gap-3 sm:flex-row sm:items-center">
                        {canManageCleaningGroups && (
                            <button
                                type="button"
                                onClick={() => setAssemblyRepsOpen(true)}
                                className="inline-flex items-center justify-center gap-2 rounded-2xl border border-white/15 bg-white/10 px-4 py-3.5 text-xs font-bold text-white backdrop-blur-md transition hover:bg-white/20"
                            >
                                <Users className="h-4 w-4 text-blue-300" />
                                Assembly Reps
                            </button>
                        )}

                        <div className="flex items-center gap-3.5 rounded-2xl border border-white/10 bg-white/[0.06] px-5 py-3.5 backdrop-blur-xl">
                            <div
                                className={`flex h-11 w-11 shrink-0 items-center justify-center rounded-xl ring-1 ${
                                    hasAnomalies
                                        ? 'bg-rose-500/20 text-rose-300 ring-rose-400/30'
                                        : 'bg-emerald-500/20 text-emerald-300 ring-emerald-400/30'
                                }`}
                            >
                                {hasAnomalies ? (
                                    <ShieldAlert className="h-5 w-5 animate-pulse" />
                                ) : (
                                    <ShieldCheck className="h-5 w-5" />
                                )}
                            </div>
                            <div>
                                <p className="text-[10px] font-extrabold uppercase tracking-widest text-slate-400">
                                    System Integrity
                                </p>
                                <p
                                    className={`mt-0.5 text-sm font-black ${
                                        hasAnomalies ? 'text-rose-300' : 'text-emerald-300'
                                    }`}
                                >
                                    {hasAnomalies
                                        ? `${anomalies.length} Anomalies Found`
                                        : 'All Clear'}
                                </p>
                            </div>
                        </div>
                    </div>
                </div>
            </motion.header>

            {errorMsg && (
                <div
                    role="alert"
                    className="flex items-center gap-2.5 rounded-2xl border border-rose-200 bg-rose-50 px-5 py-3.5 text-sm font-bold text-rose-800 shadow-xs"
                >
                    <AlertCircle className="h-4 w-4 shrink-0 text-rose-600" />
                    <span>{errorMsg}</span>
                </div>
            )}

            {/* MAIN SECURITY GRID */}
            <div
                className={`grid grid-cols-1 items-start gap-6 ${
                    canIssueDaily ? 'lg:grid-cols-3' : ''
                }`}
            >
                {/* LEFT COLUMN: TOKEN / QR GENERATOR */}
                {canIssueDaily && (
                    <motion.div
                        initial={{ opacity: 0, x: -16 }}
                        animate={{ opacity: 1, x: 0 }}
                        transition={{ delay: 0.08 }}
                        className="space-y-5 lg:col-span-1"
                    >
                        <section className="rounded-[1.75rem] border border-slate-200/90 bg-white p-6 shadow-sm sm:p-7">
                            <div className="mb-5 flex items-center justify-between gap-2">
                                <h3 className="flex items-center gap-2.5 text-base font-black tracking-tight text-slate-900">
                                    <span className="flex h-9 w-9 items-center justify-center rounded-xl bg-slate-900 text-white">
                                        {accessMode === 'qr' ? (
                                            <QrCode className="h-4 w-4" />
                                        ) : (
                                            <KeyRound className="h-4 w-4" />
                                        )}
                                    </span>
                                    {accessMode === 'qr' ? 'Live QR' : 'Rotating Passcode'}
                                </h3>
                                <span className="inline-flex items-center gap-1.5 rounded-full border border-slate-200 bg-slate-50 px-2.5 py-1 text-[11px] font-extrabold tabular-nums text-slate-700">
                                    <RefreshCw className="h-3 w-3 text-blue-600" />
                                    {accessMode === 'qr'
                                        ? qrSession
                                            ? formatCountdown(qrSeconds)
                                            : '--:--'
                                        : activeToken
                                          ? formatCountdown(passcodeSeconds)
                                          : '--:--'}
                                </span>
                            </div>

                            <div className="mb-5 grid grid-cols-2 gap-1.5 rounded-xl border border-slate-200/80 bg-slate-50 p-1">
                                <button
                                    type="button"
                                    onClick={() => setAccessMode('passcode')}
                                    className={`rounded-lg py-2 text-xs font-bold transition-all ${
                                        accessMode === 'passcode'
                                            ? 'bg-slate-900 text-white shadow-xs'
                                            : 'text-slate-500 hover:text-slate-900'
                                    }`}
                                >
                                    Passcode
                                </button>
                                <button
                                    type="button"
                                    onClick={() => setAccessMode('qr')}
                                    className={`rounded-lg py-2 text-xs font-bold transition-all ${
                                        accessMode === 'qr'
                                            ? 'bg-slate-900 text-white shadow-xs'
                                            : 'text-slate-500 hover:text-slate-900'
                                    }`}
                                >
                                    QR Code
                                </button>
                            </div>

                            {accessMode === 'passcode' ? (
                                <div className="space-y-4">
                                    <div>
                                        <label className="mb-1.5 block text-[10px] font-extrabold uppercase tracking-widest text-slate-400">
                                            Shift Type
                                        </label>
                                        <div className="w-full rounded-xl border border-slate-200 bg-slate-50 px-3.5 py-2.5 text-sm font-bold text-slate-700">
                                            Daily Clock
                                        </div>
                                    </div>

                                    <div>
                                        <label className="mb-1.5 block text-[10px] font-extrabold uppercase tracking-widest text-slate-400">
                                            Remarks / Location
                                        </label>
                                        <input
                                            type="text"
                                            value={descInput}
                                            onChange={(e) => setDescInput(e.target.value)}
                                            placeholder="e.g. CCS Lab 1 Maintenance"
                                            className="w-full rounded-xl border border-slate-200 bg-slate-50 px-3.5 py-2.5 text-sm font-semibold text-slate-900 outline-none transition placeholder:text-slate-400 focus:border-blue-600 focus:bg-white focus:ring-2 focus:ring-blue-600/20"
                                        />
                                        <p className="mt-2 text-[11px] font-medium text-slate-500">
                                            Applies to the next 30-second passcode.
                                        </p>
                                    </div>
                                </div>
                            ) : (
                                <div className="space-y-4">
                                    <div>
                                        <label className="mb-1.5 block text-[10px] font-extrabold uppercase tracking-widest text-slate-400">
                                            Shift Type
                                        </label>
                                        <div className="w-full rounded-xl border border-slate-200 bg-slate-50 px-3.5 py-2.5 text-sm font-bold text-slate-700">
                                            Daily Clock
                                        </div>
                                    </div>

                                    <div
                                        className="flex flex-col items-center rounded-2xl border border-slate-200 bg-slate-50/70 p-5 select-none"
                                        onContextMenu={(e) => e.preventDefault()}
                                        onCopy={(e) => e.preventDefault()}
                                        onCut={(e) => e.preventDefault()}
                                        onDragStart={(e) => e.preventDefault()}
                                        style={{
                                            WebkitTouchCallout: 'none',
                                            WebkitUserSelect: 'none',
                                        }}
                                    >
                                        <div className="relative rounded-2xl border-2 border-slate-100 bg-white p-2.5 shadow-sm">
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
                                        <p className="mt-4 font-mono text-sm font-black text-slate-900">
                                            {qrLoading && !qrSession
                                                ? 'Preparing QR…'
                                                : `Refreshes in ${formatCountdown(qrSeconds)}`}
                                        </p>
                                        <p className="mt-1.5 text-center text-[11px] font-medium leading-relaxed text-slate-500">
                                            Screen-only scan — expires automatically on refresh.
                                        </p>
                                        <button
                                            type="button"
                                            onClick={() => setQrExpanded(true)}
                                            disabled={!qrSession?.payload}
                                            className="mt-4 inline-flex w-full items-center justify-center gap-2 rounded-xl bg-slate-900 py-3 text-xs font-bold text-white shadow-sm transition hover:bg-blue-600 disabled:opacity-50"
                                        >
                                            <Maximize2 className="h-4 w-4" />
                                            Expand QR Fullscreen
                                        </button>
                                    </div>
                                </div>
                            )}
                        </section>

                        {/* ACTIVE PASSCODE TERMINAL DISPLAY */}
                        <AnimatePresence>
                            {accessMode === 'passcode' && (activeToken || passcodeLoading) && (
                                <motion.section
                                    initial={{ opacity: 0, scale: 0.97, y: 10 }}
                                    animate={{ opacity: 1, scale: 1, y: 0 }}
                                    className="rounded-[1.75rem] border border-slate-200/90 bg-white p-6 shadow-sm"
                                >
                                    <p className="mb-3 text-[10px] font-extrabold uppercase tracking-widest text-slate-400">
                                        Active Verification Code
                                    </p>
                                    <div className="flex items-center justify-between gap-3 rounded-2xl border border-slate-800 bg-slate-950 p-4 text-white shadow-inner">
                                        <span className="select-all font-mono text-3xl font-black tracking-[0.2em] text-white">
                                            {passcodeLoading && !activeToken
                                                ? '······'
                                                : activeToken?.token_code}
                                        </span>
                                        <button
                                            onClick={copyToClipboard}
                                            className={`inline-flex shrink-0 items-center gap-1.5 rounded-xl px-3 py-2.5 text-xs font-bold transition ${
                                                copied
                                                    ? 'bg-emerald-500 text-white'
                                                    : 'border border-white/15 bg-white/10 text-white hover:bg-white/20'
                                            }`}
                                            title="Copy to clipboard"
                                        >
                                            {copied ? (
                                                <>
                                                    <Check className="h-4 w-4" />
                                                    Copied
                                                </>
                                            ) : (
                                                <>
                                                    <Copy className="h-4 w-4" />
                                                    Copy
                                                </>
                                            )}
                                        </button>
                                    </div>
                                    <p className="mt-4 text-center font-mono text-xs font-bold tabular-nums text-slate-800">
                                        {passcodeLoading && !activeToken
                                            ? 'Preparing passcode…'
                                            : `Refreshes in ${formatCountdown(passcodeSeconds)}`}
                                    </p>
                                    <p className="mt-1.5 text-center text-[11px] font-medium text-slate-500">
                                        Rotates every 30 seconds — use the code on screen.
                                    </p>
                                </motion.section>
                            )}
                        </AnimatePresence>
                    </motion.div>
                )}

                {/* ACTIVITY QR CONSOLE */}
                {canIssueActivity && (
                    <section
                        className={`${
                            canIssueDaily ? 'lg:col-span-2' : ''
                        } overflow-hidden rounded-[1.75rem] border border-slate-200/90 bg-white shadow-sm`}
                    >
                        <div className="flex flex-col justify-between gap-4 border-b border-slate-100 bg-slate-50/70 px-6 py-5 sm:flex-row sm:items-center">
                            <div className="flex items-center gap-3">
                                <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-2xl bg-slate-900 text-white shadow-sm">
                                    <QrCode className="h-5 w-5" />
                                </span>
                                <div>
                                    <h2 className="text-base font-black tracking-tight text-slate-900">
                                        Activity QR
                                    </h2>
                                    <p className="text-xs font-medium text-slate-500">
                                        Create an activity for a group, then show today&apos;s QR and passcode.
                                    </p>
                                </div>
                            </div>

                            <div className="flex shrink-0 flex-wrap gap-2">
                                {canManageCleaningGroups && (
                                    <button
                                        type="button"
                                        onClick={() => setGroupsOpen(true)}
                                        className="inline-flex items-center gap-1.5 rounded-xl border border-slate-200 bg-white px-3.5 py-2 text-xs font-bold text-slate-700 transition hover:border-blue-300 hover:bg-blue-50 hover:text-blue-700"
                                    >
                                        <Users className="h-3.5 w-3.5" />
                                        Groups
                                    </button>
                                )}
                                {canManageJanitorialGroupsFlag && (
                                    <button
                                        type="button"
                                        onClick={() => setJanitorialGroupsOpen(true)}
                                        className="inline-flex items-center gap-1.5 rounded-xl border border-slate-200 bg-white px-3.5 py-2 text-xs font-bold text-slate-700 transition hover:border-emerald-300 hover:bg-emerald-50 hover:text-emerald-700"
                                    >
                                        <Brush className="h-3.5 w-3.5" />
                                        Janitorial
                                    </button>
                                )}
                                <button
                                    type="button"
                                    onClick={() => {
                                        setActivityNotice('');
                                        setActivityFormOpen(true);
                                    }}
                                    className="inline-flex items-center gap-1.5 rounded-xl bg-blue-600 px-3.5 py-2 text-xs font-extrabold text-white shadow-sm transition hover:bg-blue-500"
                                >
                                    <Plus className="h-3.5 w-3.5" />
                                    Add Activity
                                </button>
                            </div>
                        </div>

                        <div className="space-y-5 p-6">
                            {activityNotice && (
                                <div className="flex items-center justify-between gap-3 rounded-2xl border border-blue-200 bg-blue-50 px-4 py-3 text-xs font-bold text-blue-900">
                                    <span>{activityNotice}</span>
                                    <button
                                        type="button"
                                        onClick={() => setActivityNotice('')}
                                        className="rounded-lg p-1 text-blue-600 hover:bg-blue-100"
                                        aria-label="Dismiss notice"
                                    >
                                        <X className="h-3.5 w-3.5" />
                                    </button>
                                </div>
                            )}

                            {activityEvents.length === 0 ? (
                                <div className="rounded-2xl border border-dashed border-slate-200 bg-slate-50/70 px-6 py-10 text-center">
                                    <p className="text-sm font-extrabold text-slate-700">
                                        No activity attendance is scheduled for today
                                    </p>
                                    <p className="mt-1 text-xs font-medium text-slate-400">
                                        Add an activity above to generate a live QR code and passcode.
                                    </p>
                                </div>
                            ) : (
                                <div className="space-y-5">
                                    <label className="block">
                                        <span className="mb-1.5 block text-[10px] font-extrabold uppercase tracking-widest text-slate-400">
                                            Today&apos;s Activity
                                        </span>
                                        <select
                                            value={activityEventId}
                                            onChange={(event) =>
                                                setActivityEventId(event.target.value)
                                            }
                                            className="w-full rounded-xl border border-slate-200 bg-slate-50 px-3.5 py-2.5 text-sm font-bold text-slate-900 outline-none focus:border-blue-600 focus:bg-white focus:ring-2 focus:ring-blue-600/20"
                                        >
                                            {activityEvents.map((event) => (
                                                <option key={event.id} value={event.id}>
                                                    {event.title}
                                                    {event.group_name
                                                        ? ` · ${event.group_name}`
                                                        : ''}
                                                    {event.year_label
                                                        ? ` · ${event.year_label}`
                                                        : ''}{' '}
                                                    · {event.hours} hrs
                                                </option>
                                            ))}
                                        </select>
                                    </label>
                                    {activityEventId && (
                                        <div className="space-y-4">
                                            <ActivityQrCard eventId={Number(activityEventId)} />
                                            <ActivityAttendanceChecker
                                                eventId={Number(activityEventId)}
                                                eventDate={
                                                    activityEvents.find(
                                                        (event) =>
                                                            String(event.id) ===
                                                            String(activityEventId)
                                                    )?.event_date
                                                }
                                                onChanged={() =>
                                                    loadActivityEvents(Number(activityEventId))
                                                }
                                            />
                                        </div>
                                    )}
                                </div>
                            )}
                        </div>
                    </section>
                )}

                {groupsOpen && <CleaningGroupsDialog onClose={() => setGroupsOpen(false)} />}
                {janitorialGroupsOpen && (
                    <JanitorialGroupsDialog onClose={() => setJanitorialGroupsOpen(false)} />
                )}
                {assemblyRepsOpen && (
                    <AssemblyYearRepsDialog onClose={() => setAssemblyRepsOpen(false)} />
                )}

                {activityFormOpen && (
                    <AddActivityHoursDialog
                        onClose={() => setActivityFormOpen(false)}
                        onSaved={(event) => {
                            setActivityFormOpen(false);
                            const now = new Date();
                            const today = new Date(
                                now.getTime() - now.getTimezoneOffset() * 60000
                            )
                                .toISOString()
                                .slice(0, 10);
                            const showsToday =
                                event?.uses_attendance && event?.event_date === today;
                            setActivityNotice(
                                showsToday
                                    ? 'Activity saved. Its QR is ready below.'
                                    : 'Activity saved. It appears in Hours Rendered. Today’s QR list updates when the activity date is today.'
                            );
                            loadActivityEvents(showsToday ? event.id : undefined);
                        }}
                    />
                )}

            </div>

            {clocksAsStudent && (
                <section className="rounded-[1.75rem] border border-emerald-200/90 bg-gradient-to-br from-emerald-50/70 via-white to-teal-50/40 p-5 shadow-sm sm:p-6">
                    <h2 className="text-base font-black tracking-tight text-slate-900">
                        My Duty Attendance
                    </h2>
                    <p className="mt-1 text-xs font-medium text-slate-600">
                        Clock in and out for your own duty hours using your department supervisor&apos;s code.
                    </p>
                    <div className="mt-4 overflow-hidden rounded-2xl border border-slate-200 bg-white p-2 sm:p-4">
                        <StudentAttendanceTerminal />
                    </div>
                </section>
            )}

            <ClassClockInRequestsPanel defaultOpen={false} />

            {/* ANOMALY RADAR */}
            <div>
                    <HelpDisclosure
                        title="How Attendance Hub Works"
                        items={
                            canIssueDaily
                                ? [
                                      'Daily duty clock-in uses a rotating 30-second passcode or screen-only live QR code that cannot be saved, copied, or reused after refresh.',
                                      'Cleaning, devotional, and assembly activities use their own dedicated Activity QR codes and passcodes.',
                                      'Use the Anomaly Radar to review unusual clock-in patterns automatically flagged by the system.',
                                  ]
                                : [
                                      'Schedule campus group activities and display live activity QR codes or passcodes for student check-ins.',
                                      'Your own personal duty hours are still recorded through the working-student clock-in terminal.',
                                  ]
                        }
                    />
                </div>

            <FeatureSection
                    defaultOpen={false}
                    className="flex min-h-0 flex-col"
                    title="Anomaly Radar"
                    icon={
                        <span
                            className={`flex h-8 w-8 items-center justify-center rounded-xl ${
                                hasAnomalies
                                    ? 'bg-rose-100 text-rose-600'
                                    : 'bg-blue-50 text-blue-600'
                            }`}
                        >
                            <Activity className="h-4 w-4" />
                        </span>
                    }
                    badge={
                        <span className="rounded-full border border-slate-200 bg-white px-3 py-1 text-[10px] font-extrabold uppercase tracking-widest text-slate-500">
                            Auto-Detection
                        </span>
                    }
                >
                    <div className="min-h-[280px] flex-1 p-5">
                        {anomalies.length === 0 ? (
                            <div className="flex h-full flex-col items-center justify-center p-10 text-center">
                                <div className="mb-4 flex h-16 w-16 items-center justify-center rounded-2xl bg-emerald-50 text-emerald-600 ring-1 ring-emerald-200">
                                    <ShieldCheck className="h-8 w-8" />
                                </div>
                                <p className="text-base font-black text-slate-800">
                                    No Anomalies Detected
                                </p>
                                <p className="mt-1 max-w-sm text-xs font-medium text-slate-400">
                                    All attendance logs conform to standard operational protocols.
                                </p>
                            </div>
                        ) : (
                            <motion.div
                                variants={containerVariants}
                                initial="hidden"
                                animate="show"
                                className="space-y-3.5"
                            >
                                {anomalies.map((item) => (
                                    <motion.div
                                        variants={itemVariants}
                                        key={item.id}
                                        className="group relative flex flex-col justify-between gap-4 overflow-hidden rounded-2xl border border-rose-200/90 bg-rose-50/40 p-5 transition-all hover:bg-rose-50/70 hover:shadow-sm sm:flex-row sm:items-center"
                                    >
                                        <span
                                            aria-hidden="true"
                                            className="absolute inset-y-3 left-0 w-1 rounded-r-full bg-rose-500"
                                        />
                                        <div className="flex items-start gap-4 pl-2">
                                            <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl border border-rose-200 bg-rose-100 text-rose-600 transition-transform group-hover:scale-105">
                                                <AlertTriangle className="h-5 w-5" />
                                            </div>
                                            <div>
                                                <div className="flex flex-wrap items-center gap-2">
                                                    <h4 className="text-sm font-extrabold text-slate-900">
                                                        {item.user?.name || 'Unknown Student'}
                                                    </h4>
                                                    {(item.account_deleted ||
                                                        item.user?.deleted_at) && (
                                                        <span className="rounded-md border border-slate-200 bg-slate-100 px-2 py-0.5 text-[10px] font-bold uppercase tracking-wider text-slate-600">
                                                            Account deleted
                                                        </span>
                                                    )}
                                                </div>
                                                <p className="mt-1 text-xs font-bold text-rose-700">
                                                    Trigger: {item.anomaly_reason}
                                                </p>
                                                <div className="mt-2 flex flex-wrap items-center gap-3 text-[11px] font-bold text-slate-500">
                                                    <span className="inline-flex items-center gap-1">
                                                        <Calendar className="h-3.5 w-3.5 text-slate-400" />
                                                        {item.time_in
                                                            ? new Date(
                                                                  item.time_in
                                                              ).toLocaleDateString()
                                                            : '—'}
                                                    </span>
                                                    <span className="inline-flex items-center gap-1">
                                                        <Clock className="h-3.5 w-3.5 text-slate-400" />
                                                        {item.time_in
                                                            ? new Date(
                                                                  item.time_in
                                                              ).toLocaleTimeString('en-US', {
                                                                  hour: 'numeric',
                                                                  minute: '2-digit',
                                                                  hour12: true,
                                                              })
                                                            : '—'}
                                                    </span>
                                                </div>
                                            </div>
                                        </div>

                                        <div className="flex shrink-0 flex-col items-start pl-2 sm:items-end sm:pl-0">
                                            <span className="mb-1 text-[10px] font-extrabold uppercase tracking-widest text-slate-400">
                                                Logged Time
                                            </span>
                                            <span className="rounded-xl border border-rose-200 bg-white px-3 py-1 font-mono text-base font-black text-rose-700 shadow-2xs">
                                                {formatHours(
                                                    item.computed_hours || item.rendered_hours
                                                )}{' '}
                                                <span className="font-sans text-xs font-bold text-rose-400">
                                                    hrs
                                                </span>
                                            </span>
                                        </div>
                                    </motion.div>
                                ))}
                            </motion.div>
                        )}
                    </div>
            </FeatureSection>


            {/* OBSIDIAN EXPANDED QR MODAL */}
            {typeof document !== 'undefined' &&
                createPortal(
                    <AnimatePresence>
                        {qrExpanded && (
                            <motion.div
                                initial={{ opacity: 0 }}
                                animate={{ opacity: 1 }}
                                exit={{ opacity: 0 }}
                                className="fixed inset-0 z-[80] flex items-center justify-center bg-slate-950/85 p-4 backdrop-blur-md select-none"
                                onClick={() => setQrExpanded(false)}
                                onContextMenu={(e) => e.preventDefault()}
                                onCopy={(e) => e.preventDefault()}
                                onCut={(e) => e.preventDefault()}
                                onDragStart={(e) => e.preventDefault()}
                                style={{
                                    WebkitTouchCallout: 'none',
                                    WebkitUserSelect: 'none',
                                }}
                                role="dialog"
                                aria-modal="true"
                                aria-label="Expanded attendance QR code"
                            >
                                <motion.div
                                    initial={{ opacity: 0, scale: 0.96, y: 12 }}
                                    animate={{ opacity: 1, scale: 1, y: 0 }}
                                    exit={{ opacity: 0, scale: 0.96, y: 12 }}
                                    className="w-full max-w-lg overflow-hidden rounded-[2rem] border border-slate-200 bg-white shadow-2xl"
                                    onClick={(e) => e.stopPropagation()}
                                >
                                    <div className="flex items-center justify-between gap-4 bg-slate-950 px-6 py-4 text-white">
                                        <div className="flex items-center gap-2.5">
                                            <QrCode className="h-4 w-4 text-blue-400" />
                                            <div>
                                                <p className="text-[10px] font-extrabold uppercase tracking-widest text-blue-300">
                                                    Live QR
                                                </p>
                                                <p className="text-sm font-black tracking-tight">
                                                    {selectedType}
                                                </p>
                                            </div>
                                        </div>
                                        <div className="flex items-center gap-2.5">
                                            <span className="inline-flex items-center gap-1.5 rounded-full border border-emerald-400/30 bg-emerald-500/15 px-2.5 py-0.5 font-mono text-xs font-extrabold tabular-nums text-emerald-300">
                                                <span className="h-1.5 w-1.5 animate-pulse rounded-full bg-emerald-400" />
                                                {formatCountdown(qrSeconds)}
                                            </span>
                                            <button
                                                type="button"
                                                onClick={() => setQrExpanded(false)}
                                                className="rounded-xl border border-white/10 bg-white/5 p-2 text-slate-300 transition hover:bg-white/15 hover:text-white"
                                                aria-label="Close expanded QR"
                                            >
                                                <X className="h-4 w-4" />
                                            </button>
                                        </div>
                                    </div>

                                    <div className="flex flex-col items-center p-6 sm:p-8">
                                        <p className="mb-5 text-center text-lg font-extrabold text-slate-900">
                                            Scan this QR code for attendance
                                        </p>
                                        <div className="relative rounded-2xl border-2 border-slate-100 bg-white p-3 shadow-sm">
                                            <canvas
                                                ref={qrExpandedCanvasRef}
                                                draggable={false}
                                                aria-label="Expanded live attendance QR code"
                                                className="pointer-events-none max-w-full rounded-xl select-none"
                                            />
                                            <div
                                                className="absolute inset-0"
                                                aria-hidden="true"
                                                onContextMenu={(e) => e.preventDefault()}
                                            />
                                        </div>
                                        <p className="mt-5 font-mono text-lg font-black tabular-nums text-slate-900">
                                            {`Refreshes in ${formatCountdown(qrSeconds)}`}
                                        </p>
                                    </div>
                                </motion.div>
                            </motion.div>
                        )}
                    </AnimatePresence>,
                    document.body
                )}
        </div>
    );
};

export default SupervisorAttendanceHub;