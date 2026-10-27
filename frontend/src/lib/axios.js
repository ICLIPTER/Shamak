import axios from "axios";
import { getToken, setToken, SESSION_EXPIRED_EVENT } from "./auth-token.js";

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

// Access token for this device. The refresh cookie stays HttpOnly behind
// /api/auth, so the browser never sees it.
axiosInstance.interceptors.request.use((config) => {
  const token = getToken();
  if (token) {
    config.headers = config.headers || {};
    config.headers.Authorization = `Bearer ${token}`;
  }
  return config;
});

// On 401, silently swap the expired access token for a fresh one via the
// refresh cookie, then replay the original request exactly once.
let refreshInFlight = null;

function refreshSession() {
  if (!refreshInFlight) {
    refreshInFlight = axiosInstance
      .post("/auth/refresh")
      .then((res) => {
        const token = res.data?.token || null;
        if (token) setToken(token);
        return token;
      })
      .finally(() => {
        refreshInFlight = null;
      });
  }
  return refreshInFlight;
}

const NO_RETRY_URLS = ["/auth/refresh", "/auth/login", "/auth/register", "/auth/logout"];

axiosInstance.interceptors.response.use(undefined, async (error) => {
  const status = error.response?.status;
  const url = error.config?.url || "";

  if (
    status !== 401 ||
    error.response?.data?.code === "NEEDS_PASSWORD" ||
    error.config?._retry ||
    NO_RETRY_URLS.some((path) => url.includes(path))
  ) {
    return Promise.reject(error);
  }

  error.config._retry = true;
  try {
    const token = await refreshSession();
    if (!token) return Promise.reject(error);
    error.config.headers.Authorization = `Bearer ${token}`;
    return axiosInstance(error.config);
  } catch (refreshError) {
    // The refresh cookie is gone/invalid — the session really is over.
    setToken(null);
    window.dispatchEvent(new Event(SESSION_EXPIRED_EVENT));
    return Promise.reject(refreshError);
  }
});
