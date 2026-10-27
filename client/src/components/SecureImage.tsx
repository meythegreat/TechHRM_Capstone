import { useState, useEffect, type ReactNode } from 'react';
import axios from 'axios';
import { normalizeFilePath } from '../utils/secureFile';

interface SecureImageProps {
    filePath: string;
    altText?: string;
    className?: string;
    /** Shown when the image cannot be loaded (e.g. initials for avatars). */
    fallback?: ReactNode;
}

export default function SecureImage({ filePath, altText = 'Secure Image', className = '', fallback }: SecureImageProps) {
    const [imageSrc, setImageSrc] = useState<string | null>(null);
    const [error, setError] = useState(false);

    useEffect(() => {
        const path = normalizeFilePath(filePath);
        let objectUrl: string | null = null;
        let cancelled = false;

        setImageSrc(null);
        setError(false);

        if (!path) {
            setError(true);
            return;
        }

        const fetchImage = async () => {
            try {
                const response = await axios.get('/api/secure-file', {
                    params: { path },
                    responseType: 'blob',
                });

                if (cancelled) return;

                objectUrl = URL.createObjectURL(response.data);
                setImageSrc(objectUrl);
                setError(false);
            } catch (err) {
                if (!cancelled) {
                    console.error('Failed to load secure file', err);
                    setError(true);
                }
            }
        };

        fetchImage();

        return () => {
            cancelled = true;
            if (objectUrl) URL.revokeObjectURL(objectUrl);
        };
    }, [filePath]);

    if (error) {
        if (fallback !== undefined) {
            return <>{fallback}</>;
        }
        return <div className={`bg-gray-100 ${className}`} aria-hidden="true" />;
    }

    if (!imageSrc) {
        return <div className={`bg-gray-100 animate-pulse ${className}`} />;
    }

    return <img src={imageSrc} alt={altText} className={className} />;
}
