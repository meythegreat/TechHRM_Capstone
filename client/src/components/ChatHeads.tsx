import { useEffect, useMemo, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { AnimatePresence, motion, useReducedMotion } from 'framer-motion';
import { MessageCircle, Plus, X } from 'lucide-react';
import UserAvatar from './UserAvatar';
import MessagesPage from './MessagesPage';
import { chatService, type ChatConversation } from '../services/chatService';

const WINDOW_WIDTH = 360;
const WINDOW_HEIGHT = 500;
const WINDOW_GAP = 12;
const DOCK_WIDTH = 72;

type FloatingWindow = {
  id: number;
  minimized: boolean;
};

function conversationLabel(conversation: ChatConversation): string {
  if (conversation.is_group || conversation.type === 'group') {
    return conversation.name || conversation.title || 'Group';
  }
  return conversation.peer?.name || conversation.title || 'Chat';
}

function conversationPicture(conversation: ChatConversation): string | null {
  if (conversation.is_group || conversation.type === 'group') {
    return conversation.participants?.[0]?.profile_picture ?? null;
  }
  return conversation.peer?.profile_picture ?? null;
}

function isOnline(conversation: ChatConversation): boolean {
  if (conversation.is_group || conversation.type === 'group') {
    return Boolean(conversation.participants?.some((member) => member.id && member.online));
  }
  return Boolean(conversation.peer?.online);
}

/**
 * Desktop-only chat heads docked to the bottom-far-right of the app shell.
 * Opens compact floating chat windows instead of a full-page overlay.
 */
export default function ChatHeads() {
  const navigate = useNavigate();
  const reduceMotion = useReducedMotion();
  const [conversations, setConversations] = useState<ChatConversation[]>([]);
  const [windows, setWindows] = useState<FloatingWindow[]>([]);
  const [hiddenIds, setHiddenIds] = useState<Set<number>>(() => new Set());
  const [viewportWidth, setViewportWidth] = useState(() =>
    typeof window !== 'undefined' ? window.innerWidth : 1440,
  );
  const previousUnread = useRef<Record<number, number>>({});

  const load = async () => {
    try {
      const rows = await chatService.listConversations();
      setConversations(rows);
    } catch {
      // Soft polling — ignore transient failures.
    }
  };

  useEffect(() => {
    void load();
    const interval = window.setInterval(() => void load(), 8000);
    const onVisible = () => {
      if (document.visibilityState === 'visible') void load();
    };
    document.addEventListener('visibilitychange', onVisible);
    return () => {
      window.clearInterval(interval);
      document.removeEventListener('visibilitychange', onVisible);
    };
  }, []);

  useEffect(() => {
    const onResize = () => setViewportWidth(window.innerWidth);
    window.addEventListener('resize', onResize);
    return () => window.removeEventListener('resize', onResize);
  }, []);

  useEffect(() => {
    setHiddenIds((current) => {
      let changed = false;
      const next = new Set(current);
      for (const conversation of conversations) {
        const previous = previousUnread.current[conversation.id] ?? 0;
        if (conversation.unread_count > previous && next.has(conversation.id)) {
          next.delete(conversation.id);
          changed = true;
        }
        previousUnread.current[conversation.id] = conversation.unread_count;
      }
      return changed ? next : current;
    });
  }, [conversations]);

  const openWindowIds = useMemo(() => new Set(windows.map((item) => item.id)), [windows]);

  const heads = useMemo(() => {
    const prioritized = conversations
      .filter((item) => !hiddenIds.has(item.id))
      .filter(
        (item) =>
          openWindowIds.has(item.id) ||
          item.unread_count > 0 ||
          item.peer?.online ||
          (item.is_group && item.participants?.some((member) => member.online)),
      )
      .concat(
        conversations.filter(
          (item) =>
            !hiddenIds.has(item.id) &&
            !openWindowIds.has(item.id) &&
            item.unread_count === 0 &&
            !item.peer?.online &&
            !(item.is_group && item.participants?.some((member) => member.online)),
        ),
      )
      .filter((item, index, all) => all.findIndex((row) => row.id === item.id) === index);

    return prioritized.slice(0, 6);
  }, [conversations, hiddenIds, openWindowIds]);

  const unreadTotal = conversations.reduce((sum, item) => sum + (item.unread_count || 0), 0);

  const visibleWindows = useMemo(() => windows.filter((item) => !item.minimized), [windows]);

  const maxWindows = useMemo(() => {
    const available = Math.max(WINDOW_WIDTH, viewportWidth - DOCK_WIDTH - 24);
    return Math.max(1, Math.floor((available + WINDOW_GAP) / (WINDOW_WIDTH + WINDOW_GAP)));
  }, [viewportWidth]);

  const openChat = (conversationId: number) => {
    setHiddenIds((current) => {
      if (!current.has(conversationId)) return current;
      const next = new Set(current);
      next.delete(conversationId);
      return next;
    });

    setWindows((current) => {
      const existing = current.find((item) => item.id === conversationId);
      if (existing) {
        return current.map((item) =>
          item.id === conversationId ? { ...item, minimized: false } : item,
        );
      }

      const next = [...current, { id: conversationId, minimized: false }];
      const openCount = next.filter((item) => !item.minimized).length;
      if (openCount <= maxWindows) return next;

      // Keep newest windows visible; minimize the oldest expanded ones.
      let overflow = openCount - maxWindows;
      return next.map((item) => {
        if (item.id === conversationId || item.minimized || overflow <= 0) return item;
        overflow -= 1;
        return { ...item, minimized: true };
      });
    });
  };

  const minimizeWindow = (conversationId: number) => {
    setWindows((current) =>
      current.map((item) => (item.id === conversationId ? { ...item, minimized: true } : item)),
    );
  };

  const closeWindow = (conversationId: number) => {
    setWindows((current) => current.filter((item) => item.id !== conversationId));
    void load();
  };

  const closeHead = (conversationId: number) => {
    setHiddenIds((current) => {
      const next = new Set(current);
      next.add(conversationId);
      return next;
    });
    setWindows((current) => current.filter((item) => item.id !== conversationId));
  };

  return (
    <>
      <div className="pointer-events-none fixed bottom-0 right-0 z-[75] hidden flex-col items-end justify-end gap-3 pb-4 pr-2 lg:flex print:hidden">
        <div className="pointer-events-auto flex flex-col-reverse items-end gap-2.5">
          <motion.button
            type="button"
            whileHover={reduceMotion ? undefined : { scale: 1.06 }}
            whileTap={reduceMotion ? undefined : { scale: 0.94 }}
            onClick={() => navigate('/messages')}
            className="relative flex h-12 w-12 items-center justify-center rounded-full bg-blue-600 text-white shadow-lg shadow-blue-600/25 ring-2 ring-white transition hover:bg-blue-700"
            aria-label="Open messages page"
            title="Messages"
          >
            <MessageCircle className="h-5 w-5" />
            {unreadTotal > 0 && (
              <span className="absolute -right-1 -top-1 inline-flex min-w-5 items-center justify-center rounded-full bg-rose-500 px-1 text-[10px] font-bold text-white">
                {unreadTotal > 9 ? '9+' : unreadTotal}
              </span>
            )}
          </motion.button>

          {heads.map((conversation) => {
            const label = conversationLabel(conversation);
            const online = isOnline(conversation);
            const windowState = windows.find((item) => item.id === conversation.id);
            const isOpen = Boolean(windowState && !windowState.minimized);
            return (
              <div key={conversation.id} className="group relative">
                <motion.button
                  type="button"
                  layout={!reduceMotion}
                  whileHover={reduceMotion ? undefined : { scale: 1.06, x: -2 }}
                  whileTap={reduceMotion ? undefined : { scale: 0.94 }}
                  onClick={() => openChat(conversation.id)}
                  className={`relative ${isOpen ? 'ring-2 ring-blue-400 rounded-full' : ''}`}
                  title={label}
                  aria-label={`Open chat with ${label}`}
                >
                  <div className="relative">
                    {conversation.is_group || conversation.type === 'group' ? (
                      <div className="flex h-12 w-12 items-center justify-center rounded-full bg-slate-800 text-xs font-bold text-white shadow-lg ring-2 ring-white">
                        <Plus className="absolute h-3 w-3 opacity-0" />
                        {(conversation.name || 'G').slice(0, 2).toUpperCase()}
                      </div>
                    ) : (
                      <UserAvatar
                        name={label}
                        picture={conversationPicture(conversation)}
                        className="h-12 w-12 rounded-full bg-slate-100 text-sm text-slate-600 shadow-lg ring-2 ring-white"
                      />
                    )}
                    <span
                      className={`absolute bottom-0 right-0 h-3 w-3 rounded-full border-2 border-white ${
                        online ? 'bg-emerald-500' : 'bg-slate-300'
                      }`}
                    />
                    {conversation.unread_count > 0 && (
                      <span className="absolute -right-1 -top-1 inline-flex min-w-5 items-center justify-center rounded-full bg-blue-600 px-1 text-[10px] font-bold text-white">
                        {conversation.unread_count > 9 ? '9+' : conversation.unread_count}
                      </span>
                    )}
                  </div>
                </motion.button>
                <button
                  type="button"
                  onClick={(event) => {
                    event.stopPropagation();
                    closeHead(conversation.id);
                  }}
                  className="absolute -left-1 -top-1 z-10 inline-flex h-5 w-5 items-center justify-center rounded-full bg-slate-700 text-white opacity-0 shadow ring-2 ring-white transition hover:bg-slate-900 group-hover:opacity-100 focus-visible:opacity-100"
                  aria-label={`Close chat head for ${label}`}
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
          const right = DOCK_WIDTH + index * (WINDOW_WIDTH + WINDOW_GAP);
          return (
            <motion.div
              key={`float-${windowItem.id}`}
              role="dialog"
              aria-label="Floating chat"
              initial={reduceMotion ? false : { opacity: 0, y: 24, scale: 0.98 }}
              animate={{ opacity: 1, y: 0, scale: 1 }}
              exit={reduceMotion ? undefined : { opacity: 0, y: 16, scale: 0.98 }}
              transition={{ duration: 0.22, ease: [0.22, 1, 0.36, 1] }}
              className="fixed z-[80] hidden overflow-hidden rounded-2xl bg-white shadow-2xl ring-1 ring-slate-200/80 lg:block print:hidden"
              style={{
                width: WINDOW_WIDTH,
                height: WINDOW_HEIGHT,
                right,
                bottom: 16,
                maxWidth: `calc(100vw - ${DOCK_WIDTH + 16}px)`,
                maxHeight: 'calc(100vh - 2rem)',
              }}
            >
              <MessagesPage
                variant="float"
                initialConversationId={windowItem.id}
                onClose={() => closeWindow(windowItem.id)}
                onMinimize={() => minimizeWindow(windowItem.id)}
              />
            </motion.div>
          );
        })}
      </AnimatePresence>
    </>
  );
}
