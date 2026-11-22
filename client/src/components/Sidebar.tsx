import { useEffect, useRef, useState, type FC, type ReactNode } from 'react';
import { motion } from 'framer-motion';
import ThemeToggle from './ThemeToggle';

const DESKTOP_SIDEBAR_QUERY = '(min-width: 1024px)';

function useDesktopSidebar() {
    const [isDesktop, setIsDesktop] = useState(
        () => typeof window !== 'undefined' && window.matchMedia(DESKTOP_SIDEBAR_QUERY).matches,
    );

    useEffect(() => {
        const media = window.matchMedia(DESKTOP_SIDEBAR_QUERY);
        const sync = () => setIsDesktop(media.matches);
        sync();
        media.addEventListener('change', sync);
        return () => media.removeEventListener('change', sync);
    }, []);

    return isDesktop;
}

interface NavItem {
    id: string;
    label: string;
    icon: ReactNode;
}

interface SidebarProps {
    isSidebarOpen: boolean;
    setIsSidebarOpen: (isOpen: boolean) => void;
    activeTab: string;
    setActiveTab: (path: string) => void;
    handleLogout: () => void;
    userRole?: string | null;
    navItems?: NavItem[];
}

const staffNavItems: NavItem[] = [
    { id: 'dashboard', label: 'Dashboard', icon: <path strokeLinecap="round" strokeLinejoin="round" d="M3 12l2-2 7-7 7 7M5 10v10h4v-6h6v6h4V10" /> },
    { id: 'attendance', label: 'Timesheets', icon: <path strokeLinecap="round" strokeLinejoin="round" d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" /> },
    { id: 'schedules', label: 'Schedules', icon: <path strokeLinecap="round" strokeLinejoin="round" d="M8 3v4m8-4v4M5 9h14M5 5h14v16H5z" /> },
    { id: 'requirements', label: 'Document Review', icon: <path strokeLinecap="round" strokeLinejoin="round" d="M9 12h6m-6 4h6m2 5H7V3h7l5 5v11a2 2 0 01-2 2z" /> },
    { id: 'pipeline', label: 'Applications', icon: <path strokeLinecap="round" strokeLinejoin="round" d="M4 4h16v16H4zM8 8h8m-8 4h8m-8 4h5" /> },
    { id: 'attendance-hub', label: 'Attendance Hub', icon: <path strokeLinecap="round" strokeLinejoin="round" d="M12 15v2m-6 4h12a2 2 0 002-2v-6a2 2 0 00-2-2H6a2 2 0 00-2 2v6a2 2 0 002 2zm10-10V7a4 4 0 00-8 0v4" /> },
    { id: 'compliance', label: 'Compliance', icon: <path strokeLinecap="round" strokeLinejoin="round" d="M12 9v2m0 4h.01M5.1 19h13.8L12 4 5.1 19z" /> },
    { id: 'logs', label: 'Audit Trail', icon: <path strokeLinecap="round" strokeLinejoin="round" d="M6 3h9l3 3v15H6zM9 10h6m-6 4h6" /> },
    { id: 'users', label: 'User Management', icon: <path strokeLinecap="round" strokeLinejoin="round" d="M16 21v-2a4 4 0 00-4-4H6a4 4 0 00-4 4v2m14-10a4 4 0 100-8 4 4 0 000 8z" /> },
    { id: 'offices', label: 'Offices', icon: <path strokeLinecap="round" strokeLinejoin="round" d="M3 21h18M5 21V7l7-4 7 4v14M9 21v-6h6v6" /> },
    { id: 'analytics', label: 'Reports & Analytics', icon: <path strokeLinecap="round" strokeLinejoin="round" d="M4 19V9m6 10V5m6 14v-7m4 7V3" /> },
    { id: 'financial', label: 'Hours Rendered', icon: <path strokeLinecap="round" strokeLinejoin="round" d="M12 8c-1.657 0-3 .895-3 2s1.343 2 3 2 3 .895 3 2-1.343 2-3 2m0-8c1.11 0 2.08.402 2.599 1M12 8V7m0 1v8m0 0v1m0-1c-1.11 0-2.08-.402-2.599-1M21 12a9 9 0 11-18 0 9 9 0 0118 0z" /> },
    { id: 'messages', label: 'Messages', icon: <path strokeLinecap="round" strokeLinejoin="round" d="M8 10h.01M12 10h.01M16 10h.01M9 16H5a2 2 0 01-2-2V6a2 2 0 012-2h14a2 2 0 012 2v8a2 2 0 01-2 2h-5l-5 5v-5z" /> },
    { id: 'help', label: 'Help', icon: <path strokeLinecap="round" strokeLinejoin="round" d="M8.228 9c.549-1.165 2.03-2 3.772-2 2.21 0 4 1.343 4 3 0 1.4-1.278 2.575-3.006 2.907-.542.104-.994.54-.994 1.093m0 3h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" /> },
    { id: 'settings', label: 'Profile Settings', icon: <><path strokeLinecap="round" strokeLinejoin="round" d="M10.325 4.317c.426-1.756 2.924-1.756 3.35 0a1.724 1.724 0 002.573 1.066c1.543-.94 3.31.826 2.37 2.37a1.724 1.724 0 001.065 2.572c1.756.426 1.756 2.924 0 3.35a1.724 1.724 0 00-1.066 2.573c.94 1.543-.826 3.31-2.37 2.37a1.724 1.724 0 00-2.572 1.065c-.426 1.756-2.924 1.756-3.35 0a1.724 1.724 0 00-2.573-1.066c-1.543.94-3.31-.826-2.37-2.37a1.724 1.724 0 00-1.065-2.572c-1.756-.426-1.756-2.924 0-3.35a1.724 1.724 0 001.066-2.573c-.94-1.543.826-3.31 2.37-2.37.996.608 2.296.07 2.572-1.065z" /><path strokeLinecap="round" strokeLinejoin="round" d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" /></> },
];

const Sidebar: FC<SidebarProps> = ({
    isSidebarOpen,
    setIsSidebarOpen,
    activeTab,
    setActiveTab,
    handleLogout,
    navItems,
    userRole,
}) => {
    const isDesktop = useDesktopSidebar();
    const [hoverOpen, setHoverOpen] = useState(false);
    const [logoHovered, setLogoHovered] = useState(false);
    const hoverTimerRef = useRef<number | null>(null);
    const expanded = isSidebarOpen || (isDesktop && hoverOpen);
    const showLogoMenu = isDesktop && logoHovered;

    const clearHoverTimer = () => {
        if (hoverTimerRef.current != null) {
            window.clearTimeout(hoverTimerRef.current);
            hoverTimerRef.current = null;
        }
    };

    useEffect(() => clearHoverTimer, []);

    useEffect(() => {
        if (!isDesktop || isSidebarOpen) {
            clearHoverTimer();
            setHoverOpen(false);
        }
        if (!isDesktop) setLogoHovered(false);
    }, [isDesktop, isSidebarOpen]);

    const scheduleHover = (open: boolean) => {
        if (!isDesktop) return;
        clearHoverTimer();
        if (open && isSidebarOpen) return;
        hoverTimerRef.current = window.setTimeout(() => setHoverOpen(open), open ? 90 : 180);
    };

    const visibleNavItems =
        navItems ??
        staffNavItems.filter((item) => {
            if (userRole === 'Immediate Supervisor') {
                return ['dashboard', 'messages', 'help', 'settings'].includes(item.id);
            }
            if (['pipeline', 'logs', 'users', 'analytics', 'financial', 'offices'].includes(item.id)) {
                return userRole === 'Super Admin' || userRole === 'WSPO Staff';
            }
            return item.id !== 'requirements' || userRole === 'Super Admin';
        });
    const pinnedNavItems = visibleNavItems.filter((item) => item.id === 'dashboard');
    const scrollingNavItems = visibleNavItems.filter((item) => item.id !== 'dashboard');

    const renderNavItem = (item: NavItem) => {
        const isActive = activeTab === item.id;

        return (
            <button
                key={item.id}
                onClick={() => {
                    setActiveTab(item.id);
                    if (window.innerWidth < 1024) setIsSidebarOpen(false);
                }}
                className={`group relative flex w-full items-center overflow-hidden rounded-2xl p-2.5 outline-none transition-all duration-200 ${
                    isActive ? 'text-white' : 'text-slate-400 hover:text-white'
                }`}
                title={!expanded ? item.label : ''}
            >
                {isActive ? (
                    <motion.div
                        layoutId="sidebar-active-indicator"
                        className="absolute inset-0 rounded-2xl border border-blue-500/30 bg-gradient-to-r from-blue-600/25 via-indigo-600/15 to-transparent"
                        initial={false}
                        transition={{ type: 'spring', stiffness: 360, damping: 30 }}
                    >
                        <div className="absolute left-0 top-1/2 h-7 w-1 -translate-y-1/2 rounded-r-full bg-blue-400 shadow-[0_0_12px_rgba(96,165,250,0.85)]" />
                    </motion.div>
                ) : (
                    <div className="absolute inset-0 rounded-2xl bg-white/[0.05] opacity-0 transition-opacity duration-200 group-hover:opacity-100" />
                )}

                <div className="relative z-10 flex w-full items-center">
                    <div
                        className={`flex h-9 w-9 shrink-0 items-center justify-center rounded-xl transition-all duration-200 ${
                            isActive
                                ? 'bg-gradient-to-br from-blue-500 to-indigo-600 text-white shadow-md shadow-blue-600/30'
                                : 'bg-white/[0.04] text-slate-400 group-hover:bg-white/10 group-hover:text-white'
                        }`}
                    >
                        <svg
                            className="h-4 w-4"
                            fill="none"
                            viewBox="0 0 24 24"
                            stroke="currentColor"
                            strokeWidth={isActive ? '2.4' : '2'}
                        >
                            {item.icon}
                        </svg>
                    </div>

                    <span
                        className={`ml-3 whitespace-nowrap text-sm font-bold tracking-tight transition-all duration-200 ${
                            expanded
                                ? 'translate-x-0 opacity-100'
                                : '-translate-x-3 opacity-0 lg:hidden'
                        }`}
                    >
                        {item.label}
                    </span>
                </div>
            </button>
        );
    };

    return (
        <>
            {/* MOBILE OVERLAY */}
            <div
                onClick={() => setIsSidebarOpen(false)}
                className={`fixed inset-0 z-40 bg-slate-950/70 backdrop-blur-sm transition-opacity duration-300 lg:hidden print:hidden ${
                    isSidebarOpen ? 'opacity-100' : 'pointer-events-none opacity-0'
                }`}
                aria-hidden="true"
            />

            {/* OBSIDIAN SIDEBAR RAIL */}
            <aside
                onMouseEnter={() => scheduleHover(true)}
                onMouseLeave={() => scheduleHover(false)}
                className={`fixed inset-y-0 left-0 z-50 flex flex-col border-r border-slate-800/90 bg-slate-950 text-white shadow-2xl transition-all duration-300 ease-in-out lg:relative lg:shadow-none print:hidden ${
                    expanded
                        ? 'w-64 translate-x-0'
                        : 'w-64 -translate-x-full lg:w-20 lg:translate-x-0'
                }`}
            >
                {/* BRANDING / LOGO HEADER */}
                <div className="relative flex h-[4.5rem] shrink-0 items-center justify-center overflow-hidden border-b border-slate-800/80 px-4">
                    <div
                        className="pointer-events-none absolute inset-0 opacity-20"
                        style={{
                            backgroundImage:
                                'radial-gradient(rgba(148,163,184,0.4) 1px, transparent 1px)',
                            backgroundSize: '14px 14px',
                        }}
                        aria-hidden="true"
                    />
                    <div
                        className="pointer-events-none absolute left-1/2 top-1/2 h-24 w-24 -translate-x-1/2 -translate-y-1/2 rounded-full bg-blue-600/20 blur-2xl"
                        aria-hidden="true"
                    />

                    <div className="relative z-10 flex w-full items-center justify-center gap-3 overflow-hidden whitespace-nowrap">
                        <div
                            className="relative h-10 w-10 shrink-0"
                            onMouseEnter={() => {
                                if (window.matchMedia(DESKTOP_SIDEBAR_QUERY).matches) setLogoHovered(true);
                            }}
                            onMouseLeave={(event) => {
                                setLogoHovered(false);
                                const active = document.activeElement;
                                if (active instanceof HTMLElement && event.currentTarget.contains(active)) {
                                    active.blur();
                                }
                            }}
                        >
                            <img
                                src="/logo.jpg"
                                alt="WoSPIS"
                                className={`h-10 w-10 rounded-xl border border-white/15 object-cover shadow-lg shadow-black/40 transition-opacity duration-200 ${
                                    showLogoMenu ? 'opacity-0' : 'opacity-100'
                                }`}
                            />
                            <button
                                type="button"
                                onClick={() => setIsSidebarOpen(!isSidebarOpen)}
                                aria-label={isSidebarOpen ? 'Collapse sidebar' : 'Expand sidebar'}
                                aria-expanded={isSidebarOpen}
                                title={isSidebarOpen ? 'Collapse sidebar' : 'Expand sidebar'}
                                className={`absolute inset-0 hidden items-center justify-center rounded-xl border border-white/15 bg-white/10 text-white shadow-lg shadow-black/40 outline-none transition-opacity duration-200 lg:flex ${
                                    showLogoMenu ? 'opacity-100' : 'pointer-events-none opacity-0'
                                }`}
                            >
                                <svg
                                    className="h-5 w-5"
                                    fill="none"
                                    viewBox="0 0 24 24"
                                    stroke="currentColor"
                                    strokeWidth="2.2"
                                >
                                    <path strokeLinecap="round" strokeLinejoin="round" d="M4 7h16M4 12h16M4 17h16" />
                                </svg>
                            </button>
                        </div>
                        <div
                            className={`min-w-0 transition-all duration-300 ${
                                expanded ? 'w-auto opacity-100' : 'w-0 opacity-0 lg:hidden'
                            }`}
                        >
                            <span className="block bg-gradient-to-r from-white via-blue-100 to-slate-300 bg-clip-text text-lg font-black tracking-tight text-transparent">
                                WoSPIS
                            </span>
                            {userRole && (
                                <span className="block text-[10px] font-bold uppercase tracking-widest text-blue-400">
                                    {userRole}
                                </span>
                            )}
                        </div>
                    </div>
                </div>

                {/* PINNED DASHBOARD LINK */}
                {pinnedNavItems.length > 0 && (
                    <div className="shrink-0 space-y-1 border-b border-slate-800/80 px-3 pb-2.5 pt-3.5">
                        {pinnedNavItems.map(renderNavItem)}
                    </div>
                )}

                {/* SCROLLABLE NAVIGATION LINKS */}
                <nav className="custom-scrollbar flex-1 space-y-1 overflow-y-auto px-3 py-3.5">
                    {scrollingNavItems.map(renderNavItem)}
                </nav>

                {/* BOTTOM ACTIONS DOCK */}
                <div className="shrink-0 space-y-1.5 border-t border-slate-800/80 bg-slate-900/50 p-3">
                    <ThemeToggle layout="menu" expanded={expanded} />
                    <button
                        type="button"
                        onClick={() => {
                            if (!window.confirm('Are you sure you want to securely end your session?')) return;
                            void handleLogout();
                        }}
                        title={!expanded ? 'Sign Out' : ''}
                        className="group relative flex w-full items-center overflow-hidden rounded-2xl p-2.5 text-slate-400 outline-none transition-all duration-200 hover:text-rose-300"
                    >
                        <div className="absolute inset-0 rounded-2xl border border-rose-500/20 bg-rose-500/10 opacity-0 transition-opacity duration-200 group-hover:opacity-100" />

                        <div className="relative z-10 flex w-full items-center">
                            <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-white/[0.04] text-slate-400 transition-all duration-200 group-hover:bg-rose-500/20 group-hover:text-rose-300">
                                <svg
                                    className="h-4 w-4"
                                    fill="none"
                                    viewBox="0 0 24 24"
                                    stroke="currentColor"
                                    strokeWidth="2.4"
                                >
                                    <path
                                        strokeLinecap="round"
                                        strokeLinejoin="round"
                                        d="M17 16l4-4m0 0l-4-4m4 4H7m6 4v1a3 3 0 01-3 3H6a3 3 0 01-3-3V7a3 3 0 013-3h4a3 3 0 013 3v1"
                                    />
                                </svg>
                            </div>
                            <span
                                className={`ml-3 whitespace-nowrap text-sm font-bold tracking-tight transition-all duration-200 ${
                                    expanded
                                        ? 'translate-x-0 opacity-100'
                                        : '-translate-x-3 opacity-0 lg:hidden'
                                }`}
                            >
                                Sign Out
                            </span>
                        </div>
                    </button>
                </div>
            </aside>
        </>
    );
};

export default Sidebar;