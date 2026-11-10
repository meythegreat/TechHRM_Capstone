export const REALTIME_EVENT = 'wospis:realtime';

export function emitRealtimeRefresh() {
    window.dispatchEvent(new CustomEvent(REALTIME_EVENT));
}
