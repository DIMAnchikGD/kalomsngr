import type { Chat, Message, User } from './types';

export class ApiClient {
  constructor(private readonly baseUrl: string, private readonly token: string) {}

  private async request<T>(path: string, init: RequestInit = {}): Promise<T> {
    const response = await fetch(`${this.baseUrl}${path}`, {
      ...init,
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${this.token}`,
        ...(init.headers || {})
      }
    });

    if (!response.ok) {
      throw new Error(await response.text());
    }
    return response.json() as Promise<T>;
  }

  me() {
    return this.request<User>('/me');
  }

  getChats() {
    return this.request<Chat[]>('/chats');
  }

  getMessages(chatId: number) {
    return this.request<Message[]>(`/chats/${chatId}/messages`);
  }

  sendMessage(chatId: number, body: string, replyToMessageId?: number) {
    return this.request<Message>(`/chats/${chatId}/messages`, {
      method: 'POST',
      body: JSON.stringify({ body, replyToMessageId })
    });
  }

  pinMessage(chatId: number, messageId: number) {
    return this.request<{ ok: boolean }>(`/chats/${chatId}/pin`, {
      method: 'POST',
      body: JSON.stringify({ messageId })
    });
  }

  unpinMessage(chatId: number) {
    return this.request<{ ok: boolean }>(`/chats/${chatId}/unpin`, { method: 'POST' });
  }
}

export async function login(baseUrl: string, username: string, password: string) {
  const response = await fetch(`${baseUrl}/auth/login`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ username, password })
  });

  if (!response.ok) throw new Error('Login failed');
  return response.json() as Promise<{ token: string; user: User }>;
}
