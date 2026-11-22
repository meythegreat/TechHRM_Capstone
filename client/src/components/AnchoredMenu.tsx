import { useCallback, useEffect, useLayoutEffect, useRef, type ReactNode } from 'react';
import { createPortal } from 'react-dom';

interface AnchoredMenuProps {
    open: boolean;
    onClose: () => void;
    trigger: ReactNode;
    children: ReactNode;
    menuClassName?: string;
}

const GAP = 6;
const MARGIN = 8;

function anchorIsVisible(anchor: HTMLElement) {
    const rect = anchor.getBoundingClientRect();
    if (rect.width === 0 || rect.height === 0) return false;
    if (
        rect.bottom <= 0 ||
        rect.top >= window.innerHeight ||
        rect.right <= 0 ||
        rect.left >= window.innerWidth
    ) {
        return false;
    }

    let parent = anchor.parentElement;
    while (parent && parent !== document.body) {
        const style = getComputedStyle(parent);
        const clipsY = style.overflowY === 'auto' || style.overflowY === 'scroll' || style.overflowY === 'hidden';
        const clipsX = style.overflowX === 'auto' || style.overflowX === 'scroll' || style.overflowX === 'hidden';
        if (clipsY || clipsX) {
            const bounds = parent.getBoundingClientRect();
            const hiddenY = clipsY && (rect.bottom <= bounds.top + 1 || rect.top >= bounds.bottom - 1);
            const hiddenX = clipsX && (rect.right <= bounds.left + 1 || rect.left >= bounds.right - 1);
            if (hiddenY || hiddenX) return false;
        }
        parent = parent.parentElement;
    }

    return true;
}

/**
 * Dropdown that stays pinned to its trigger and flips inside the viewport.
 * Portaled so overflow clipping on chat panes cannot cut the options off.
 */
export default function AnchoredMenu({ open, onClose, trigger, children, menuClassName }: AnchoredMenuProps) {
    const anchorRef = useRef<HTMLDivElement>(null);
    const menuRef = useRef<HTMLDivElement>(null);

    const place = useCallback(() => {
        const anchor = anchorRef.current;
        const menu = menuRef.current;
        if (!anchor || !menu) return;
        if (!anchorIsVisible(anchor)) {
            onClose();
            return;
        }

        const triggerRect = anchor.getBoundingClientRect();
        const width = menu.offsetWidth;
        const height = menu.offsetHeight;
        const spaceBelow = window.innerHeight - triggerRect.bottom - MARGIN;
        const spaceAbove = triggerRect.top - MARGIN;
        const openUp = height + GAP > spaceBelow && spaceAbove > spaceBelow;

        let top = openUp ? triggerRect.top - GAP - height : triggerRect.bottom + GAP;
        top = Math.min(Math.max(top, MARGIN), Math.max(MARGIN, window.innerHeight - height - MARGIN));

        let left = triggerRect.right - width;
        left = Math.min(Math.max(left, MARGIN), Math.max(MARGIN, window.innerWidth - width - MARGIN));

        menu.style.top = `${top}px`;
        menu.style.left = `${left}px`;
        menu.style.visibility = 'visible';
    }, [onClose]);

    useLayoutEffect(() => {
        if (!open) return;
        place();
        const onReflow = () => place();
        window.addEventListener('resize', onReflow);
        window.addEventListener('scroll', onReflow, true);
        return () => {
            window.removeEventListener('resize', onReflow);
            window.removeEventListener('scroll', onReflow, true);
        };
    }, [open, place, children]);

    useEffect(() => {
        if (!open) return;
        const onPointer = (event: MouseEvent) => {
            const target = event.target as Node;
            if (menuRef.current?.contains(target)) return;
            if (anchorRef.current?.contains(target)) return;
            onClose();
        };
        const onKey = (event: KeyboardEvent) => {
            if (event.key !== 'Escape') return;
            event.stopImmediatePropagation();
            onClose();
        };
        document.addEventListener('mousedown', onPointer);
        document.addEventListener('keydown', onKey, true);
        return () => {
            document.removeEventListener('mousedown', onPointer);
            document.removeEventListener('keydown', onKey, true);
        };
    }, [open, onClose]);

    return (
        <div ref={anchorRef} className="relative inline-flex">
            {trigger}
            {open &&
                typeof document !== 'undefined' &&
                createPortal(
                    <div
                        ref={menuRef}
                        role="menu"
                        style={{ position: 'fixed', top: 0, left: 0, visibility: 'hidden', zIndex: 85 }}
                        className={menuClassName}
                    >
                        {children}
                    </div>,
                    document.body,
                )}
        </div>
    );
}
