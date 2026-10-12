import { useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { Camera, ImagePlus, Trash2 } from 'lucide-react';
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
                <div className="fixed inset-0 z-[90] bg-slate-900/60 backdrop-blur-sm flex items-end sm:items-center justify-center p-3 sm:p-4" {...bindPopup(() => setOpen(false))}>
                    <div className="bg-white rounded-3xl shadow-2xl w-full max-w-sm border border-slate-200">
                        <div className="px-5 sm:px-6 pt-6 pb-2">
                            <h3 className="text-xl font-semibold text-slate-900">Profile picture</h3>
                            <p className="text-sm font-medium text-slate-500 mt-1">Choose a new photo, or remove the current one and return to your initial.</p>
                        </div>
                        <div className="px-5 sm:px-6 py-5 flex flex-col gap-3">
                            <button
                                type="button"
                                onClick={choosePhoto}
                                className="min-h-11 px-5 py-3 text-sm font-bold text-white bg-blue-600 hover:bg-blue-700 rounded-xl shadow-lg shadow-blue-600/25 flex items-center justify-center gap-2"
                            >
                                <ImagePlus className="w-4 h-4" />
                                Change photo
                            </button>
                            <button
                                type="button"
                                onClick={() => {
                                    setOpen(false);
                                    onRemove();
                                }}
                                className="min-h-11 px-5 py-3 text-sm font-bold text-rose-700 bg-rose-50 hover:bg-rose-100 rounded-xl flex items-center justify-center gap-2"
                            >
                                <Trash2 className="w-4 h-4" />
                                Remove photo
                            </button>
                        </div>
                        <div className="px-5 sm:px-6 pb-6">
                            <button type="button" onClick={() => setOpen(false)} className="w-full min-h-11 px-5 py-2.5 text-sm font-bold text-slate-500 hover:bg-slate-100 rounded-xl transition-colors">
                                Cancel
                            </button>
                        </div>
                    </div>
                </div>,
                document.body,
            )}
        </>
    );
}
