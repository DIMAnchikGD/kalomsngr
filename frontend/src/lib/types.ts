export type AppMode = 'host' | 'client';

export interface User {
  id: number;
  username: string;
}

export interface PresenceState {
  online: boolean;
  lastSeen: string | null;
}

export interface Chat {
  id: number;
  title: string;
  is_group: number;
  pinned_message_id: number | null;
  last_message: string | null;
  participants: User[];
}

export interface Message {
  id: number;
  chat_id: number;
  sender_id: number;
  sender_username: string;
  body: string;
  created_at: string;
  reply_to_message_id: number | null;
  status: 'sent' | 'delivered' | 'read';
}
