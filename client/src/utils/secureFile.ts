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

function baseMime(value: string): string {
    return value.split(';')[0].trim().toLowerCase();
}

function mimeFromPath(path: string): string {
    if (/\.pdf$/i.test(path)) return 'application/pdf';
    if (/\.png$/i.test(path)) return 'image/png';
    if (/\.jpe?g$/i.test(path)) return 'image/jpeg';
    if (/\.gif$/i.test(path)) return 'image/gif';
    if (/\.webp$/i.test(path)) return 'image/webp';
    return '';
}

function isUsefulMime(mime: string): boolean {
    return mime !== ''
        && mime !== 'application/octet-stream'
        && mime !== 'text/plain'
        && mime !== 'text/html';
}

function preferredMime(headerMime: string, blobMime: string, path: string): string {
    if (isUsefulMime(headerMime)) return headerMime;
    const fromPath = mimeFromPath(path);
    if (fromPath) return fromPath;
    if (isUsefulMime(blobMime)) return blobMime;
    return blobMime || headerMime || 'application/octet-stream';
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
        const raw: Blob = response.data;
        const headerMime = baseMime(String(response.headers?.['content-type'] || ''));
        const blobMime = baseMime(raw.type || '');
        const mime = preferredMime(headerMime, blobMime, path);
        const blob = raw.type.toLowerCase() === mime ? raw : new Blob([raw], { type: mime });
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

/**
 * Opens a secured file in a new tab.
 * The blank tab is opened before the download so the browser still treats it as the click,
 * and the blob is loaded in that same tab. A noopener window cannot read the blob and stays blank.
 */
export async function openSecureFile(filePath: string): Promise<void> {
    const preview = window.open('about:blank', '_blank');
    if (!preview) {
        throw new Error('The browser blocked the document window. Allow pop-ups for this site and try again.');
    }

    try {
        const payload = await fetchSecureFile(filePath);
        preview.location.replace(payload.url);
        window.setTimeout(() => URL.revokeObjectURL(payload.url), 60_000);
    } catch (error) {
        preview.close();
        throw error;
    }
}
