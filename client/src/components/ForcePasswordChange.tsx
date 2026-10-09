import { useState } from 'react';
import axios from 'axios';
import { Eye, EyeOff, KeyRound, Loader2 } from 'lucide-react';

interface ForcePasswordChangeProps {
    onChanged: () => void;
}

export default function ForcePasswordChange({ onChanged }: ForcePasswordChangeProps) {
    const [password, setPassword] = useState('');
    const [confirmation, setConfirmation] = useState('');
    const [showPassword, setShowPassword] = useState(false);
    const [error, setError] = useState<string | null>(null);
    const [isSaving, setIsSaving] = useState(false);

    const handleSubmit = async (event: React.FormEvent) => {
        event.preventDefault();
        setError(null);

        if (password.length < 6) {
            setError('Use at least 6 characters.');
            return;
        }

        if (password !== confirmation) {
            setError('The passwords do not match.');
            return;
        }

        setIsSaving(true);
        try {
            await axios.post('/api/user/change-password', {
                password,
                password_confirmation: confirmation,
            });
            onChanged();
        } catch (err: any) {
            const message = !err.response
                ? 'Cannot reach the server. Ensure Laravel is running.'
                : (err.response?.data?.message
                    || err.response?.data?.errors?.password?.[0]
                    || 'Could not update the password.');
            setError(message);
        } finally {
            setIsSaving(false);
        }
    };

    return (
        <div className="fixed inset-0 z-[200] flex items-center justify-center bg-slate-950/55 p-6 backdrop-blur-sm">
            <div
                role="dialog"
                aria-modal="true"
                aria-labelledby="change-password-title"
                className="w-full max-w-md rounded-2xl border border-slate-200 bg-white p-6 shadow-2xl"
            >
                <div className="flex items-center gap-3">
                    <div className="flex h-11 w-11 items-center justify-center rounded-xl bg-blue-50 text-blue-700">
                        <KeyRound className="h-5 w-5" />
                    </div>
                    <div>
                        <h2 id="change-password-title" className="text-lg font-black text-slate-900">Choose a new password</h2>
                        <p className="text-sm font-medium text-slate-500">The temporary password only lasts until you replace it.</p>
                    </div>
                </div>

                <form className="mt-6 space-y-4" onSubmit={handleSubmit}>
                    <PasswordField
                        id="new-password"
                        label="New password"
                        value={password}
                        shown={showPassword}
                        onToggle={() => setShowPassword((current) => !current)}
                        onChange={setPassword}
                        autoFocus
                    />
                    <PasswordField
                        id="confirm-password"
                        label="Confirm password"
                        value={confirmation}
                        shown={showPassword}
                        onChange={setConfirmation}
                    />

                    {error && (
                        <p className="rounded-xl border border-red-100 bg-red-50 px-3 py-2 text-sm font-semibold text-red-700">
                            {error}
                        </p>
                    )}

                    <button
                        type="submit"
                        disabled={isSaving}
                        className="flex w-full items-center justify-center gap-2 rounded-xl bg-gradient-to-r from-blue-600 to-blue-700 py-3.5 text-sm font-bold text-white shadow-lg shadow-blue-600/25 disabled:cursor-not-allowed disabled:opacity-70"
                    >
                        {isSaving ? (
                            <>
                                <Loader2 className="h-4 w-4 animate-spin" />
                                Saving password...
                            </>
                        ) : (
                            'Save new password'
                        )}
                    </button>
                </form>
            </div>
        </div>
    );
}

function PasswordField({
    id,
    label,
    value,
    shown,
    onChange,
    onToggle,
    autoFocus = false,
}: {
    id: string;
    label: string;
    value: string;
    shown: boolean;
    onChange: (value: string) => void;
    onToggle?: () => void;
    autoFocus?: boolean;
}) {
    return (
        <div className="relative">
            <input
                id={id}
                type={shown ? 'text' : 'password'}
                required
                autoFocus={autoFocus}
                value={value}
                onChange={(event) => onChange(event.target.value)}
                className="block w-full appearance-none rounded-xl border border-slate-200 bg-slate-50 px-4 pb-3 pt-6 pr-14 text-base text-slate-900 shadow-sm focus:border-transparent focus:outline-none focus:ring-2 focus:ring-blue-600"
                placeholder=" "
            />
            <label
                htmlFor={id}
                className="absolute left-4 top-4 z-10 origin-left -translate-y-3 scale-75 text-base font-medium text-slate-500"
            >
                {label}
            </label>
            {onToggle && (
                <button
                    type="button"
                    onClick={onToggle}
                    className="absolute inset-y-0 right-1 flex w-12 items-center justify-center rounded-xl text-slate-400 hover:text-blue-600"
                    aria-label={shown ? 'Hide password' : 'Show password'}
                >
                    {shown ? <EyeOff className="h-5 w-5" /> : <Eye className="h-5 w-5" />}
                </button>
            )}
        </div>
    );
}
