import axios from 'axios';

export interface ChatUser {
  id: number;
  name: string;
  username: string;
  role: string;
  profile_picture?: string | null;
}

export interface ChatMessage {
  id: number;
  conversation_id: number;
  sender_id: number;
  body: string;
  is_mine?: boolean;
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
  last_message_at: string | null;
  unread_count: number;
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
};
