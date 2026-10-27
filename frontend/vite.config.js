import react, { reactCompilerPreset } from "@vitejs/plugin-react";
import babel from "@rolldown/plugin-babel";
import { defineConfig } from "vite";
import tailwindcss from "@tailwindcss/vite";

// https://vite.dev/config/
export default defineConfig(({ mode }) => ({
  plugins: [
    react(),
    tailwindcss(),
    // The React Compiler breaks HMR in dev (useMemoCache crashes on hot-swap),
    // so it compiles production builds only. Dev stays plain React.
    ...(mode === "production"
      ? [babel({ presets: [reactCompilerPreset()] })]
      : []),
  ],
  server: {
    // Bind IPv4 + IPv6 so the HMR websocket to localhost:5173 doesn't fail
    // when the OS resolves localhost to the mismatched stack.
    host: true,
    hmr: { host: "localhost" },
  },
}));
