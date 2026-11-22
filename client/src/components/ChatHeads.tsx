import { useEffect, useMemo, useRef, useState, type PointerEvent as ReactPointerEvent } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import { AnimatePresence, motion, useReducedMotion } from 'framer-motion';
import { MessageCircle, Plus, Search, X } from 'lucide-react';
import UserAvatar from './UserAvatar';
import MessagesPage from './MessagesPage';
import {
  CHAT_SYNC_EVENT,
  chatService,
  type ChatConversation,
  type ChatUser,
} from '../services/chatService';

const WINDOW_WIDTH = 360;
const TABLET_WINDOW_WIDTH = 320;
const WINDOW_GAP = 12;
const DOCK_SIZE = 56;
const PANEL_WIDTH = 320;

type FloatingWindow = {
  id: number;
  minimized: boolean;
};

type Presence = 'online' | 'away' | 'offline';

function useFineHover() {
  const [fine, setFine] = useState(() =>
    typeof window !== 'undefined'
      ? window.matchMedia('(hover: hover) and (pointer: fine)').matches
      : false,
  );

  useEffect(() => {
    const media = window.matchMedia('(hover: hover) and (pointer: fine)');
    const sync = () => setFine(media.matches);
    sync();
    media.addEventListener('change', sync);
    return () => media.removeEventListener('change', sync);
  }, []);

  return fine;
}

function conversationLabel(conversation: ChatConversation): string {
  if (conversation.is_group || conversation.type === 'group') {
    return conversation.name || conversation.title || 'Group';
  }
  return conversation.peer?.name || conversation.title || 'Chat';
}

function conversationPicture(conversation: ChatConversation): string | null {
  if (conversation.is_group || conversation.type === 'group') {
    return null;
  }
  return conversation.peer?.profile_picture ?? null;
}

function conversationPreview(conversation: ChatConversation): string {
  if (conversation.last_message_preview) return conversation.last_message_preview;
  if (conversation.last_message?.is_unsent) return 'Message unsent';
  return conversation.last_message?.body || 'No messages yet';
}

function presenceOf(online?: boolean, lastSeen?: string | null): Presence {
  if (online) return 'online';
  if (!lastSeen) return 'offline';
  const seen = new Date(lastSeen).getTime();
  if (Number.isNaN(seen)) return 'offline';
  const elapsed = Date.now() - seen;
  if (elapsed >= 0 && elapsed < 15 * 60 * 1000) return 'away';
  return 'offline';
}

function presenceLabel(presence: Presence, role?: string | null): string {
  if (presence === 'online') return 'Online';
  if (presence === 'away') return 'Away';
  return role || 'Offline';
}

function StatusDot({ presence }: { presence: Presence }) {
  const color =
    presence === 'online' ? 'bg-emerald-400' : presence === 'away' ? 'bg-amber-400' : 'bg-slate-500';
  return (
    <span
      className={`absolute bottom-0 right-0 h-2.5 w-2.5 rounded-full border-2 border-slate-950 ${color}`}
      title={presenceLabel(presence)}
    />
  );
}

/**
 * Floating mini-messenger docked to the lower-right of the app shell.
 * Opens real conversations in place and only navigates when a chat is expanded.
 */
export default function ChatHeads() {
  const navigate = useNavigate();
  const location = useLocation();
  const reduceMotion = useReducedMotion();
  const fineHover = useFineHover();
  const dockRef = useRef<HTMLDivElement>(null);
  const searchRef = useRef<HTMLInputElement>(null);
  const leaveTimer = useRef<number | null>(null);
  const suppressClick = useRef(false);
  const dragRef = useRef<{
    pointerId: number;
    startX: number;
    startY: number;
    originRight: number;
    originBottom: number;
    moved: boolean;
  } | null>(null);

  const [conversations, setConversations] = useState<ChatConversation[]>([]);
  const [directory, setDirectory] = useState<ChatUser[]>([]);
  const [windows, setWindows] = useState<FloatingWindow[]>([]);
  const [drafts, setDrafts] = useState<Record<number, string>>({});
  const [search, setSearch] = useState('');
  const [pinned, setPinned] = useState(false);
  const [hovered, setHovered] = useState(false);
  const [contactsLoading, setContactsLoading] = useState(false);
  const [contactsError, setContactsError] = useState<string | null>(null);
  const [openingUserId, setOpeningUserId] = useState<number | null>(null);
  const [anchor, setAnchor] = useState({ right: 16, bottom: 16 });
  const [viewport, setViewport] = useState(() => ({
    width: typeof window !== 'undefined' ? window.innerWidth : 1440,
    height: typeof window !== 'undefined' ? window.innerHeight : 900,
  }));

  const onMessagesPage = /^\/messages(\/|$)/.test(location.pathname);
  const isMobile = viewport.width < 768;
  const isTablet = viewport.width >= 768 && viewport.width < 1024;
  const expanded = pinned || (fineHover && hovered);
  const windowWidth = isTablet ? TABLET_WINDOW_WIDTH : WINDOW_WIDTH;
  const panelWidth = Math.min(PANEL_WIDTH, Math.max(240, viewport.width - anchor.right - 28));

  const loadConversations = async () => {
    try {
      const rows = await chatService.listConversations();
      setConversations(rows);
    } catch {
      // Soft polling — ignore transient failures.
    }
  };

  useEffect(() => {
    void loadConversations();
    const interval = window.setInterval(() => void loadConversations(), 10000);
    const onVisible = () => {
      if (document.visibilityState === 'visible') void loadConversations();
    };
    const onSync = () => void loadConversations();
    document.addEventListener('visibilitychange', onVisible);
    window.addEventListener(CHAT_SYNC_EVENT, onSync);
    return () => {
      window.clearInterval(interval);
      document.removeEventListener('visibilitychange', onVisible);
      window.removeEventListener(CHAT_SYNC_EVENT, onSync);
    };
  }, []);

  useEffect(() => {
    const clamp = () => {
      setViewport({ width: window.innerWidth, height: window.innerHeight });
      setAnchor((current) => ({
        right: Math.min(Math.max(12, current.right), Math.max(12, window.innerWidth - 64)),
        bottom: Math.min(Math.max(12, current.bottom), Math.max(12, window.innerHeight - 64)),
      }));
    };
    window.addEventListener('resize', clamp);
    return () => window.removeEventListener('resize', clamp);
  }, []);

  useEffect(() => {
    if (!expanded) return;
    let cancelled = false;
    setContactsLoading(true);
    const timeout = window.setTimeout(() => {
      void chatService
        .searchUsers(search.trim())
        .then((rows) => {
          if (cancelled) return;
          setDirectory(rows);
          setContactsError(null);
        })
        .catch(() => {
          if (cancelled) return;
          setDirectory([]);
          setContactsError('Could not load people.');
        })
        .finally(() => {
          if (!cancelled) setContactsLoading(false);
        });
    }, 220);
    return () => {
      cancelled = true;
      window.clearTimeout(timeout);
    };
  }, [expanded, search]);

  useEffect(() => {
    if (!pinned) return;
    const onPointerDown = (event: globalThis.PointerEvent) => {
      if (dockRef.current?.contains(event.target as Node)) return;
      setPinned(false);
    };
    const onKey = (event: KeyboardEvent) => {
      if (event.key === 'Escape') setPinned(false);
    };
    document.addEventListener('pointerdown', onPointerDown);
    document.addEventListener('keydown', onKey);
    return () => {
      document.removeEventListener('pointerdown', onPointerDown);
      document.removeEventListener('keydown', onKey);
    };
  }, [pinned]);

  useEffect(() => {
    return () => {
      if (leaveTimer.current) window.clearTimeout(leaveTimer.current);
    };
  }, []);

  const maxWindows = useMemo(() => {
    if (isMobile) return 1;
    const pickerSpace = expanded ? panelWidth + WINDOW_GAP : 0;
    const available = viewport.width - anchor.right - DOCK_SIZE - pickerSpace - 16;
    return Math.max(1, Math.floor((available + WINDOW_GAP) / (windowWidth + WINDOW_GAP)));
  }, [anchor.right, expanded, isMobile, panelWidth, viewport.width, windowWidth]);

  useEffect(() => {
    setWindows((current) => {
      const openCount = current.filter((item) => !item.minimized).length;
      if (openCount <= maxWindows) return current;
      let overflow = openCount - maxWindows;
      return current.map((item) => {
        if (item.minimized || overflow <= 0) return item;
        overflow -= 1;
        return { ...item, minimized: true };
      });
    });
  }, [maxWindows]);

  const unreadTotal = conversations.reduce((sum, item) => sum + (item.unread_count || 0), 0);

  const query = search.trim().toLowerCase();
  const filteredConversations = useMemo(() => {
    if (!query) return conversations;
    return conversations.filter((conversation) => {
      const label = conversationLabel(conversation).toLowerCase();
      const username = conversation.peer?.username?.toLowerCase() ?? '';
      return label.includes(query) || username.includes(query);
    });
  }, [conversations, query]);

  const people = useMemo(() => {
    const shownPeerIds = new Set(
      filteredConversations
        .map((conversation) => conversation.peer?.id)
        .filter((id): id is number => typeof id === 'number'),
    );
    return directory.filter((user) => {
      if (shownPeerIds.has(user.id)) return false;
      if (!query) return true;
      return (
        user.name.toLowerCase().includes(query) ||
        user.username.toLowerCase().includes(query) ||
        user.role.toLowerCase().includes(query)
      );
    });
  }, [directory, filteredConversations, query]);

  const rememberConversation = (conversation: ChatConversation) => {
    setConversations((current) => {
      const index = current.findIndex((item) => item.id === conversation.id);
      if (index === -1) return [conversation, ...current];
      const next = current.slice();
      next[index] = { ...next[index], ...conversation, unread_count: 0 };
      return next;
    });
  };

  const openChat = (conversationId: number) => {
    setPinned(false);
    setHovered(false);
    setSearch('');
    setConversations((current) =>
      current.map((item) => (item.id === conversationId ? { ...item, unread_count: 0 } : item)),
    );
    setWindows((current) => {
      const exists = current.some((item) => item.id === conversationId);
      const next = exists
        ? current.map((item) =>
            item.id === conversationId ? { ...item, minimized: false } : item,
          )
        : [...current, { id: conversationId, minimized: false }];

      const opened = next.map((item) =>
        item.id === conversationId ? { ...item, minimized: false } : item,
      );
      const limit = isMobile ? 1 : maxWindows;
      let overflow = opened.filter((item) => !item.minimized).length - limit;
      if (overflow <= 0) return opened;
      return opened.map((item) => {
        if (item.id === conversationId || item.minimized || overflow <= 0) return item;
        overflow -= 1;
        return { ...item, minimized: true };
      });
    });
  };

  const openContact = async (user: ChatUser) => {
    if (openingUserId) return;
    const existing = conversations.find(
      (conversation) => !conversation.is_group && conversation.type !== 'group' && conversation.peer?.id === user.id,
    );
    if (existing) {
      openChat(existing.id);
      return;
    }

    setOpeningUserId(user.id);
    setContactsError(null);
    try {
      const conversation = await chatService.openConversation(user.id);
      rememberConversation(conversation);
      openChat(conversation.id);
    } catch {
      setContactsError('Could not open that conversation.');
      setPinned(true);
    } finally {
      setOpeningUserId(null);
    }
  };

  const minimizeWindow = (conversationId: number) => {
    setWindows((current) =>
      current.map((item) => (item.id === conversationId ? { ...item, minimized: true } : item)),
    );
  };

  const closeWindow = (conversationId: number) => {
    setWindows((current) => current.filter((item) => item.id !== conversationId));
    setDrafts((current) => {
      if (!(conversationId in current)) return current;
      const next = { ...current };
      delete next[conversationId];
      return next;
    });
    void loadConversations();
  };

  const expandWindow = (conversationId: number) => {
    navigate(`/messages?conversation=${conversationId}`);
  };

  const togglePinned = () => {
    if (suppressClick.current) {
      suppressClick.current = false;
      return;
    }
    setPinned((current) => !current);
  };

  const onDockEnter = () => {
    if (!fineHover) return;
    if (leaveTimer.current) window.clearTimeout(leaveTimer.current);
    setHovered(true);
  };

  const onDockLeave = () => {
    if (!fineHover) return;
    if (leaveTimer.current) window.clearTimeout(leaveTimer.current);
    leaveTimer.current = window.setTimeout(() => setHovered(false), 180);
  };

  const onDragStart = (event: ReactPointerEvent<HTMLButtonElement>) => {
    if (event.button !== 0 || isMobile) return;
    dragRef.current = {
      pointerId: event.pointerId,
      startX: event.clientX,
      startY: event.clientY,
      originRight: anchor.right,
      originBottom: anchor.bottom,
      moved: false,
    };
    event.currentTarget.setPointerCapture(event.pointerId);
  };

  const onDragMove = (event: ReactPointerEvent<HTMLButtonElement>) => {
    const drag = dragRef.current;
    if (!drag || drag.pointerId !== event.pointerId) return;
    const dx = event.clientX - drag.startX;
    const dy = event.clientY - drag.startY;
    if (Math.hypot(dx, dy) > 6) drag.moved = true;
    if (!drag.moved) return;
    setAnchor({
      right: Math.min(Math.max(12, drag.originRight - dx), Math.max(12, window.innerWidth - 64)),
      bottom: Math.min(Math.max(12, drag.originBottom - dy), Math.max(12, window.innerHeight - 64)),
    });
  };

  const onDragEnd = (event: ReactPointerEvent<HTMLButtonElement>) => {
    const drag = dragRef.current;
    if (drag?.pointerId === event.pointerId && drag.moved) suppressClick.current = true;
    dragRef.current = null;
  };

  const visibleWindows = windows.filter((item) => !item.minimized);
  const windowHeight = Math.min(520, Math.max(300, viewport.height - anchor.bottom - 88));
  const panelMaxHeight = Math.max(240, Math.min(460, viewport.height - anchor.bottom - 96));

  if (onMessagesPage) return null;

  return (
    <>
      <div
        ref={dockRef}
        className="fixed z-[70] print:hidden"
        style={{
          right: anchor.right,
          bottom: `calc(${anchor.bottom}px + env(safe-area-inset-bottom))`,
        }}
        onMouseEnter={onDockEnter}
        onMouseLeave={onDockLeave}
      >
        <AnimatePresence>
          {expanded && (
            <motion.section
              key="chat-picker"
              role="dialog"
              aria-label="Messages"
              initial={reduceMotion ? false : { opacity: 0, y: 10, scale: 0.98 }}
              animate={{ opacity: 1, y: 0, scale: 1 }}
              exit={reduceMotion ? undefined : { opacity: 0, y: 8, scale: 0.98 }}
              transition={{ duration: 0.2, ease: [0.22, 1, 0.36, 1] }}
              className={`absolute z-10 flex flex-col overflow-hidden rounded-3xl border border-slate-800 bg-slate-950 text-white shadow-2xl shadow-slate-950/40 ${
                isMobile ? 'bottom-full right-0 mb-3' : 'bottom-0 right-[calc(100%+12px)]'
              }`}
              style={{ width: panelWidth, maxHeight: panelMaxHeight }}
            >
              <div className="flex items-center justify-between gap-2 border-b border-white/10 px-3.5 py-3">
                <div>
                  <p className="text-sm font-black tracking-tight">Messages</p>
                  <p className="text-[10px] font-semibold uppercase tracking-widest text-slate-400">
                    {unreadTotal > 0 ? `${unreadTotal} unread` : 'Direct and group chats'}
                  </p>
                </div>
                <button
                  type="button"
                  onClick={() => {
                    setSearch('');
                    searchRef.current?.focus();
                  }}
                  className="inline-flex items-center gap-1 rounded-xl bg-white/10 px-2.5 py-1.5 text-[11px] font-bold text-white transition hover:bg-white/15"
                >
                  <Plus className="h-3.5 w-3.5" />
                  New Message
                </button>
              </div>

              <div className="border-b border-white/10 px-3 py-2.5">
                <label className="relative block">
                  <Search className="pointer-events-none absolute left-3 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-slate-500" />
                  <input
                    ref={searchRef}
                    value={search}
                    onChange={(event) => setSearch(event.target.value)}
                    placeholder="Search people by name"
                    className="w-full rounded-xl border border-slate-700 bg-slate-900 py-2 pl-9 pr-8 text-sm text-white outline-none placeholder:text-slate-500 focus:border-blue-500 focus:ring-2 focus:ring-blue-500/30"
                  />
                  {search && (
                    <button
                      type="button"
                      onClick={() => setSearch('')}
                      className="absolute right-2 top-1/2 inline-flex h-6 w-6 -translate-y-1/2 items-center justify-center rounded-lg text-slate-400 hover:bg-white/10 hover:text-white"
                      aria-label="Clear search"
                    >
                      <X className="h-3.5 w-3.5" />
                    </button>
                  )}
                </label>
              </div>

              <div className="custom-scrollbar min-h-0 flex-1 overflow-y-auto px-1.5 py-1.5">
                {contactsError && (
                  <p className="mx-2 my-1 rounded-xl bg-rose-500/10 px-3 py-2 text-xs font-semibold text-rose-200">
                    {contactsError}
                  </p>
                )}

                {filteredConversations.length > 0 && (
                  <p className="px-2.5 pb-1 pt-1.5 text-[10px] font-extrabold uppercase tracking-widest text-slate-500">
                    Conversations
                  </p>
                )}
                {filteredConversations.map((conversation) => {
                  const label = conversationLabel(conversation);
                  const isGroup = Boolean(conversation.is_group || conversation.type === 'group');
                  const presence = isGroup
                    ? conversation.participants?.some((member) => member.online)
                      ? 'online'
                      : 'offline'
                    : presenceOf(conversation.peer?.online, conversation.peer?.last_seen_at);
                  const open = windows.some((item) => item.id === conversation.id && !item.minimized);
                  return (
                    <button
                      key={conversation.id}
                      type="button"
                      onClick={() => openChat(conversation.id)}
                      className={`flex w-full items-center gap-2.5 rounded-2xl px-2 py-2 text-left transition hover:bg-white/10 ${
                        open ? 'bg-white/10' : ''
                      }`}
                    >
                      <span className="relative shrink-0">
                        {isGroup ? (
                          <span className="flex h-9 w-9 items-center justify-center rounded-full bg-slate-800 text-[10px] font-black tracking-wide text-white">
                            {(conversation.name || 'G').slice(0, 2).toUpperCase()}
                          </span>
                        ) : (
                          <UserAvatar
                            name={label}
                            picture={conversationPicture(conversation)}
                            className="h-9 w-9 rounded-full bg-slate-800 text-xs text-slate-200"
                          />
                        )}
                        <StatusDot presence={presence} />
                      </span>
                      <span className="min-w-0 flex-1">
                        <span className="flex items-center gap-2">
                          <span className="truncate text-sm font-bold text-white">{label}</span>
                          {conversation.unread_count > 0 && (
                            <span className="inline-flex h-4 min-w-4 items-center justify-center rounded-full bg-blue-500 px-1 text-[10px] font-black text-white">
                              {conversation.unread_count > 9 ? '9+' : conversation.unread_count}
                            </span>
                          )}
                        </span>
                        <span className="block truncate text-[11px] font-medium text-slate-400">
                          {presenceLabel(presence, isGroup ? 'Group' : conversation.peer?.role)}
                          {' · '}
                          {conversationPreview(conversation)}
                        </span>
                      </span>
                    </button>
                  );
                })}

                <p className="px-2.5 pb-1 pt-2 text-[10px] font-extrabold uppercase tracking-widest text-slate-500">
                  People
                </p>
                {contactsLoading && people.length === 0 ? (
                  <p className="px-3 py-4 text-center text-xs font-semibold text-slate-500">Looking up people…</p>
                ) : people.length === 0 ? (
                  <p className="px-3 py-4 text-center text-xs font-semibold text-slate-500">
                    {query ? 'No one matches that search.' : 'No other people are available.'}
                  </p>
                ) : (
                  people.map((user) => {
                    const presence = presenceOf(user.online, user.last_seen_at);
                    return (
                      <button
                        key={`person-${user.id}`}
                        type="button"
                        disabled={openingUserId === user.id}
                        onClick={() => void openContact(user)}
                        className="flex w-full items-center gap-2.5 rounded-2xl px-2 py-2 text-left transition hover:bg-white/10 disabled:opacity-60"
                      >
                        <span className="relative shrink-0">
                          <UserAvatar
                            name={user.name}
                            picture={user.profile_picture}
                            className="h-9 w-9 rounded-full bg-slate-800 text-xs text-slate-200"
                          />
                          <StatusDot presence={presence} />
                        </span>
                        <span className="min-w-0 flex-1">
                          <span className="block truncate text-sm font-bold text-white">{user.name}</span>
                          <span
                            className={`block truncate text-[11px] font-medium ${
                              presence === 'online'
                                ? 'text-emerald-300'
                                : presence === 'away'
                                  ? 'text-amber-300'
                                  : 'text-slate-400'
                            }`}
                          >
                            {openingUserId === user.id ? 'Opening…' : presenceLabel(presence, user.role)}
                          </span>
                        </span>
                      </button>
                    );
                  })
                )}
              </div>
            </motion.section>
          )}
        </AnimatePresence>

        <div className="flex flex-col-reverse items-center gap-2">
          <button
            type="button"
            onPointerDown={onDragStart}
            onPointerMove={onDragMove}
            onPointerUp={onDragEnd}
            onPointerCancel={onDragEnd}
            onClick={togglePinned}
            className="relative flex h-12 w-12 items-center justify-center rounded-full bg-gradient-to-br from-slate-950 via-blue-700 to-indigo-600 text-white shadow-lg shadow-blue-950/40 ring-2 ring-white transition hover:brightness-110"
            aria-label={expanded ? 'Close messages' : 'Open messages'}
            aria-expanded={expanded}
            title="Messages"
          >
            <MessageCircle className="h-5 w-5" />
            {unreadTotal > 0 && (
              <span className="absolute -right-1 -top-1 flex h-5 min-w-5 items-center justify-center rounded-full bg-rose-600 px-1 text-[10px] font-black tabular-nums text-white ring-2 ring-white">
                {unreadTotal > 9 ? '9+' : unreadTotal}
              </span>
            )}
          </button>

          {windows.slice(-6).map((item) => {
            const conversation = conversations.find((row) => row.id === item.id);
            const label = conversation ? conversationLabel(conversation) : 'Chat';
            const isGroup = Boolean(conversation?.is_group || conversation?.type === 'group');
            const online = conversation
              ? isGroup
                ? Boolean(conversation.participants?.some((member) => member.online))
                : Boolean(conversation.peer?.online)
              : false;
            const preview = conversation ? conversationPreview(conversation) : '';
            const unread = conversation?.unread_count ?? 0;
            return (
              <div key={item.id} className="group relative">
                <span className="pointer-events-none absolute right-14 top-1/2 hidden w-max max-w-[180px] -translate-y-1/2 flex-col rounded-xl bg-slate-950 px-3 py-1.5 text-left opacity-0 shadow-lg transition group-hover:opacity-100 lg:flex">
                  <span className="truncate text-xs font-bold text-white">{label}</span>
                  {preview && (
                    <span className="truncate text-[10px] font-medium text-slate-300">{preview}</span>
                  )}
                </span>
                <button
                  type="button"
                  onClick={() => openChat(item.id)}
                  className={`relative rounded-full transition ${
                    item.minimized ? '' : 'ring-2 ring-blue-500 ring-offset-2 ring-offset-slate-50'
                  }`}
                  aria-label={item.minimized ? `Restore chat with ${label}` : `${label} is open`}
                  title={label}
                >
                  {isGroup ? (
                    <span className="flex h-11 w-11 items-center justify-center rounded-full bg-slate-950 text-[10px] font-black tracking-wider text-white shadow-md ring-2 ring-white">
                      {(conversation?.name || 'G').slice(0, 2).toUpperCase()}
                    </span>
                  ) : (
                    <UserAvatar
                      name={label}
                      picture={conversation ? conversationPicture(conversation) : null}
                      className="h-11 w-11 rounded-full bg-slate-100 text-xs text-slate-600 shadow-md ring-2 ring-white"
                    />
                  )}
                  <span
                    className={`absolute bottom-0 right-0 h-3 w-3 rounded-full border-2 border-white ${
                      online ? 'bg-emerald-500' : 'bg-slate-300'
                    }`}
                  />
                  {item.minimized && unread > 0 && (
                    <span className="absolute -right-1 -top-1 inline-flex h-5 min-w-5 items-center justify-center rounded-full bg-blue-600 px-1 text-[10px] font-black text-white ring-2 ring-white">
                      {unread > 9 ? '9+' : unread}
                    </span>
                  )}
                </button>
                <button
                  type="button"
                  onClick={(event) => {
                    event.stopPropagation();
                    closeWindow(item.id);
                  }}
                  className="absolute -left-1 -top-1 z-10 inline-flex h-5 w-5 items-center justify-center rounded-full bg-slate-950 text-white opacity-0 shadow-md ring-2 ring-white transition hover:bg-rose-600 focus-visible:opacity-100 group-hover:opacity-100"
                  aria-label={`Close chat with ${label}`}
                  title="Close"
                >
                  <X className="h-3 w-3" strokeWidth={2.5} />
                </button>
              </div>
            );
          })}
        </div>
      </div>

      <AnimatePresence>
        {visibleWindows.map((windowItem, index) => {
          const right =
            anchor.right +
            DOCK_SIZE +
            (expanded && !isMobile ? panelWidth + WINDOW_GAP : 0) +
            index * (windowWidth + WINDOW_GAP);
          return (
            <motion.div
              key={`float-${windowItem.id}`}
              role="dialog"
              aria-label="Conversation"
              initial={reduceMotion ? false : { opacity: 0, y: 16, scale: 0.98 }}
              animate={{ opacity: 1, y: 0, scale: 1 }}
              exit={reduceMotion ? undefined : { opacity: 0, y: 12, scale: 0.98 }}
              transition={{ duration: 0.22, ease: [0.22, 1, 0.36, 1] }}
              className={
                isMobile
                  ? 'fixed inset-x-0 bottom-0 z-[72] overflow-hidden rounded-t-3xl bg-white shadow-2xl shadow-slate-950/30 print:hidden'
                  : 'fixed z-[72] overflow-hidden rounded-[1.5rem] bg-white shadow-2xl shadow-slate-950/20 ring-1 ring-slate-200/90 print:hidden'
              }
              style={
                isMobile
                  ? { top: '4.5rem' }
                  : {
                      width: windowWidth,
                      height: windowHeight,
                      right,
                      bottom: `calc(${anchor.bottom}px + env(safe-area-inset-bottom))`,
                      maxWidth: `calc(100vw - ${DOCK_SIZE + 24}px)`,
                    }
              }
            >
              <MessagesPage
                variant="float"
                initialConversationId={windowItem.id}
                initialDraft={drafts[windowItem.id] ?? ''}
                onDraftChange={(value) =>
                  setDrafts((current) => ({ ...current, [windowItem.id]: value }))
                }
                onClose={() => closeWindow(windowItem.id)}
                onMinimize={() => minimizeWindow(windowItem.id)}
                onExpand={() => expandWindow(windowItem.id)}
              />
            </motion.div>
          );
        })}
      </AnimatePresence>
    </>
  );
}
