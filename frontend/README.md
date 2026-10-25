# Shamak frontend

React 19 + Vite SPA for the Shamak family chat. See the
[root README](../README.md) for setup, environment variables, and deployment.

```bash
npm install
npm run dev      # http://localhost:5173 (expects the API on :3000)
npm run lint
npm run build    # emits dist/
```

Notes:

- Routes and chat modals are code-split, so keep new panels behind
  `React.lazy` where they are not needed on first paint.
- API origin comes from `VITE_API_URL` when set, otherwise development uses
  `http://localhost:3000` and production uses the same origin.
- The service worker (`public/sw.js`) is only registered in production.
