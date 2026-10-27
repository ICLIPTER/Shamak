import { lazy, Suspense, useEffect, useState } from "react";
import { Navigate, Route, Routes } from "react-router";
import { useAuth, useClerk } from "@clerk/react";
import { Toaster } from "react-hot-toast";
import { Button } from "@heroui/react";

import { WallpaperProvider } from "./context/WallpaperContext.jsx";
import { ThemeProvider } from "./context/ThemeContext.jsx";
import PageLoader from "./components/PageLoader.jsx";
import { useAuthStore } from "./store/useAuthStore.js";
import { setTokenProvider } from "./lib/axios.js";
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
  const { isSignedIn, isLoaded, getToken } = useAuth();
  const clerk = useClerk();

  const checkAuth = useAuthStore((state) => state.checkAuth);
  const isCheckingAuth = useAuthStore((state) => state.isCheckingAuth);
  const clearAuth = useAuthStore((state) => state.clearAuth);
  const setTokenGetter = useAuthStore((state) => state.setTokenGetter);
  const authUser = useAuthStore((state) => state.authUser);
  const authError = useAuthStore((state) => state.authError);

  const [syncTimedOut, setSyncTimedOut] = useState(false);

  useEffect(() => {
    setTokenProvider(getToken);
    setTokenGetter(getToken);
  }, [getToken, setTokenGetter]);

  useEffect(() => {
    if (!isLoaded) return;

    if (isSignedIn) checkAuth();
    else clearAuth();
  }, [checkAuth, clearAuth, isLoaded, isSignedIn]);

  // PWA: register once in production so notifications + offline shell work.
  // In dev, actively unregister anything left over — a stale worker caches
  // Vite modules "cache-first" with no revalidation and makes the tab serve
  // dead module URLs until a hard refresh.
  useEffect(() => {
    if (import.meta.env.PROD) registerServiceWorker();
    else unregisterServiceWorkers();
  }, []);

  // The Clerk webhook may still be syncing a brand-new account. Retry quietly
  // until the profile exists so the user never lands on an empty chat.
  const syncPending = !authError || authError === "SYNCING";

  useEffect(() => {
    if (!isSignedIn || authUser || syncTimedOut || !syncPending) {
      return undefined;
    }
    let attempts = 0;
    const timer = setInterval(() => {
      attempts += 1;
      checkAuth();
      if (attempts >= 5) {
        clearInterval(timer);
        setSyncTimedOut(true);
      }
    }, 4000);

    return () => clearInterval(timer);
  }, [isSignedIn, authUser, checkAuth, syncTimedOut, syncPending]);

  const syncingAccount =
    isSignedIn && !authUser && !syncTimedOut && syncPending;

  if (!isLoaded || (isSignedIn && isCheckingAuth) || syncingAccount) {
    return <PageLoader />;
  }

  // Signed in but the profile could not be loaded (bad token / server down).
  if (isSignedIn && !authUser) {
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
                    setSyncTimedOut(false);
                    checkAuth();
                  }}
                >
                  Try again
                </Button>
                <Button variant="ghost" onPress={() => clerk.signOut()}>
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

  const pending = isSignedIn && authUser && authUser.isApproved === false;

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
