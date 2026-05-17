import axios from 'axios';

/** Normalize legacy public URLs to storage-relative paths (e.g. avatars/abc.jpg). */
export function normalizeFilePath(filePath: string | null | undefined): string | null {
    if (!filePath) return null;

    const trimmed = filePath.trim();
    if (!trimmed) return null;

    try {
        if (trimmed.startsWith('http://') || trimmed.startsWith('https://')) {
            const url = new URL(trimmed);
            const storageIdx = url.pathname.indexOf('/storage/');
            if (storageIdx !== -1) {
                return decodeURIComponent(url.pathname.slice(storageIdx + '/storage/'.length));
            }
        }
    } catch {
        // fall through
    }

    const storageMatch = trimmed.match(/\/storage\/(.+)$/);
    if (storageMatch) {
        return decodeURIComponent(storageMatch[1]);
    }

    if (trimmed.startsWith('avatars/') || trimmed.startsWith('requirements/')) {
        return trimmed;
    }

    const avatarsIdx = trimmed.indexOf('avatars/');
    if (avatarsIdx !== -1) {
        return trimmed.slice(avatarsIdx);
    }

    const requirementsIdx = trimmed.indexOf('requirements/');
    if (requirementsIdx !== -1) {
        return trimmed.slice(requirementsIdx);
    }

    return trimmed;
}

export async function openSecureFile(filePath: string): Promise<void> {
    const path = normalizeFilePath(filePath);
    if (!path) return;

    const response = await axios.get('/api/secure-file', {
        params: { path },
        responseType: 'blob',
    });

    const objectUrl = URL.createObjectURL(response.data);
    window.open(objectUrl, '_blank', 'noopener,noreferrer');
    setTimeout(() => URL.revokeObjectURL(objectUrl), 60_000);
}
