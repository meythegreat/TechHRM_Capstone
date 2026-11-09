import axios from 'axios';

export interface ChatUser {
  id: number;
  name: string;
  username: string;
  role: string;
  profile_picture?: string | null;
  online?: boolean;
  last_seen_at?: string | null;
  assignment?: string | null;
  assigned_office?: string | null;
  clocked_in?: boolean;
  clocked_in_since?: string | null;
  work_type?: string | null;
}

export interface ChatMessage {
  id: number;
  conversation_id: number;
  sender_id: number;
  body: string;
  is_mine?: boolean;
  is_unsent?: boolean;
  edited_at?: string | null;
  unsent_at?: string | null;
  can_edit?: boolean;
  can_unsend?: boolean;
  read_at: string | null;
  created_at: string | null;
  sender?: {
    id: number;
    name: string;
    profile_picture?: string | null;
  } | null;
}

export interface ChatConversation {
  id: number;
  peer: ChatUser | null;
  last_message: ChatMessage | null;
  last_message_preview?: string | null;
  last_message_at: string | null;
  unread_count: number;
  peer_typing?: boolean;
}

export interface ChatConversationState {
  conversation_id: number;
  peer_id: number;
  peer_online: boolean;
  peer_typing: boolean;
  peer_last_seen_at: string | null;
  peer_assignment?: string | null;
  peer_clocked_in?: boolean;
  peer_clocked_in_since?: string | null;
  peer_work_type?: string | null;
}

export interface ChatActiveNowResponse {
  people: ChatUser[];
  count: number;
}

export const chatService = {
  searchUsers: async (q = ''): Promise<ChatUser[]> => {
    const response = await axios.get('/api/chat/users', { params: q ? { q } : undefined });
    return Array.isArray(response.data) ? response.data : [];
  },

  listConversations: async (): Promise<ChatConversation[]> => {
    const response = await axios.get('/api/chat/conversations');
    return Array.isArray(response.data) ? response.data : [];
  },

  listActiveNow: async (): Promise<ChatActiveNowResponse> => {
    const response = await axios.get('/api/chat/active-now');
    return {
      people: Array.isArray(response.data?.people) ? response.data.people : [],
      count: Number(response.data?.count || 0),
    };
  },

  openConversation: async (userId: number): Promise<ChatConversation> => {
    const response = await axios.post('/api/chat/conversations', { user_id: userId });
    return response.data;
  },

  listMessages: async (conversationId: number): Promise<ChatMessage[]> => {
    const response = await axios.get(`/api/chat/conversations/${conversationId}/messages`);
    return Array.isArray(response.data) ? response.data : [];
  },

  sendMessage: async (conversationId: number, body: string): Promise<ChatMessage> => {
    const response = await axios.post(`/api/chat/conversations/${conversationId}/messages`, { body });
    return response.data.data;
  },

  editMessage: async (conversationId: number, messageId: number, body: string): Promise<ChatMessage> => {
    const response = await axios.patch(`/api/chat/conversations/${conversationId}/messages/${messageId}`, { body });
    return response.data.data;
  },

  unsendMessage: async (conversationId: number, messageId: number): Promise<ChatMessage> => {
    const response = await axios.delete(`/api/chat/conversations/${conversationId}/messages/${messageId}`);
    return response.data.data;
  },

  heartbeat: async (): Promise<void> => {
    await axios.post('/api/chat/presence');
  },

  setTyping: async (conversationId: number, typing: boolean): Promise<void> => {
    await axios.post(`/api/chat/conversations/${conversationId}/typing`, { typing });
  },

  getState: async (conversationId: number): Promise<ChatConversationState> => {
    const response = await axios.get(`/api/chat/conversations/${conversationId}/state`);
    return response.data;
  },
};
