import { useState, useEffect } from 'react';
import axios from 'axios';
import { normalizeFilePath } from '../utils/secureFile';

interface SecureImageProps {
    filePath: string;
    altText?: string;
    className?: string;
}

export default function SecureImage({ filePath, altText = 'Secure Image', className = '' }: SecureImageProps) {
    const [imageSrc, setImageSrc] = useState<string | null>(null);
    const [error, setError] = useState(false);

    useEffect(() => {
        const path = normalizeFilePath(filePath);
        if (!path) return;

        let objectUrl: string | null = null;
        let cancelled = false;

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
        return (
            <div className={`bg-gray-200 flex items-center justify-center text-xs text-gray-500 ${className}`}>
                Image Unavailable
            </div>
        );
    }

    if (!imageSrc) {
        return <div className={`bg-gray-100 animate-pulse ${className}`} />;
    }

    return <img src={imageSrc} alt={altText} className={className} />;
}
