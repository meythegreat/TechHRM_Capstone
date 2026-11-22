import React, { useEffect, useRef, useState } from 'react';
import axios from 'axios';
import { Camera, CheckCircle2, RefreshCw } from 'lucide-react';
import SecureImage from './SecureImage';
import { submitCleaningProof } from '../services/advancedAttendanceService';
import { clearLiveCaptureDraft, loadLiveCaptureDraft, saveLiveCaptureDraft } from '../utils/offlineAttendanceDraft';

const installedApp = () => window.matchMedia('(display-mode: standalone)').matches
    || window.navigator.standalone === true;

const cameraErrorMessage = (err) => {
    const name = err?.name || '';
    const text = String(err?.message || err || '');
    const denied = name === 'NotAllowedError' || name === 'PermissionDeniedError' || /not allowed|permission/i.test(text);
    if (denied && installedApp() && /iPad|iPhone|iPod/.test(navigator.userAgent)) {
        return 'Allow Camera for WoSPIS in Settings, then try again.';
    }
    if (denied) {
        return 'Camera permission was blocked. Allow the camera, then try again.';
    }
    if (name === 'NotFoundError' || name === 'DevicesNotFoundError') {
        return 'No camera was found on this device.';
    }
    return 'The camera could not start. Allow camera access and try again.';
};

const formatStamp = (date) => {
    try {
        return new Intl.DateTimeFormat('en-PH', {
            year: 'numeric',
            month: 'short',
            day: '2-digit',
            hour: '2-digit',
            minute: '2-digit',
            second: '2-digit',
            hour12: true,
        }).format(date);
    } catch {
        return date.toLocaleString('en-US', {
            month: 'short',
            day: 'numeric',
            year: 'numeric',
            hour: 'numeric',
            minute: '2-digit',
            second: '2-digit',
            hour12: true,
        });
    }
};

/**
 * Live-camera before/after capture for janitorial / daily cleaning.
 * Burns device date+time onto the JPEG at shutter. No gallery / file picker.
 *
 * @param {{
 *   attendanceId?: number | string | null,
 *   beforePath?: string | null,
 *   afterPath?: string | null,
 *   onUpdated?: (data?: any) => void,
 *   insecureCamera?: boolean,
 *   janitorial?: boolean,
 *   presence?: boolean,
 *   groupId?: number | null,
 *   collect?: boolean,
 *   onCollected?: (data?: any) => void,
 *   restored?: { before?: any, after?: any } | null,
 * }} props
 */
export default function CleaningProofCapture({
    attendanceId,
    beforePath = null,
    afterPath = null,
    onUpdated,
    insecureCamera = false,
    janitorial = false,
    presence = false,
    groupId = null,
    collect = false,
    onCollected,
    restored = null,
}) {
    const [phase, setPhase] = useState(() => (restored?.before ? 'after' : (beforePath ? 'after' : 'before')));
    const [live, setLive] = useState(false);
    const [starting, setStarting] = useState(false);
    const [previewUrl, setPreviewUrl] = useState(null);
    const [capturedBlob, setCapturedBlob] = useState(null);
    const [capturedAt, setCapturedAt] = useState(null);
    const [uploading, setUploading] = useState(false);
    const [error, setError] = useState('');
    const [notice, setNotice] = useState('');
    const [kept, setKept] = useState(() => ({
        before: restored?.before || null,
        after: restored?.after || null,
    }));
    const videoRef = useRef(null);
    const streamRef = useRef(null);
    const skipPersist = useRef(false);

    const persistLive = janitorial && !collect;

    useEffect(() => {
        if (!persistLive) return undefined;
        let cancelled = false;
        loadLiveCaptureDraft().then((draft) => {
            if (cancelled || !draft?.blob) return;
            const sameShift = attendanceId
                ? String(draft.attendanceId || '') === String(attendanceId)
                : !draft.attendanceId;
            if (!sameShift) return;
            if (groupId && draft.groupId && String(draft.groupId) !== String(groupId)) return;
            setPhase(draft.phase || 'before');
            setCapturedBlob(draft.blob);
            setCapturedAt(draft.capturedAt ? new Date(draft.capturedAt) : new Date());
            setPreviewUrl(URL.createObjectURL(draft.blob));
        }).catch(() => {});
        return () => {
            cancelled = true;
        };
    }, [persistLive, attendanceId, groupId]);

    useEffect(() => {
        if (!persistLive || !capturedBlob || !capturedAt) return undefined;
        const payload = {
            phase,
            blob: capturedBlob,
            capturedAt: capturedAt.toISOString(),
            groupId: groupId || null,
            attendanceId: attendanceId || null,
        };
        const timer = window.setTimeout(() => {
            saveLiveCaptureDraft(payload).catch(() => {});
        }, 100);
        return () => {
            window.clearTimeout(timer);
            if (skipPersist.current) return;
            saveLiveCaptureDraft(payload).catch(() => {});
        };
    }, [persistLive, capturedBlob, capturedAt, phase, groupId, attendanceId]);

    const beforeDone = collect ? Boolean(kept.before) : Boolean(beforePath);
    const afterDone = collect ? Boolean(kept.after) : Boolean(afterPath);
    const complete = beforeDone && afterDone;

    useEffect(() => {
        if (collect) return;
        if (!beforePath) {
            setPhase('before');
        } else if (!afterPath) {
            setPhase('after');
        }
    }, [collect, beforePath, afterPath]);

    useEffect(() => () => {
        stopCamera();
        if (previewUrl) URL.revokeObjectURL(previewUrl);
    }, []);

    const stopCamera = () => {
        const stream = streamRef.current;
        streamRef.current = null;
        stream?.getTracks().forEach((track) => track.stop());
        if (videoRef.current) {
            videoRef.current.pause();
            videoRef.current.srcObject = null;
        }
        setLive(false);
    };

    const startCamera = async () => {
        setError('');
        setNotice('');
        if (previewUrl) {
            URL.revokeObjectURL(previewUrl);
            setPreviewUrl(null);
        }
        setCapturedBlob(null);
        setCapturedAt(null);

        if (!window.isSecureContext || !navigator.mediaDevices?.getUserMedia) {
            setError('Camera capture needs a secure (https) connection.');
            return;
        }

        setStarting(true);
        try {
            stopCamera();
            const stream = await navigator.mediaDevices.getUserMedia({
                audio: false,
                video: { facingMode: { ideal: 'environment' } },
            }).catch(() => navigator.mediaDevices.getUserMedia({ audio: false, video: true }));
            streamRef.current = stream;
            if (videoRef.current) {
                videoRef.current.srcObject = stream;
                await videoRef.current.play().catch(() => {});
            }
            setLive(true);
        } catch (err) {
            setError(cameraErrorMessage(err));
            stopCamera();
        } finally {
            setStarting(false);
        }
    };

    const burnTimestampFrame = () => {
        const video = videoRef.current;
        if (!video || !video.videoWidth) {
            throw new Error('Camera preview is not ready yet.');
        }
        const captured = new Date();
        const canvas = document.createElement('canvas');
        canvas.width = video.videoWidth;
        canvas.height = video.videoHeight;
        const ctx = canvas.getContext('2d');
        ctx.drawImage(video, 0, 0, canvas.width, canvas.height);

        const stamp = formatStamp(captured);
        const pad = Math.max(12, Math.round(canvas.width * 0.02));
        const fontSize = Math.max(18, Math.round(canvas.width * 0.035));
        ctx.font = `bold ${fontSize}px "Segoe UI", system-ui, sans-serif`;
        const textWidth = ctx.measureText(stamp).width;
        const boxH = fontSize + pad;
        const boxW = textWidth + pad * 2;
        const x = pad;
        const y = canvas.height - boxH - pad;

        ctx.fillStyle = 'rgba(0, 0, 0, 0.55)';
        ctx.fillRect(x, y, boxW, boxH);
        ctx.fillStyle = '#ffffff';
        ctx.textBaseline = 'middle';
        ctx.fillText(stamp, x + pad, y + boxH / 2);

        return new Promise((resolve, reject) => {
            canvas.toBlob((blob) => {
                if (!blob) {
                    reject(new Error('Could not capture the photo.'));
                    return;
                }
                resolve({ blob, captured });
            }, 'image/jpeg', 0.92);
        });
    };

    const takePhoto = async () => {
        setError('');
        setNotice('');
        try {
            skipPersist.current = false;
            const { blob, captured } = await burnTimestampFrame();
            if (previewUrl) URL.revokeObjectURL(previewUrl);
            setPreviewUrl(URL.createObjectURL(blob));
            setCapturedBlob(blob);
            setCapturedAt(captured);
            stopCamera();
        } catch (err) {
            setError(err?.message || 'Could not capture the photo.');
        }
    };

    const keepCollectedPhoto = () => {
        if (!capturedBlob || !capturedAt) return;
        const file = new File([capturedBlob], `${phase}-cleaning.jpg`, { type: 'image/jpeg' });
        const next = {
            ...kept,
            [phase]: {
                file,
                capturedAt: capturedAt.toISOString(),
                url: previewUrl,
            },
        };
        setKept(next);
        setCapturedBlob(null);
        setPreviewUrl(null);
        setNotice(`${phase === 'before' ? 'Before' : 'After'} photo kept. The date and time are stamped on it.`);
        if (phase === 'before') setPhase('after');
        onCollected?.({
            before: next.before,
            after: next.after,
        });
    };

    const uploadPhoto = async () => {
        if (collect) {
            keepCollectedPhoto();
            return;
        }
        if (!capturedBlob || !capturedAt || (!presence && !janitorial && !attendanceId)) return;
        if (presence && !groupId) {
            setError('Choose the area you are supervising.');
            return;
        }
        setUploading(true);
        setError('');
        setNotice('');
        try {
            const form = new FormData();
            form.append('capture_source', 'live_camera');
            form.append('captured_at', capturedAt.toISOString());
            form.append('photo', capturedBlob, `${presence ? 'presence' : phase}-cleaning.jpg`);
            if ((janitorial || presence) && groupId) form.append('group_id', String(groupId));
            if (!presence) form.append('phase', phase);
            const res = presence
                ? await axios.post('/api/attendance/janitorial-supervision', form, {
                    headers: { 'Content-Type': 'multipart/form-data' },
                })
                : janitorial
                ? await axios.post('/api/attendance/janitorial-photo', form, {
                    headers: { 'Content-Type': 'multipart/form-data' },
                })
                : await submitCleaningProof(attendanceId, form);
            setNotice(res.data?.message || `${phase} photo saved.`);
            if (persistLive) {
                skipPersist.current = true;
                clearLiveCaptureDraft().catch(() => {});
            }
            setCapturedBlob(null);
            if (previewUrl) {
                URL.revokeObjectURL(previewUrl);
                setPreviewUrl(null);
            }
            onUpdated?.(res.data);
        } catch (err) {
            setError(err.response?.data?.message
                || err.response?.data?.errors?.photo?.[0]
                || 'Could not save the cleaning photo.');
        } finally {
            setUploading(false);
        }
    };

    if (complete && !collect) {
        return (
            <div className="mt-4 w-full overflow-hidden rounded-[1.5rem] border border-emerald-200/90 bg-white text-left shadow-xs">
                <div className="flex items-center justify-between gap-2 bg-slate-950 px-4 py-3 text-white">
                    <p className="flex items-center gap-2 text-xs font-extrabold uppercase tracking-wider text-emerald-300">
                        <CheckCircle2 className="h-4 w-4" />
                        Cleaning Proof Complete
                    </p>
                    <span className="rounded-full border border-emerald-400/30 bg-emerald-500/15 px-2.5 py-0.5 text-[10px] font-extrabold uppercase tracking-wider text-emerald-300">
                        Verified
                    </span>
                </div>
                <div className="space-y-3 p-4">
                    <div className="grid grid-cols-2 gap-3">
                        <div>
                            <p className="mb-1 text-[10px] font-extrabold uppercase tracking-widest text-slate-400">Before</p>
                            <SecureImage filePath={beforePath} altText="Before cleaning" className="h-28 w-full rounded-xl border border-slate-200 object-cover" />
                        </div>
                        <div>
                            <p className="mb-1 text-[10px] font-extrabold uppercase tracking-widest text-slate-400">After</p>
                            <SecureImage filePath={afterPath} altText="After cleaning" className="h-28 w-full rounded-xl border border-slate-200 object-cover" />
                        </div>
                    </div>
                    <p className="rounded-xl border border-emerald-200/80 bg-emerald-50/70 px-3.5 py-2 text-xs font-bold text-emerald-800">
                        You can clock out with the supervisor passcode or QR.
                    </p>
                </div>
            </div>
        );
    }

    return (
        <div className="mt-4 w-full overflow-hidden rounded-[1.5rem] border border-slate-200/90 bg-white text-left shadow-sm">
            <div className="relative overflow-hidden bg-slate-950 px-4 py-3.5 text-white">
                <div
                    className="pointer-events-none absolute -right-10 -top-10 h-24 w-24 rounded-full bg-amber-500/20 blur-2xl"
                    aria-hidden="true"
                />
                <div className="relative z-10 flex items-center gap-2.5">
                    <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-xl bg-amber-500/20 text-amber-300 ring-1 ring-amber-400/30">
                        <Camera className="h-4 w-4" />
                    </span>
                    <div>
                        <p className="text-xs font-black uppercase tracking-wider text-white">
                            {presence ? 'Presence Photo' : `Cleaning Proof — ${phase} Photo`}
                        </p>
                        <p className="text-[11px] font-medium text-slate-400">Live timestamped camera capture only</p>
                    </div>
                </div>
            </div>

            <div className="space-y-3.5 p-4">
                <p className="text-xs font-medium leading-relaxed text-slate-600">
                    {presence
                        ? 'Take one live on-site photo (gallery uploads are not accepted).'
                        : collect
                        ? 'Capture a live timestamped photo of the area (no gallery uploads).'
                        : persistLive
                            ? 'Capture a live timestamped photo (draft stays saved on this device).'
                            : janitorial && phase === 'before'
                            ? 'Take a live photo of the area to record your timestamped clock-in.'
                            : janitorial && phase === 'after'
                                ? 'Take a live photo of the area to record your timestamped clock-out.'
                                : 'Capture a live timestamped camera photo of the assigned area (no gallery uploads).'}
                </p>

                {!presence && (collect || !janitorial || attendanceId) ? (
                    <div className="grid grid-cols-2 gap-2 rounded-xl border border-slate-200/80 bg-slate-50 p-1">
                        <button
                            type="button"
                            disabled={!collect && beforeDone}
                            onClick={() => { setPhase('before'); setCapturedBlob(null); setPreviewUrl(null); }}
                            className={`rounded-lg py-2 text-xs font-extrabold uppercase tracking-wider transition ${
                                phase === 'before'
                                    ? 'bg-slate-900 text-white shadow-xs'
                                    : 'text-slate-500 hover:text-slate-800'
                            } ${beforeDone ? 'opacity-60' : ''}`}
                        >
                            Before {beforeDone ? '✓' : ''}
                        </button>
                        <button
                            type="button"
                            disabled={!beforeDone}
                            onClick={() => { setPhase('after'); setCapturedBlob(null); setPreviewUrl(null); }}
                            className={`rounded-lg py-2 text-xs font-extrabold uppercase tracking-wider transition ${
                                phase === 'after'
                                    ? 'bg-slate-900 text-white shadow-xs'
                                    : 'text-slate-500 hover:text-slate-800'
                            } ${!beforeDone ? 'opacity-45' : ''}`}
                        >
                            After {afterDone ? '✓' : ''}
                        </button>
                    </div>
                ) : null}

                {insecureCamera && (
                    <p className="rounded-xl border border-amber-200 bg-amber-50 p-3 text-xs font-bold text-amber-800">
                        Camera capture needs https. Open the secure site, then return here.
                    </p>
                )}

                {error && (
                    <p className="rounded-xl border border-rose-200 bg-rose-50 p-3 text-xs font-bold text-rose-700">{error}</p>
                )}
                {notice && (
                    <p className="rounded-xl border border-emerald-200 bg-emerald-50 p-3 text-xs font-bold text-emerald-700">{notice}</p>
                )}

                {previewUrl ? (
                    <div className="space-y-3">
                        <img src={previewUrl} alt={`${phase} preview`} className="max-h-64 w-full rounded-xl border border-slate-200 object-cover" />
                        <div className="grid grid-cols-2 gap-2.5">
                            <button
                                type="button"
                                onClick={startCamera}
                                className="flex items-center justify-center gap-1.5 rounded-xl border border-slate-200 bg-white py-2.5 text-xs font-bold text-slate-800 transition hover:bg-slate-50"
                            >
                                <RefreshCw className="h-4 w-4" />
                                Retake
                            </button>
                            <button
                                type="button"
                                onClick={uploadPhoto}
                                disabled={uploading}
                                className="rounded-xl bg-emerald-600 py-2.5 text-xs font-extrabold uppercase tracking-wider text-white shadow-sm shadow-emerald-600/20 transition hover:bg-emerald-700 disabled:opacity-50"
                            >
                                {uploading ? 'Saving…' : (presence ? 'Submit Presence Photo' : collect ? `Keep ${phase} Photo` : janitorial && phase === 'before' ? 'Clock In With Photo' : janitorial && phase === 'after' ? 'Clock Out With Photo' : `Save ${phase} Photo`)}
                            </button>
                        </div>
                    </div>
                ) : (
                    <div className="space-y-3">
                        {!live && (
                            <button
                                type="button"
                                onClick={startCamera}
                                disabled={starting || insecureCamera}
                                className="flex w-full items-center justify-center gap-2 rounded-xl bg-slate-900 py-3 text-xs font-extrabold uppercase tracking-wider text-white shadow-sm transition hover:bg-blue-600 disabled:opacity-50"
                            >
                                <Camera className="h-4 w-4" />
                                {starting ? 'Starting Camera…' : (presence ? 'Open Camera' : `Open Camera for ${phase}`)}
                            </button>
                        )}
                        <div className="overflow-hidden rounded-xl border border-slate-200 bg-slate-950">
                            <video
                                ref={videoRef}
                                playsInline
                                muted
                                autoPlay
                                className={`block w-full object-cover ${live ? 'h-[220px]' : 'h-0'}`}
                            />
                        </div>
                        {live && (
                            <button
                                type="button"
                                onClick={takePhoto}
                                className="flex w-full items-center justify-center gap-2 rounded-xl bg-amber-500 py-3 text-xs font-extrabold uppercase tracking-wider text-white shadow-sm shadow-amber-500/25 transition hover:bg-amber-600"
                            >
                                <Camera className="h-4 w-4" />
                                Capture {phase} Photo
                            </button>
                        )}
                    </div>
                )}

                {collect && (kept.before || kept.after) && (
                    <div className="grid grid-cols-2 gap-3 pt-1">
                        {['before', 'after'].map((key) => (
                            <div key={key}>
                                <p className="mb-1 text-[10px] font-extrabold uppercase tracking-widest text-slate-400">
                                    {key} {kept[key] ? '✓' : ''}
                                </p>
                                {kept[key]?.url ? (
                                    <img src={kept[key].url} alt={`${key} surroundings`} className="h-28 w-full rounded-xl border border-slate-200 object-cover" />
                                ) : (
                                    <div className="h-28 rounded-xl border border-dashed border-slate-200 bg-slate-50" />
                                )}
                            </div>
                        ))}
                    </div>
                )}
            </div>
        </div>
    );
}
