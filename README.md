# KaloMessenger MVP (Electron + React + Node + SQLite)

Telegram-inspired private desktop messenger prototype for Windows.

## Stack
- Desktop shell: Electron
- Frontend: React + TypeScript + Vite + Tailwind
- Backend: Express + Socket.IO
- Database: SQLite (`better-sqlite3`)

## Features
- Host mode (starts backend automatically on `0.0.0.0`)
- Client mode (connects to host with `IP:PORT`)
- Username/password auth (`alice` / `bob` demo users)
- Realtime messaging
- Message states (`sent`, `delivered`, `read`)
- Typing indicators
- Presence updates (online/offline + last seen)
- Reply to message
- Pin/unpin message
- Dark/light mode
- Desktop + mobile-style responsive layout

## Project Structure
- `desktop/` Electron main + preload
- `frontend/` React app
- `backend/` Express + Socket.IO + SQLite

## Install
```bash
npm install
```

## Development (full app)
```bash
npm run dev
```

What this does:
- Starts Vite frontend dev server on `5173`
- Starts Electron app
- In **Host mode**, backend auto-starts on port `3030` by default

## Build Windows .exe
```bash
npm run build
```

This builds frontend and packages Electron using `electron-builder` into a Windows installer/exe (`dist/`).

## LAN Usage
1. On host PC, run app and choose **Host mode**.
2. Copy one of detected IPv4 addresses from host screen (example: `192.168.1.15:3030`).
3. On client PC, run app and connect using that address in **Client mode**.
4. Login with:
   - `alice` / `password123`
   - `bob` / `password123`

## Tailscale / Internet Usage
1. Install Tailscale on both PCs.
2. Sign in on both PCs.
3. On host, choose **Host mode** (server listens `0.0.0.0`).
4. Host shares Tailscale address, e.g. `100.101.102.103:3030`.
5. Client connects in **Client mode** using that address.

## API
### Auth
- `POST /auth/login`
- `POST /auth/logout`
- `GET /me`

### Chats / Messages
- `GET /chats`
- `GET /chats/:chatId/messages`
- `POST /chats/:chatId/messages`
- `POST /chats/:chatId/pin`
- `POST /chats/:chatId/unpin`

### Socket events
- `message:new`
- `message:status`
- `typing:start`
- `typing:stop`
- `presence:update`
- `message:pin`
- `message:unpin`

## Notes
- Prototype-level auth/session handling only (not production-hardened).
- SQLite database auto-initializes with schema and seed data.
