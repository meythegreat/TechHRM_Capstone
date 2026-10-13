import { useEffect, useRef, type PointerEvent } from 'react';

type SignaturePadProps = {
    label: string;
    onChange: (value: string) => void;
};

const SignaturePad = ({ label, onChange }: SignaturePadProps) => {
    const canvasRef = useRef<HTMLCanvasElement>(null);
    const drawing = useRef(false);
    const ink = useRef(false);

    const prepare = () => {
        const canvas = canvasRef.current;
        const context = canvas?.getContext('2d');
        if (!canvas || !context) return null;
        const ratio = window.devicePixelRatio || 1;
        const width = canvas.clientWidth || 560;
        const height = 140;
        canvas.width = Math.round(width * ratio);
        canvas.height = Math.round(height * ratio);
        context.setTransform(ratio, 0, 0, ratio, 0, 0);
        context.fillStyle = '#ffffff';
        context.fillRect(0, 0, width, height);
        context.strokeStyle = '#0f172a';
        context.lineWidth = 2.2;
        context.lineCap = 'round';
        context.lineJoin = 'round';
        return context;
    };

    useEffect(() => {
        prepare();
    }, []);

    const point = (event: PointerEvent<HTMLCanvasElement>) => {
        const rect = event.currentTarget.getBoundingClientRect();
        return { x: event.clientX - rect.left, y: event.clientY - rect.top };
    };

    const publish = () => {
        const canvas = canvasRef.current;
        onChange(canvas && ink.current ? canvas.toDataURL('image/png') : '');
    };

    return (
        <div>
            <div className="flex items-center justify-between gap-3 mb-2">
                <p className="text-sm font-semibold text-slate-700">{label}</p>
                <button
                    type="button"
                    onClick={() => {
                        ink.current = false;
                        drawing.current = false;
                        prepare();
                        onChange('');
                    }}
                    className="text-xs font-bold text-slate-500 hover:text-red-600"
                >
                    Clear
                </button>
            </div>
            <canvas
                ref={canvasRef}
                className="w-full h-[140px] touch-none rounded-2xl border border-slate-300 bg-white cursor-crosshair"
                onPointerDown={(event) => {
                    const context = canvasRef.current?.getContext('2d');
                    if (!context) return;
                    drawing.current = true;
                    event.currentTarget.setPointerCapture(event.pointerId);
                    const next = point(event);
                    context.beginPath();
                    context.moveTo(next.x, next.y);
                }}
                onPointerMove={(event) => {
                    if (!drawing.current) return;
                    const context = canvasRef.current?.getContext('2d');
                    if (!context) return;
                    const next = point(event);
                    context.lineTo(next.x, next.y);
                    context.stroke();
                    ink.current = true;
                }}
                onPointerUp={() => {
                    drawing.current = false;
                    publish();
                }}
                onPointerLeave={() => {
                    if (!drawing.current) return;
                    drawing.current = false;
                    publish();
                }}
            />
            <p className="mt-1.5 text-xs text-slate-500">Sign with a finger, mouse, or stylus.</p>
        </div>
    );
};

export default SignaturePad;
