import axios from "axios";

const DEV_API_ORIGIN = "http://localhost:3000";

/**
 * Where the API lives.
 *
 * - `VITE_API_URL` wins, which lets the SPA be hosted separately from the API.
 * - Development defaults to the local Express server.
 * - Production defaults to the same origin (the bundled Express monolith).
 */
export const API_ORIGIN = (
  import.meta.env.VITE_API_URL ||
  (import.meta.env.MODE === "development" ? DEV_API_ORIGIN : "")
)
  .trim()
  .replace(/\/+$/, "");

export const axiosInstance = axios.create({
  baseURL: `${API_ORIGIN}/api`,
  withCredentials: true,
  timeout: 30000,
});

// Clerk token provider, wired up by the app shell. Sending a bearer token
// works in dev (cross-port) and production without relying on third-party
// cookie behaviour.
let tokenProvider = null;

export function setTokenProvider(provider) {
  tokenProvider = provider;
}

axiosInstance.interceptors.request.use(async (config) => {
  if (!tokenProvider) return config;

  try {
    const token = await tokenProvider();
    if (token) {
      config.headers = config.headers || {};
      config.headers.Authorization = `Bearer ${token}`;
    }
  } catch {
    /* unauthenticated request; the API will answer 401 */
  }

  return config;
});
