// Access token storage — shared by the axios interceptor and the socket
// connection without creating circular imports between them.
const TOKEN_KEY = "shamak_token";

export function getToken() {
  try {
    return localStorage.getItem(TOKEN_KEY);
  } catch {
    return null;
  }
}

export function setToken(token) {
  try {
    if (token) localStorage.setItem(TOKEN_KEY, token);
    else localStorage.removeItem(TOKEN_KEY);
  } catch {
    /* private mode; token then lives only in memory */
  }
}

/** App-wide event when the refresh flow proves the session is truly over. */
export const SESSION_EXPIRED_EVENT = "shamak:session-expired";
