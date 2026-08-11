import { useState, useEffect } from 'react';
import axios from 'axios';
import { motion } from 'framer-motion';
import { UserCircle, ShieldCheck, Camera, Eye, EyeOff, CheckCircle2, AlertCircle } from 'lucide-react';
import SecureImage from './SecureImage';
import { normalizeFilePath } from '../utils/secureFile';

interface StaffProfileSettingsProps {
    onProfileUpdated?: (name: string, avatarPath: string | null) => void;
}

const StaffProfileSettings = ({ onProfileUpdated }: StaffProfileSettingsProps) => {
    const userRole = localStorage.getItem('user_role') || 'Supervisor';

    const [name, setName] = useState(localStorage.getItem('user_name') || '');
    const [phoneNumber, setPhoneNumber] = useState('');
    const [assignedOffice, setAssignedOffice] = useState(localStorage.getItem('assigned_office') || '');
    const [avatarPath, setAvatarPath] = useState<string | null>(() => normalizeFilePath(localStorage.getItem('profile_picture')));

    const [currentPassword, setCurrentPassword] = useState('');
    const [newPassword, setNewPassword] = useState('');
    const [confirmPassword, setConfirmPassword] = useState('');
    const [showCurrentPassword, setShowCurrentPassword] = useState(false);
    const [showNewPassword, setShowNewPassword] = useState(false);

    const [isSaving, setIsSaving] = useState(false);
    const [isUploading, setIsUploading] = useState(false);
    const [message, setMessage] = useState<{ text: string; type: 'success' | 'error' } | null>(null);

    useEffect(() => {
        axios.get('/api/user')
            .then((response) => {
                const user = response.data;
                setName(user.name || '');
                setPhoneNumber(user.phone_number || '');
                setAssignedOffice(user.profile?.assigned_office || localStorage.getItem('assigned_office') || '');

                if (user.profile_picture) {
                    const path = normalizeFilePath(user.profile_picture);
                    setAvatarPath(path);
                    if (path) localStorage.setItem('profile_picture', path);
                }
            })
            .catch(() => {
                setMessage({ text: 'Failed to load profile details.', type: 'error' });
            });
    }, []);

    const showFeedback = (text: string, type: 'success' | 'error') => {
        setMessage({ text, type });
        setTimeout(() => setMessage(null), 4000);
    };

    const handleImageUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
        const file = e.target.files?.[0];
        if (!file) return;

        const formData = new FormData();
        formData.append('avatar', file);
        setIsUploading(true);

        try {
            const response = await axios.post('/api/user/avatar', formData, {
                headers: { 'Content-Type': 'multipart/form-data' },
            });
            const path = normalizeFilePath(response.data.profile_picture);
            setAvatarPath(path);
            if (path) localStorage.setItem('profile_picture', path);
            onProfileUpdated?.(name, path);
            showFeedback('Profile picture updated successfully.', 'success');
        } catch {
            showFeedback('Failed to upload image. Ensure it is under 2MB.', 'error');
        } finally {
            setIsUploading(false);
            e.target.value = '';
        }
    };

    const handleSave = async (e: React.FormEvent) => {
        e.preventDefault();

        if (newPassword && newPassword !== confirmPassword) {
            showFeedback('New password and confirmation do not match.', 'error');
            return;
        }

        setIsSaving(true);
        try {
            const payload: Record<string, string> = {
                name: name.trim(),
                phone_number: phoneNumber.trim(),
            };

            if (newPassword) {
                payload.password = newPassword;
                payload.password_confirmation = confirmPassword;
                payload.current_password = currentPassword;
            }

            const response = await axios.put('/api/user', payload);
            const updatedUser = response.data.user;

            localStorage.setItem('user_name', updatedUser.name);
            onProfileUpdated?.(updatedUser.name, avatarPath);

            setCurrentPassword('');
            setNewPassword('');
            setConfirmPassword('');
            showFeedback('Profile saved successfully.', 'success');
        } catch (err: any) {
            showFeedback(err.response?.data?.message || 'Failed to save profile.', 'error');
        } finally {
            setIsSaving(false);
        }
    };

    const firstName = name.split(' ')[0] || 'U';

    return (
        <div className="space-y-6 max-w-4xl mx-auto p-4 sm:p-8 font-sans">
            <motion.div
                initial={{ opacity: 0, y: -20 }}
                animate={{ opacity: 1, y: 0 }}
                className="flex flex-col md:flex-row md:items-end justify-between gap-4 bg-slate-900 p-6 sm:p-8 rounded-3xl shadow-xl overflow-hidden relative"
            >
                <div className="absolute top-0 right-0 -mt-16 -mr-16 w-64 h-64 bg-blue-600 rounded-full mix-blend-multiply filter blur-3xl opacity-20" />
                <div className="relative z-10">
                    <div className="flex items-center gap-2 mb-2">
                        <UserCircle className="w-5 h-5 text-blue-400" />
                        <span className="text-xs font-bold text-blue-400 uppercase tracking-widest">Account Management</span>
                    </div>
                    <h1 className="text-3xl sm:text-4xl font-black text-white tracking-tight">Profile Settings</h1>
                    <p className="mt-2 text-slate-400 font-medium max-w-md">
                        Update your account details, contact information, and password.
                    </p>
                </div>
                <div className="relative z-10 bg-black/40 backdrop-blur-md border border-white/10 px-6 py-4 rounded-2xl flex items-center gap-4">
                    <ShieldCheck className="w-5 h-5 text-blue-400" />
                    <div className="flex flex-col">
                        <span className="text-[10px] font-bold text-slate-400 uppercase tracking-widest">Access Level</span>
                        <span className="text-sm font-extrabold text-blue-400">{userRole}</span>
                    </div>
                </div>
            </motion.div>

            {message && (
                <div className={`p-4 rounded-xl border flex items-center gap-3 ${message.type === 'success' ? 'bg-emerald-50 border-emerald-100 text-emerald-800' : 'bg-red-50 border-red-100 text-red-800'}`}>
                    {message.type === 'success' ? <CheckCircle2 className="w-5 h-5 shrink-0" /> : <AlertCircle className="w-5 h-5 shrink-0" />}
                    <span className="text-sm font-bold">{message.text}</span>
                </div>
            )}

            <form onSubmit={handleSave} className="bg-white p-6 sm:p-8 rounded-3xl shadow-sm border border-slate-200 space-y-8">
                <div className="flex flex-col md:flex-row gap-10 items-start">
                    <div className="flex flex-col items-center md:w-1/3 w-full">
                        <div className="relative group cursor-pointer">
                            <div className="w-40 h-40 bg-slate-100 rounded-full border-4 border-white shadow-xl flex items-center justify-center overflow-hidden">
                                {avatarPath ? (
                                    <SecureImage filePath={avatarPath} altText="Profile" className="w-full h-full object-cover" />
                                ) : (
                                    <span className="text-slate-400 font-black text-5xl">{firstName.charAt(0)}</span>
                                )}
                            </div>
                            <label htmlFor="staffAvatarUpload" className="absolute inset-0 bg-slate-900/60 rounded-full flex flex-col items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity duration-300 cursor-pointer backdrop-blur-sm">
                                <Camera className="w-8 h-8 text-white mb-1" />
                                <span className="text-white text-xs font-bold uppercase tracking-wider">
                                    {isUploading ? 'Uploading...' : 'Update Photo'}
                                </span>
                            </label>
                            <input type="file" id="staffAvatarUpload" accept="image/*" onChange={handleImageUpload} className="hidden" disabled={isUploading} />
                        </div>
                        <p className="text-xs text-slate-500 font-medium mt-4 text-center">Allowed formats: JPG, PNG. Max size: 2MB.</p>
                    </div>

                    <div className="flex-1 w-full space-y-6">
                        <div className="grid grid-cols-1 sm:grid-cols-2 gap-6">
                            <div>
                                <label className="block text-xs font-bold text-slate-500 uppercase tracking-wider mb-2">Full Name</label>
                                <input
                                    type="text"
                                    required
                                    value={name}
                                    onChange={(e) => setName(e.target.value)}
                                    className="w-full p-3.5 bg-slate-50 border border-slate-200 rounded-xl text-slate-900 font-bold outline-none focus:ring-2 focus:ring-blue-600 focus:bg-white transition-all"
                                />
                            </div>
                            <div>
                                <label className="block text-xs font-bold text-slate-500 uppercase tracking-wider mb-2">Contact Number</label>
                                <input
                                    type="text"
                                    value={phoneNumber}
                                    onChange={(e) => setPhoneNumber(e.target.value)}
                                    placeholder="Optional"
                                    className="w-full p-3.5 bg-slate-50 border border-slate-200 rounded-xl text-slate-900 font-medium outline-none focus:ring-2 focus:ring-blue-600 focus:bg-white transition-all"
                                />
                            </div>
                            {(userRole === 'WSPO Staff' || userRole === 'Supervisor') && (
                                <div className="sm:col-span-2">
                                    <label className="block text-xs font-bold text-slate-500 uppercase tracking-wider mb-2">
                                        {userRole === 'WSPO Staff' ? 'WSPO Position' : 'Supervised Department'}
                                    </label>
                                    <input
                                        type="text"
                                        disabled
                                        value={assignedOffice || 'Not assigned'}
                                        className="w-full p-3.5 bg-slate-50 border border-slate-200 rounded-xl text-slate-900 font-bold opacity-80 cursor-not-allowed"
                                    />
                                    <p className="text-xs text-slate-400 mt-2">Contact a Super Admin to change organizational assignment.</p>
                                </div>
                            )}
                        </div>
                    </div>
                </div>

                <div className="border-t border-slate-100 pt-8 space-y-5">
                    <h2 className="text-sm font-black text-slate-900 uppercase tracking-widest">Change Password</h2>
                    <p className="text-sm text-slate-500">Leave blank if you do not want to change your password.</p>

                    <div className="grid grid-cols-1 sm:grid-cols-3 gap-5">
                        <div className="relative">
                            <label className="block text-xs font-bold text-slate-500 uppercase tracking-wider mb-2">Current Password</label>
                            <input
                                type={showCurrentPassword ? 'text' : 'password'}
                                value={currentPassword}
                                onChange={(e) => setCurrentPassword(e.target.value)}
                                className="w-full p-3.5 pr-12 bg-slate-50 border border-slate-200 rounded-xl outline-none focus:ring-2 focus:ring-blue-600 focus:bg-white transition-all"
                            />
                            <button type="button" onClick={() => setShowCurrentPassword(!showCurrentPassword)} className="absolute right-3 top-[38px] text-slate-400 hover:text-blue-600">
                                {showCurrentPassword ? <EyeOff className="w-5 h-5" /> : <Eye className="w-5 h-5" />}
                            </button>
                        </div>
                        <div className="relative">
                            <label className="block text-xs font-bold text-slate-500 uppercase tracking-wider mb-2">New Password</label>
                            <input
                                type={showNewPassword ? 'text' : 'password'}
                                value={newPassword}
                                onChange={(e) => setNewPassword(e.target.value)}
                                minLength={6}
                                className="w-full p-3.5 pr-12 bg-slate-50 border border-slate-200 rounded-xl outline-none focus:ring-2 focus:ring-blue-600 focus:bg-white transition-all"
                            />
                            <button type="button" onClick={() => setShowNewPassword(!showNewPassword)} className="absolute right-3 top-[38px] text-slate-400 hover:text-blue-600">
                                {showNewPassword ? <EyeOff className="w-5 h-5" /> : <Eye className="w-5 h-5" />}
                            </button>
                        </div>
                        <div>
                            <label className="block text-xs font-bold text-slate-500 uppercase tracking-wider mb-2">Confirm Password</label>
                            <input
                                type="password"
                                value={confirmPassword}
                                onChange={(e) => setConfirmPassword(e.target.value)}
                                minLength={6}
                                className="w-full p-3.5 bg-slate-50 border border-slate-200 rounded-xl outline-none focus:ring-2 focus:ring-blue-600 focus:bg-white transition-all"
                            />
                        </div>
                    </div>
                </div>

                <div className="flex justify-end pt-2">
                    <button
                        type="submit"
                        disabled={isSaving}
                        className="px-6 py-3 bg-blue-600 hover:bg-blue-700 text-white font-bold rounded-xl shadow-lg shadow-blue-600/25 disabled:opacity-50 transition-all"
                    >
                        {isSaving ? 'Saving...' : 'Save Profile'}
                    </button>
                </div>
            </form>
        </div>
    );
};

export default StaffProfileSettings;
