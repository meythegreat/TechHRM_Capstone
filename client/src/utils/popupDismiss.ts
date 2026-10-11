import type { MouseEvent } from 'react';

type PopupElement = HTMLElement & { onpopupclose?: () => void };

export function bindPopup(onClose: () => void) {
    return {
        'data-popup-overlay': 'true',
        onMouseDown: (event: MouseEvent<HTMLElement>) => {
            if (event.target === event.currentTarget) onClose();
        },
        ref: (node: PopupElement | null) => {
            if (node) node.onpopupclose = onClose;
        },
    };
}
