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

    if (
        trimmed.startsWith('avatars/')
        || trimmed.startsWith('requirements/')
        || trimmed.startsWith('application-documents/')
        || trimmed.startsWith('staffing-approvals/')
        || trimmed.startsWith('extra-hours-approvals/')
    ) {
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

export type SecureFileKind = 'image' | 'pdf' | 'other';

export type SecureFilePayload = {
    url: string;
    mime: string;
    kind: SecureFileKind;
    blob: Blob;
};

async function rethrowSecureFileError(error: any): Promise<never> {
    const data = error?.response?.data;
    if (data instanceof Blob) {
        try {
            const text = await data.text();
            const parsed = JSON.parse(text);
            if (parsed?.message) {
                const next = new Error(parsed.message);
                (next as any).response = { data: parsed, status: error?.response?.status };
                throw next;
            }
        } catch (parsedError) {
            if (parsedError instanceof Error && (parsedError as any).response) {
                throw parsedError;
            }
        }
    }
    throw error;
}

function kindForMime(mime: string, path: string): SecureFileKind {
    if (mime.startsWith('image/') || /\.(jpe?g|png|gif|webp)$/i.test(path)) return 'image';
    if (mime === 'application/pdf' || /\.pdf$/i.test(path)) return 'pdf';
    return 'other';
}

/** Fetch a secured file as a blob URL for in-app preview. Caller must revoke `url`. */
export async function fetchSecureFile(filePath: string): Promise<SecureFilePayload> {
    const path = normalizeFilePath(filePath);
    if (!path) {
        throw new Error('Invalid file path.');
    }

    try {
        const response = await axios.get('/api/secure-file', {
            params: { path },
            responseType: 'blob',
        });
        const blob: Blob = response.data;
        const mime = blob.type || String(response.headers?.['content-type'] || 'application/octet-stream');
        return {
            url: URL.createObjectURL(blob),
            mime,
            kind: kindForMime(mime, path),
            blob,
        };
    } catch (error: any) {
        return rethrowSecureFileError(error);
    }
}

/** Opens a secured file in a new tab (legacy). Prefer in-app SecureFileViewerModal. */
export async function openSecureFile(filePath: string): Promise<void> {
    const payload = await fetchSecureFile(filePath);
    window.open(payload.url, '_blank', 'noopener,noreferrer');
    setTimeout(() => URL.revokeObjectURL(payload.url), 60_000);
}
