import { lazy, Suspense, useEffect, useState } from "react";
import { Navigate, Route, Routes } from "react-router";
import { Toaster } from "react-hot-toast";
import { Button } from "@heroui/react";

import { WallpaperProvider } from "./context/WallpaperContext.jsx";
import { ThemeProvider } from "./context/ThemeContext.jsx";
import PageLoader from "./components/PageLoader.jsx";
import { useAuthStore } from "./store/useAuthStore.js";
import { registerServiceWorker, unregisterServiceWorkers } from "./lib/push.js";

// Route-level code splitting keeps the initial download small on phones.
const AuthPage = lazy(() => import("./pages/AuthPage.jsx"));
const ChatPage = lazy(() => import("./pages/ChatPage.jsx"));
const PendingApproval = lazy(() =>
  import("./pages/PendingApproval.jsx").then((module) => ({
    default: module.PendingApproval,
  })),
);

function App() {
  const checkAuth = useAuthStore((state) => state.checkAuth);
  const isCheckingAuth = useAuthStore((state) => state.isCheckingAuth);
  const clearAuth = useAuthStore((state) => state.clearAuth);
  const logout = useAuthStore((state) => state.logout);
  const authUser = useAuthStore((state) => state.authUser);
  const accessToken = useAuthStore((state) => state.accessToken);

  // A signed-in session with a profile that could not be loaded gets one
  // quiet retry, then the recovery card below.
  const [timedOut, setTimedOut] = useState(false);

  // Re-check the profile whenever the session gains a token.
  useEffect(() => {
    if (accessToken) checkAuth();
    else clearAuth();
  }, [accessToken, checkAuth, clearAuth]);

  // PWA: register once in production so notifications + offline shell work.
  // In dev, actively unregister anything left over — a stale worker caches
  // Vite modules "cache-first" with no revalidation and makes the tab serve
  // dead module URLs until a hard refresh.
  useEffect(() => {
    if (import.meta.env.PROD) registerServiceWorker();
    else unregisterServiceWorkers();
  }, []);

  // Signed in but the profile still isn't loaded — retry a few times before
  // giving up, so a brief hiccup never shows an error card.
  useEffect(() => {
    if (!accessToken || authUser || timedOut) return undefined;

    const timer = setTimeout(() => {
      checkAuth();
      setTimedOut(true);
    }, 4000);

    return () => clearTimeout(timer);
  }, [accessToken, authUser, checkAuth, timedOut]);

  const isSignedIn = Boolean(accessToken && authUser);

  if (!isSignedIn && accessToken && isCheckingAuth) {
    return <PageLoader />;
  }

  // Signed in but the profile could not be loaded.
  if (accessToken && !authUser) {
    return (
      <ThemeProvider>
        <WallpaperProvider>
          <div className="flex min-h-dvh items-center justify-center p-4">
            <div className="w-full max-w-sm rounded-3xl border border-border bg-background p-6 text-center text-foreground">
              <p className="text-base font-semibold">
                We couldn&apos;t load your account
              </p>
              <p className="mt-1 text-[13px] leading-relaxed text-muted">
                Check your connection and try again.
              </p>
              <div className="mt-5 flex justify-center gap-2">
                <Button
                  variant="primary"
                  onPress={() => {
                    setTimedOut(false);
                    checkAuth();
                  }}
                >
                  Try again
                </Button>
                <Button variant="ghost" onPress={logout}>
                  Sign out
                </Button>
              </div>
            </div>
          </div>
          <Toaster />
        </WallpaperProvider>
      </ThemeProvider>
    );
  }

  const pending = isSignedIn && authUser.isApproved === false;

  return (
    <ThemeProvider>
      <WallpaperProvider>
        <Suspense fallback={<PageLoader />}>
          {pending ? (
            <PendingApproval />
          ) : (
            <Routes>
              <Route
                path="/"
                element={
                  isSignedIn ? <ChatPage /> : <Navigate to={"/auth"} replace />
                }
              />
              <Route
                path="/auth"
                element={
                  !isSignedIn ? <AuthPage /> : <Navigate to={"/"} replace />
                }
              />
              <Route path="*" element={<Navigate to={"/"} replace />} />
            </Routes>
          )}
        </Suspense>
        <Toaster />
      </WallpaperProvider>
    </ThemeProvider>
  );
}

export default App;
