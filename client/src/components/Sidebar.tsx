import type { FC, ReactNode } from 'react';

interface NavItem {
    id: string;
    label: string;
    icon: ReactNode;
}

interface SidebarProps {
    isSidebarOpen: boolean;
    activeTab: string;
    setActiveTab: (tab: any) => void;
    handleLogout: () => void;
    navItems: NavItem[]; // <-- We made this dynamic!
}

const Sidebar: FC<SidebarProps> = ({ isSidebarOpen, activeTab, setActiveTab, handleLogout, navItems }) => {
    return (
        <aside className={`bg-white border-r border-gray-200 transition-all duration-300 flex flex-col z-20 ${isSidebarOpen ? 'w-64' : 'w-20'}`}>
            <div className="h-20 flex items-center justify-center border-b border-gray-200">
                <img src="/logo.jpg" alt="Logo" className={`rounded-full shadow-md object-cover transition-all ${isSidebarOpen ? 'w-10 h-10 mr-3' : 'w-10 h-10'}`} />
                {isSidebarOpen && (
                    <div>
                        <h1 className="text-xl font-extrabold text-blue-700 tracking-tight leading-tight">TechHRM</h1>
                    </div>
                )}
            </div>

            <nav className="flex-1 overflow-y-auto py-6 px-3 space-y-2">
                {navItems.map((item) => (
                    <button
                        key={item.id}
                        onClick={() => setActiveTab(item.id)}
                        className={`w-full flex items-center p-3 rounded-xl transition-all ${
                            activeTab === item.id 
                            ? 'bg-blue-600 text-white shadow-md' 
                            : 'text-gray-500 hover:bg-gray-100 hover:text-gray-900'
                        }`}
                        title={!isSidebarOpen ? item.label : ''}
                    >
                        <svg className="w-6 h-6 shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2">
                            {item.icon}
                        </svg>
                        {isSidebarOpen && <span className="ml-3 font-semibold text-sm">{item.label}</span>}
                    </button>
                ))}
            </nav>

            <div className="p-4 border-t border-gray-200">
                <button onClick={handleLogout} className="w-full flex items-center p-3 rounded-xl text-red-600 hover:bg-red-50 transition-all">
                    <svg className="w-6 h-6 shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2">
                        <path strokeLinecap="round" strokeLinejoin="round" d="M17 16l4-4m0 0l-4-4m4 4H7m6 4v1a3 3 0 01-3 3H6a3 3 0 01-3-3V7a3 3 0 013-3h4a3 3 0 013 3v1" />
                    </svg>
                    {isSidebarOpen && <span className="ml-3 font-bold text-sm">Logout</span>}
                </button>
            </div>
        </aside>
    );
};

export default Sidebar;