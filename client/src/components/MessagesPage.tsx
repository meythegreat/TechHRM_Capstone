import { useEffect, useMemo, useRef, useState, type FormEvent } from 'react';
import { AnimatePresence, motion, useReducedMotion } from 'framer-motion';
import {
  Activity,
  Archive,
  ArchiveRestore,
  Check,
  ChevronLeft,
  ChevronRight,
  MapPin,
  Maximize2,
  MessageCircle,
  Minimize2,
  MoreVertical,
  Pencil,
  Plus,
  Search,
  Send,
  Trash2,
  Users,
  UsersRound,
  X,
} from 'lucide-react';
import UserAvatar from './UserAvatar';
import {
  chatService,
  type ChatConversation,
  type ChatMessage,
  type ChatUser,
} from '../services/chatService';

export interface MessagesPageProps {
  variant?: 'page' | 'overlay';
  initialConversationId?: number | null;
  onClose?: () => void;
}

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
  group,
}: {
  name?: string | null;
  picture?: string | null;
  online?: boolean;
  className: string;
  group?: boolean;
}) {
  return (
    <div className="relative shrink-0">
      {group ? (
        <div className={`${className} flex items-center justify-center bg-slate-800 font-bold text-white`}>
          <UsersRound className="h-4 w-4" />
        </div>
      ) : (
        <UserAvatar name={name} picture={picture} className={className} />
      )}
      <PresenceDot online={online} />
    </div>
  );
}

function isGroupConversation(conversation: ChatConversation | null | undefined): boolean {
  return Boolean(conversation?.is_group || conversation?.type === 'group');
}

function conversationTitle(conversation: ChatConversation): string {
  if (isGroupConversation(conversation)) {
    return conversation.name || conversation.title || 'Group chat';
  }
  return conversation.peer?.name || conversation.title || 'Unknown user';
}

function conversationPreview(conversation: ChatConversation): string {
  if (conversation.peer_typing) return 'typing…';
  if (conversation.last_message_preview) return conversation.last_message_preview;
  if (conversation.last_message?.is_unsent) return 'Message unsent';
  return conversation.last_message?.body || 'No messages yet';
}

function conversationOnline(conversation: ChatConversation): boolean {
  if (isGroupConversation(conversation)) {
    return Boolean(conversation.participants?.some((member) => member.online));
  }
  return Boolean(conversation.peer?.online);
}

function AssignmentChip({ label }: { label?: string | null }) {
  if (!label) return null;
  return (
    <span className="inline-flex max-w-full items-center gap-1 rounded-lg bg-slate-100 px-1.5 py-0.5 text-[10px] font-semibold text-slate-600">
      <MapPin className="h-3 w-3 shrink-0" />
      <span className="truncate">{label}</span>
    </span>
  );
}

function ClockedInChip({
  clockedIn,
  workType,
}: {
  clockedIn?: boolean;
  workType?: string | null;
}) {
  if (!clockedIn) {
    return (
      <span className="inline-flex items-center rounded-lg bg-slate-100 px-1.5 py-0.5 text-[10px] font-semibold text-slate-500">
        Not clocked in
      </span>
    );
  }
  return (
    <span className="inline-flex items-center gap-1 rounded-lg bg-emerald-50 px-1.5 py-0.5 text-[10px] font-semibold text-emerald-700">
      <span className="h-1.5 w-1.5 rounded-full bg-emerald-500" />
      Clocked in{workType ? ` · ${workType}` : ''}
    </span>
  );
}

export default function MessagesPage({
  variant = 'page',
  initialConversationId = null,
  onClose,
}: MessagesPageProps) {
  const reduceMotion = useReducedMotion();
  const isOverlay = variant === 'overlay';
  const [conversations, setConversations] = useState<ChatConversation[]>([]);
  const [directory, setDirectory] = useState<ChatUser[]>([]);
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [activeId, setActiveId] = useState<number | null>(initialConversationId);
  const [search, setSearch] = useState('');
  const [draft, setDraft] = useState('');
  const [loadingInbox, setLoadingInbox] = useState(true);
  const [loadingThread, setLoadingThread] = useState(false);
  const [sending, setSending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [peerTyping, setPeerTyping] = useState(false);
  const [peerOnline, setPeerOnline] = useState(false);
  const [peerLastSeenAt, setPeerLastSeenAt] = useState<string | null>(null);
  const [peerAssignment, setPeerAssignment] = useState<string | null>(null);
  const [peerClockedIn, setPeerClockedIn] = useState(false);
  const [peerWorkType, setPeerWorkType] = useState<string | null>(null);
  const [typingNames, setTypingNames] = useState<string[]>([]);
  const [onlineCount, setOnlineCount] = useState(0);
  const [memberCount, setMemberCount] = useState(0);
  const [activeNow, setActiveNow] = useState<ChatUser[]>([]);
  const [maximized, setMaximized] = useState(isOverlay);
  const [sidebarCollapsed, setSidebarCollapsed] = useState(false);
  const [editingId, setEditingId] = useState<number | null>(null);
  const [editDraft, setEditDraft] = useState('');
  const [savingEdit, setSavingEdit] = useState(false);
  const [menuId, setMenuId] = useState<number | null>(null);
  const [showGroupModal, setShowGroupModal] = useState(false);
  const [groupName, setGroupName] = useState('');
  const [groupSearch, setGroupSearch] = useState('');
  const [groupCandidates, setGroupCandidates] = useState<ChatUser[]>([]);
  const [groupSelected, setGroupSelected] = useState<ChatUser[]>([]);
  const [creatingGroup, setCreatingGroup] = useState(false);
  const [inboxScope, setInboxScope] = useState<'active' | 'archived'>('active');
  const [threadMenuOpen, setThreadMenuOpen] = useState(false);
  const [managingId, setManagingId] = useState<number | null>(null);
  const bottomRef = useRef<HTMLDivElement>(null);
  const draftRef = useRef<HTMLTextAreaElement>(null);
  const editRef = useRef<HTMLTextAreaElement>(null);
  const typingIdleRef = useRef<number | null>(null);
  const lastTypingSentRef = useRef(false);
  const shellRef = useRef<HTMLDivElement>(null);
  const autoCollapsedRef = useRef(false);

  const ease = [0.22, 1, 0.36, 1] as const;

  const active = useMemo(
    () => conversations.find((item) => item.id === activeId) ?? null,
    [conversations, activeId],
  );
  const activeIsGroup = isGroupConversation(active);

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

  const loadInbox = async (preferId?: number | null, scope: 'active' | 'archived' = inboxScope) => {
    try {
      const rows = await chatService.listConversations(scope);
      setConversations(rows);
      setActiveId((current) => {
        if (preferId && rows.some((row) => row.id === preferId)) return preferId;
        if (current && rows.some((row) => row.id === current)) return current;
        if (
          scope === 'active' &&
          initialConversationId &&
          rows.some((row) => row.id === initialConversationId)
        ) {
          return initialConversationId;
        }
        return rows.some((row) => row.id === current) ? current : rows[0]?.id ?? null;
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

  const loadActiveNow = async () => {
    try {
      const response = await chatService.listActiveNow();
      setActiveNow(response.people);
    } catch {
      setActiveNow([]);
    }
  };

  const refreshState = async (conversationId: number) => {
    try {
      const state = await chatService.getState(conversationId);
      setPeerTyping(state.peer_typing);
      setPeerOnline(state.peer_online);
      setPeerLastSeenAt(state.peer_last_seen_at);
      setPeerAssignment(state.peer_assignment ?? null);
      setPeerClockedIn(Boolean(state.peer_clocked_in));
      setPeerWorkType(state.peer_work_type ?? null);
      setTypingNames(Array.isArray(state.typing_names) ? state.typing_names : []);
      setOnlineCount(Number(state.online_count || 0));
      setMemberCount(Number(state.member_count || 0));
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
                      assignment: state.peer_assignment ?? item.peer.assignment,
                      clocked_in: Boolean(state.peer_clocked_in),
                      clocked_in_since: state.peer_clocked_in_since ?? null,
                      work_type: state.peer_work_type ?? null,
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
    setLoadingInbox(true);
    loadInbox(initialConversationId, inboxScope);
    loadDirectory('');
    void loadActiveNow();
  }, [initialConversationId, inboxScope]);

  useEffect(() => {
    const shell = shellRef.current;
    if (!shell || typeof ResizeObserver === 'undefined') return;

    const observer = new ResizeObserver((entries) => {
      const width = entries[0]?.contentRect.width ?? shell.clientWidth;
      if (width < 860) {
        if (!autoCollapsedRef.current) {
          autoCollapsedRef.current = true;
          setSidebarCollapsed(true);
        }
      } else if (autoCollapsedRef.current) {
        autoCollapsedRef.current = false;
        setSidebarCollapsed(false);
      }
    });

    observer.observe(shell);
    return () => observer.disconnect();
  }, []);

  useEffect(() => {
    const timeout = window.setTimeout(() => loadDirectory(search), 250);
    return () => window.clearTimeout(timeout);
  }, [search]);

  useEffect(() => {
    if (!showGroupModal) return;
    const timeout = window.setTimeout(() => {
      void chatService.searchUsers(groupSearch.trim()).then(setGroupCandidates).catch(() => setGroupCandidates([]));
    }, 200);
    return () => window.clearTimeout(timeout);
  }, [groupSearch, showGroupModal]);

  useEffect(() => {
    if (!activeId) {
      setMessages([]);
      setPeerTyping(false);
      setPeerOnline(false);
      setPeerLastSeenAt(null);
      setPeerAssignment(null);
      setPeerClockedIn(false);
      setPeerWorkType(null);
      setTypingNames([]);
      setOnlineCount(0);
      setMemberCount(0);
      setEditingId(null);
      setMenuId(null);
      return;
    }

    setPeerTyping(false);
    setEditingId(null);
    setMenuId(null);
    setThreadMenuOpen(false);
    setManagingId(null);
    loadThread(activeId);
    void refreshState(activeId);

    const messagesInterval = window.setInterval(() => {
      loadThread(activeId, true);
      loadInbox(activeId);
      void loadActiveNow();
    }, 5000);
    const stateInterval = window.setInterval(() => {
      void refreshState(activeId);
    }, 2000);

    const onVisible = () => {
      if (document.visibilityState === 'visible') {
        loadThread(activeId, true);
        loadInbox(activeId);
        void refreshState(activeId);
        void loadActiveNow();
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
    if (!maximized || isOverlay) return;
    const onKey = (event: KeyboardEvent) => {
      if (event.key === 'Escape') setMaximized(false);
    };
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [maximized, isOverlay]);

  useEffect(() => {
    if (editingId) editRef.current?.focus();
  }, [editingId]);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: reduceMotion ? 'auto' : 'smooth', block: 'end' });
  }, [messages.length, activeId, peerTyping, maximized, reduceMotion]);

  const startChat = async (user: ChatUser) => {
    try {
      const conversation = await chatService.openConversation(user.id);
      setSearch('');
      setPeerOnline(Boolean(conversation.peer?.online));
      setPeerLastSeenAt(conversation.peer?.last_seen_at ?? null);
      setInboxScope('active');
      setLoadingInbox(true);
      await loadInbox(conversation.id, 'active');
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

  const toggleGroupMember = (user: ChatUser) => {
    setGroupSelected((current) =>
      current.some((item) => item.id === user.id)
        ? current.filter((item) => item.id !== user.id)
        : [...current, user],
    );
  };

  const createGroup = async (event: FormEvent) => {
    event.preventDefault();
    if (!groupName.trim() || groupSelected.length === 0 || creatingGroup) return;
    setCreatingGroup(true);
    try {
      const conversation = await chatService.createGroup(
        groupName.trim(),
        groupSelected.map((user) => user.id),
      );
      setShowGroupModal(false);
      setGroupName('');
      setGroupSearch('');
      setGroupSelected([]);
      setInboxScope('active');
      setLoadingInbox(true);
      await loadInbox(conversation.id, 'active');
      setError(null);
    } catch {
      setError('Could not create that group chat.');
    } finally {
      setCreatingGroup(false);
    }
  };

  const archiveConversation = async (conversationId: number) => {
    setThreadMenuOpen(false);
    setManagingId(null);
    try {
      await chatService.archiveConversation(conversationId);
      setConversations((current) => current.filter((item) => item.id !== conversationId));
      if (activeId === conversationId) {
        setActiveId(null);
        setMessages([]);
      }
      setError(null);
    } catch {
      setError('Could not archive that conversation.');
    }
  };

  const restoreConversation = async (conversationId: number) => {
    setThreadMenuOpen(false);
    setManagingId(null);
    try {
      await chatService.restoreConversation(conversationId);
      setInboxScope('active');
      setLoadingInbox(true);
      await loadInbox(conversationId, 'active');
      setError(null);
    } catch {
      setError('Could not restore that conversation.');
    }
  };

  const deleteConversation = async (conversationId: number) => {
    if (
      !window.confirm(
        'Delete this conversation for you? You will not see it again unless someone messages you here.',
      )
    ) {
      return;
    }
    setThreadMenuOpen(false);
    setManagingId(null);
    try {
      await chatService.deleteConversation(conversationId);
      setConversations((current) => current.filter((item) => item.id !== conversationId));
      if (activeId === conversationId) {
        setActiveId(null);
        setMessages([]);
      }
      setError(null);
    } catch {
      setError('Could not delete that conversation.');
    }
  };

  const directoryWithoutExisting = directory.filter(
    (user) => !conversations.some((item) => !isGroupConversation(item) && item.peer?.id === user.id),
  );

  const statusLabel = peerTyping
    ? typingNames.length > 0
      ? `${typingNames[0]}${typingNames.length > 1 ? ` +${typingNames.length - 1}` : ''} typing…`
      : 'typing…'
    : activeIsGroup
      ? `${onlineCount} online · ${memberCount || active?.member_count || 0} members`
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
            Choose someone from the left, or start a group chat.
          </p>
        </div>
      ) : (
        <>
          <header className="flex items-center gap-3 border-b border-slate-200/80 bg-white/90 px-4 py-3 backdrop-blur sm:px-5">
            <AvatarWithPresence
              name={activeIsGroup ? conversationTitle(active) : active.peer?.name}
              picture={active.peer?.profile_picture}
              online={peerOnline || conversationOnline(active)}
              group={activeIsGroup}
              className="h-11 w-11 rounded-full bg-slate-100 text-sm text-slate-600"
            />
            <div className="min-w-0 flex-1">
              <p className="truncate text-sm font-semibold text-slate-900">{conversationTitle(active)}</p>
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
                      {statusLabel}
                    </span>
                  ) : (
                    statusLabel
                  )}
                </motion.p>
              </AnimatePresence>
              {!activeIsGroup && (
                <div className="mt-1.5 flex flex-wrap items-center gap-1.5">
                  <AssignmentChip label={peerAssignment || active.peer?.assignment} />
                  <ClockedInChip
                    clockedIn={peerClockedIn || active.peer?.clocked_in}
                    workType={peerWorkType || active.peer?.work_type}
                  />
                </div>
              )}
            </div>
            <div className="flex items-center gap-1">
              <div className="relative">
                <button
                  type="button"
                  onClick={() => setThreadMenuOpen((value) => !value)}
                  className="inline-flex h-9 w-9 items-center justify-center rounded-xl text-slate-500 transition hover:bg-slate-100 hover:text-slate-800"
                  aria-label="Conversation options"
                  title="Conversation options"
                >
                  <MoreVertical className="h-4 w-4" />
                </button>
                <AnimatePresence>
                  {threadMenuOpen && (
                    <motion.div
                      initial={reduceMotion ? false : { opacity: 0, y: 4, scale: 0.98 }}
                      animate={{ opacity: 1, y: 0, scale: 1 }}
                      exit={reduceMotion ? undefined : { opacity: 0, y: 4, scale: 0.98 }}
                      className="absolute right-0 z-30 mt-1 min-w-44 overflow-hidden rounded-xl border border-slate-200 bg-white shadow-lg"
                    >
                      {inboxScope === 'archived' || active.is_archived ? (
                        <button
                          type="button"
                          onClick={() => void restoreConversation(active.id)}
                          className="flex w-full items-center gap-2 px-3 py-2.5 text-left text-xs font-semibold text-slate-700 hover:bg-slate-50"
                        >
                          <ArchiveRestore className="h-3.5 w-3.5" />
                          Restore conversation
                        </button>
                      ) : (
                        <button
                          type="button"
                          onClick={() => void archiveConversation(active.id)}
                          className="flex w-full items-center gap-2 px-3 py-2.5 text-left text-xs font-semibold text-slate-700 hover:bg-slate-50"
                        >
                          <Archive className="h-3.5 w-3.5" />
                          Archive conversation
                        </button>
                      )}
                      <button
                        type="button"
                        onClick={() => void deleteConversation(active.id)}
                        className="flex w-full items-center gap-2 px-3 py-2.5 text-left text-xs font-semibold text-rose-600 hover:bg-rose-50"
                      >
                        <Trash2 className="h-3.5 w-3.5" />
                        Delete for me
                      </button>
                    </motion.div>
                  )}
                </AnimatePresence>
              </div>
              {!isOverlay && (
                <button
                  type="button"
                  onClick={() => setMaximized((value) => !value)}
                  className="inline-flex h-9 w-9 items-center justify-center rounded-xl text-slate-500 transition hover:bg-slate-100 hover:text-slate-800"
                  aria-label={maximized ? 'Exit maximized conversation' : 'Maximize conversation'}
                  title={maximized ? 'Exit full view' : 'Maximize'}
                >
                  {maximized ? <Minimize2 className="h-4 w-4" /> : <Maximize2 className="h-4 w-4" />}
                </button>
              )}
              {(maximized || isOverlay) && (
                <button
                  type="button"
                  onClick={() => {
                    if (isOverlay) onClose?.();
                    else setMaximized(false);
                  }}
                  className="inline-flex h-9 w-9 items-center justify-center rounded-xl text-slate-500 transition hover:bg-slate-100 hover:text-slate-800"
                  aria-label="Close chat"
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
                        {activeIsGroup && !mine && !unsent && (
                          <p className="mb-1 px-1 text-[10px] font-semibold text-slate-400">
                            {message.sender?.name || 'Member'}
                          </p>
                        )}
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
                              className="chat-composer w-full resize-none rounded-xl border border-slate-200 bg-slate-50 px-3 py-2 text-sm text-slate-800 outline-none focus:border-blue-300 focus:ring-2 focus:ring-blue-100"
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
                    {activeIsGroup
                      ? statusLabel
                      : `${active.peer?.name?.split(' ')[0] || 'They'} is typing`}
                  </div>
                </motion.div>
              )}
            </AnimatePresence>
            <div ref={bottomRef} />
          </div>

          <form onSubmit={submit} className="border-t border-slate-200/80 bg-white/90 p-3 backdrop-blur sm:p-4">
            <div className="chat-composer flex items-end gap-2 rounded-2xl border border-slate-200 bg-slate-50/90 p-2 transition focus-within:border-blue-300 focus-within:ring-2 focus-within:ring-blue-100">
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
                placeholder={`Message ${conversationTitle(active)}`}
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

  const inbox = (
    <aside
      className={`relative flex min-h-0 flex-col border-b border-slate-200/80 transition-[width] duration-300 ease-out lg:border-b-0 lg:border-r ${
        sidebarCollapsed ? 'lg:w-[4.75rem]' : 'lg:w-[22rem]'
      } ${isOverlay || maximized ? 'w-full lg:shrink-0' : ''}`}
    >
      <div className={`border-b border-slate-200/80 ${sidebarCollapsed ? 'p-2' : 'p-4'}`}>
        <div className={`mb-3 flex items-center ${sidebarCollapsed ? 'justify-center' : 'justify-between gap-2'}`}>
          {!sidebarCollapsed && (
            <p className="text-[10px] font-semibold uppercase tracking-widest text-slate-400">Inbox</p>
          )}
          <div className={`flex items-center gap-1 ${sidebarCollapsed ? 'flex-col' : ''}`}>
            <button
              type="button"
              onClick={() => setShowGroupModal(true)}
              className="inline-flex h-9 w-9 items-center justify-center rounded-xl text-slate-500 transition hover:bg-blue-50 hover:text-blue-700"
              title="New group chat"
              aria-label="New group chat"
            >
              <UsersRound className="h-4 w-4" />
            </button>
            <button
              type="button"
              onClick={() => setInboxScope((value) => (value === 'active' ? 'archived' : 'active'))}
              className={`inline-flex h-9 w-9 items-center justify-center rounded-xl transition ${
                inboxScope === 'archived'
                  ? 'bg-amber-50 text-amber-700'
                  : 'text-slate-500 hover:bg-slate-100 hover:text-slate-800'
              }`}
              title={inboxScope === 'archived' ? 'Show active chats' : 'Show archived chats'}
              aria-label={inboxScope === 'archived' ? 'Show active chats' : 'Show archived chats'}
            >
              <Archive className="h-4 w-4" />
            </button>
            <button
              type="button"
              onClick={() => {
                autoCollapsedRef.current = false;
                setSidebarCollapsed((value) => !value);
              }}
              className="hidden h-9 w-9 items-center justify-center rounded-xl text-slate-500 transition hover:bg-slate-100 hover:text-slate-800 lg:inline-flex"
              title={sidebarCollapsed ? 'Expand sidebar' : 'Collapse sidebar'}
              aria-label={sidebarCollapsed ? 'Expand sidebar' : 'Collapse sidebar'}
            >
              {sidebarCollapsed ? <ChevronRight className="h-4 w-4" /> : <ChevronLeft className="h-4 w-4" />}
            </button>
            {isOverlay && onClose && (
              <button
                type="button"
                onClick={onClose}
                className="inline-flex h-9 w-9 items-center justify-center rounded-xl text-slate-500 transition hover:bg-slate-100 lg:hidden"
                aria-label="Close"
              >
                <X className="h-4 w-4" />
              </button>
            )}
          </div>
        </div>
        {!sidebarCollapsed && (
          <>
            <div className="mb-3 grid grid-cols-2 gap-1 rounded-xl bg-slate-100 p-1">
              <button
                type="button"
                onClick={() => setInboxScope('active')}
                className={`rounded-lg px-2 py-1.5 text-xs font-semibold transition ${
                  inboxScope === 'active' ? 'bg-white text-slate-900 shadow-sm' : 'text-slate-500'
                }`}
              >
                Active
              </button>
              <button
                type="button"
                onClick={() => setInboxScope('archived')}
                className={`rounded-lg px-2 py-1.5 text-xs font-semibold transition ${
                  inboxScope === 'archived' ? 'bg-white text-slate-900 shadow-sm' : 'text-slate-500'
                }`}
              >
                Archived
              </button>
            </div>
            {inboxScope === 'active' && (
              <label className="relative block">
                <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
                <input
                  value={search}
                  onChange={(event) => setSearch(event.target.value)}
                  placeholder="Find someone to message"
                  className="chat-composer w-full rounded-xl border border-slate-200 bg-slate-50 py-2.5 pl-10 pr-3 text-sm text-slate-800 outline-none transition focus:border-blue-300 focus:ring-2 focus:ring-blue-100"
                />
              </label>
            )}
          </>
        )}
      </div>

      <div className="custom-scrollbar min-h-0 flex-1 overflow-y-auto">
        {!sidebarCollapsed && inboxScope === 'active' && !search.trim() && (
          <div className="border-b border-slate-100 px-3 py-3">
            <p className="mb-2 flex items-center gap-2 px-1 text-[10px] font-semibold uppercase tracking-widest text-slate-400">
              <Activity className="h-3.5 w-3.5" />
              Active now
              {activeNow.length > 0 && (
                <span className="rounded-full bg-emerald-100 px-1.5 py-0.5 text-[9px] font-bold text-emerald-700">
                  {activeNow.length}
                </span>
              )}
            </p>
            {activeNow.length === 0 ? (
              <p className="px-2 py-2 text-xs text-slate-500">Nobody is clocked in right now.</p>
            ) : (
              <div className="space-y-1">
                {activeNow.slice(0, 8).map((user) => (
                  <button
                    key={`active-${user.id}`}
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
                    <div className="min-w-0 flex-1">
                      <p className="truncate text-sm font-semibold text-slate-900">{user.name}</p>
                      <div className="mt-1 flex flex-wrap gap-1">
                        <AssignmentChip label={user.assignment} />
                        <ClockedInChip clockedIn={user.clocked_in} workType={user.work_type} />
                      </div>
                    </div>
                  </button>
                ))}
              </div>
            )}
          </div>
        )}

        {!sidebarCollapsed && inboxScope === 'active' && search.trim() && (
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
                    <div className="mt-1 flex flex-wrap gap-1">
                      <AssignmentChip label={user.assignment} />
                      <ClockedInChip clockedIn={user.clocked_in} workType={user.work_type} />
                    </div>
                  </div>
                </button>
              ))
            )}
          </div>
        )}

        <div className={`py-3 ${sidebarCollapsed ? 'px-1.5' : 'px-3'}`}>
          {!sidebarCollapsed && (
            <p className="mb-2 flex items-center gap-2 px-1 text-[10px] font-semibold uppercase tracking-widest text-slate-400">
              {inboxScope === 'archived' ? <Archive className="h-3.5 w-3.5" /> : <MessageCircle className="h-3.5 w-3.5" />}
              {inboxScope === 'archived' ? 'Archived' : 'Conversations'}
            </p>
          )}
          {loadingInbox ? (
            <p className="px-2 py-6 text-sm text-slate-500">Loading inbox…</p>
          ) : conversations.length === 0 ? (
            sidebarCollapsed ? (
              <p className="px-1 text-center text-[10px] text-slate-400">—</p>
            ) : (
              <div className="px-2 py-8 text-sm text-slate-500">
                <p className="font-medium text-slate-700">
                  {inboxScope === 'archived' ? 'No archived conversations.' : 'No conversations yet.'}
                </p>
                <p className="mt-1">
                  {inboxScope === 'archived'
                    ? 'Archived chats can be restored anytime from this tab.'
                    : 'Search for a coworker or student above to start chatting.'}
                </p>
                {inboxScope === 'active' && !search.trim() && directoryWithoutExisting.length > 0 && (
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
            )
          ) : (
            conversations.map((conversation) => {
              const selected = conversation.id === activeId;
              const preview = conversationPreview(conversation);
              const group = isGroupConversation(conversation);
              if (sidebarCollapsed) {
                return (
                  <motion.button
                    key={conversation.id}
                    type="button"
                    layout={!reduceMotion}
                    onClick={() => setActiveId(conversation.id)}
                    className={`relative mb-1.5 flex w-full items-center justify-center rounded-xl p-1.5 transition ${
                      selected ? 'bg-blue-50 ring-1 ring-blue-100' : 'hover:bg-slate-50'
                    }`}
                    title={conversationTitle(conversation)}
                    aria-label={conversationTitle(conversation)}
                  >
                    <AvatarWithPresence
                      name={conversationTitle(conversation)}
                      picture={conversation.peer?.profile_picture}
                      online={conversationOnline(conversation)}
                      group={group}
                      className="h-10 w-10 rounded-full bg-slate-100 text-sm text-slate-600"
                    />
                    {conversation.unread_count > 0 && (
                      <span className="absolute right-1 top-1 inline-flex h-4 min-w-4 items-center justify-center rounded-full bg-blue-600 px-1 text-[9px] font-bold text-white">
                        {conversation.unread_count > 9 ? '9+' : conversation.unread_count}
                      </span>
                    )}
                  </motion.button>
                );
              }
              return (
                <div
                  key={conversation.id}
                  className={`group/row mb-1 flex w-full items-start gap-2 rounded-xl px-2 py-2.5 transition ${
                    selected ? 'bg-blue-50 ring-1 ring-blue-100' : 'hover:bg-slate-50'
                  }`}
                >
                  <button
                    type="button"
                    onClick={() => setActiveId(conversation.id)}
                    className="flex min-w-0 flex-1 items-start gap-3 text-left"
                  >
                    <AvatarWithPresence
                      name={conversationTitle(conversation)}
                      picture={conversation.peer?.profile_picture}
                      online={conversationOnline(conversation)}
                      group={group}
                      className="h-10 w-10 rounded-full bg-slate-100 text-sm text-slate-600"
                    />
                    <div className="min-w-0 flex-1">
                      <div className="flex items-center justify-between gap-2">
                        <p className="truncate text-sm font-semibold text-slate-900">
                          {conversationTitle(conversation)}
                        </p>
                        <span className="shrink-0 text-[10px] text-slate-400">
                          {formatClock(conversation.last_message_at)}
                        </span>
                      </div>
                      {!group && (
                        <div className="mt-1 flex flex-wrap gap-1">
                          <AssignmentChip label={conversation.peer?.assignment} />
                          <ClockedInChip
                            clockedIn={conversation.peer?.clocked_in}
                            workType={conversation.peer?.work_type}
                          />
                        </div>
                      )}
                      {group && (
                        <p className="mt-1 text-[10px] font-semibold uppercase tracking-wide text-slate-400">
                          Group · {conversation.member_count || conversation.participants?.length || 0} members
                        </p>
                      )}
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
                  </button>
                  <div className="relative shrink-0">
                    <button
                      type="button"
                      onClick={() =>
                        setManagingId((current) => (current === conversation.id ? null : conversation.id))
                      }
                      className="inline-flex h-8 w-8 items-center justify-center rounded-lg text-slate-400 opacity-0 transition hover:bg-white hover:text-slate-700 group-hover/row:opacity-100"
                      aria-label="Manage conversation"
                    >
                      <MoreVertical className="h-4 w-4" />
                    </button>
                    <AnimatePresence>
                      {managingId === conversation.id && (
                        <motion.div
                          initial={reduceMotion ? false : { opacity: 0, y: 4, scale: 0.98 }}
                          animate={{ opacity: 1, y: 0, scale: 1 }}
                          exit={reduceMotion ? undefined : { opacity: 0, y: 4, scale: 0.98 }}
                          className="absolute right-0 z-30 mt-1 min-w-40 overflow-hidden rounded-xl border border-slate-200 bg-white shadow-lg"
                        >
                          {inboxScope === 'archived' ? (
                            <button
                              type="button"
                              onClick={() => void restoreConversation(conversation.id)}
                              className="flex w-full items-center gap-2 px-3 py-2 text-left text-xs font-semibold text-slate-700 hover:bg-slate-50"
                            >
                              <ArchiveRestore className="h-3.5 w-3.5" />
                              Restore
                            </button>
                          ) : (
                            <button
                              type="button"
                              onClick={() => void archiveConversation(conversation.id)}
                              className="flex w-full items-center gap-2 px-3 py-2 text-left text-xs font-semibold text-slate-700 hover:bg-slate-50"
                            >
                              <Archive className="h-3.5 w-3.5" />
                              Archive
                            </button>
                          )}
                          <button
                            type="button"
                            onClick={() => void deleteConversation(conversation.id)}
                            className="flex w-full items-center gap-2 px-3 py-2 text-left text-xs font-semibold text-rose-600 hover:bg-rose-50"
                          >
                            <Trash2 className="h-3.5 w-3.5" />
                            Delete
                          </button>
                        </motion.div>
                      )}
                    </AnimatePresence>
                  </div>
                </div>
              );
            })
          )}
        </div>
      </div>
    </aside>
  );

  const workspace = (
    <motion.div
      ref={shellRef}
      layout={!reduceMotion}
      className={`flex min-h-0 flex-1 overflow-hidden bg-white ${
        isOverlay || maximized
          ? 'h-full w-full rounded-none border-0 shadow-none'
          : 'rounded-2xl border border-slate-200/80 shadow-[0_1px_2px_rgba(15,23,42,0.04)]'
      } ${sidebarCollapsed ? 'lg:flex-row' : 'lg:flex-row'} flex-col`}
    >
      {inbox}
      {(!maximized || isOverlay) && conversationPane}
      {maximized && !isOverlay && null}
    </motion.div>
  );

  return (
    <div
      className={
        isOverlay
          ? 'flex h-full min-h-0 w-full flex-col'
          : 'mx-auto flex h-[calc(100vh-6.5rem)] max-w-6xl flex-col gap-4 p-4 sm:p-6 lg:p-8'
      }
    >
      {!isOverlay && (
        <motion.div
          initial={reduceMotion ? false : { opacity: 0, y: 8 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.35, ease }}
        >
          <p className="text-[11px] font-semibold uppercase tracking-[0.2em] text-blue-600">Inbox</p>
          <h1 className="mt-1 text-2xl font-semibold tracking-tight text-slate-900 sm:text-3xl">Messages</h1>
          <p className="mt-1 max-w-2xl text-sm text-slate-500">
            Message any signed-in TechHRM user, create group chats, and stay reachable from the chat heads on desktop.
          </p>
        </motion.div>
      )}

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

      {workspace}

      <AnimatePresence>
        {maximized && !isOverlay && active && (
          <motion.div
            key="chat-maximize"
            className="fixed inset-0 z-[80] flex bg-white"
            initial={reduceMotion ? false : { opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={reduceMotion ? undefined : { opacity: 0 }}
            transition={{ duration: 0.22 }}
          >
            <motion.div
              role="dialog"
              aria-modal="true"
              aria-label={`Conversation with ${conversationTitle(active)}`}
              initial={reduceMotion ? false : { opacity: 0, scale: 0.98 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={reduceMotion ? undefined : { opacity: 0, scale: 0.99 }}
              transition={{ duration: 0.28, ease }}
              className="flex h-full w-full overflow-hidden"
            >
              {inbox}
              {conversationPane}
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>

      <AnimatePresence>
        {showGroupModal && (
          <motion.div
            className="fixed inset-0 z-[90] flex items-center justify-center bg-slate-950/45 p-4 backdrop-blur-[2px]"
            initial={reduceMotion ? false : { opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={reduceMotion ? undefined : { opacity: 0 }}
            onClick={() => setShowGroupModal(false)}
          >
            <motion.form
              onSubmit={createGroup}
              onClick={(event) => event.stopPropagation()}
              initial={reduceMotion ? false : { opacity: 0, y: 12, scale: 0.98 }}
              animate={{ opacity: 1, y: 0, scale: 1 }}
              exit={reduceMotion ? undefined : { opacity: 0, y: 8, scale: 0.98 }}
              className="flex max-h-[85vh] w-full max-w-lg flex-col overflow-hidden rounded-3xl border border-slate-200 bg-white shadow-2xl"
            >
              <div className="flex items-center justify-between border-b border-slate-200 px-5 py-4">
                <div>
                  <p className="text-[10px] font-semibold uppercase tracking-widest text-slate-400">New</p>
                  <h2 className="text-lg font-semibold text-slate-900">Group chat</h2>
                </div>
                <button
                  type="button"
                  onClick={() => setShowGroupModal(false)}
                  className="inline-flex h-9 w-9 items-center justify-center rounded-xl text-slate-500 hover:bg-slate-100"
                  aria-label="Close group modal"
                >
                  <X className="h-4 w-4" />
                </button>
              </div>
              <div className="custom-scrollbar space-y-4 overflow-y-auto px-5 py-4">
                <label className="block">
                  <span className="mb-1.5 block text-xs font-semibold uppercase tracking-wide text-slate-500">
                    Group name
                  </span>
                  <input
                    value={groupName}
                    onChange={(event) => setGroupName(event.target.value)}
                    placeholder="e.g. CCS Supervisors"
                    className="chat-composer w-full rounded-xl border border-slate-200 bg-slate-50 px-3 py-2.5 text-sm outline-none focus:border-blue-300 focus:ring-2 focus:ring-blue-100"
                    required
                  />
                </label>
                <label className="block">
                  <span className="mb-1.5 block text-xs font-semibold uppercase tracking-wide text-slate-500">
                    Add members
                  </span>
                  <div className="relative">
                    <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
                    <input
                      value={groupSearch}
                      onChange={(event) => setGroupSearch(event.target.value)}
                      placeholder="Search people"
                      className="chat-composer w-full rounded-xl border border-slate-200 bg-slate-50 py-2.5 pl-10 pr-3 text-sm outline-none focus:border-blue-300 focus:ring-2 focus:ring-blue-100"
                    />
                  </div>
                </label>
                {groupSelected.length > 0 && (
                  <div className="flex flex-wrap gap-2">
                    {groupSelected.map((user) => (
                      <button
                        key={`selected-${user.id}`}
                        type="button"
                        onClick={() => toggleGroupMember(user)}
                        className="inline-flex items-center gap-1.5 rounded-full bg-blue-50 px-2.5 py-1 text-xs font-semibold text-blue-700"
                      >
                        {user.name}
                        <X className="h-3 w-3" />
                      </button>
                    ))}
                  </div>
                )}
                <div className="max-h-56 space-y-1 overflow-y-auto rounded-2xl border border-slate-100 p-2">
                  {groupCandidates.length === 0 ? (
                    <p className="px-2 py-6 text-center text-sm text-slate-500">Search for people to add.</p>
                  ) : (
                    groupCandidates.map((user) => {
                      const selected = groupSelected.some((item) => item.id === user.id);
                      return (
                        <button
                          key={user.id}
                          type="button"
                          onClick={() => toggleGroupMember(user)}
                          className={`flex w-full items-center gap-3 rounded-xl px-2 py-2 text-left transition ${
                            selected ? 'bg-blue-50 ring-1 ring-blue-100' : 'hover:bg-slate-50'
                          }`}
                        >
                          <AvatarWithPresence
                            name={user.name}
                            picture={user.profile_picture}
                            online={user.online}
                            className="h-9 w-9 rounded-full bg-slate-100 text-sm text-slate-600"
                          />
                          <div className="min-w-0 flex-1">
                            <p className="truncate text-sm font-semibold text-slate-900">{user.name}</p>
                            <p className="truncate text-xs text-slate-500">{user.role}</p>
                          </div>
                          {selected ? <Check className="h-4 w-4 text-blue-600" /> : <Plus className="h-4 w-4 text-slate-400" />}
                        </button>
                      );
                    })
                  )}
                </div>
              </div>
              <div className="flex items-center justify-end gap-2 border-t border-slate-200 px-5 py-4">
                <button
                  type="button"
                  onClick={() => setShowGroupModal(false)}
                  className="rounded-xl px-3 py-2 text-sm font-semibold text-slate-500 hover:bg-slate-100"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={creatingGroup || !groupName.trim() || groupSelected.length === 0}
                  className="rounded-xl bg-blue-600 px-4 py-2 text-sm font-semibold text-white hover:bg-blue-700 disabled:bg-slate-300"
                >
                  {creatingGroup ? 'Creating…' : 'Create group'}
                </button>
              </div>
            </motion.form>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
