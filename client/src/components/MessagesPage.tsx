import { useEffect, useMemo, useRef, useState, type FormEvent } from 'react';
import { AnimatePresence, motion, useReducedMotion } from 'framer-motion';
import {
  Check,
  Maximize2,
  MessageCircle,
  Minimize2,
  Pencil,
  Search,
  Send,
  Trash2,
  Users,
  X,
} from 'lucide-react';
import UserAvatar from './UserAvatar';
import {
  chatService,
  type ChatConversation,
  type ChatMessage,
  type ChatUser,
} from '../services/chatService';

function formatClock(value?: string | null): string {
  if (!value) return '';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return '';
  return date.toLocaleString(undefined, {
    month: 'short',
    day: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
  });
}

function formatLastSeen(value?: string | null): string {
  if (!value) return 'Offline';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return 'Offline';
  const diffMs = Date.now() - date.getTime();
  if (diffMs < 60_000) return 'Last seen just now';
  if (diffMs < 3_600_000) return `Last seen ${Math.floor(diffMs / 60_000)}m ago`;
  if (diffMs < 86_400_000) return `Last seen ${Math.floor(diffMs / 3_600_000)}h ago`;
  return `Last seen ${date.toLocaleDateString(undefined, { month: 'short', day: 'numeric' })}`;
}

function PresenceDot({ online }: { online?: boolean }) {
  return (
    <span
      className={`absolute bottom-0 right-0 h-3 w-3 rounded-full border-2 border-white ${
        online ? 'bg-emerald-500' : 'bg-slate-300'
      }`}
      title={online ? 'Online' : 'Offline'}
    >
      {online && (
        <span className="absolute inset-0 animate-ping rounded-full bg-emerald-400 opacity-60" />
      )}
    </span>
  );
}

function TypingDots() {
  return (
    <span className="inline-flex items-center gap-1 px-0.5" aria-hidden="true">
      {[0, 1, 2].map((index) => (
        <motion.span
          key={index}
          className="h-1.5 w-1.5 rounded-full bg-slate-400"
          animate={{ y: [0, -3, 0], opacity: [0.45, 1, 0.45] }}
          transition={{ duration: 0.9, repeat: Infinity, delay: index * 0.15, ease: 'easeInOut' }}
        />
      ))}
    </span>
  );
}

function AvatarWithPresence({
  name,
  picture,
  online,
  className,
}: {
  name?: string | null;
  picture?: string | null;
  online?: boolean;
  className: string;
}) {
  return (
    <div className="relative shrink-0">
      <UserAvatar name={name} picture={picture} className={className} />
      <PresenceDot online={online} />
    </div>
  );
}

function conversationPreview(conversation: ChatConversation): string {
  if (conversation.peer_typing) return 'typing…';
  if (conversation.last_message_preview) return conversation.last_message_preview;
  if (conversation.last_message?.is_unsent) return 'Message unsent';
  return conversation.last_message?.body || 'No messages yet';
}

export default function MessagesPage() {
  const reduceMotion = useReducedMotion();
  const [conversations, setConversations] = useState<ChatConversation[]>([]);
  const [directory, setDirectory] = useState<ChatUser[]>([]);
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [activeId, setActiveId] = useState<number | null>(null);
  const [search, setSearch] = useState('');
  const [draft, setDraft] = useState('');
  const [loadingInbox, setLoadingInbox] = useState(true);
  const [loadingThread, setLoadingThread] = useState(false);
  const [sending, setSending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [peerTyping, setPeerTyping] = useState(false);
  const [peerOnline, setPeerOnline] = useState(false);
  const [peerLastSeenAt, setPeerLastSeenAt] = useState<string | null>(null);
  const [maximized, setMaximized] = useState(false);
  const [editingId, setEditingId] = useState<number | null>(null);
  const [editDraft, setEditDraft] = useState('');
  const [savingEdit, setSavingEdit] = useState(false);
  const [menuId, setMenuId] = useState<number | null>(null);
  const bottomRef = useRef<HTMLDivElement>(null);
  const draftRef = useRef<HTMLTextAreaElement>(null);
  const editRef = useRef<HTMLTextAreaElement>(null);
  const typingIdleRef = useRef<number | null>(null);
  const lastTypingSentRef = useRef(false);

  const ease = [0.22, 1, 0.36, 1] as const;

  const active = useMemo(
    () => conversations.find((item) => item.id === activeId) ?? null,
    [conversations, activeId],
  );

  const replaceMessage = (updated: ChatMessage) => {
    setMessages((current) => current.map((item) => (item.id === updated.id ? updated : item)));
    setConversations((current) =>
      current.map((item) => {
        if (item.id !== updated.conversation_id) return item;
        if (item.last_message?.id !== updated.id) return item;
        return {
          ...item,
          last_message: updated,
          last_message_preview: updated.is_unsent ? 'Message unsent' : updated.body,
        };
      }),
    );
  };

  const loadInbox = async (preferId?: number | null) => {
    try {
      const rows = await chatService.listConversations();
      setConversations(rows);
      setActiveId((current) => {
        if (preferId && rows.some((row) => row.id === preferId)) return preferId;
        if (current && rows.some((row) => row.id === current)) return current;
        return rows[0]?.id ?? null;
      });
      setError(null);
    } catch {
      setError('Could not load conversations.');
    } finally {
      setLoadingInbox(false);
    }
  };

  const loadDirectory = async (q: string) => {
    try {
      const rows = await chatService.searchUsers(q.trim());
      setDirectory(rows);
    } catch {
      setDirectory([]);
    }
  };

  const loadThread = async (conversationId: number, soft = false) => {
    if (!soft) setLoadingThread(true);
    try {
      const rows = await chatService.listMessages(conversationId);
      setMessages((current) => {
        if (editingId && soft) {
          const editing = current.find((item) => item.id === editingId);
          return rows.map((row) => (row.id === editingId && editing ? { ...row, body: editing.body } : row));
        }
        return rows;
      });
      setConversations((current) =>
        current.map((item) => (item.id === conversationId ? { ...item, unread_count: 0 } : item)),
      );
      setError(null);
    } catch {
      if (!soft) setError('Could not load this conversation.');
    } finally {
      if (!soft) setLoadingThread(false);
    }
  };

  const refreshState = async (conversationId: number) => {
    try {
      const state = await chatService.getState(conversationId);
      setPeerTyping(state.peer_typing);
      setPeerOnline(state.peer_online);
      setPeerLastSeenAt(state.peer_last_seen_at);
      setConversations((current) =>
        current.map((item) =>
          item.id === conversationId
            ? {
                ...item,
                peer_typing: state.peer_typing,
                peer: item.peer
                  ? {
                      ...item.peer,
                      online: state.peer_online,
                      last_seen_at: state.peer_last_seen_at,
                    }
                  : item.peer,
              }
            : item,
        ),
      );
    } catch {
      // Soft presence polling should stay quiet on transient errors.
    }
  };

  const stopTyping = async (conversationId: number | null = activeId) => {
    if (!conversationId || !lastTypingSentRef.current) return;
    lastTypingSentRef.current = false;
    try {
      await chatService.setTyping(conversationId, false);
    } catch {
      // Ignore typing cleanup failures.
    }
  };

  const bumpTyping = (conversationId: number) => {
    if (typingIdleRef.current) window.clearTimeout(typingIdleRef.current);
    if (!lastTypingSentRef.current) {
      lastTypingSentRef.current = true;
      void chatService.setTyping(conversationId, true).catch(() => {
        lastTypingSentRef.current = false;
      });
    }
    typingIdleRef.current = window.setTimeout(() => {
      void stopTyping(conversationId);
    }, 1800);
  };

  useEffect(() => {
    loadInbox();
    loadDirectory('');
    void chatService.heartbeat().catch(() => undefined);
    const heartbeat = window.setInterval(() => {
      void chatService.heartbeat().catch(() => undefined);
    }, 20000);
    return () => window.clearInterval(heartbeat);
  }, []);

  useEffect(() => {
    const timeout = window.setTimeout(() => loadDirectory(search), 250);
    return () => window.clearTimeout(timeout);
  }, [search]);

  useEffect(() => {
    if (!activeId) {
      setMessages([]);
      setPeerTyping(false);
      setPeerOnline(false);
      setPeerLastSeenAt(null);
      setEditingId(null);
      setMenuId(null);
      return;
    }

    setPeerTyping(false);
    setEditingId(null);
    setMenuId(null);
    loadThread(activeId);
    void refreshState(activeId);

    const messagesInterval = window.setInterval(() => {
      loadThread(activeId, true);
      loadInbox(activeId);
    }, 5000);
    const stateInterval = window.setInterval(() => {
      void refreshState(activeId);
    }, 2000);

    const onVisible = () => {
      if (document.visibilityState === 'visible') {
        loadThread(activeId, true);
        loadInbox(activeId);
        void refreshState(activeId);
        void chatService.heartbeat().catch(() => undefined);
      }
    };
    document.addEventListener('visibilitychange', onVisible);

    return () => {
      window.clearInterval(messagesInterval);
      window.clearInterval(stateInterval);
      document.removeEventListener('visibilitychange', onVisible);
      void stopTyping(activeId);
    };
  }, [activeId]);

  useEffect(() => {
    if (!maximized) return;
    const onKey = (event: KeyboardEvent) => {
      if (event.key === 'Escape') setMaximized(false);
    };
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [maximized]);

  useEffect(() => {
    if (editingId) editRef.current?.focus();
  }, [editingId]);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: reduceMotion ? 'auto' : 'smooth', block: 'end' });
  }, [messages.length, activeId, peerTyping, maximized, reduceMotion]);

  const startChat = async (user: ChatUser) => {
    try {
      const conversation = await chatService.openConversation(user.id);
      setConversations((current) => {
        const without = current.filter((item) => item.id !== conversation.id);
        return [conversation, ...without];
      });
      setActiveId(conversation.id);
      setPeerOnline(Boolean(conversation.peer?.online));
      setPeerLastSeenAt(conversation.peer?.last_seen_at ?? null);
      setSearch('');
      setError(null);
      draftRef.current?.focus();
    } catch {
      setError('Could not open that conversation.');
    }
  };

  const submit = async (event: FormEvent) => {
    event.preventDefault();
    if (!activeId || !draft.trim() || sending) return;
    setSending(true);
    if (typingIdleRef.current) window.clearTimeout(typingIdleRef.current);
    await stopTyping(activeId);
    try {
      const created = await chatService.sendMessage(activeId, draft.trim());
      setDraft('');
      setMessages((current) => (current.some((item) => item.id === created.id) ? current : [...current, created]));
      setConversations((current) => {
        const next = current.map((item) =>
          item.id === activeId
            ? {
                ...item,
                last_message: created,
                last_message_preview: created.body,
                last_message_at: created.created_at,
                unread_count: 0,
                peer_typing: false,
              }
            : item,
        );
        return next.sort((a, b) => {
          const aTime = a.last_message_at ? new Date(a.last_message_at).getTime() : 0;
          const bTime = b.last_message_at ? new Date(b.last_message_at).getTime() : 0;
          return bTime - aTime;
        });
      });
      setError(null);
    } catch {
      setError('Could not send that message.');
    } finally {
      setSending(false);
      draftRef.current?.focus();
    }
  };

  const beginEdit = (message: ChatMessage) => {
    if (!message.can_edit) return;
    setMenuId(null);
    setEditingId(message.id);
    setEditDraft(message.body);
  };

  const cancelEdit = () => {
    setEditingId(null);
    setEditDraft('');
  };

  const saveEdit = async (messageId: number) => {
    if (!activeId || !editDraft.trim() || savingEdit) return;
    setSavingEdit(true);
    try {
      const updated = await chatService.editMessage(activeId, messageId, editDraft.trim());
      replaceMessage(updated);
      setEditingId(null);
      setEditDraft('');
      setError(null);
    } catch {
      setError('Could not edit that message. Edits are only allowed within 15 minutes.');
    } finally {
      setSavingEdit(false);
    }
  };

  const unsend = async (message: ChatMessage) => {
    if (!activeId || !message.can_unsend) return;
    if (!window.confirm('Unsend this message for everyone in the conversation?')) return;
    setMenuId(null);
    try {
      const updated = await chatService.unsendMessage(activeId, message.id);
      replaceMessage(updated);
      if (editingId === message.id) cancelEdit();
      setError(null);
    } catch {
      setError('Could not unsend that message.');
    }
  };

  const directoryWithoutExisting = directory.filter(
    (user) => !conversations.some((item) => item.peer?.id === user.id),
  );

  const statusLabel = peerTyping
    ? 'typing…'
    : peerOnline
      ? 'Online'
      : formatLastSeen(peerLastSeenAt || active?.peer?.last_seen_at);

  const conversationPane = (
    <section className="chat-wallpaper flex min-h-0 flex-1 flex-col">
      {!active ? (
        <div className="flex flex-1 flex-col items-center justify-center gap-3 px-6 text-center">
          <motion.div
            initial={reduceMotion ? false : { opacity: 0, scale: 0.92 }}
            animate={{ opacity: 1, scale: 1 }}
            transition={{ duration: 0.35, ease }}
            className="rounded-2xl border border-slate-200 bg-white/80 p-4 text-slate-400 shadow-sm backdrop-blur"
          >
            <MessageCircle className="h-8 w-8" />
          </motion.div>
          <p className="text-base font-semibold text-slate-800">Select a conversation</p>
          <p className="max-w-sm text-sm text-slate-500">
            Choose someone from the left to read and send messages.
          </p>
        </div>
      ) : (
        <>
          <header className="flex items-center gap-3 border-b border-slate-200/80 bg-white/90 px-4 py-3 backdrop-blur sm:px-5">
            <AvatarWithPresence
              name={active.peer?.name}
              picture={active.peer?.profile_picture}
              online={peerOnline || active.peer?.online}
              className="h-11 w-11 rounded-full bg-slate-100 text-sm text-slate-600"
            />
            <div className="min-w-0 flex-1">
              <p className="truncate text-sm font-semibold text-slate-900">{active.peer?.name}</p>
              <AnimatePresence mode="wait" initial={false}>
                <motion.p
                  key={statusLabel}
                  initial={reduceMotion ? false : { opacity: 0, y: 4 }}
                  animate={{ opacity: 1, y: 0 }}
                  exit={reduceMotion ? undefined : { opacity: 0, y: -4 }}
                  transition={{ duration: 0.18, ease }}
                  className={`truncate text-xs ${
                    peerTyping || peerOnline ? 'font-medium text-emerald-600' : 'text-slate-500'
                  }`}
                >
                  {peerTyping ? (
                    <span className="inline-flex items-center gap-2">
                      <TypingDots />
                      typing…
                    </span>
                  ) : (
                    statusLabel
                  )}
                </motion.p>
              </AnimatePresence>
            </div>
            <div className="flex items-center gap-1">
              <button
                type="button"
                onClick={() => setMaximized((value) => !value)}
                className="inline-flex h-9 w-9 items-center justify-center rounded-xl text-slate-500 transition hover:bg-slate-100 hover:text-slate-800"
                aria-label={maximized ? 'Exit maximized conversation' : 'Maximize conversation'}
                title={maximized ? 'Exit full view' : 'Maximize'}
              >
                {maximized ? <Minimize2 className="h-4 w-4" /> : <Maximize2 className="h-4 w-4" />}
              </button>
              {maximized && (
                <button
                  type="button"
                  onClick={() => setMaximized(false)}
                  className="inline-flex h-9 w-9 items-center justify-center rounded-xl text-slate-500 transition hover:bg-slate-100 hover:text-slate-800"
                  aria-label="Close maximized conversation"
                >
                  <X className="h-4 w-4" />
                </button>
              )}
            </div>
          </header>

          <div className="custom-scrollbar min-h-0 flex-1 space-y-3 overflow-y-auto px-4 py-4 sm:px-5">
            {loadingThread ? (
              <p className="py-10 text-center text-sm text-slate-500">Loading messages…</p>
            ) : messages.length === 0 ? (
              <p className="py-10 text-center text-sm text-slate-500">Say hello to start the conversation.</p>
            ) : (
              <AnimatePresence initial={false}>
                {messages.map((message) => {
                  const mine = Boolean(message.is_mine);
                  const unsent = Boolean(message.is_unsent);
                  const editing = editingId === message.id;
                  return (
                    <motion.div
                      key={message.id}
                      layout={!reduceMotion}
                      initial={reduceMotion ? false : { opacity: 0, y: 10, scale: 0.98 }}
                      animate={{ opacity: 1, y: 0, scale: 1 }}
                      transition={{ duration: 0.22, ease }}
                      className={`group flex ${mine ? 'justify-end' : 'justify-start'}`}
                    >
                      <div className={`relative max-w-[85%] sm:max-w-[70%] ${mine ? 'items-end' : 'items-start'}`}>
                        {editing ? (
                          <div className="rounded-2xl border border-blue-200 bg-white p-3 shadow-sm">
                            <textarea
                              ref={editRef}
                              value={editDraft}
                              onChange={(event) => setEditDraft(event.target.value)}
                              onKeyDown={(event) => {
                                if (event.key === 'Escape') {
                                  event.preventDefault();
                                  cancelEdit();
                                }
                                if (event.key === 'Enter' && !event.shiftKey) {
                                  event.preventDefault();
                                  void saveEdit(message.id);
                                }
                              }}
                              rows={3}
                              className="w-full resize-none rounded-xl border border-slate-200 bg-slate-50 px-3 py-2 text-sm text-slate-800 outline-none focus:border-blue-300 focus:bg-white focus:ring-2 focus:ring-blue-100"
                            />
                            <div className="mt-2 flex items-center justify-end gap-2">
                              <button
                                type="button"
                                onClick={cancelEdit}
                                className="inline-flex items-center gap-1 rounded-lg px-2.5 py-1.5 text-xs font-semibold text-slate-500 hover:bg-slate-100"
                              >
                                <X className="h-3.5 w-3.5" />
                                Cancel
                              </button>
                              <button
                                type="button"
                                disabled={savingEdit || !editDraft.trim()}
                                onClick={() => void saveEdit(message.id)}
                                className="inline-flex items-center gap-1 rounded-lg bg-blue-600 px-2.5 py-1.5 text-xs font-semibold text-white hover:bg-blue-700 disabled:bg-slate-300"
                              >
                                <Check className="h-3.5 w-3.5" />
                                Save
                              </button>
                            </div>
                          </div>
                        ) : (
                          <div
                            className={`rounded-2xl px-3.5 py-2.5 text-sm shadow-sm ${
                              unsent
                                ? 'chat-unsent rounded-bl-md border border-dashed border-slate-300 bg-slate-50/80 italic text-slate-500'
                                : mine
                                  ? 'rounded-br-md bg-blue-600 text-white'
                                  : 'chat-bubble-peer rounded-bl-md border border-slate-200 bg-white text-slate-800'
                            }`}
                          >
                            <p className="whitespace-pre-wrap break-words leading-relaxed">
                              {unsent ? 'Message unsent' : message.body}
                            </p>
                            <p className={`mt-1 text-[10px] ${mine && !unsent ? 'text-blue-100' : 'text-slate-400'}`}>
                              {formatClock(message.created_at)}
                              {!unsent && message.edited_at ? ' · edited' : ''}
                            </p>
                          </div>
                        )}

                        {mine && !editing && (message.can_edit || message.can_unsend) && (
                          <div className={`mt-1 flex ${mine ? 'justify-end' : 'justify-start'}`}>
                            <div className="relative">
                              <button
                                type="button"
                                onClick={() => setMenuId((current) => (current === message.id ? null : message.id))}
                                className="rounded-lg px-2 py-1 text-[10px] font-semibold uppercase tracking-wide text-slate-400 opacity-0 transition hover:bg-white/70 hover:text-slate-700 group-hover:opacity-100"
                              >
                                Manage
                              </button>
                              <AnimatePresence>
                                {menuId === message.id && (
                                  <motion.div
                                    initial={reduceMotion ? false : { opacity: 0, y: 4, scale: 0.98 }}
                                    animate={{ opacity: 1, y: 0, scale: 1 }}
                                    exit={reduceMotion ? undefined : { opacity: 0, y: 4, scale: 0.98 }}
                                    className="absolute right-0 z-20 mt-1 min-w-36 overflow-hidden rounded-xl border border-slate-200 bg-white shadow-lg"
                                  >
                                    {message.can_edit && (
                                      <button
                                        type="button"
                                        onClick={() => beginEdit(message)}
                                        className="flex w-full items-center gap-2 px-3 py-2 text-left text-xs font-semibold text-slate-700 hover:bg-slate-50"
                                      >
                                        <Pencil className="h-3.5 w-3.5" />
                                        Edit
                                      </button>
                                    )}
                                    {message.can_unsend && (
                                      <button
                                        type="button"
                                        onClick={() => void unsend(message)}
                                        className="flex w-full items-center gap-2 px-3 py-2 text-left text-xs font-semibold text-rose-600 hover:bg-rose-50"
                                      >
                                        <Trash2 className="h-3.5 w-3.5" />
                                        Unsend
                                      </button>
                                    )}
                                  </motion.div>
                                )}
                              </AnimatePresence>
                            </div>
                          </div>
                        )}
                      </div>
                    </motion.div>
                  );
                })}
              </AnimatePresence>
            )}

            <AnimatePresence>
              {peerTyping && (
                <motion.div
                  key="typing-row"
                  initial={reduceMotion ? false : { opacity: 0, y: 8 }}
                  animate={{ opacity: 1, y: 0 }}
                  exit={reduceMotion ? undefined : { opacity: 0, y: 6 }}
                  transition={{ duration: 0.2, ease }}
                  className="flex justify-start"
                >
                  <div className="inline-flex items-center gap-2 rounded-2xl rounded-bl-md border border-slate-200 bg-white/90 px-3.5 py-2.5 text-xs font-medium text-slate-500 shadow-sm backdrop-blur">
                    <TypingDots />
                    {active.peer?.name?.split(' ')[0] || 'They'} is typing
                  </div>
                </motion.div>
              )}
            </AnimatePresence>
            <div ref={bottomRef} />
          </div>

          <form onSubmit={submit} className="border-t border-slate-200/80 bg-white/90 p-3 backdrop-blur sm:p-4">
            <div className="flex items-end gap-2 rounded-2xl border border-slate-200 bg-slate-50/90 p-2 transition focus-within:border-blue-300 focus-within:bg-white focus-within:ring-2 focus-within:ring-blue-100">
              <textarea
                ref={draftRef}
                value={draft}
                onChange={(event) => {
                  const value = event.target.value;
                  setDraft(value);
                  if (!activeId) return;
                  if (value.trim()) bumpTyping(activeId);
                  else void stopTyping(activeId);
                }}
                onBlur={() => void stopTyping(activeId)}
                onKeyDown={(event) => {
                  if (event.key === 'Enter' && !event.shiftKey) {
                    event.preventDefault();
                    void submit(event);
                  }
                }}
                rows={1}
                placeholder={`Message ${active.peer?.name || '…'}`}
                className="max-h-32 min-h-[2.75rem] flex-1 resize-none bg-transparent px-2 py-2 text-sm text-slate-800 outline-none"
              />
              <motion.button
                type="submit"
                disabled={sending || !draft.trim()}
                whileTap={reduceMotion || sending || !draft.trim() ? undefined : { scale: 0.94 }}
                className="inline-flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-blue-600 text-white transition hover:bg-blue-700 disabled:cursor-not-allowed disabled:bg-slate-300"
                aria-label="Send message"
              >
                <Send className="h-4 w-4" />
              </motion.button>
            </div>
          </form>
        </>
      )}
    </section>
  );

  return (
    <div className="mx-auto flex h-[calc(100vh-6.5rem)] max-w-6xl flex-col gap-4 p-4 sm:p-6 lg:p-8">
      <motion.div
        initial={reduceMotion ? false : { opacity: 0, y: 8 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.35, ease }}
      >
        <p className="text-[11px] font-semibold uppercase tracking-[0.2em] text-blue-600">Inbox</p>
        <h1 className="mt-1 text-2xl font-semibold tracking-tight text-slate-900 sm:text-3xl">Messages</h1>
        <p className="mt-1 max-w-2xl text-sm text-slate-500">
          Message any signed-in TechHRM user. Edit within 15 minutes, unsend when needed, and expand a chat for more room.
        </p>
      </motion.div>

      <AnimatePresence>
        {error && (
          <motion.div
            initial={reduceMotion ? false : { opacity: 0, y: -6 }}
            animate={{ opacity: 1, y: 0 }}
            exit={reduceMotion ? undefined : { opacity: 0, y: -6 }}
            className="rounded-xl border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-700"
          >
            {error}
          </motion.div>
        )}
      </AnimatePresence>

      <motion.div
        layout={!reduceMotion}
        className="grid min-h-0 flex-1 overflow-hidden rounded-2xl border border-slate-200/80 bg-white shadow-[0_1px_2px_rgba(15,23,42,0.04)] lg:grid-cols-[22rem_minmax(0,1fr)]"
      >
        <aside className="flex min-h-0 flex-col border-b border-slate-200/80 lg:border-b-0 lg:border-r">
          <div className="border-b border-slate-200/80 p-4">
            <label className="relative block">
              <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
              <input
                value={search}
                onChange={(event) => setSearch(event.target.value)}
                placeholder="Find someone to message"
                className="w-full rounded-xl border border-slate-200 bg-slate-50 py-2.5 pl-10 pr-3 text-sm text-slate-800 outline-none transition focus:border-blue-300 focus:bg-white focus:ring-2 focus:ring-blue-100"
              />
            </label>
          </div>

          <div className="custom-scrollbar min-h-0 flex-1 overflow-y-auto">
            {search.trim() && (
              <div className="border-b border-slate-100 px-3 py-3">
                <p className="mb-2 flex items-center gap-2 px-1 text-[10px] font-semibold uppercase tracking-widest text-slate-400">
                  <Users className="h-3.5 w-3.5" />
                  People
                </p>
                {directory.length === 0 ? (
                  <p className="px-2 py-3 text-sm text-slate-500">No matching users.</p>
                ) : (
                  directory.map((user) => (
                    <button
                      key={user.id}
                      type="button"
                      onClick={() => startChat(user)}
                      className="flex w-full items-center gap-3 rounded-xl px-2 py-2 text-left transition hover:bg-slate-50"
                    >
                      <AvatarWithPresence
                        name={user.name}
                        picture={user.profile_picture}
                        online={user.online}
                        className="h-10 w-10 rounded-full bg-slate-100 text-sm text-slate-600"
                      />
                      <div className="min-w-0">
                        <p className="truncate text-sm font-semibold text-slate-900">{user.name}</p>
                        <p className={`truncate text-xs ${user.online ? 'text-emerald-600' : 'text-slate-500'}`}>
                          {user.online ? 'Online' : user.role}
                        </p>
                      </div>
                    </button>
                  ))
                )}
              </div>
            )}

            <div className="px-3 py-3">
              <p className="mb-2 flex items-center gap-2 px-1 text-[10px] font-semibold uppercase tracking-widest text-slate-400">
                <MessageCircle className="h-3.5 w-3.5" />
                Conversations
              </p>
              {loadingInbox ? (
                <p className="px-2 py-6 text-sm text-slate-500">Loading inbox…</p>
              ) : conversations.length === 0 ? (
                <div className="px-2 py-8 text-sm text-slate-500">
                  <p className="font-medium text-slate-700">No conversations yet.</p>
                  <p className="mt-1">Search for a coworker or student above to start chatting.</p>
                  {!search.trim() && directoryWithoutExisting.length > 0 && (
                    <div className="mt-4 space-y-1">
                      {directoryWithoutExisting.slice(0, 6).map((user) => (
                        <button
                          key={user.id}
                          type="button"
                          onClick={() => startChat(user)}
                          className="flex w-full items-center gap-3 rounded-xl px-2 py-2 text-left transition hover:bg-slate-50"
                        >
                          <AvatarWithPresence
                            name={user.name}
                            picture={user.profile_picture}
                            online={user.online}
                            className="h-9 w-9 rounded-full bg-slate-100 text-sm text-slate-600"
                          />
                          <div className="min-w-0">
                            <p className="truncate text-sm font-semibold text-slate-900">{user.name}</p>
                            <p className={`truncate text-xs ${user.online ? 'text-emerald-600' : 'text-slate-500'}`}>
                              {user.online ? 'Online' : user.role}
                            </p>
                          </div>
                        </button>
                      ))}
                    </div>
                  )}
                </div>
              ) : (
                conversations.map((conversation) => {
                  const selected = conversation.id === activeId;
                  const preview = conversationPreview(conversation);
                  return (
                    <motion.button
                      key={conversation.id}
                      type="button"
                      layout={!reduceMotion}
                      onClick={() => setActiveId(conversation.id)}
                      whileHover={reduceMotion ? undefined : { x: 2 }}
                      className={`mb-1 flex w-full items-start gap-3 rounded-xl px-2 py-2.5 text-left transition ${
                        selected ? 'bg-blue-50 ring-1 ring-blue-100' : 'hover:bg-slate-50'
                      }`}
                    >
                      <AvatarWithPresence
                        name={conversation.peer?.name}
                        picture={conversation.peer?.profile_picture}
                        online={conversation.peer?.online}
                        className="h-10 w-10 rounded-full bg-slate-100 text-sm text-slate-600"
                      />
                      <div className="min-w-0 flex-1">
                        <div className="flex items-center justify-between gap-2">
                          <p className="truncate text-sm font-semibold text-slate-900">
                            {conversation.peer?.name || 'Unknown user'}
                          </p>
                          <span className="shrink-0 text-[10px] text-slate-400">
                            {formatClock(conversation.last_message_at)}
                          </span>
                        </div>
                        <div className="mt-0.5 flex items-center justify-between gap-2">
                          <p
                            className={`truncate text-xs ${
                              conversation.peer_typing ? 'font-medium text-emerald-600' : 'text-slate-500'
                            }`}
                          >
                            {preview}
                          </p>
                          {conversation.unread_count > 0 && (
                            <span className="inline-flex min-w-5 items-center justify-center rounded-full bg-blue-600 px-1.5 text-[10px] font-bold text-white">
                              {conversation.unread_count}
                            </span>
                          )}
                        </div>
                      </div>
                    </motion.button>
                  );
                })
              )}
            </div>
          </div>
        </aside>

        {!maximized && conversationPane}
      </motion.div>

      <AnimatePresence>
        {maximized && active && (
          <motion.div
            key="chat-maximize"
            className="fixed inset-0 z-[80] flex items-center justify-center bg-slate-950/45 p-3 backdrop-blur-[2px] sm:p-6"
            initial={reduceMotion ? false : { opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={reduceMotion ? undefined : { opacity: 0 }}
            transition={{ duration: 0.22 }}
            onClick={() => setMaximized(false)}
          >
            <motion.div
              role="dialog"
              aria-modal="true"
              aria-label={`Conversation with ${active.peer?.name || 'user'}`}
              initial={reduceMotion ? false : { opacity: 0, scale: 0.96, y: 16 }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              exit={reduceMotion ? undefined : { opacity: 0, scale: 0.98, y: 10 }}
              transition={{ duration: 0.28, ease }}
              className="flex h-[min(92vh,900px)] w-full max-w-5xl overflow-hidden rounded-3xl border border-slate-200 bg-white shadow-2xl"
              onClick={(event) => event.stopPropagation()}
            >
              {conversationPane}
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
