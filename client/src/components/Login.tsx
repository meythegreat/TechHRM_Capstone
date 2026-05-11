import { useState } from 'react';
import type { FormEvent } from 'react'; // Explicit type-only import
import axios from 'axios';

type LoginProps = {
    onLoggedIn?: () => void;
};

const Login = ({ onLoggedIn }: LoginProps) => {
    // Add basic state types
    const [username, setUsername] = useState<string>('');
    const [password, setPassword] = useState<string>('');
    const [error, setError] = useState<string>('');
    const [isLoading, setIsLoading] = useState<boolean>(false);

    // Define the event type as FormEvent<HTMLFormElement>
    const handleLogin = async (e: FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    setError('');
    setIsLoading(true);

    try {
        const response = await axios.post('/api/login', {
            username,
            password
        });

        const token: string | undefined = response.data?.token;
        if (token) {
            localStorage.setItem('auth_token', token);
        }

        alert(`Login successful! Role: ${response.data.user.role}`);
        onLoggedIn?.();
        // redirect logic here...

    } catch (err: any) {
        if (err.response?.status === 419) {
            setError('Security token error. Please try again.');
        } else if (err.response?.status === 401) {
            setError('Invalid username or password.');
        } else {
            setError('An unexpected error occurred.');
        }
    } finally {
        setIsLoading(false);
    }
};

    return (
    <div className="min-h-screen flex items-center justify-center bg-gray-50 font-sans">
        <div className="w-full max-w-md p-8 space-y-6 bg-white rounded-2xl shadow-xl border border-gray-100">
            <div className="text-center">
                <h1 className="text-3xl font-bold text-gray-900 tracking-tight">TechHRM</h1>
                <p className="mt-2 text-sm text-gray-500 font-medium">Please sign in to your account</p>
            </div>

            {error && (
                <div className="p-3 text-sm text-red-600 bg-red-50 border border-red-200 rounded-lg animate-pulse">
                    {error}
                </div>
            )}

            <form className="space-y-5" onSubmit={handleLogin}>
                <div>
                    <label className="block text-xs font-semibold uppercase tracking-wider text-gray-400 mb-1 ml-1">
                        Username
                    </label>
                    <input
                        type="text"
                        value={username}
                        onChange={(e) => setUsername(e.target.value)}
                        className="w-full px-4 py-3 bg-gray-50 border border-gray-200 rounded-xl focus:ring-2 focus:ring-blue-500 focus:border-transparent outline-none transition-all placeholder:text-gray-300"
                        placeholder="Enter your username"
                        required
                    />
                </div>

                <div>
                    <label className="block text-xs font-semibold uppercase tracking-wider text-gray-400 mb-1 ml-1">
                        Password
                    </label>
                    <input
                        type="password"
                        value={password}
                        onChange={(e) => setPassword(e.target.value)}
                        className="w-full px-4 py-3 bg-gray-50 border border-gray-200 rounded-xl focus:ring-2 focus:ring-blue-500 focus:border-transparent outline-none transition-all placeholder:text-gray-300"
                        placeholder="••••••••"
                        required
                    />
                </div>

                <button
                    type="submit"
                    disabled={isLoading}
                    className="w-full py-4 px-6 bg-blue-600 hover:bg-blue-700 disabled:bg-blue-300 text-white font-bold rounded-xl shadow-lg shadow-blue-200 transition-all active:scale-[0.98]"
                >
                    {isLoading ? (
                        <span className="flex items-center justify-center gap-2">
                            <svg className="animate-spin h-5 w-5 text-white" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24"><circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle><path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path></svg>
                            Authenticating...
                        </span>
                    ) : (
                        'Login'
                    )}
                </button>
            </form>
            
            <p className="text-center text-xs text-gray-400">
                Working Students Program Office &copy; {new Date().getFullYear()}
            </p>
        </div>
    </div>
);
};

export default Login;