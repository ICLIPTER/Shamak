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
| `OWNER_EMAIL`                  | Reserved owner email — master recovery credential             |
| `OWNER_PASSWORD`               | Recreates/resumes the owner's admin account on login          |
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

### The owner account (indefinite admin)

The `OWNER_EMAIL` + `OWNER_PASSWORD` environment variables are the app
owner's master credentials — they live outside the database:

- Logging in with them always works, as an approved family admin.
- If the owner's account was ever deleted from the database, logging in with
  them recreates it instantly as admin (role, approval and admin status are
  restored even if the account exists but was altered).
- Nobody can register a new account with the owner email, and admins (the
  owner included) cannot be deleted through the Family hub — the server
  refuses.
- Changing the master password means editing `OWNER_PASSWORD` and setting the
  account's password to match (local script:
  `node scripts/set-password.js <owner-email> <new-password>`).

## Production

### Render (recommended — Blueprint deploys everything)

One service serves both the API and the built SPA from a single port. Commit
this repo, then:

1. Push the repo to GitHub, on Render choose **New + → Blueprint** and pick
   the repository. `render.yaml` at the root configures the Docker service,
   the `/health` health check, and strong random JWT secrets automatically.
2. Fill in the prompted secrets on first deploy:

   | Prompt                   | Fill with                                             |
   | ------------------------ | ----------------------------------------------------- |
   | `MONGO_URI`              | Your MongoDB connection string                        |
   | `OWNER_EMAIL`            | Your email (master credentials)                       |
   | `OWNER_PASSWORD`         | Your master password                                  |
   | `IMAGEKIT_PRIVATE_KEY`   | ImageKit private key                                  |
   | `VAPID_PUBLIC_KEY`       | Web Push public key                                   |
   | `VAPID_PRIVATE_KEY`      | Web Push private key                                  |
   | `SELF_URL`               | The service's public URL (fills in after first deploy) |

3. Generate push keys with `npx web-push generate-vapid-keys` if you do not
   have them; tokens/secrets **are not** stored in the repo.

`SELF_URL` is only used by the free-tier keep-alive ping. Without it the
service still works — it just spins down when idle.

### Docker (any host)

```bash
docker build -t shamak .

docker run -p 3001:3001 \
  -e NODE_ENV=production \
  -e MONGO_URI="mongodb+srv://..." \
  -e OWNER_EMAIL="you@example.com" \
  -e OWNER_PASSWORD="your-master-password" \
  -e JWT_ACCESS_SECRET="<48-byte hex>" \
  -e JWT_REFRESH_SECRET="<48-byte hex>" \
  -e IMAGEKIT_PRIVATE_KEY="private_xxx" \
  -e VAPID_PUBLIC_KEY="..." \
  -e VAPID_PRIVATE_KEY="..." \
  -e VAPID_SUBJECT="mailto:family@example.com" \
  -e SELF_URL="https://chat.example.com" \
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
