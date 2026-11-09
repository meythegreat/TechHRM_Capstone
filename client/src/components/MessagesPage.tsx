import { useEffect, useMemo, useRef, useState, type FormEvent } from 'react';
import { MessageCircle, Search, Send, Users } from 'lucide-react';
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

export default function MessagesPage() {
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
  const bottomRef = useRef<HTMLDivElement>(null);
  const draftRef = useRef<HTMLTextAreaElement>(null);

  const active = useMemo(
    () => conversations.find((item) => item.id === activeId) ?? null,
    [conversations, activeId],
  );

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
      setMessages(rows);
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

  useEffect(() => {
    loadInbox();
    loadDirectory('');
  }, []);

  useEffect(() => {
    const timeout = window.setTimeout(() => loadDirectory(search), 250);
    return () => window.clearTimeout(timeout);
  }, [search]);

  useEffect(() => {
    if (!activeId) {
      setMessages([]);
      return;
    }
    loadThread(activeId);
    const interval = window.setInterval(() => {
      loadThread(activeId, true);
      loadInbox(activeId);
    }, 5000);
    const onVisible = () => {
      if (document.visibilityState === 'visible') {
        loadThread(activeId, true);
        loadInbox(activeId);
      }
    };
    document.addEventListener('visibilitychange', onVisible);
    return () => {
      window.clearInterval(interval);
      document.removeEventListener('visibilitychange', onVisible);
    };
  }, [activeId]);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth', block: 'end' });
  }, [messages.length, activeId]);

  const startChat = async (user: ChatUser) => {
    try {
      const conversation = await chatService.openConversation(user.id);
      setConversations((current) => {
        const without = current.filter((item) => item.id !== conversation.id);
        return [conversation, ...without];
      });
      setActiveId(conversation.id);
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
                last_message_at: created.created_at,
                unread_count: 0,
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

  const directoryWithoutExisting = directory.filter(
    (user) => !conversations.some((item) => item.peer?.id === user.id),
  );

  return (
    <div className="mx-auto flex h-[calc(100vh-6.5rem)] max-w-6xl flex-col gap-4 p-4 sm:p-6 lg:p-8">
      <div>
        <p className="text-[11px] font-semibold uppercase tracking-[0.2em] text-blue-600">Inbox</p>
        <h1 className="mt-1 text-2xl font-semibold tracking-tight text-slate-900 sm:text-3xl">Messages</h1>
        <p className="mt-1 max-w-2xl text-sm text-slate-500">
          Message any signed-in TechHRM user. Conversations refresh every few seconds while this page is open.
        </p>
      </div>

      {error && (
        <div className="rounded-xl border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-700">
          {error}
        </div>
      )}

      <div className="grid min-h-0 flex-1 overflow-hidden rounded-2xl border border-slate-200/80 bg-white shadow-[0_1px_2px_rgba(15,23,42,0.04)] lg:grid-cols-[22rem_minmax(0,1fr)]">
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
                      <UserAvatar name={user.name} picture={user.profile_picture} className="h-10 w-10 rounded-full bg-slate-100 text-sm text-slate-600" />
                      <div className="min-w-0">
                        <p className="truncate text-sm font-semibold text-slate-900">{user.name}</p>
                        <p className="truncate text-xs text-slate-500">{user.role}</p>
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
                          <UserAvatar name={user.name} picture={user.profile_picture} className="h-9 w-9 rounded-full bg-slate-100 text-sm text-slate-600" />
                          <div className="min-w-0">
                            <p className="truncate text-sm font-semibold text-slate-900">{user.name}</p>
                            <p className="truncate text-xs text-slate-500">{user.role}</p>
                          </div>
                        </button>
                      ))}
                    </div>
                  )}
                </div>
              ) : (
                conversations.map((conversation) => {
                  const selected = conversation.id === activeId;
                  return (
                    <button
                      key={conversation.id}
                      type="button"
                      onClick={() => setActiveId(conversation.id)}
                      className={`mb-1 flex w-full items-start gap-3 rounded-xl px-2 py-2.5 text-left transition ${
                        selected ? 'bg-blue-50 ring-1 ring-blue-100' : 'hover:bg-slate-50'
                      }`}
                    >
                      <UserAvatar
                        name={conversation.peer?.name}
                        picture={conversation.peer?.profile_picture}
                        className="h-10 w-10 rounded-full bg-slate-100 text-sm text-slate-600"
                      />
                      <div className="min-w-0 flex-1">
                        <div className="flex items-center justify-between gap-2">
                          <p className="truncate text-sm font-semibold text-slate-900">{conversation.peer?.name || 'Unknown user'}</p>
                          <span className="shrink-0 text-[10px] text-slate-400">{formatClock(conversation.last_message_at)}</span>
                        </div>
                        <div className="mt-0.5 flex items-center justify-between gap-2">
                          <p className="truncate text-xs text-slate-500">
                            {conversation.last_message?.body || 'No messages yet'}
                          </p>
                          {conversation.unread_count > 0 && (
                            <span className="inline-flex min-w-5 items-center justify-center rounded-full bg-blue-600 px-1.5 text-[10px] font-bold text-white">
                              {conversation.unread_count}
                            </span>
                          )}
                        </div>
                      </div>
                    </button>
                  );
                })
              )}
            </div>
          </div>
        </aside>

        <section className="flex min-h-0 flex-col bg-[linear-gradient(180deg,#f8fafc_0%,#ffffff_28%)]">
          {!active ? (
            <div className="flex flex-1 flex-col items-center justify-center gap-3 px-6 text-center">
              <div className="rounded-2xl border border-slate-200 bg-white p-4 text-slate-400 shadow-sm">
                <MessageCircle className="h-8 w-8" />
              </div>
              <p className="text-base font-semibold text-slate-800">Select a conversation</p>
              <p className="max-w-sm text-sm text-slate-500">
                Choose someone from the left to read and send messages.
              </p>
            </div>
          ) : (
            <>
              <header className="flex items-center gap-3 border-b border-slate-200/80 bg-white/90 px-4 py-3 backdrop-blur sm:px-5">
                <UserAvatar
                  name={active.peer?.name}
                  picture={active.peer?.profile_picture}
                  className="h-11 w-11 rounded-full bg-slate-100 text-sm text-slate-600"
                />
                <div className="min-w-0">
                  <p className="truncate text-sm font-semibold text-slate-900">{active.peer?.name}</p>
                  <p className="truncate text-xs text-slate-500">
                    {active.peer?.role}
                    {active.peer?.username ? ` · @${active.peer.username}` : ''}
                  </p>
                </div>
              </header>

              <div className="custom-scrollbar min-h-0 flex-1 space-y-3 overflow-y-auto px-4 py-4 sm:px-5">
                {loadingThread ? (
                  <p className="py-10 text-center text-sm text-slate-500">Loading messages…</p>
                ) : messages.length === 0 ? (
                  <p className="py-10 text-center text-sm text-slate-500">Say hello to start the conversation.</p>
                ) : (
                  messages.map((message) => {
                    const mine = Boolean(message.is_mine);
                    return (
                      <div key={message.id} className={`flex ${mine ? 'justify-end' : 'justify-start'}`}>
                        <div
                          className={`max-w-[85%] rounded-2xl px-3.5 py-2.5 text-sm shadow-sm sm:max-w-[70%] ${
                            mine
                              ? 'rounded-br-md bg-blue-600 text-white'
                              : 'rounded-bl-md border border-slate-200 bg-white text-slate-800'
                          }`}
                        >
                          <p className="whitespace-pre-wrap break-words leading-relaxed">{message.body}</p>
                          <p className={`mt-1 text-[10px] ${mine ? 'text-blue-100' : 'text-slate-400'}`}>
                            {formatClock(message.created_at)}
                          </p>
                        </div>
                      </div>
                    );
                  })
                )}
                <div ref={bottomRef} />
              </div>

              <form onSubmit={submit} className="border-t border-slate-200/80 bg-white p-3 sm:p-4">
                <div className="flex items-end gap-2 rounded-2xl border border-slate-200 bg-slate-50 p-2 focus-within:border-blue-300 focus-within:bg-white focus-within:ring-2 focus-within:ring-blue-100">
                  <textarea
                    ref={draftRef}
                    value={draft}
                    onChange={(event) => setDraft(event.target.value)}
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
                  <button
                    type="submit"
                    disabled={sending || !draft.trim()}
                    className="inline-flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-blue-600 text-white transition hover:bg-blue-700 disabled:cursor-not-allowed disabled:bg-slate-300"
                    aria-label="Send message"
                  >
                    <Send className="h-4 w-4" />
                  </button>
                </div>
              </form>
            </>
          )}
        </section>
      </div>
    </div>
  );
}
