import type { FC, ReactNode } from 'react';
import { motion } from 'framer-motion';

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
    { id: 'pipeline', label: 'Application Pipeline', icon: <path strokeLinecap="round" strokeLinejoin="round" d="M4 4h16v16H4zM8 8h8m-8 4h8m-8 4h5" /> },
    { id: 'tasks', label: 'Task Management', icon: <path strokeLinecap="round" strokeLinejoin="round" d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2" /> },
    { id: 'attendance-hub', label: 'Attendance Hub', icon: <path strokeLinecap="round" strokeLinejoin="round" d="M12 15v2m-6 4h12a2 2 0 002-2v-6a2 2 0 00-2-2H6a2 2 0 00-2 2v6a2 2 0 002 2zm10-10V7a4 4 0 00-8 0v4" /> },
    { id: 'compliance', label: 'Compliance', icon: <path strokeLinecap="round" strokeLinejoin="round" d="M12 9v2m0 4h.01M5.1 19h13.8L12 4 5.1 19z" /> },
    { id: 'logs', label: 'Audit Trail', icon: <path strokeLinecap="round" strokeLinejoin="round" d="M6 3h9l3 3v15H6zM9 10h6m-6 4h6" /> },
    { id: 'users', label: 'User Management', icon: <path strokeLinecap="round" strokeLinejoin="round" d="M16 21v-2a4 4 0 00-4-4H6a4 4 0 00-4 4v2m14-10a4 4 0 100-8 4 4 0 000 8z" /> },
    { id: 'analytics', label: 'Reports & Analytics', icon: <path strokeLinecap="round" strokeLinejoin="round" d="M4 19V9m6 10V5m6 14v-7m4 7V3" /> },
    { id: 'settings', label: 'Profile Settings', icon: <><path strokeLinecap="round" strokeLinejoin="round" d="M10.325 4.317c.426-1.756 2.924-1.756 3.35 0a1.724 1.724 0 002.573 1.066c1.543-.94 3.31.826 2.37 2.37a1.724 1.724 0 001.065 2.572c1.756.426 1.756 2.924 0 3.35a1.724 1.724 0 00-1.066 2.573c.94 1.543-.826 3.31-2.37 2.37a1.724 1.724 0 00-2.572 1.065c-.426 1.756-2.924 1.756-3.35 0a1.724 1.724 0 00-2.573-1.066c-1.543.94-3.31-.826-2.37-2.37a1.724 1.724 0 00-1.065-2.572c-1.756-.426-1.756-2.924 0-3.35a1.724 1.724 0 001.066-2.573c-.94-1.543.826-3.31 2.37-2.37.996.608 2.296.07 2.572-1.065z" /><path strokeLinecap="round" strokeLinejoin="round" d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" /></> },
];

const Sidebar: FC<SidebarProps> = ({ isSidebarOpen, setIsSidebarOpen, activeTab, setActiveTab, handleLogout, navItems, userRole }) => {
    const visibleNavItems = navItems ?? staffNavItems.filter((item) =>
        !['logs', 'users', 'analytics'].includes(item.id) || userRole === 'Super Admin' || userRole === 'WSPO Staff'
    );

    return (
        <>
            {/* MOBILE OVERLAY: Darkens the background on mobile when sidebar is open */}
            <div 
                onClick={() => setIsSidebarOpen(false)} 
                className={`fixed inset-0 bg-slate-900/40 backdrop-blur-sm z-40 lg:hidden transition-opacity duration-300 ${
                    isSidebarOpen ? 'opacity-100' : 'opacity-0 pointer-events-none'
                }`}
                aria-hidden="true"
            ></div>

            {/* SIDEBAR CORE */}
            <aside className={`
                fixed lg:relative inset-y-0 left-0 bg-white border-r border-slate-200 transition-all duration-300 ease-in-out flex flex-col z-50 shadow-2xl lg:shadow-none
                ${isSidebarOpen 
                    ? 'translate-x-0 w-64' 
                    : '-translate-x-full lg:translate-x-0 w-64 lg:w-20'
                }
            `}>
                
                {/* BRANDING / LOGO AREA */}
                <div className="h-20 flex items-center justify-center border-b border-slate-100 shrink-0 px-4">
                    <div className="flex items-center justify-center gap-3 overflow-hidden whitespace-nowrap w-full">
                        <img 
                            src="/logo.jpg" 
                            alt="TechHRM" 
                            className="w-10 h-10 rounded-full shadow-sm shrink-0 border border-slate-100" 
                        />
                        <span className={`font-black text-blue-950 text-xl tracking-tight transition-all duration-300 ${
                            isSidebarOpen ? 'opacity-100 w-auto' : 'opacity-0 w-0 lg:hidden'
                        }`}>
                            TechHRM
                        </span>
                    </div>
                </div>

                {/* NAVIGATION LINKS */}
                <nav className="flex-1 overflow-y-auto py-6 px-3 space-y-1.5 custom-scrollbar">
                    {visibleNavItems.map((item) => {
                        const isActive = activeTab === item.id;

                        return (
                            <button
                                key={item.id}
                                onClick={() => {
                                    setActiveTab(item.id);
                                    // Auto-close sidebar on mobile after clicking a link
                                    if (window.innerWidth < 1024) setIsSidebarOpen(false); 
                                }}
                                className={`relative w-full flex items-center p-3 rounded-xl transition-all duration-300 group outline-none overflow-hidden ${
                                    isActive 
                                    ? 'text-blue-700' 
                                    : 'text-slate-500 hover:text-slate-900'
                                }`}
                                title={!isSidebarOpen ? item.label : ''}
                            >
                                {/* THE GLIDING ACTIVE PILL (Framer Motion) */}
                                {isActive ? (
                                    <motion.div
                                        layoutId="sidebar-active-indicator"
                                        className="absolute inset-0 bg-blue-50 border border-blue-100/50 rounded-xl"
                                        initial={false}
                                        transition={{ type: "spring", stiffness: 350, damping: 30 }}
                                    />
                                ) : (
                                    <div className="absolute inset-0 bg-slate-50 rounded-xl opacity-0 group-hover:opacity-100 transition-opacity duration-300" />
                                )}
                                
                                {/* ICON & TEXT (Z-index keeps them above the animated background) */}
                                <div className="relative z-10 flex items-center w-full">
                                    <div className={`flex items-center justify-center shrink-0 transition-transform duration-300 ${isActive ? 'scale-110' : 'group-hover:scale-110'}`}>
                                        <svg 
                                            className={`w-5 h-5 transition-colors duration-300 ${isActive ? 'text-blue-600' : 'text-slate-400 group-hover:text-slate-600'}`} 
                                            fill="none" 
                                            viewBox="0 0 24 24" 
                                            stroke="currentColor" 
                                            strokeWidth={isActive ? "2.5" : "2"}
                                        >
                                            {item.icon}
                                        </svg>
                                    </div>
                                    
                                    <span className={`ml-3.5 font-bold text-sm whitespace-nowrap transition-all duration-300 ${
                                        isSidebarOpen ? 'opacity-100 translate-x-0' : 'opacity-0 -translate-x-4 lg:hidden'
                                    }`}>
                                        {item.label}
                                    </span>
                                </div>
                            </button>
                        );
                    })}
                </nav>

                {/* BOTTOM LOGOUT BUTTON */}
                <div className="p-4 border-t border-slate-100 shrink-0">
                    <button 
                        type="button" 
                        onClick={() => void handleLogout()} 
                        className="relative w-full flex items-center p-3 rounded-xl text-slate-500 hover:text-red-700 transition-all duration-300 group outline-none overflow-hidden"
                    >
                        {/* Hover Background */}
                        <div className="absolute inset-0 bg-red-50 rounded-xl opacity-0 group-hover:opacity-100 transition-opacity duration-300" />
                        
                        <div className="relative z-10 flex items-center w-full">
                            <svg 
                                className="w-5 h-5 shrink-0 text-slate-400 group-hover:text-red-500 transition-colors duration-300 group-hover:rotate-12" 
                                fill="none" 
                                viewBox="0 0 24 24" 
                                stroke="currentColor" 
                                strokeWidth="2.5"
                            >
                                {/* Fixed standard log-out icon path */}
                                <path strokeLinecap="round" strokeLinejoin="round" d="M17 16l4-4m0 0l-4-4m4 4H7m6 4v1a3 3 0 01-3 3H6a3 3 0 01-3-3V7a3 3 0 013-3h4a3 3 0 013 3v1" />
                            </svg>
                            <span className={`ml-3.5 font-bold text-sm whitespace-nowrap transition-all duration-300 ${
                                isSidebarOpen ? 'opacity-100 translate-x-0' : 'opacity-0 -translate-x-4 lg:hidden'
                            }`}>
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
