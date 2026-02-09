const express = require('express');
const cors = require('cors');
const http = require('http');
const { Server } = require('socket.io');
const crypto = require('crypto');
const { db, initSchema } = require('./db');

initSchema();

const app = express();
const server = http.createServer(app);
const io = new Server(server, { cors: { origin: '*' } });

const PORT = Number(process.env.PORT || 3030);
const HOST = process.env.HOST || '0.0.0.0';

const sessions = new Map();
const online = new Map();

app.use(cors());
app.use(express.json());

function getUserFromAuth(req) {
  const auth = req.headers.authorization || '';
  const token = auth.startsWith('Bearer ') ? auth.slice(7) : null;
  if (!token) return null;
  return sessions.get(token) || null;
}

function authMiddleware(req, res, next) {
  const user = getUserFromAuth(req);
  if (!user) return res.status(401).json({ error: 'Unauthorized' });
  req.user = user;
  next();
}

function listChatsForUser(userId) {
  return db.prepare(`
    SELECT c.id, c.title, c.is_group, c.created_at,
      pm.message_id AS pinned_message_id,
      pm.pinned_at,
      (
        SELECT m.body FROM messages m WHERE m.chat_id = c.id ORDER BY m.id DESC LIMIT 1
      ) AS last_message,
      (
        SELECT m.created_at FROM messages m WHERE m.chat_id = c.id ORDER BY m.id DESC LIMIT 1
      ) AS last_message_at
    FROM chats c
    JOIN chat_participants cp ON cp.chat_id = c.id
    LEFT JOIN pinned_messages pm ON pm.chat_id = c.id
    WHERE cp.user_id = ?
    ORDER BY COALESCE(last_message_at, c.created_at) DESC
  `).all(userId);
}

function listParticipants(chatId) {
  return db.prepare(`
    SELECT u.id, u.username
    FROM chat_participants cp
    JOIN users u ON u.id = cp.user_id
    WHERE cp.chat_id = ?
  `).all(chatId);
}

app.post('/auth/login', (req, res) => {
  const { username, password } = req.body;
  const user = db.prepare('SELECT id, username FROM users WHERE username = ? AND password = ?').get(username, password);

  if (!user) {
    return res.status(401).json({ error: 'Invalid credentials' });
  }

  const token = crypto.randomBytes(24).toString('hex');
  sessions.set(token, user);
  res.json({ token, user });
});

app.post('/auth/logout', authMiddleware, (req, res) => {
  const auth = req.headers.authorization;
  const token = auth.slice(7);
  sessions.delete(token);
  res.json({ ok: true });
});

app.get('/me', authMiddleware, (req, res) => {
  const presence = online.get(req.user.id);
  res.json({ ...req.user, online: Boolean(presence), lastSeen: presence?.lastSeen || null });
});

app.get('/chats', authMiddleware, (req, res) => {
  const chats = listChatsForUser(req.user.id).map((chat) => ({
    ...chat,
    participants: listParticipants(chat.id)
  }));
  res.json(chats);
});

app.get('/chats/:chatId/messages', authMiddleware, (req, res) => {
  const chatId = Number(req.params.chatId);
  const messages = db.prepare(`
    SELECT m.*, u.username AS sender_username
    FROM messages m
    JOIN users u ON u.id = m.sender_id
    WHERE m.chat_id = ?
    ORDER BY m.id ASC
  `).all(chatId);

  res.json(messages);
});

app.post('/chats/:chatId/messages', authMiddleware, (req, res) => {
  const chatId = Number(req.params.chatId);
  const { body, replyToMessageId } = req.body;

  const insert = db.prepare(`
    INSERT INTO messages (chat_id, sender_id, body, reply_to_message_id, status)
    VALUES (?, ?, ?, ?, 'sent')
  `).run(chatId, req.user.id, body, replyToMessageId || null);

  const message = db.prepare(`
    SELECT m.*, u.username AS sender_username
    FROM messages m
    JOIN users u ON u.id = m.sender_id
    WHERE m.id = ?
  `).get(insert.lastInsertRowid);

  io.to(`chat:${chatId}`).emit('message:new', message);
  res.json(message);
});

app.post('/chats/:chatId/pin', authMiddleware, (req, res) => {
  const chatId = Number(req.params.chatId);
  const { messageId } = req.body;
  db.prepare(`
    INSERT INTO pinned_messages (chat_id, message_id, pinned_at)
    VALUES (?, ?, CURRENT_TIMESTAMP)
    ON CONFLICT(chat_id) DO UPDATE SET
      message_id = excluded.message_id,
      pinned_at = CURRENT_TIMESTAMP
  `).run(chatId, messageId);

  io.to(`chat:${chatId}`).emit('message:pin', { chatId, messageId });
  res.json({ ok: true });
});

app.post('/chats/:chatId/unpin', authMiddleware, (req, res) => {
  const chatId = Number(req.params.chatId);
  db.prepare('DELETE FROM pinned_messages WHERE chat_id = ?').run(chatId);
  io.to(`chat:${chatId}`).emit('message:unpin', { chatId });
  res.json({ ok: true });
});

io.use((socket, next) => {
  const token = socket.handshake.auth?.token;
  const user = token ? sessions.get(token) : null;
  if (!user) return next(new Error('Unauthorized'));
  socket.user = user;
  next();
});

io.on('connection', (socket) => {
  const userId = socket.user.id;
  online.set(userId, { socketId: socket.id, lastSeen: null });
  io.emit('presence:update', { userId, online: true, lastSeen: null });

  const chats = db.prepare('SELECT chat_id FROM chat_participants WHERE user_id = ?').all(userId);
  chats.forEach(({ chat_id }) => socket.join(`chat:${chat_id}`));

  socket.on('typing:start', ({ chatId }) => {
    socket.to(`chat:${chatId}`).emit('typing:start', { chatId, userId, username: socket.user.username });
  });

  socket.on('typing:stop', ({ chatId }) => {
    socket.to(`chat:${chatId}`).emit('typing:stop', { chatId, userId });
  });

  socket.on('message:status', ({ messageId, status, chatId }) => {
    db.prepare('UPDATE messages SET status = ? WHERE id = ?').run(status, messageId);
    io.to(`chat:${chatId}`).emit('message:status', { messageId, status, chatId });
  });

  socket.on('disconnect', () => {
    online.delete(userId);
    const lastSeen = new Date().toISOString();
    io.emit('presence:update', { userId, online: false, lastSeen });
  });
});

server.listen(PORT, HOST, () => {
  console.log(`Backend listening on http://${HOST}:${PORT}`);
});
