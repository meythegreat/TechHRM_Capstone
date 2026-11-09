import { useEffect, useMemo, useRef, useState } from 'react';
import { AnimatePresence, motion, useReducedMotion } from 'framer-motion';
import { MessageCircle, Plus, X } from 'lucide-react';
import UserAvatar from './UserAvatar';
import MessagesPage from './MessagesPage';
import { chatService, type ChatConversation } from '../services/chatService';

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
 * Hidden on mobile viewports.
 */
export default function ChatHeads() {
  const reduceMotion = useReducedMotion();
  const [conversations, setConversations] = useState<ChatConversation[]>([]);
  const [open, setOpen] = useState(false);
  const [focusId, setFocusId] = useState<number | null>(null);
  const [hiddenIds, setHiddenIds] = useState<Set<number>>(() => new Set());
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

  useEffect(() => {
    if (!open) return;
    const onKey = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        setOpen(false);
        setFocusId(null);
      }
    };
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [open]);

  const heads = useMemo(() => {
    return conversations
      .filter((item) => !hiddenIds.has(item.id))
      .filter((item) => item.unread_count > 0 || item.peer?.online || (item.is_group && item.participants?.some((p) => p.online)))
      .concat(
        conversations.filter(
          (item) =>
            !hiddenIds.has(item.id) &&
            item.unread_count === 0 &&
            !item.peer?.online &&
            !(item.is_group && item.participants?.some((p) => p.online)),
        ),
      )
      .filter((item, index, all) => all.findIndex((row) => row.id === item.id) === index)
      .slice(0, 6);
  }, [conversations, hiddenIds]);

  const unreadTotal = conversations.reduce((sum, item) => sum + (item.unread_count || 0), 0);

  const openChat = (conversationId?: number | null) => {
    setFocusId(conversationId ?? null);
    setOpen(true);
  };

  const closeHead = (conversationId: number) => {
    setHiddenIds((current) => {
      const next = new Set(current);
      next.add(conversationId);
      return next;
    });
    if (focusId === conversationId) {
      setOpen(false);
      setFocusId(null);
    }
  };

  return (
    <>
      <div className="pointer-events-none fixed bottom-0 right-0 z-[75] hidden flex-col items-end justify-end gap-3 pb-4 pr-2 lg:flex print:hidden">
        <div className="pointer-events-auto flex flex-col-reverse items-end gap-2.5">
          <motion.button
            type="button"
            whileHover={reduceMotion ? undefined : { scale: 1.06 }}
            whileTap={reduceMotion ? undefined : { scale: 0.94 }}
            onClick={() => openChat(null)}
            className="relative flex h-12 w-12 items-center justify-center rounded-full bg-blue-600 text-white shadow-lg shadow-blue-600/25 ring-2 ring-white transition hover:bg-blue-700"
            aria-label="Open messages"
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
            return (
              <div key={conversation.id} className="group relative">
                <motion.button
                  type="button"
                  layout={!reduceMotion}
                  whileHover={reduceMotion ? undefined : { scale: 1.06, x: -2 }}
                  whileTap={reduceMotion ? undefined : { scale: 0.94 }}
                  onClick={() => openChat(conversation.id)}
                  className="relative"
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
        {open && (
          <motion.div
            key="chat-heads-overlay"
            className="fixed inset-0 z-[80] hidden lg:flex print:hidden"
            initial={reduceMotion ? false : { opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={reduceMotion ? undefined : { opacity: 0 }}
            transition={{ duration: 0.2 }}
          >
            <button
              type="button"
              className="absolute inset-0 bg-slate-950/40 backdrop-blur-[1px]"
              aria-label="Close chat"
              onClick={() => {
                setOpen(false);
                setFocusId(null);
                void load();
              }}
            />
            <motion.div
              role="dialog"
              aria-modal="true"
              aria-label="Messages"
              initial={reduceMotion ? false : { opacity: 0, x: 40 }}
              animate={{ opacity: 1, x: 0 }}
              exit={reduceMotion ? undefined : { opacity: 0, x: 24 }}
              transition={{ duration: 0.28, ease: [0.22, 1, 0.36, 1] }}
              className="relative ml-auto flex h-full w-full max-w-none overflow-hidden bg-white shadow-2xl"
            >
              <MessagesPage
                variant="overlay"
                initialConversationId={focusId}
                onClose={() => {
                  setOpen(false);
                  setFocusId(null);
                  void load();
                }}
              />
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>
    </>
  );
}
