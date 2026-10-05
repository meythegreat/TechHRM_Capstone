export const REALTIME_EVENT = 'techhrm:realtime';

export function emitRealtimeRefresh() {
    window.dispatchEvent(new CustomEvent(REALTIME_EVENT));
}
