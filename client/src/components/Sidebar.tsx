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
    setActiveTab: (tab: any) => void;
    handleLogout: () => void;
    navItems: NavItem[];
}

const Sidebar: FC<SidebarProps> = ({ isSidebarOpen, setIsSidebarOpen, activeTab, setActiveTab, handleLogout, navItems }) => {
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
                    {navItems.map((item) => {
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