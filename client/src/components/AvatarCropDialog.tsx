import { useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { motion } from 'framer-motion';
import { Crop, X, ZoomIn } from 'lucide-react';
import { bindPopup } from '../utils/popupDismiss';

interface AvatarCropDialogProps {
    imageUrl: string;
    onCancel: () => void;
    onConfirm: (file: File) => void;
}

const VIEW = 320;
const EXPORT_SIZE = 512;
const START_ZOOM = 1.35;

function coverScale(image: HTMLImageElement, size: number, zoom: number) {
    return Math.max(size / image.width, size / image.height) * zoom;
}

function clampOffset(image: HTMLImageElement, size: number, zoom: number, offsetX: number, offsetY: number) {
    const scale = coverScale(image, size, zoom);
    const drawnWidth = image.width * scale;
    const drawnHeight = image.height * scale;
    const limitX = Math.abs((size - drawnWidth) / 2);
    const limitY = Math.abs((size - drawnHeight) / 2);
    return {
        x: Math.min(limitX, Math.max(-limitX, offsetX)),
        y: Math.min(limitY, Math.max(-limitY, offsetY)),
    };
}

function imagePlacement(image: HTMLImageElement, size: number, zoom: number, offsetX: number, offsetY: number) {
    const scale = coverScale(image, size, zoom);
    const drawnWidth = image.width * scale;
    const drawnHeight = image.height * scale;
    return {
        x: (size - drawnWidth) / 2 + offsetX * (size / VIEW),
        y: (size - drawnHeight) / 2 + offsetY * (size / VIEW),
        drawnWidth,
        drawnHeight,
    };
}

function drawAvatar(
    ctx: CanvasRenderingContext2D,
    image: HTMLImageElement,
    size: number,
    zoom: number,
    offsetX: number,
    offsetY: number,
    showFrame: boolean,
) {
    const { x, y, drawnWidth, drawnHeight } = imagePlacement(image, size, zoom, offsetX, offsetY);
    const radius = size / 2 - (showFrame ? 8 : 0);
    const center = size / 2;

    ctx.clearRect(0, 0, size, size);

    if (showFrame) {
        ctx.save();
        ctx.fillStyle = '#e2e8f0';
        ctx.fillRect(0, 0, size, size);
        ctx.globalAlpha = 0.45;
        ctx.drawImage(image, x, y, drawnWidth, drawnHeight);
        ctx.restore();
    }

    if (showFrame) {
        ctx.save();
        ctx.fillStyle = 'rgba(15, 23, 42, 0.55)';
        ctx.fillRect(0, 0, size, size);
        ctx.globalCompositeOperation = 'destination-out';
        ctx.beginPath();
        ctx.arc(center, center, radius, 0, Math.PI * 2);
        ctx.fill();
        ctx.restore();
    }

    ctx.save();
    ctx.beginPath();
    ctx.arc(center, center, radius, 0, Math.PI * 2);
    ctx.clip();
    ctx.drawImage(image, x, y, drawnWidth, drawnHeight);
    ctx.restore();

    if (showFrame) {
        ctx.beginPath();
        ctx.arc(center, center, radius, 0, Math.PI * 2);
        ctx.strokeStyle = '#ffffff';
        ctx.lineWidth = 3;
        ctx.stroke();
    }
}

export default function AvatarCropDialog({ imageUrl, onCancel, onConfirm }: AvatarCropDialogProps) {
    const canvasRef = useRef<HTMLCanvasElement>(null);
    const imageRef = useRef<HTMLImageElement | null>(null);
    const dragRef = useRef<{ pointerX: number; pointerY: number; originX: number; originY: number } | null>(null);
    const pointersRef = useRef(new Map<number, { x: number; y: number }>());
    const pinchRef = useRef<{ distance: number; zoom: number } | null>(null);
    const zoomRef = useRef(1);
    const offsetRef = useRef({ x: 0, y: 0 });
    const [zoom, setZoom] = useState(1);
    const [offset, setOffset] = useState({ x: 0, y: 0 });
    const [ready, setReady] = useState(false);
    const [saving, setSaving] = useState(false);

    useEffect(() => {
        const image = new Image();
        image.onload = () => {
            imageRef.current = image;
            zoomRef.current = START_ZOOM;
            offsetRef.current = { x: 0, y: 0 };
            setZoom(START_ZOOM);
            setOffset({ x: 0, y: 0 });
            setReady(true);
        };
        image.src = imageUrl;
    }, [imageUrl]);

    useEffect(() => {
        const canvas = canvasRef.current;
        const image = imageRef.current;
        if (!canvas || !image || !ready) return;
        const ctx = canvas.getContext('2d');
        if (!ctx) return;
        drawAvatar(ctx, image, VIEW, zoom, offset.x, offset.y, true);
    }, [ready, zoom, offset]);

    const applyOffset = (nextX: number, nextY: number, nextZoom = zoomRef.current) => {
        const image = imageRef.current;
        if (!image) return;
        const next = clampOffset(image, VIEW, nextZoom, nextX, nextY);
        offsetRef.current = next;
        setOffset(next);
    };

    const applyZoom = (nextZoom: number) => {
        const image = imageRef.current;
        const clampedZoom = Math.min(3, Math.max(1, nextZoom));
        zoomRef.current = clampedZoom;
        setZoom(clampedZoom);
        if (image) applyOffset(offsetRef.current.x, offsetRef.current.y, clampedZoom);
    };

    const pointerDistance = () => {
        const points = [...pointersRef.current.values()];
        if (points.length < 2) return 0;
        return Math.hypot(points[0].x - points[1].x, points[0].y - points[1].y);
    };

    const confirmCrop = () => {
        const image = imageRef.current;
        if (!image) return;
        const exportCanvas = document.createElement('canvas');
        exportCanvas.width = EXPORT_SIZE;
        exportCanvas.height = EXPORT_SIZE;
        const ctx = exportCanvas.getContext('2d');
        if (!ctx) return;
        drawAvatar(ctx, image, EXPORT_SIZE, zoom, offset.x, offset.y, false);
        setSaving(true);
        exportCanvas.toBlob((blob) => {
            if (!blob) {
                setSaving(false);
                return;
            }
            onConfirm(new File([blob], 'avatar.png', { type: 'image/png' }));
        }, 'image/png');
    };

    return createPortal(
        <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            className="fixed inset-0 z-[90] flex items-end justify-center bg-slate-950/75 p-3 backdrop-blur-sm sm:items-center sm:p-4"
            {...bindPopup(onCancel)}
        >
            <motion.div
                initial={{ opacity: 0, scale: 0.96, y: 16 }}
                animate={{ opacity: 1, scale: 1, y: 0 }}
                transition={{ duration: 0.22, ease: [0.22, 1, 0.36, 1] }}
                className="max-h-[calc(100dvh-1.5rem)] w-full max-w-md overflow-y-auto rounded-[2rem] border border-slate-200 bg-white shadow-2xl"
                onClick={(event) => event.stopPropagation()}
                role="dialog"
                aria-modal="true"
            >
                <div className="flex items-center justify-between gap-3 bg-slate-950 px-6 py-4 text-white">
                    <div className="flex items-center gap-2.5">
                        <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-blue-500/20 text-blue-300 ring-1 ring-blue-400/30">
                            <Crop className="h-4 w-4" />
                        </span>
                        <div>
                            <h3 className="text-base font-black tracking-tight text-white">Crop Profile Picture</h3>
                            <p className="text-[11px] font-medium text-slate-400">Drag to position · Pinch or slide to zoom</p>
                        </div>
                    </div>
                    <button
                        type="button"
                        onClick={onCancel}
                        disabled={saving}
                        className="rounded-xl border border-white/10 bg-white/5 p-2 text-slate-300 transition hover:bg-white/15 hover:text-white disabled:opacity-50"
                        aria-label="Close"
                    >
                        <X className="h-4 w-4" />
                    </button>
                </div>

                <div className="flex flex-col items-center gap-5 px-5 py-6 sm:px-6">
                    <canvas
                        ref={canvasRef}
                        width={VIEW}
                        height={VIEW}
                        className="aspect-square h-auto w-[min(18rem,calc(100vw-3.5rem))] cursor-grab touch-none rounded-2xl border border-slate-200 bg-slate-200 shadow-inner active:cursor-grabbing"
                        onPointerDown={(event) => {
                            event.preventDefault();
                            event.currentTarget.setPointerCapture(event.pointerId);
                            pointersRef.current.set(event.pointerId, { x: event.clientX, y: event.clientY });
                            if (pointersRef.current.size >= 2) {
                                dragRef.current = null;
                                pinchRef.current = { distance: pointerDistance(), zoom: zoomRef.current };
                                return;
                            }
                            dragRef.current = {
                                pointerX: event.clientX,
                                pointerY: event.clientY,
                                originX: offsetRef.current.x,
                                originY: offsetRef.current.y,
                            };
                        }}
                        onPointerMove={(event) => {
                            if (!pointersRef.current.has(event.pointerId)) return;
                            event.preventDefault();
                            pointersRef.current.set(event.pointerId, { x: event.clientX, y: event.clientY });
                            const pinch = pinchRef.current;
                            if (pointersRef.current.size >= 2 && pinch && pinch.distance > 0) {
                                applyZoom(pinch.zoom * (pointerDistance() / pinch.distance));
                                return;
                            }
                            const drag = dragRef.current;
                            if (!drag) return;
                            const rect = event.currentTarget.getBoundingClientRect();
                            const scale = rect.width > 0 ? VIEW / rect.width : 1;
                            applyOffset(
                                drag.originX + (event.clientX - drag.pointerX) * scale,
                                drag.originY + (event.clientY - drag.pointerY) * scale,
                            );
                        }}
                        onPointerUp={(event) => {
                            pointersRef.current.delete(event.pointerId);
                            pinchRef.current = null;
                            dragRef.current = null;
                        }}
                        onPointerCancel={(event) => {
                            pointersRef.current.delete(event.pointerId);
                            pinchRef.current = null;
                            dragRef.current = null;
                        }}
                    />
                    <label className="w-full rounded-2xl border border-slate-200/80 bg-slate-50/80 px-4 py-3">
                        <span className="mb-1.5 flex items-center justify-between text-[10px] font-extrabold uppercase tracking-widest text-slate-400">
                            <span className="inline-flex items-center gap-1">
                                <ZoomIn className="h-3.5 w-3.5 text-blue-500" /> Zoom
                            </span>
                            <span className="font-mono text-slate-600">{Math.round(zoom * 100)}%</span>
                        </span>
                        <input
                            type="range"
                            min={1}
                            max={3}
                            step={0.01}
                            value={zoom}
                            onChange={(event) => applyZoom(Number(event.target.value))}
                            className="h-9 w-full accent-blue-600"
                        />
                    </label>
                </div>
                <div className="flex flex-col-reverse gap-2.5 border-t border-slate-100 bg-slate-50/50 px-5 py-4 sm:flex-row sm:justify-end sm:px-6">
                    <button
                        type="button"
                        onClick={onCancel}
                        disabled={saving}
                        className="min-h-11 rounded-xl border border-slate-200 bg-white px-5 py-2.5 text-xs font-bold text-slate-700 transition hover:bg-slate-50 disabled:opacity-50"
                    >
                        Cancel
                    </button>
                    <button
                        type="button"
                        onClick={confirmCrop}
                        disabled={!ready || saving}
                        className="min-h-11 rounded-xl bg-slate-900 px-6 py-2.5 text-xs font-extrabold uppercase tracking-wider text-white shadow-sm transition hover:bg-blue-600 disabled:opacity-50"
                    >
                        {saving ? 'Preparing…' : 'Use Photo'}
                    </button>
                </div>
            </motion.div>
        </motion.div>,
        document.body,
    );
}
