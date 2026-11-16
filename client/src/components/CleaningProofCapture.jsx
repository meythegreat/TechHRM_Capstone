import React, { useEffect, useRef, useState } from 'react';
import { Camera, CheckCircle2, RefreshCw } from 'lucide-react';
import SecureImage from './SecureImage';
import { submitCleaningProof } from '../services/advancedAttendanceService';

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
        return date.toLocaleString();
    }
};

/**
 * Live-camera before/after capture for janitorial / daily cleaning.
 * Burns device date+time onto the JPEG at shutter. No gallery / file picker.
 */
export default function CleaningProofCapture({
    attendanceId,
    beforePath = null,
    afterPath = null,
    onUpdated,
    insecureCamera = false,
}) {
    const [phase, setPhase] = useState(beforePath ? 'after' : 'before');
    const [live, setLive] = useState(false);
    const [starting, setStarting] = useState(false);
    const [previewUrl, setPreviewUrl] = useState(null);
    const [capturedBlob, setCapturedBlob] = useState(null);
    const [capturedAt, setCapturedAt] = useState(null);
    const [uploading, setUploading] = useState(false);
    const [error, setError] = useState('');
    const [notice, setNotice] = useState('');
    const videoRef = useRef(null);
    const streamRef = useRef(null);

    const beforeDone = Boolean(beforePath);
    const afterDone = Boolean(afterPath);
    const complete = beforeDone && afterDone;

    useEffect(() => {
        if (!beforePath) {
            setPhase('before');
        } else if (!afterPath) {
            setPhase('after');
        }
    }, [beforePath, afterPath]);

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

    const uploadPhoto = async () => {
        if (!capturedBlob || !capturedAt || !attendanceId) return;
        setUploading(true);
        setError('');
        setNotice('');
        try {
            const form = new FormData();
            form.append('phase', phase);
            form.append('capture_source', 'live_camera');
            form.append('captured_at', capturedAt.toISOString());
            form.append('photo', capturedBlob, `${phase}-cleaning.jpg`);
            const res = await submitCleaningProof(attendanceId, form);
            setNotice(res.data?.message || `${phase} photo saved.`);
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

    if (complete) {
        return (
            <div className="w-full mt-4 p-4 bg-white/80 border border-emerald-100 rounded-2xl text-left space-y-3">
                <p className="text-xs font-bold text-emerald-800 uppercase tracking-wider flex items-center gap-1.5">
                    <CheckCircle2 className="w-4 h-4" />
                    Cleaning proof complete
                </p>
                <div className="grid grid-cols-2 gap-3">
                    <div>
                        <p className="text-[11px] font-bold text-slate-500 uppercase mb-1">Before</p>
                        <SecureImage filePath={beforePath} altText="Before cleaning" className="w-full h-28 object-cover rounded-xl border border-slate-200" />
                    </div>
                    <div>
                        <p className="text-[11px] font-bold text-slate-500 uppercase mb-1">After</p>
                        <SecureImage filePath={afterPath} altText="After cleaning" className="w-full h-28 object-cover rounded-xl border border-slate-200" />
                    </div>
                </div>
                <p className="text-xs text-emerald-800 font-medium">You can clock out with the supervisor passcode or QR.</p>
            </div>
        );
    }

    return (
        <div className="w-full mt-4 p-4 bg-white/80 border border-amber-100 rounded-2xl text-left space-y-3">
            <div>
                <p className="text-xs font-bold text-amber-900 uppercase tracking-wider">
                    Cleaning proof — {phase} photo
                </p>
                <p className="text-xs text-slate-600 mt-1">
                    Take a live camera photo of the assigned area. The date and time are stamped on the image.
                    Gallery upload is not allowed.
                </p>
            </div>

            <div className="flex gap-2">
                <button
                    type="button"
                    disabled={beforeDone}
                    onClick={() => { setPhase('before'); setCapturedBlob(null); setPreviewUrl(null); }}
                    className={`flex-1 py-2 rounded-lg text-xs font-bold border ${phase === 'before' ? 'bg-amber-100 border-amber-300 text-amber-900' : 'bg-white border-slate-200 text-slate-500'} ${beforeDone ? 'opacity-60' : ''}`}
                >
                    Before {beforeDone ? '✓' : ''}
                </button>
                <button
                    type="button"
                    disabled={!beforeDone}
                    onClick={() => { setPhase('after'); setCapturedBlob(null); setPreviewUrl(null); }}
                    className={`flex-1 py-2 rounded-lg text-xs font-bold border ${phase === 'after' ? 'bg-amber-100 border-amber-300 text-amber-900' : 'bg-white border-slate-200 text-slate-500'} ${!beforeDone ? 'opacity-50' : ''}`}
                >
                    After {afterDone ? '✓' : ''}
                </button>
            </div>

            {insecureCamera && (
                <p className="text-xs font-bold text-amber-800 bg-amber-50 border border-amber-200 rounded-xl p-3">
                    Camera capture needs https. Open the secure site, then return here.
                </p>
            )}

            {error && (
                <p className="text-xs font-bold text-red-700 bg-red-50 border border-red-200 rounded-xl p-3">{error}</p>
            )}
            {notice && (
                <p className="text-xs font-bold text-emerald-700 bg-emerald-50 border border-emerald-200 rounded-xl p-3">{notice}</p>
            )}

            {previewUrl ? (
                <div className="space-y-3">
                    <img src={previewUrl} alt={`${phase} preview`} className="w-full max-h-64 object-cover rounded-xl border border-slate-200" />
                    <div className="grid grid-cols-2 gap-2">
                        <button
                            type="button"
                            onClick={startCamera}
                            className="py-2.5 rounded-xl border border-slate-200 bg-white text-slate-800 text-sm font-bold flex items-center justify-center gap-1.5"
                        >
                            <RefreshCw className="w-4 h-4" />
                            Retake
                        </button>
                        <button
                            type="button"
                            onClick={uploadPhoto}
                            disabled={uploading}
                            className="py-2.5 rounded-xl bg-emerald-600 hover:bg-emerald-700 text-white text-sm font-bold disabled:opacity-50"
                        >
                            {uploading ? 'Saving…' : `Save ${phase} photo`}
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
                            className="w-full py-3 bg-slate-900 hover:bg-slate-800 text-white font-bold rounded-xl transition-all disabled:opacity-50 flex items-center justify-center gap-2"
                        >
                            <Camera className="w-4 h-4" />
                            {starting ? 'Starting camera…' : `Open camera for ${phase}`}
                        </button>
                    )}
                    <div className="overflow-hidden rounded-xl border border-slate-200 bg-slate-900">
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
                            className="w-full py-3.5 bg-amber-500 hover:bg-amber-600 text-white font-bold rounded-xl flex items-center justify-center gap-2"
                        >
                            <Camera className="w-5 h-5" />
                            Capture {phase} photo
                        </button>
                    )}
                </div>
            )}
        </div>
    );
}
