import SecureImage from './SecureImage';
import { normalizeFilePath } from '../utils/secureFile';

interface UserAvatarProps {
    name?: string | null;
    picture?: string | null;
    className?: string;
}

export default function UserAvatar({
    name,
    picture,
    className = 'w-10 h-10 rounded-full bg-slate-100 border-2 border-slate-200 text-slate-600 text-sm',
}: UserAvatarProps) {
    const path = normalizeFilePath(picture || '');
    const firstName = String(name || '').trim().split(/\s+/)[0] || '';
    const initial = (firstName.charAt(0) || '?').toUpperCase();
    const initials = <span aria-hidden="true">{initial}</span>;

    return (
        <div className={`flex items-center justify-center font-semibold shrink-0 overflow-hidden shadow-sm ${className}`}>
            {path ? (
                <SecureImage
                    filePath={path}
                    altText={firstName || 'Profile'}
                    className="w-full h-full object-cover"
                    fallback={initials}
                />
            ) : (
                initials
            )}
        </div>
    );
}
