import { useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { motion } from 'framer-motion';
import { Camera, ImagePlus, Trash2, X } from 'lucide-react';
import { bindPopup } from '../utils/popupDismiss';

interface AvatarPhotoMenuProps {
    inputId: string;
    hasPicture: boolean;
    disabled?: boolean;
    onFileSelected: (event: React.ChangeEvent<HTMLInputElement>) => void;
    onRemove: () => void;
}

export default function AvatarPhotoMenu({
    inputId,
    hasPicture,
    disabled = false,
    onFileSelected,
    onRemove,
}: AvatarPhotoMenuProps) {
    const inputRef = useRef<HTMLInputElement>(null);
    const [open, setOpen] = useState(false);

    const choosePhoto = () => {
        setOpen(false);
        inputRef.current?.click();
    };

    const openMenu = () => {
        if (disabled) return;
        if (!hasPicture) {
            inputRef.current?.click();
            return;
        }
        setOpen(true);
    };

    return (
        <>
            <button
                type="button"
                onClick={openMenu}
                disabled={disabled}
                className="absolute bottom-1 right-1 z-10 flex h-11 w-11 items-center justify-center rounded-full bg-slate-900 text-white shadow-lg cursor-pointer disabled:opacity-50"
            >
                <Camera className="w-5 h-5" />
                <span className="sr-only">{disabled ? 'Updating photo' : hasPicture ? 'Change or remove photo' : 'Change photo'}</span>
            </button>
            <input
                ref={inputRef}
                id={inputId}
                type="file"
                accept="image/*"
                onChange={onFileSelected}
                className="hidden"
                disabled={disabled}
            />
            {open && createPortal(
                <motion.div
                    initial={{ opacity: 0 }}
                    animate={{ opacity: 1 }}
                    className="fixed inset-0 z-[90] flex items-end justify-center bg-slate-950/75 p-3 backdrop-blur-sm sm:items-center sm:p-4"
                    {...bindPopup(() => setOpen(false))}
                >
                    <motion.div
                        initial={{ opacity: 0, scale: 0.96, y: 16 }}
                        animate={{ opacity: 1, scale: 1, y: 0 }}
                        transition={{ duration: 0.22, ease: [0.22, 1, 0.36, 1] }}
                        className="w-full max-w-sm overflow-hidden rounded-[2rem] border border-slate-200 bg-white shadow-2xl"
                        onClick={(event) => event.stopPropagation()}
                        role="dialog"
                        aria-modal="true"
                    >
                        <div className="flex items-center justify-between gap-3 bg-slate-950 px-6 py-4 text-white">
                            <div className="flex items-center gap-2.5">
                                <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-blue-500/20 text-blue-300 ring-1 ring-blue-400/30">
                                    <Camera className="h-4 w-4" />
                                </span>
                                <h3 className="text-base font-black tracking-tight text-white">Profile Picture</h3>
                            </div>
                            <button
                                type="button"
                                onClick={() => setOpen(false)}
                                className="rounded-xl border border-white/10 bg-white/5 p-2 text-slate-300 transition hover:bg-white/15 hover:text-white"
                                aria-label="Close"
                            >
                                <X className="h-4 w-4" />
                            </button>
                        </div>
                        <div className="space-y-4 p-6">
                            <p className="text-xs font-medium leading-relaxed text-slate-500">
                                Choose a new photo, or remove the current one to return to your monogram initial.
                            </p>
                            <div className="flex flex-col gap-2.5">
                                <button
                                    type="button"
                                    onClick={choosePhoto}
                                    className="flex min-h-11 items-center justify-center gap-2 rounded-xl bg-slate-900 px-5 py-3 text-xs font-extrabold uppercase tracking-wider text-white shadow-sm transition hover:bg-blue-600"
                                >
                                    <ImagePlus className="h-4 w-4" />
                                    Change Photo
                                </button>
                                <button
                                    type="button"
                                    onClick={() => {
                                        setOpen(false);
                                        onRemove();
                                    }}
                                    className="flex min-h-11 items-center justify-center gap-2 rounded-xl border border-rose-200 bg-rose-50 px-5 py-3 text-xs font-extrabold uppercase tracking-wider text-rose-700 transition hover:bg-rose-100"
                                >
                                    <Trash2 className="h-4 w-4" />
                                    Remove Photo
                                </button>
                                <button
                                    type="button"
                                    onClick={() => setOpen(false)}
                                    className="min-h-11 rounded-xl border border-slate-200 bg-white px-5 py-2.5 text-xs font-bold text-slate-600 transition hover:bg-slate-50"
                                >
                                    Cancel
                                </button>
                            </div>
                        </div>
                    </motion.div>
                </motion.div>,
                document.body,
            )}
        </>
    );
}
