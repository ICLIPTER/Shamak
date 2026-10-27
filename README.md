# Shamak

A private, invite-only chat app built for one family. It is a full
WhatsApp-style messenger: group chats, read receipts, typing indicators, voice
notes, polls, replies, reactions, pins, search, a family board, shared dates,
a photo album, and installable PWA push notifications.

## Stack

| Layer    | Tech                                                                 |
| -------- | -------------------------------------------------------------------- |
| Frontend | React 19, Vite, HeroUI v3, Tailwind, Zustand, Socket.IO client        |
| Backend  | Node.js (ESM), Express 5, Socket.IO, Mongoose                         |
| Auth     | Self-hosted email + password: bcrypt hashes, 15-min JWT access tokens via `Authorization: Bearer`, 30-day refresh cookie |
| Media    | ImageKit (images, video, voice notes)                                 |
| Push     | Web Push / VAPID with a service worker                                |

## Repository layout

```
backend/    Express API, Socket.IO server, MongoDB models, cron reminders
frontend/   Vite SPA (routes are code-split; chat modals load on demand)
Dockerfile  Multi-stage build: SPA -> backend/public, API -> dist/
```

## Local development

Requirements: Node.js 20+, a MongoDB database, and (optional) an ImageKit
account for media uploads.

```bash
# 1. API
cd backend
cp .env.example .env          # fill in the values below
npm install
npm run dev                   # http://localhost:3000

# 2. SPA (second terminal)
cd frontend
cp .env.example .env
npm install
npm run dev                   # http://localhost:5173
```

### Environment variables

`backend/.env`

| Variable                       | Purpose                                                       |
| ------------------------------ | ------------------------------------------------------------- |
| `PORT`                         | API port (defaults to 3001)                                   |
| `NODE_ENV`                     | `production` enables cron reminders                           |
| `MONGO_URI`                    | MongoDB connection string                                     |
| `FRONTEND_URL`                 | Allowed browser origin(s); comma-separated for multiple       |
| `SELF_URL`                     | Public API URL, used by the keep-alive ping                   |
| `JWT_ACCESS_SECRET`            | Signs 15-minute access tokens (required in production)        |
| `JWT_REFRESH_SECRET`           | Signs 30-day refresh cookies (required in production)         |
| `IMAGEKIT_PRIVATE_KEY`         | Enables chat media uploads                                    |
| `VAPID_PUBLIC_KEY`             | Web Push public key                                           |
| `VAPID_PRIVATE_KEY`            | Web Push private key                                          |
| `VAPID_SUBJECT`                | `mailto:` contact for push services                           |

Generate push keys with `npx web-push generate-vapid-keys` and generate each
auth secret with
`node -e "console.log(require('crypto').randomBytes(48).toString('hex'))"`.

`frontend/.env`

| Variable       | Purpose                                                |
| -------------- | ------------------------------------------------------ |
| `VITE_API_URL` | Optional API origin when the SPA is hosted separately  |

## First run: becoming the admin

The first approved account in the database becomes the family admin
automatically. After that, new sign-ups land on a "waiting for approval"
screen until an admin approves them in **Family hub → Admin**, or until they
enter a valid invite code.

To promote an existing account manually:

```js
// mongosh
db.users.updateOne({ email: "you@example.com" }, { $set: { role: "admin" } })
```

## Auth: accounts, invites and migrated members

- **Sign-up** (`/auth` → "Create an account"): the first account in the
  database becomes the family admin automatically. Other new accounts wait on
  the approval screen until an admin approves them, or until they redeem an
  invite code that was created with a matching email.
- **Logging in**: email + password. Wrong credentials always return the same
  "Wrong email or password" answer (no email enumeration).
- **Migrated Clerk-era members** have no password yet — the first login
  attempt explains this, and an admin generates a temporary 8-character
  password in **Family hub** (key icon next to the member). Members can start
  chatting right away with the temp password.
- Sessions: a 15-minute access token is kept on the device and refreshed
  silently by an HttpOnly cookie; a failed refresh signs the user out.

## Production

### Docker (single service)

The root `Dockerfile` builds the SPA, copies it to `backend/public`, compiles
the API to `backend/dist`, and runs everything on one port.

```bash
docker build \
  --build-arg VITE_CLERK_PUBLISHABLE_KEY=pk_live_xxx \
  -t shamak .

docker run -p 3001:3001 \
  -e NODE_ENV=production \
  -e MONGO_URI="mongodb+srv://..." \
  -e FRONTEND_URL="https://chat.example.com" \
  -e SELF_URL="https://chat.example.com" \
  -e CLERK_PUBLISHABLE_KEY="pk_live_xxx" \
  -e CLERK_SECRET_KEY="sk_live_xxx" \
  -e CLERK_WEBHOOK_SIGNING_SECRET="whsec_xxx" \
  -e IMAGEKIT_PRIVATE_KEY="private_xxx" \
  -e VAPID_PUBLIC_KEY="..." \
  -e VAPID_PRIVATE_KEY="..." \
  -e VAPID_SUBJECT="mailto:family@example.com" \
  shamak
```

### Split hosting

Build the SPA with `VITE_API_URL=https://api.example.com` and serve
`frontend/dist` from any static host. Point `FRONTEND_URL` on the API at the
SPA origin so CORS and Socket.IO accept the connection.

## Database maintenance

```bash
cd backend
npm run db:seed       # demo accounts + conversations (development only)
npm run db:migrate    # migrate legacy 1:1 messages into conversations
```

`npm run db:migrate` is idempotent and safe to re-run.

## Quality checks

```bash
cd frontend && npm run lint && npm run build
cd backend  && npm run build   # copies src/ to dist/ for the Docker image
```
