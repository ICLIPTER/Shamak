import { WallpaperProvider } from "./context/WallpaperContext.jsx";
import { ThemeProvider } from "./context/ThemeContext.jsx";
import { Navigate, Route, Routes } from "react-router";
import AuthPage from "./pages/AuthPage.jsx";
import ChatPage from "./pages/ChatPage.jsx";
import { useAuth } from "@clerk/react";
import PageLoader from "./components/PageLoader.jsx";
import { useAuthStore } from "./store/useAuthStore.js";
import { useEffect } from "react";
import { Toaster } from "react-hot-toast";

function App() {
  const { isSignedIn, isLoaded } = useAuth();

  // option 1
  // const { checkAuth, isCheckingAuth, clearAuth } = useAuthStore();

  // option 2
  //this method is faster and more optimized for the application
  const checkAuth = useAuthStore((state) => state.checkAuth);
  const isCheckingAuth = useAuthStore((state) => state.isCheckingAuth);
  const clearAuth = useAuthStore((state) => state.clearAuth);

  useEffect(() => {
    if (!isLoaded) return;

    if (isSignedIn) checkAuth();
    else clearAuth();
  }, [checkAuth, clearAuth, isLoaded, isSignedIn]);

  if (!isLoaded || (isSignedIn && isCheckingAuth)) return <PageLoader />;

  return (
    <ThemeProvider>
      <WallpaperProvider>
        <Routes>
          <Route
            path="/"
            element={
              isSignedIn ? <ChatPage /> : <Navigate to={"/auth"} replace />
            }
          />
          <Route
            path="/auth"
            element={!isSignedIn ? <AuthPage /> : <Navigate to={"/"} replace />}
          />
        </Routes>
        <Toaster />
      </WallpaperProvider>
    </ThemeProvider>
  );
}

export default App;
