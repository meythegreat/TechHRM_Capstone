import React, { useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import axios from 'axios';
import { Camera, CheckCircle2, Flashlight, FlashlightOff, RefreshCw } from 'lucide-react';
import SecureImage from './SecureImage';
import { submitCleaningProof } from '../services/advancedAttendanceService';
import { clearLiveCaptureDraft, loadLiveCaptureDraft, saveLiveCaptureDraft } from '../utils/offlineAttendanceDraft';

const installedApp = () => window.matchMedia('(display-mode: standalone)').matches
    || window.navigator.standalone === true;

const phoneCamera = () => /Android|iPhone|iPad|iPod/i.test(navigator.userAgent);

const trackSupportsTorch = (track) => {
    try {
        if (track?.getCapabilities?.().torch) return true;
    } catch {
        // Some phones omit torch from capabilities until a constraint is applied.
    }
    try {
        return Boolean(navigator.mediaDevices?.getSupportedConstraints?.().torch);
    } catch {
        return false;
    }
};

const torchIs = (track, enabled) => {
    const settings = track?.getSettings?.() || {};
    return 'torch' in settings && Boolean(settings.torch) === Boolean(enabled);
};

const delay = (ms) => new Promise((resolve) => { window.setTimeout(resolve, ms); });

const applyTorch = async (track, enabled, { force = false } = {}) => {
    if (!track?.applyConstraints || track.readyState === 'ended') return false;
    track.enabled = true;
    let caps = {};
    try {
        caps = track.getCapabilities?.() || {};
    } catch {
        caps = {};
    }
    if (!force && 'torch' in caps && !caps.torch) return false;

    const existing = track.getConstraints?.() || {};
    const shapes = [
        { ...existing, advanced: [...(existing.advanced || []), { torch: enabled }] },
        { advanced: [{ torch: enabled }] },
        { ...existing, torch: enabled },
        { torch: enabled },
    ];
    if (enabled && Array.isArray(caps.focusMode) && caps.focusMode.includes('continuous')) {
        shapes.push({ advanced: [{ focusMode: 'continuous' }, { torch: enabled }] });
    }

    for (const constraints of shapes) {
        try {
            await track.applyConstraints(constraints);
            if (enabled) {
                await delay(120);
                await track.applyConstraints(constraints);
            }
        } catch {
            continue;
        }
        if (torchIs(track, enabled)) return true;
        const keys = Object.keys(constraints);
        if (keys.length === 1 && keys[0] === 'torch') return true;
    }
    return false;
};

const cameraHasTorch = (stream) => {
    try {
        return Boolean(stream?.getVideoTracks?.()[0]?.getCapabilities?.().torch);
    } catch {
        return false;
    }
};

const pickTorchCamera = async (stream) => {
    if (cameraHasTorch(stream)) return stream;
    let current = stream;
    let cameras = [];
    try {
        cameras = await rearCameras();
    } catch {
        cameras = [];
    }
    const openedId = stream?.getVideoTracks?.()[0]?.getSettings?.().deviceId;
    for (const camera of cameras) {
        if (!camera.deviceId || camera.deviceId === openedId) continue;
        current?.getTracks?.().forEach((item) => item.stop());
        try {
            current = await navigator.mediaDevices.getUserMedia({
                audio: false,
                video: { deviceId: { exact: camera.deviceId } },
            });
        } catch {
            current = null;
            continue;
        }
        if (cameraHasTorch(current)) return current;
    }
    return current || stream;
};

const rearCameras = async () => {
    const cameras = (await navigator.mediaDevices.enumerateDevices())
        .filter((device) => device.kind === 'videoinput');
    const rank = (label) => {
        const text = String(label || '').toLowerCase();
        if (/front|user|face|facetime/.test(text)) return 9;
        if (/ultra|telephoto|\btele\b|depth|mono/.test(text)) return 3;
        if (/back|rear|environment/.test(text)) return 0;
        return 4;
    };
    return cameras
        .filter((device) => rank(device.label) < 9)
        .sort((a, b) => rank(a.label) - rank(b.label) || String(a.label).localeCompare(String(b.label)));
};

const waitForVideo = (video) => new Promise((resolve) => {
    if (!video) {
        resolve();
        return;
    }
    if (video.readyState >= 2 && video.videoWidth) {
        resolve();
        return;
    }
    const done = () => {
        video.removeEventListener('loadeddata', done);
        resolve();
    };
    video.addEventListener('loadeddata', done);
    window.setTimeout(done, 900);
});

const openRearStream = async () => {
    const attempts = [
        { audio: false, video: { facingMode: { exact: 'environment' } } },
        { audio: false, video: { facingMode: 'environment' } },
        { audio: false, video: true },
    ];
    let stream = null;
    let lastError = null;
    for (const constraints of attempts) {
        try {
            stream = await navigator.mediaDevices.getUserMedia(constraints);
            break;
        } catch (err) {
            lastError = err;
        }
    }
    if (!stream) throw lastError || new Error('camera');

    const track = stream.getVideoTracks()[0];
    if (track?.getSettings?.().facingMode === 'environment') return stream;

    try {
        const cameras = (await navigator.mediaDevices.enumerateDevices())
            .filter((device) => device.kind === 'videoinput');
        const rear = cameras.find((device) => /back|rear|environment/i.test(device.label));
        const currentId = track?.getSettings?.().deviceId;
        if (rear?.deviceId && rear.deviceId !== currentId) {
            const rearStream = await navigator.mediaDevices.getUserMedia({
                audio: false,
                video: { deviceId: { exact: rear.deviceId } },
            });
            stream.getTracks().forEach((item) => item.stop());
            return rearStream;
        }
    } catch {
        // Keep the stream that already started.
    }
    return stream;
};

const captureFlashBitmap = async (track) => {
    if (!track || typeof ImageCapture === 'undefined') return null;
    try {
        const imageCapture = new ImageCapture(track);
        const caps = await imageCapture.getPhotoCapabilities();
        if (!(caps?.fillLightMode || []).includes('flash')) return null;
        const blob = await imageCapture.takePhoto({ fillLightMode: 'flash' });
        return await createImageBitmap(blob);
    } catch {
        return null;
    }
};

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
    const [torchOn, setTorchOn] = useState(false);
    const [torchBusy, setTorchBusy] = useState(false);
    const [torchAvailable, setTorchAvailable] = useState(false);
    const [cameraReleased, setCameraReleased] = useState(false);
    const videoRef = useRef(null);
    const flashFileRef = useRef(null);
    const streamRef = useRef(null);
    const skipPersist = useRef(false);
    const torchOnRef = useRef(false);
    const torchPreference = useRef(null);
    const torchReadyAt = useRef(0);
    const gotFlashFile = useRef(false);

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
        const track = stream?.getVideoTracks?.()[0];
        const finish = () => {
            stream?.getTracks().forEach((item) => item.stop());
            if (videoRef.current) {
                videoRef.current.pause();
                videoRef.current.srcObject = null;
            }
            torchOnRef.current = false;
            torchReadyAt.current = 0;
            setTorchOn(false);
            setTorchAvailable(false);
            setLive(false);
        };
        if (torchOnRef.current && track) {
            return applyTorch(track, false).finally(finish);
        }
        finish();
        return Promise.resolve();
    };

    const markTorch = (enabled) => {
        torchOnRef.current = Boolean(enabled);
        torchReadyAt.current = enabled ? Date.now() + 600 : 0;
        setTorchOn(torchOnRef.current);
    };

    const showStream = async (stream) => {
        streamRef.current = stream;
        const video = videoRef.current;
        if (!video) return;
        video.srcObject = stream;
        video.muted = true;
        setLive(true);
        await new Promise((resolve) => {
            window.requestAnimationFrame(() => window.requestAnimationFrame(resolve));
        });
        await video.play().catch(() => {});
        await waitForVideo(video);
    };

    const turnLight = async (enabled) => {
        let track = streamRef.current?.getVideoTracks?.()[0];
        if (track && await applyTorch(track, enabled, { force: true })) {
            markTorch(enabled);
            await videoRef.current?.play().catch(() => {});
            return true;
        }
        if (!enabled) {
            markTorch(false);
            return false;
        }

        const currentId = track?.getSettings?.().deviceId;
        let cameras = [];
        try {
            cameras = await rearCameras();
        } catch {
            cameras = [];
        }
        const ordered = [
            ...cameras.filter((camera) => camera.deviceId && camera.deviceId !== currentId),
            ...cameras.filter((camera) => camera.deviceId && camera.deviceId === currentId),
        ];

        for (const camera of ordered) {
            const previous = streamRef.current;
            streamRef.current = null;
            previous?.getTracks().forEach((item) => item.stop());
            try {
                const next = await navigator.mediaDevices.getUserMedia({
                    audio: false,
                    video: { deviceId: { exact: camera.deviceId } },
                });
                await showStream(next);
                track = next.getVideoTracks()[0];
                if (await applyTorch(track, true, { force: true })) {
                    markTorch(true);
                    await videoRef.current?.play().catch(() => {});
                    return true;
                }
            } catch {
                // Try the next rear camera. One phone camera can be open at a time.
            }
        }

        markTorch(false);
        return false;
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
        setCameraReleased(false);
        try {
            await stopCamera();
            const stream = await pickTorchCamera(await openRearStream());
            await showStream(stream);
            setTorchAvailable(phoneCamera() || trackSupportsTorch(stream.getVideoTracks()[0]));
            const wantOn = torchPreference.current ?? Boolean(janitorial);
            if (wantOn) {
                setTorchBusy(true);
                const on = await turnLight(true);
                setTorchBusy(false);
                if (!on) {
                    setError('The camera light stayed off. Tap Light on once more. If it is still dark, use Camera with flash.');
                }
            }
        } catch (err) {
            setError(cameraErrorMessage(err));
            stopCamera();
        } finally {
            setStarting(false);
        }
    };

    const stampSource = (source, width, height) => {
        if (!source || !width || !height) {
            throw new Error('Camera preview is not ready yet.');
        }
        const captured = new Date();
        const canvas = document.createElement('canvas');
        canvas.width = width;
        canvas.height = height;
        const ctx = canvas.getContext('2d');
        ctx.drawImage(source, 0, 0, width, height);

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

    const toggleTorch = async () => {
        if (!streamRef.current || torchBusy) return;
        const next = !torchOnRef.current;
        torchPreference.current = next;
        setError('');
        setTorchBusy(true);
        try {
            const on = await turnLight(next);
            if (!on && next) {
                setError('The camera light stayed off. Use Camera with flash — that opens the phone camera, which has its own flash.');
            }
        } finally {
            setTorchBusy(false);
        }
    };

    const releaseCameraTracks = () => {
        const stream = streamRef.current;
        streamRef.current = null;
        stream?.getTracks().forEach((item) => item.stop());
        torchOnRef.current = false;
        torchReadyAt.current = 0;
    };

    const openFlashCamera = () => {
        const input = flashFileRef.current;
        if (!input) return;
        gotFlashFile.current = false;
        input.click();
        window.setTimeout(() => {
            if (gotFlashFile.current) return;
            if (videoRef.current) {
                videoRef.current.pause();
                videoRef.current.srcObject = null;
            }
            setTorchOn(false);
            setCameraReleased(true);
        }, 900);
    };

    const onNativeFlashPhoto = async (event) => {
        gotFlashFile.current = true;
        const file = event.target.files?.[0];
        event.target.value = '';
        if (!file) return;
        setError('');
        setNotice('');
        const url = URL.createObjectURL(file);
        try {
            const image = await new Promise((resolve, reject) => {
                const img = new Image();
                img.onload = () => resolve(img);
                img.onerror = () => reject(new Error('Could not read that photo.'));
                img.src = url;
            });
            skipPersist.current = false;
            const { blob, captured } = await stampSource(image, image.naturalWidth, image.naturalHeight);
            if (previewUrl) URL.revokeObjectURL(previewUrl);
            setPreviewUrl(URL.createObjectURL(blob));
            setCapturedBlob(blob);
            setCapturedAt(captured);
        } catch (err) {
            setError(err?.message || 'Could not capture the photo.');
        } finally {
            URL.revokeObjectURL(url);
        }
    };

    const takePhoto = async () => {
        setError('');
        setNotice('');
        let bitmap = null;
        try {
            const wait = torchReadyAt.current - Date.now();
            if (wait > 0) {
                await new Promise((resolve) => { window.setTimeout(resolve, wait); });
            }
            if (!torchOnRef.current) {
                bitmap = await captureFlashBitmap(streamRef.current?.getVideoTracks?.()[0]);
            }
            skipPersist.current = false;
            const { blob, captured } = bitmap
                ? await stampSource(bitmap, bitmap.width, bitmap.height)
                : await stampSource(videoRef.current, videoRef.current?.videoWidth, videoRef.current?.videoHeight);
            if (previewUrl) URL.revokeObjectURL(previewUrl);
            setPreviewUrl(URL.createObjectURL(blob));
            setCapturedBlob(blob);
            setCapturedAt(captured);
            stopCamera();
        } catch (err) {
            setError(err?.message || 'Could not capture the photo.');
        } finally {
            bitmap?.close?.();
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
            {typeof document !== 'undefined' && createPortal(
                <input
                    ref={flashFileRef}
                    type="file"
                    accept="image/*"
                    capture="environment"
                    aria-hidden="true"
                    tabIndex={-1}
                    onChange={onNativeFlashPhoto}
                    style={{ position: 'fixed', left: -1000, top: 0, width: 48, height: 48, opacity: 0 }}
                />,
                document.body,
            )}
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
                        {(!live || cameraReleased) && (
                            <button
                                type="button"
                                onClick={startCamera}
                                disabled={starting || insecureCamera}
                                className="flex w-full items-center justify-center gap-2 rounded-xl bg-slate-900 py-3 text-xs font-extrabold uppercase tracking-wider text-white shadow-sm transition hover:bg-blue-600 disabled:opacity-50"
                            >
                                <Camera className="h-4 w-4" />
                                {starting ? 'Starting Camera…' : cameraReleased ? 'Open camera again' : (presence ? 'Open Camera' : `Open Camera for ${phase}`)}
                            </button>
                        )}
                        <div className="relative overflow-hidden rounded-xl border border-slate-200 bg-slate-950">
                            <video
                                ref={videoRef}
                                playsInline
                                muted
                                autoPlay
                                className={`block w-full object-cover ${live || starting ? 'h-[220px]' : 'h-0'}`}
                            />
                            {live && (torchAvailable || phoneCamera()) && (
                                <button
                                    type="button"
                                    onClick={toggleTorch}
                                    disabled={torchBusy}
                                    className={`absolute right-2 top-2 flex items-center gap-1.5 rounded-full px-3 py-1.5 text-[11px] font-extrabold uppercase tracking-wider shadow-sm disabled:opacity-70 ${
                                        torchOn
                                            ? 'bg-amber-400 text-slate-950'
                                            : 'bg-black/60 text-white ring-1 ring-white/30'
                                    }`}
                                >
                                    {torchOn ? <Flashlight className="h-3.5 w-3.5" /> : <FlashlightOff className="h-3.5 w-3.5" />}
                                    {torchBusy ? 'Light…' : (torchOn ? 'Light on' : 'Light off')}
                                </button>
                            )}
                        </div>
                        {live && phoneCamera() && !torchOn && (
                            <button
                                type="button"
                                onPointerDown={releaseCameraTracks}
                                onClick={openFlashCamera}
                                className="flex w-full items-center justify-center gap-2 rounded-xl border border-amber-300 bg-amber-50 py-3 text-xs font-extrabold uppercase tracking-wider text-amber-900"
                            >
                                <Flashlight className="h-4 w-4" />
                                Camera with flash
                            </button>
                        )}
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
