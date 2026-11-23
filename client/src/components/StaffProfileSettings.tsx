import { useState, useEffect } from 'react';
import axios from 'axios';
import { motion } from 'framer-motion';
import Toast from './Toast';
import {
    UserCircle,
    ShieldCheck,
    Eye,
    EyeOff,
    Lock,
    Building2,
    Save,
} from 'lucide-react';
import SecureImage from './SecureImage';
import AvatarCropDialog from './AvatarCropDialog';
import AvatarPhotoMenu from './AvatarPhotoMenu';
import { normalizeFilePath } from '../utils/secureFile';
import { emitRealtimeRefresh } from '../utils/realtime';

interface StaffProfileSettingsProps {
    onProfileUpdated?: (name: string, avatarPath: string | null) => void;
}

const ROLES_WITH_EMPLOYEE_ID = [
    'Supervisor',
    'WSPO Staff',
    'Department Secretary',
    'Immediate Supervisor',
];

const StaffProfileSettings = ({ onProfileUpdated }: StaffProfileSettingsProps) => {
    const userRole = localStorage.getItem('user_role') || 'Supervisor';
    const canEditEmployeeId = ROLES_WITH_EMPLOYEE_ID.includes(userRole);

    const [name, setName] = useState(localStorage.getItem('user_name') || '');
    const [username, setUsername] = useState('');
    const [email, setEmail] = useState('');
    const [phoneNumber, setPhoneNumber] = useState('');
    const [employeeId, setEmployeeId] = useState('');
    const [assignedOffice, setAssignedOffice] = useState(
        localStorage.getItem('assigned_office') || ''
    );
    const [avatarPath, setAvatarPath] = useState<string | null>(() =>
        normalizeFilePath(localStorage.getItem('profile_picture'))
    );
    const [cropSource, setCropSource] = useState<string | null>(null);

    const [currentPassword, setCurrentPassword] = useState('');
    const [newPassword, setNewPassword] = useState('');
    const [confirmPassword, setConfirmPassword] = useState('');
    const [showCurrentPassword, setShowCurrentPassword] = useState(false);
    const [showNewPassword, setShowNewPassword] = useState(false);

    const [isSaving, setIsSaving] = useState(false);
    const [isUploading, setIsUploading] = useState(false);
    const [message, setMessage] = useState<{ text: string; type: 'success' | 'error' } | null>(
        null
    );

    useEffect(() => {
        axios
            .get('/api/user')
            .then((response) => {
                const user = response.data;
                setName(user.name || '');
                setUsername(user.username || '');
                setEmail(user.email || '');
                setPhoneNumber(user.phone_number || '');
                setEmployeeId(user.profile?.employee_id || '');
                setAssignedOffice(
                    user.profile?.assigned_office || localStorage.getItem('assigned_office') || ''
                );

                if (user.profile_picture) {
                    const path = normalizeFilePath(user.profile_picture);
                    setAvatarPath(path);
                    if (path) localStorage.setItem('profile_picture', path);
                } else {
                    setAvatarPath(null);
                    localStorage.removeItem('profile_picture');
                }
            })
            .catch(() => {
                setMessage({ text: 'Failed to load profile details.', type: 'error' });
            });
    }, []);

    const showFeedback = (text: string, type: 'success' | 'error') => {
        setMessage({ text, type });
    };

    const closeCrop = () => {
        setCropSource((current) => {
            if (current) URL.revokeObjectURL(current);
            return null;
        });
    };

    const handleImageSelected = (e: React.ChangeEvent<HTMLInputElement>) => {
        const file = e.target.files?.[0];
        e.target.value = '';
        if (!file) return;
        if (!file.type.startsWith('image/')) {
            showFeedback('Choose a JPG or PNG image.', 'error');
            return;
        }
        if (cropSource) URL.revokeObjectURL(cropSource);
        setCropSource(URL.createObjectURL(file));
    };

    const uploadCroppedAvatar = async (file: File) => {
        closeCrop();
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
            emitRealtimeRefresh();
            showFeedback('Profile picture updated successfully.', 'success');
        } catch {
            showFeedback('Failed to upload image. Ensure it is under 2MB.', 'error');
        } finally {
            setIsUploading(false);
        }
    };

    const removeAvatar = async () => {
        setIsUploading(true);
        try {
            await axios.delete('/api/user/avatar');
            setAvatarPath(null);
            localStorage.removeItem('profile_picture');
            onProfileUpdated?.(name, null);
            emitRealtimeRefresh();
            showFeedback('Profile picture removed.', 'success');
        } catch {
            showFeedback('Failed to remove profile picture.', 'error');
        } finally {
            setIsUploading(false);
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
                username: username.trim(),
                email: email.trim(),
                phone_number: phoneNumber.trim(),
            };

            if (canEditEmployeeId) {
                payload.employee_id = employeeId.trim();
            }

            if (newPassword) {
                payload.password = newPassword;
                payload.password_confirmation = confirmPassword;
                payload.current_password = currentPassword;
            }

            const response = await axios.put('/api/user', payload);
            const updatedUser = response.data.user;

            localStorage.setItem('user_name', updatedUser.name);
            onProfileUpdated?.(updatedUser.name, avatarPath);
            emitRealtimeRefresh();

            setCurrentPassword('');
            setNewPassword('');
            setConfirmPassword('');
            showFeedback('Profile saved successfully.', 'success');
        } catch (err: any) {
            const validation = err.response?.data?.errors;
            const firstError = validation ? Object.values(validation).flat()[0] : null;
            showFeedback(
                (typeof firstError === 'string' ? firstError : null) ||
                    err.response?.data?.message ||
                    'Failed to save profile.',
                'error'
            );
        } finally {
            setIsSaving(false);
        }
    };

    const firstName = name.split(' ')[0] || 'U';

    return (
        <div className="mx-auto max-w-4xl space-y-6 p-4 font-sans sm:p-8">
            {/* OBSIDIAN ACCOUNT HERO */}
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
                    className="pointer-events-none absolute -right-20 -top-20 h-72 w-72 rounded-full bg-blue-600/25 blur-3xl"
                    aria-hidden="true"
                />
                <div
                    className="pointer-events-none absolute -bottom-24 left-1/4 h-64 w-64 rounded-full bg-indigo-500/20 blur-3xl"
                    aria-hidden="true"
                />

                <div className="relative z-10 flex flex-col gap-6 sm:flex-row sm:items-end sm:justify-between">
                    <div className="min-w-0 max-w-xl">
                        <span className="inline-flex items-center gap-1.5 rounded-full border border-blue-400/25 bg-blue-500/15 px-3 py-1 text-[11px] font-bold uppercase tracking-widest text-blue-300">
                            <UserCircle className="h-3.5 w-3.5 text-blue-400" />
                            Account Management
                        </span>
                        <h1 className="mt-3.5 text-3xl font-black tracking-tight text-white sm:text-4xl">
                            Profile Settings
                        </h1>
                        <p className="mt-2 text-sm font-medium leading-relaxed text-slate-300">
                            {canEditEmployeeId
                                ? 'Update your username, email, phone number, employee ID, profile photo, and password.'
                                : 'Update your username, email, phone number, profile photo, and password.'}
                        </p>
                    </div>

                    <div className="flex shrink-0 items-center gap-3.5 self-start rounded-2xl border border-white/10 bg-white/[0.06] px-5 py-4 backdrop-blur-xl sm:self-auto">
                        <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-blue-500/20 text-blue-300 ring-1 ring-blue-400/30">
                            <ShieldCheck className="h-5 w-5" />
                        </div>
                        <div>
                            <p className="text-[10px] font-extrabold uppercase tracking-widest text-slate-400">
                                Access Level
                            </p>
                            <p className="mt-0.5 text-sm font-black text-white">{userRole}</p>
                        </div>
                    </div>
                </div>
            </motion.header>

            <Toast
                message={message?.text ?? null}
                type={message?.type}
                onClose={() => setMessage(null)}
            />

            {/* PROFILE & SECURITY FORM */}
            <motion.form
                initial={{ opacity: 0, y: 12 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ duration: 0.38, ease: [0.22, 1, 0.36, 1] }}
                onSubmit={handleSave}
                className="space-y-8 rounded-[1.75rem] border border-slate-200/90 bg-white p-6 shadow-sm sm:p-8"
            >
                <div className="flex flex-col items-start gap-8 md:flex-row">
                    {/* Avatar Column */}
                    <div className="flex w-full flex-col items-center md:w-1/3">
                        <div className="group relative cursor-pointer">
                            <div className="flex h-40 w-40 items-center justify-center overflow-hidden rounded-full border-4 border-white bg-slate-100 shadow-xl ring-1 ring-slate-200">
                                {avatarPath ? (
                                    <SecureImage
                                        filePath={avatarPath}
                                        altText="Profile"
                                        className="h-full w-full object-cover"
                                        fallback={
                                            <span className="text-5xl font-black text-slate-400">
                                                {firstName.charAt(0)}
                                            </span>
                                        }
                                    />
                                ) : (
                                    <span className="text-5xl font-black text-slate-400">
                                        {firstName.charAt(0)}
                                    </span>
                                )}
                            </div>
                            <AvatarPhotoMenu
                                inputId="staffAvatarUpload"
                                hasPicture={Boolean(avatarPath)}
                                disabled={isUploading}
                                onFileSelected={handleImageSelected}
                                onRemove={removeAvatar}
                            />
                        </div>
                        <p className="mt-4 max-w-[220px] text-center text-xs font-medium leading-relaxed text-slate-500">
                            Tap the camera button to change or remove your photo. JPG or PNG, up to 2MB.
                        </p>
                    </div>

                    {/* Editable Details Column */}
                    <div className="w-full flex-1 space-y-5">
                        <div className="grid grid-cols-1 gap-5 sm:grid-cols-2">
                            <div>
                                <label className="mb-1.5 block text-[10px] font-extrabold uppercase tracking-widest text-slate-400">
                                    Full Name
                                </label>
                                <input
                                    type="text"
                                    required
                                    value={name}
                                    onChange={(e) => setName(e.target.value)}
                                    className="w-full rounded-xl border border-slate-200 bg-slate-50 p-3.5 text-sm font-bold text-slate-900 outline-none transition-all focus:border-blue-600 focus:bg-white focus:ring-2 focus:ring-blue-600/20"
                                />
                            </div>

                            <div>
                                <label className="mb-1.5 block text-[10px] font-extrabold uppercase tracking-widest text-slate-400">
                                    Username
                                </label>
                                <input
                                    type="text"
                                    required
                                    value={username}
                                    onChange={(e) => setUsername(e.target.value)}
                                    autoComplete="username"
                                    className="w-full rounded-xl border border-slate-200 bg-slate-50 p-3.5 font-mono text-sm font-bold text-slate-900 outline-none transition-all focus:border-blue-600 focus:bg-white focus:ring-2 focus:ring-blue-600/20"
                                />
                                <p className="mt-2 text-xs font-medium text-slate-400">
                                    You can sign in with this username or your email.
                                </p>
                            </div>

                            <div>
                                <label className="mb-1.5 block text-[10px] font-extrabold uppercase tracking-widest text-slate-400">
                                    Email Address
                                </label>
                                <input
                                    type="email"
                                    required
                                    value={email}
                                    onChange={(e) => setEmail(e.target.value)}
                                    placeholder="name@filamer.edu.ph"
                                    className="w-full rounded-xl border border-slate-200 bg-slate-50 p-3.5 text-sm font-semibold text-slate-900 outline-none transition-all placeholder:text-slate-400 focus:border-blue-600 focus:bg-white focus:ring-2 focus:ring-blue-600/20"
                                />
                            </div>

                            <div>
                                <label className="mb-1.5 block text-[10px] font-extrabold uppercase tracking-widest text-slate-400">
                                    Contact Number
                                </label>
                                <input
                                    type="text"
                                    value={phoneNumber}
                                    onChange={(e) => setPhoneNumber(e.target.value)}
                                    placeholder="Optional"
                                    className="w-full rounded-xl border border-slate-200 bg-slate-50 p-3.5 text-sm font-semibold text-slate-900 outline-none transition-all placeholder:text-slate-400 focus:border-blue-600 focus:bg-white focus:ring-2 focus:ring-blue-600/20"
                                />
                            </div>

                            {canEditEmployeeId && (
                                <div>
                                    <label className="mb-1.5 block text-[10px] font-extrabold uppercase tracking-widest text-slate-400">
                                        Employee ID
                                    </label>
                                    <input
                                        type="text"
                                        value={employeeId}
                                        onChange={(e) => setEmployeeId(e.target.value)}
                                        placeholder="EMP-2026-001"
                                        className="w-full rounded-xl border border-slate-200 bg-slate-50 p-3.5 font-mono text-sm font-bold text-slate-900 outline-none transition-all placeholder:text-slate-400 focus:border-blue-600 focus:bg-white focus:ring-2 focus:ring-blue-600/20"
                                    />
                                </div>
                            )}

                            {(userRole === 'WSPO Staff' || userRole === 'Supervisor') && (
                                <div className="sm:col-span-2">
                                    <label className="mb-1.5 flex items-center gap-1.5 text-[10px] font-extrabold uppercase tracking-widest text-slate-400">
                                        <Building2 className="h-3.5 w-3.5 text-slate-400" />
                                        {userRole === 'WSPO Staff'
                                            ? 'WSPO Position'
                                            : 'Supervised Department'}
                                    </label>
                                    <input
                                        type="text"
                                        disabled
                                        value={assignedOffice || 'Not assigned'}
                                        className="w-full cursor-not-allowed rounded-xl border border-slate-200 bg-slate-50 p-3.5 text-sm font-bold text-slate-900 opacity-85"
                                    />
                                    <p className="mt-2 text-xs font-medium text-slate-400">
                                        Contact a Super Admin to change organizational assignment.
                                    </p>
                                </div>
                            )}
                        </div>
                    </div>
                </div>

                {/* PASSWORD SECURITY SECTION */}
                <div className="space-y-5 border-t border-slate-100 pt-7">
                    <div className="flex items-center gap-3">
                        <span className="flex h-10 w-10 items-center justify-center rounded-2xl bg-slate-900 text-white">
                            <Lock className="h-4 w-4" />
                        </span>
                        <div>
                            <h2 className="text-base font-black tracking-tight text-slate-900">
                                Change Password
                            </h2>
                            <p className="text-xs font-medium text-slate-500">
                                Leave blank if you do not want to change your password.
                            </p>
                        </div>
                    </div>

                    <div className="grid grid-cols-1 gap-5 sm:grid-cols-3">
                        <div className="relative">
                            <label className="mb-1.5 block text-[10px] font-extrabold uppercase tracking-widest text-slate-400">
                                Current Password
                            </label>
                            <input
                                type={showCurrentPassword ? 'text' : 'password'}
                                value={currentPassword}
                                onChange={(e) => setCurrentPassword(e.target.value)}
                                className="w-full rounded-xl border border-slate-200 bg-slate-50 p-3.5 pr-11 text-sm font-semibold outline-none transition-all focus:border-blue-600 focus:bg-white focus:ring-2 focus:ring-blue-600/20"
                            />
                            <button
                                type="button"
                                onClick={() => setShowCurrentPassword(!showCurrentPassword)}
                                className="absolute right-3 top-[34px] text-slate-400 transition-colors hover:text-blue-600"
                                aria-label="Toggle current password visibility"
                            >
                                {showCurrentPassword ? (
                                    <EyeOff className="h-4 w-4" />
                                ) : (
                                    <Eye className="h-4 w-4" />
                                )}
                            </button>
                        </div>

                        <div className="relative">
                            <label className="mb-1.5 block text-[10px] font-extrabold uppercase tracking-widest text-slate-400">
                                New Password
                            </label>
                            <input
                                type={showNewPassword ? 'text' : 'password'}
                                value={newPassword}
                                onChange={(e) => setNewPassword(e.target.value)}
                                minLength={6}
                                className="w-full rounded-xl border border-slate-200 bg-slate-50 p-3.5 pr-11 text-sm font-semibold outline-none transition-all focus:border-blue-600 focus:bg-white focus:ring-2 focus:ring-blue-600/20"
                            />
                            <button
                                type="button"
                                onClick={() => setShowNewPassword(!showNewPassword)}
                                className="absolute right-3 top-[34px] text-slate-400 transition-colors hover:text-blue-600"
                                aria-label="Toggle new password visibility"
                            >
                                {showNewPassword ? (
                                    <EyeOff className="h-4 w-4" />
                                ) : (
                                    <Eye className="h-4 w-4" />
                                )}
                            </button>
                        </div>

                        <div>
                            <label className="mb-1.5 block text-[10px] font-extrabold uppercase tracking-widest text-slate-400">
                                Confirm Password
                            </label>
                            <input
                                type="password"
                                value={confirmPassword}
                                onChange={(e) => setConfirmPassword(e.target.value)}
                                minLength={6}
                                className="w-full rounded-xl border border-slate-200 bg-slate-50 p-3.5 text-sm font-semibold outline-none transition-all focus:border-blue-600 focus:bg-white focus:ring-2 focus:ring-blue-600/20"
                            />
                        </div>
                    </div>
                </div>

                <div className="flex justify-end border-t border-slate-100 pt-5">
                    <button
                        type="submit"
                        disabled={isSaving}
                        className="inline-flex items-center gap-2 rounded-xl bg-slate-900 px-6 py-3 text-xs font-extrabold uppercase tracking-wider text-white shadow-sm transition-all hover:bg-blue-600 disabled:opacity-50"
                    >
                        <Save className="h-4 w-4" />
                        {isSaving ? 'Saving…' : 'Save Profile'}
                    </button>
                </div>
            </motion.form>

            {cropSource && (
                <AvatarCropDialog
                    imageUrl={cropSource}
                    onCancel={closeCrop}
                    onConfirm={uploadCroppedAvatar}
                />
            )}
        </div>
    );
};

export default StaffProfileSettings;