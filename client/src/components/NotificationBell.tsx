import { useState, useEffect, useRef } from 'react';
import axios from 'axios';

interface Notification {
    id: number;
    title: string;
    message: string;
    is_read: number;
    created_at: string;
}

interface NotificationBellProps {
    onNavigate: (tabId: string) => void;
}

export default function NotificationBell({ onNavigate }: NotificationBellProps) {
    const [notifications, setNotifications] = useState<Notification[]>([]);
    const [isOpen, setIsOpen] = useState(false);
    const dropdownRef = useRef<HTMLDivElement>(null);

    const userRole = localStorage.getItem('user_role') || 'User'; 

    const fetchNotifications = async () => {
        try {
            const res = await axios.get('/api/notifications');
            setNotifications(res.data);
        } catch (error) {
            console.error("Failed to fetch notifications", error);
        }
    };

    useEffect(() => {
        fetchNotifications();
        const interval = setInterval(fetchNotifications, 30000);
        return () => clearInterval(interval);
    }, []);

    useEffect(() => {
        const handleClickOutside = (event: MouseEvent) => {
            if (dropdownRef.current && !dropdownRef.current.contains(event.target as Node)) {
                setIsOpen(false);
            }
        };
        document.addEventListener('mousedown', handleClickOutside);
        return () => document.removeEventListener('mousedown', handleClickOutside);
    }, []);

    const handleNotificationClick = async (notif: Notification) => {
        if (!notif.is_read) {
            setNotifications(notifications.map(n => n.id === notif.id ? { ...n, is_read: 1 } : n));
            try {
                await axios.patch(`/api/notifications/${notif.id}/read`);
            } catch (error) {
                console.error("Failed to mark as read", error);
                fetchNotifications();
            }
        }

        if (notif.title.includes('Schedule')) {
            onNavigate(userRole === 'Student' ? 'schedule' : 'schedules');
        } else if (notif.title.includes('Timesheet')) {
            onNavigate('attendance');
        } else if (notif.title.includes('Requirement')) {
            onNavigate('requirements');
        }

        setIsOpen(false);
    };

    const unreadCount = notifications.filter(n => !n.is_read).length;

    return (
        <div className="relative" ref={dropdownRef}>
            {/* The Bell Icon */}
            <button 
                onClick={() => setIsOpen(!isOpen)}
                className="relative p-2 text-gray-500 hover:bg-gray-100 rounded-full transition-colors focus:outline-none"
            >
                <svg className="w-6 h-6" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2">
                    <path strokeLinecap="round" strokeLinejoin="round" d="M15 17h5l-1.405-1.405A2.032 2.032 0 0118 14.158V11a6.002 6.002 0 00-4-5.659V5a2 2 0 10-4 0v.341C7.67 6.165 6 8.388 6 11v3.159c0 .538-.214 1.055-.595 1.436L4 17h5m6 0v1a3 3 0 11-6 0v-1m6 0H9" />
                </svg>
                {unreadCount > 0 && (
                    <span className="absolute top-1 right-1.5 flex h-3 w-3">
                        <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-red-400 opacity-75"></span>
                        <span className="relative inline-flex rounded-full h-3 w-3 bg-red-500 border-2 border-white"></span>
                    </span>
                )}
            </button>

            {/* The Dropdown Container */}
            {isOpen && (
                <>
                    {/* Invisible mobile overlay to capture outside clicks easily */}
                    <div className="fixed inset-0 z-40 sm:hidden" onClick={() => setIsOpen(false)}></div>
                    
                    {/* MOBILE POLISH MAGIC:
                        - On mobile: fixed position, floating safely below the header with safe margins (left-4 right-4 top-20).
                        - On desktop (sm:): absolute positioning, attached to the right of the bell.
                    */}
                    <div className="fixed sm:absolute left-4 right-4 sm:left-auto top-20 sm:top-auto sm:right-0 sm:mt-2 sm:w-80 bg-white rounded-2xl shadow-2xl border border-gray-100 z-50 overflow-hidden">
                        
                        {/* Header */}
                        <div className="bg-gray-50/80 backdrop-blur-sm px-4 py-3 border-b border-gray-100 flex justify-between items-center">
                            <h3 className="text-sm font-bold text-gray-900">Notifications</h3>
                            {unreadCount > 0 && <span className="text-[10px] font-extrabold text-blue-700 bg-blue-100 px-2 py-1 rounded-full uppercase tracking-wider">{unreadCount} New</span>}
                        </div>

                        {/* List */}
                        <div className="max-h-[60vh] sm:max-h-80 overflow-y-auto custom-scrollbar">
                            {notifications.length === 0 ? (
                                <div className="p-8 text-center flex flex-col items-center justify-center">
                                    <svg className="w-10 h-10 text-gray-200 mb-2" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2"><path strokeLinecap="round" strokeLinejoin="round" d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" /></svg>
                                    <span className="text-sm text-gray-500 font-medium">You're all caught up!</span>
                                </div>
                            ) : (
                                notifications.map(notif => (
                                    <div 
                                        key={notif.id} 
                                        onClick={() => handleNotificationClick(notif)}
                                        className={`p-4 border-b border-gray-50 cursor-pointer transition-colors ${notif.is_read ? 'bg-white opacity-70 hover:bg-gray-50' : 'bg-blue-50/40 hover:bg-blue-50/60'}`}
                                    >
                                        <div className="flex justify-between items-start mb-1">
                                            <h4 className={`text-sm ${notif.is_read ? 'font-semibold text-gray-700' : 'font-bold text-gray-900'}`}>
                                                {notif.title}
                                            </h4>
                                            {!notif.is_read && <span className="w-2 h-2 rounded-full bg-blue-500 mt-1.5 flex-shrink-0 shadow-sm shadow-blue-300"></span>}
                                        </div>
                                        <p className="text-xs text-gray-600 leading-relaxed font-medium">{notif.message}</p>
                                        <p className="text-[10px] text-gray-400 mt-2 font-bold uppercase tracking-wider">
                                            {new Date(notif.created_at).toLocaleDateString()} at {new Date(notif.created_at).toLocaleTimeString([], {hour: '2-digit', minute:'2-digit'})}
                                        </p>
                                    </div>
                                ))
                            )}
                        </div>
                    </div>
                </>
            )}
        </div>
    );
}