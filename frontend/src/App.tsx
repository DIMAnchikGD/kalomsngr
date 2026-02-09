import { useEffect, useMemo, useRef, useState } from 'react';
import { io, Socket } from 'socket.io-client';
import { Moon, Sun } from 'lucide-react';
import { ApiClient, login } from './lib/api';
import type { AppMode, Chat, Message, PresenceState, User } from './lib/types';

const typingStopDelay = 900;

export function App() {
  const [theme, setTheme] = useState<'dark' | 'light'>('dark');
  const [mode, setMode] = useState<AppMode | null>(null);
  const [port, setPort] = useState(3030);
  const [hostInput, setHostInput] = useState('127.0.0.1:3030');
  const [addresses, setAddresses] = useState<Array<{ interface: string; address: string }>>([]);
  const [baseUrl, setBaseUrl] = useState<string | null>(null);

  const [token, setToken] = useState<string | null>(null);
  const [user, setUser] = useState<User | null>(null);
  const [username, setUsername] = useState('alice');
  const [password, setPassword] = useState('password123');

  const [chats, setChats] = useState<Chat[]>([]);
  const [selectedChatId, setSelectedChatId] = useState<number | null>(null);
  const [messagesByChat, setMessagesByChat] = useState<Record<number, Message[]>>({});
  const [messageInput, setMessageInput] = useState('');
  const [replyTo, setReplyTo] = useState<Message | null>(null);
  const [typingUsers, setTypingUsers] = useState<Record<number, string>>({});
  const [presence, setPresence] = useState<Record<number, PresenceState>>({});
  const [connection, setConnection] = useState<'connected' | 'reconnecting' | 'offline'>('offline');
  const [showProfile, setShowProfile] = useState(false);
  const [mobileChatOpen, setMobileChatOpen] = useState(false);

  const socketRef = useRef<Socket | null>(null);
  const typingTimeout = useRef<number | null>(null);
  const messagesContainerRef = useRef<HTMLDivElement | null>(null);

  const api = useMemo(() => {
    if (!baseUrl || !token) return null;
    return new ApiClient(baseUrl, token);
  }, [baseUrl, token]);

  const selectedChat = chats.find((c) => c.id === selectedChatId) || null;
  const selectedMessages = selectedChatId ? messagesByChat[selectedChatId] || [] : [];
  const pinnedMessage = selectedChat?.pinned_message_id
    ? selectedMessages.find((m) => m.id === selectedChat.pinned_message_id)
    : null;

  useEffect(() => {
    document.documentElement.classList.toggle('dark', theme === 'dark');
  }, [theme]);

  useEffect(() => {
    if (mode !== 'host') return;
    window.electronAPI?.getIPv4Addresses().then(setAddresses).catch(() => setAddresses([]));
  }, [mode]);

  useEffect(() => {
    messagesContainerRef.current?.scrollTo({ top: messagesContainerRef.current.scrollHeight, behavior: 'smooth' });
  }, [selectedMessages.length, selectedChatId]);

  async function connectHost() {
    await window.electronAPI?.startHost(port);
    setBaseUrl(`http://127.0.0.1:${port}`);
    setHostInput(`127.0.0.1:${port}`);
    setMode('host');
  }

  function connectClient() {
    const normalized = hostInput.startsWith('http') ? hostInput : `http://${hostInput}`;
    setBaseUrl(normalized);
    setMode('client');
  }

  async function handleLogin() {
    if (!baseUrl) return;
    try {
      const data = await login(baseUrl, username, password);
      setToken(data.token);
      setUser(data.user);
    } catch {
      alert('Login failed. Try alice/password123 or bob/password123');
    }
  }

  useEffect(() => {
    if (!baseUrl || !token || !user) return;

    const socket = io(baseUrl, { auth: { token } });
    socketRef.current = socket;

    setConnection('reconnecting');
    socket.on('connect', () => setConnection('connected'));
    socket.on('disconnect', () => setConnection('offline'));
    socket.io.on('reconnect_attempt', () => setConnection('reconnecting'));

    socket.on('message:new', (message: Message) => {
      setMessagesByChat((prev) => ({ ...prev, [message.chat_id]: [...(prev[message.chat_id] || []), message] }));
      if (message.sender_id !== user.id) {
        socket.emit('message:status', { messageId: message.id, status: 'delivered', chatId: message.chat_id });
      }
    });

    socket.on('message:status', ({ messageId, status, chatId }) => {
      setMessagesByChat((prev) => ({
        ...prev,
        [chatId]: (prev[chatId] || []).map((m) => (m.id === messageId ? { ...m, status } : m))
      }));
    });

    socket.on('typing:start', ({ chatId, username: typingName }) => {
      setTypingUsers((prev) => ({ ...prev, [chatId]: typingName }));
    });

    socket.on('typing:stop', ({ chatId }) => {
      setTypingUsers((prev) => {
        const copy = { ...prev };
        delete copy[chatId];
        return copy;
      });
    });

    socket.on('presence:update', ({ userId, online, lastSeen }) => {
      setPresence((prev) => ({ ...prev, [userId]: { online, lastSeen } }));
    });

    socket.on('message:pin', ({ chatId, messageId }) => {
      setChats((prev) => prev.map((chat) => (chat.id === chatId ? { ...chat, pinned_message_id: messageId } : chat)));
    });

    socket.on('message:unpin', ({ chatId }) => {
      setChats((prev) => prev.map((chat) => (chat.id === chatId ? { ...chat, pinned_message_id: null } : chat)));
    });

    return () => {
      socket.disconnect();
      socketRef.current = null;
    };
  }, [baseUrl, token, user]);

  useEffect(() => {
    if (!api || !user) return;

    api.getChats().then(async (chatList) => {
      setChats(chatList);
      if (!selectedChatId && chatList[0]) setSelectedChatId(chatList[0].id);
      const entries = await Promise.all(chatList.map(async (chat) => [chat.id, await api.getMessages(chat.id)] as const));
      setMessagesByChat(Object.fromEntries(entries));
      const basePresence: Record<number, PresenceState> = {};
      chatList.flatMap((chat) => chat.participants).forEach((participant) => {
        basePresence[participant.id] = { online: false, lastSeen: null };
      });
      setPresence(basePresence);
    });
  }, [api, user]);

  async function sendMessage() {
    if (!api || !selectedChatId || !messageInput.trim()) return;
    const sent = await api.sendMessage(selectedChatId, messageInput.trim(), replyTo?.id);
    setMessageInput('');
    setReplyTo(null);
    socketRef.current?.emit('typing:stop', { chatId: selectedChatId });
    socketRef.current?.emit('message:status', { messageId: sent.id, status: 'sent', chatId: selectedChatId });
  }

  function onTyping(value: string) {
    setMessageInput(value);
    if (!selectedChatId) return;
    socketRef.current?.emit('typing:start', { chatId: selectedChatId });

    if (typingTimeout.current) window.clearTimeout(typingTimeout.current);
    typingTimeout.current = window.setTimeout(() => {
      socketRef.current?.emit('typing:stop', { chatId: selectedChatId });
    }, typingStopDelay);
  }

  async function togglePin(messageId?: number) {
    if (!api || !selectedChatId) return;
    if (messageId) {
      await api.pinMessage(selectedChatId, messageId);
    } else {
      await api.unpinMessage(selectedChatId);
    }
  }

  function markReadIfNeeded(message: Message) {
    if (message.sender_id !== user?.id && message.status !== 'read') {
      socketRef.current?.emit('message:status', { messageId: message.id, status: 'read', chatId: message.chat_id });
    }
  }

  if (!mode) {
    return (
      <div className="h-screen bg-slate-950 text-slate-100 p-8 flex items-center justify-center">
        <div className="w-full max-w-xl rounded-2xl border border-slate-800 bg-slate-900 p-6 space-y-4">
          <h1 className="text-2xl font-bold">KaloMessenger</h1>
          <p className="text-slate-400">Choose startup mode.</p>
          <div className="flex gap-3">
            <button onClick={connectHost} className="px-4 py-2 bg-sky-500 rounded-lg font-medium">Host mode</button>
            <span className="px-4 py-2 bg-slate-700 rounded-lg">Client mode below</span>
          </div>

          <div className="mt-3 space-y-2">
            <label className="text-sm text-slate-400">Host port</label>
            <input value={port} onChange={(e) => setPort(Number(e.target.value))} className="w-full bg-slate-800 rounded p-2" />
          </div>

          <div className="space-y-2">
            <label className="text-sm text-slate-400">Connect to host (IP:PORT)</label>
            <div className="flex gap-2">
              <input value={hostInput} onChange={(e) => setHostInput(e.target.value)} className="w-full bg-slate-800 rounded p-2" />
              <button onClick={connectClient} className="px-4 bg-slate-700 rounded-lg">Connect</button>
            </div>
          </div>

          {addresses.length > 0 && (
            <div className="space-y-2">
              <h3 className="font-semibold">Detected IPv4 addresses</h3>
              {addresses.map((a) => (
                <div key={a.interface + a.address} className="flex justify-between bg-slate-800 p-2 rounded">
                  <span>{a.interface}: {a.address}:{port}</span>
                  <button className="text-sky-400" onClick={() => window.electronAPI?.copyText(`${a.address}:${port}`)}>Copy address</button>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    );
  }

  if (!token || !user) {
    return (
      <div className="h-screen bg-slate-950 text-slate-100 flex items-center justify-center p-6">
        <div className="w-full max-w-md rounded-2xl border border-slate-800 bg-slate-900 p-6 space-y-3">
          <h2 className="text-xl font-semibold">Login</h2>
          <input className="w-full bg-slate-800 rounded p-2" value={username} onChange={(e) => setUsername(e.target.value)} placeholder="username" />
          <input className="w-full bg-slate-800 rounded p-2" value={password} onChange={(e) => setPassword(e.target.value)} placeholder="password" />
          <button onClick={handleLogin} className="w-full py-2 bg-sky-500 rounded-lg font-medium">Sign in</button>
          <p className="text-xs text-slate-400">Demo accounts: alice/password123, bob/password123</p>
        </div>
      </div>
    );
  }

  return (
    <div className="h-screen bg-slate-100 text-slate-900 dark:bg-slate-950 dark:text-slate-100">
      <header className="h-12 border-b border-slate-800/60 px-4 flex items-center justify-between">
        <div className="font-semibold">KaloMessenger · {mode.toUpperCase()}</div>
        <div className="flex items-center gap-3 text-sm">
          <span className={connection === 'connected' ? 'text-emerald-400' : connection === 'reconnecting' ? 'text-amber-400' : 'text-red-400'}>{connection}</span>
          <button onClick={() => setShowProfile(true)} className="px-2 py-1 bg-slate-800 rounded">Profile</button>
          <button onClick={() => setTheme((t) => (t === 'dark' ? 'light' : 'dark'))}>{theme === 'dark' ? <Sun size={16} /> : <Moon size={16} />}</button>
        </div>
      </header>

      <div className="h-[calc(100%-3rem)] md:grid md:grid-cols-[320px_1fr]">
        <aside className={`${mobileChatOpen ? 'hidden md:block' : 'block'} border-r border-slate-800/60 overflow-auto`}>
          {chats.map((chat) => (
            <button key={chat.id} onClick={() => { setSelectedChatId(chat.id); setMobileChatOpen(true); }} className={`w-full text-left p-3 border-b border-slate-800/40 ${chat.id === selectedChatId ? 'bg-slate-800/60' : ''}`}>
              <div className="font-medium">{chat.title}</div>
              <div className="text-sm text-slate-400 truncate">{chat.last_message || 'No messages yet'}</div>
            </button>
          ))}
        </aside>

        <main className={`${mobileChatOpen ? 'block' : 'hidden md:block'} h-full`}>
          {!selectedChat ? (
            <div className="h-full flex items-center justify-center text-slate-400">Select a chat</div>
          ) : (
            <div className="h-full flex flex-col">
              <div className="p-3 border-b border-slate-800/60 flex items-center gap-3">
                <button className="md:hidden text-sky-400" onClick={() => setMobileChatOpen(false)}>Back</button>
                <div>
                  <div className="font-semibold">{selectedChat.title}</div>
                  <div className="text-xs text-slate-400">{typingUsers[selectedChat.id] ? `${typingUsers[selectedChat.id]} typing...` : 'online status shown in profile'}</div>
                </div>
              </div>

              {pinnedMessage && (
                <button
                  className="text-left p-2 bg-sky-600/20 border-b border-sky-600/30"
                  onClick={() => document.getElementById(`msg-${pinnedMessage.id}`)?.scrollIntoView({ behavior: 'smooth', block: 'center' })}
                >
                  📌 {pinnedMessage.body.slice(0, 80)}
                </button>
              )}

              <div ref={messagesContainerRef} className="flex-1 overflow-auto p-4 space-y-2 scrollbar-thin">
                {selectedMessages.map((message) => {
                  const mine = message.sender_id === user.id;
                  const reply = message.reply_to_message_id
                    ? selectedMessages.find((item) => item.id === message.reply_to_message_id)
                    : null;
                  const checks = message.status === 'sent' ? '✓' : message.status === 'delivered' ? '✓✓' : '✓✓';
                  return (
                    <div
                      id={`msg-${message.id}`}
                      key={message.id}
                      onMouseEnter={() => markReadIfNeeded(message)}
                      className={`max-w-[75%] rounded-xl p-3 animate-message-in ${mine ? 'ml-auto bg-sky-600/80' : 'bg-slate-800'}`}
                    >
                      {reply && <div className="text-xs text-sky-200 border-l-2 border-sky-300 pl-2 mb-1">Reply: {reply.body.slice(0, 50)}</div>}
                      <div>{message.body}</div>
                      <div className="mt-1 text-[11px] text-slate-300 flex justify-between gap-3">
                        <span>{new Date(message.created_at).toLocaleTimeString()}</span>
                        {mine && <span>{checks}</span>}
                      </div>
                      <div className="mt-1 flex gap-3 text-xs">
                        <button onClick={() => setReplyTo(message)} className="text-slate-200">Reply</button>
                        <button onClick={() => togglePin(message.id)} className="text-slate-200">Pin</button>
                      </div>
                    </div>
                  );
                })}
              </div>

              <div className="p-3 border-t border-slate-800/60">
                {replyTo && (
                  <div className="mb-2 text-xs bg-slate-800 rounded p-2 flex justify-between">
                    Replying to: {replyTo.body.slice(0, 80)}
                    <button onClick={() => setReplyTo(null)}>x</button>
                  </div>
                )}
                <div className="flex gap-2">
                  <input
                    className="flex-1 rounded-lg bg-slate-800 p-2"
                    placeholder="Type a message..."
                    value={messageInput}
                    onChange={(e) => onTyping(e.target.value)}
                    onKeyDown={(e) => e.key === 'Enter' && sendMessage()}
                  />
                  {selectedChat.pinned_message_id && <button onClick={() => togglePin()} className="px-3 bg-slate-700 rounded-lg">Unpin</button>}
                  <button onClick={sendMessage} className="px-4 bg-sky-500 rounded-lg">Send</button>
                </div>
              </div>
            </div>
          )}
        </main>
      </div>

      {showProfile && (
        <div className="fixed inset-0 bg-black/40 flex items-center justify-center">
          <div className="w-80 bg-slate-900 rounded-xl p-5 space-y-3 border border-slate-800">
            <div className="w-16 h-16 rounded-full bg-slate-700 flex items-center justify-center text-2xl">{user.username[0].toUpperCase()}</div>
            <div className="text-lg font-semibold">{user.username}</div>
            <div className="text-sm text-slate-400">Status: Online</div>
            <button onClick={() => setShowProfile(false)} className="w-full py-2 bg-slate-700 rounded">Close</button>
          </div>
        </div>
      )}
    </div>
  );
}
