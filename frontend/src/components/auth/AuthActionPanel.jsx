import { useState } from "react";
import { Button } from "@heroui/react";
import {
  ArrowRightIcon,
  EyeIcon,
  EyeOffIcon,
  LockIcon,
  MailIcon,
  ShieldCheckIcon,
  SparklesIcon,
  UserIcon,
} from "lucide-react";
import toast from "react-hot-toast";

import { AppLogo } from "../AppLogo";
import { useAuthStore } from "../../store/useAuthStore";
import { AuthCardShell } from "./AuthCardShell";

const logoTileClassName = [
  "relative rounded-2xl bg-linear-to-b from-white to-[#f2f2f7] p-2",
  "shadow-lg shadow-black/8 ring-1 ring-black/8",
  "dark:from-[#2c2c2e] dark:to-[#1a1a1c] dark:shadow-black/50 dark:ring-white/12",
].join(" ");

const inputClassName = [
  "w-full rounded-2xl border border-black/8 bg-white px-4 py-3 pl-11",
  "text-[15px] text-[#1C1C1E] outline-none transition",
  "placeholder:text-[#8E8E93] focus:border-black/20",
  "dark:border-white/10 dark:bg-[#1C1C1E] dark:text-[#F2F2F7] dark:placeholder:text-[#636366] dark:focus:border-white/25",
].join(" ");

const iconClassName = "pointer-events-none absolute left-3.5 top-1/2 size-4 -translate-y-1/2 text-[#8E8E93]";

const continueButtonClassName = [
  "group relative h-13 overflow-hidden rounded-2xl text-[15px] font-semibold",
  "shadow-xl shadow-accent/45 dark:shadow-accent/35",
  "after:pointer-events-none after:absolute after:inset-0 after:rounded-2xl",
  "after:shadow-[inset_0_1px_0_rgba(255,255,255,0.25)]",
  "dark:after:shadow-[inset_0_1px_0_rgba(255,255,255,0.15)]",
].join(" ");

function Field({ icon: Icon, children }) {
  return (
    <div className="relative">
      <Icon className={iconClassName} strokeWidth={2} aria-hidden />
      {children}
    </div>
  );
}

export function AuthActionPanel() {
  const login = useAuthStore((state) => state.login);
  const register = useAuthStore((state) => state.register);

  const [mode, setMode] = useState("signin"); // "signin" | "signup"
  const [fullName, setFullName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState(null);

  const isSignup = mode === "signup";

  const submit = async (event) => {
    event.preventDefault();
    if (busy) return;

    setBusy(true);
    setError(null);

    try {
      const user = isSignup
        ? await register(fullName.trim(), email.trim(), password)
        : await login(email.trim(), password);

      if (user?.isApproved === false) {
        // App switches to the waiting-for-approval screen on its own.
        toast("Account created — waiting for admin approval", { icon: "👋" });
      } else {
        toast.success(isSignup ? "Welcome to the family" : "Welcome back");
      }
    } catch (err) {
      const message =
        err.response?.data?.message || "Something went wrong — try again";
      setError(message);
    } finally {
      setBusy(false);
    }
  };

  const switchMode = () => {
    setMode(isSignup ? "signin" : "signup");
    setError(null);
  };

  return (
    <section className="relative flex flex-1 flex-col items-stretch justify-center overflow-hidden px-5 py-12 sm:px-10 md:px-14 md:py-10 lg:px-16">
      <AuthCardShell>
        <div className="mb-7 flex flex-col items-center text-center">
          <div className="relative mb-5">
            <div
              aria-hidden
              className="absolute -inset-3.5 rounded-[20px] bg-linear-to-br from-accent/22 via-accent/8 to-transparent opacity-90 blur-xl dark:from-accent/28 dark:via-accent/10"
            />
            <div className={logoTileClassName}>
              <AppLogo size={52} className="rounded-xl" alt="" />
            </div>
          </div>

          <div className="flex items-center justify-center gap-1.5 text-accent">
            <SparklesIcon className="size-3.5" strokeWidth={2} aria-hidden />
            <span className="text-[11px] font-semibold uppercase tracking-[0.18em]">
              Secure entry
            </span>
          </div>
        </div>

        <form
          onSubmit={submit}
          className="flex flex-col gap-3"
          aria-label={isSignup ? "Create account" : "Sign in"}
        >
          {isSignup && (
            <Field icon={UserIcon}>
              <input
                type="text"
                value={fullName}
                onChange={(event) => setFullName(event.target.value)}
                placeholder="Your name"
                autoComplete="name"
                required
                maxLength={80}
                className={inputClassName}
              />
            </Field>
          )}

          <Field icon={MailIcon}>
            <input
              type="email"
              value={email}
              onChange={(event) => setEmail(event.target.value)}
              placeholder="Family email"
              autoComplete="email"
              required
              className={inputClassName}
            />
          </Field>

          <Field icon={LockIcon}>
            <input
              type={showPassword ? "text" : "password"}
              value={password}
              onChange={(event) => setPassword(event.target.value)}
              placeholder={isSignup ? "Create password (8+ characters)" : "Password"}
              autoComplete={isSignup ? "new-password" : "current-password"}
              minLength={isSignup ? 8 : undefined}
              required
              className={inputClassName}
            />
            <button
              type="button"
              onClick={() => setShowPassword((visible) => !visible)}
              className="absolute right-3.5 top-1/2 -translate-y-1/2 text-[#8E8E93] transition hover:text-[#1C1C1E] dark:hover:text-[#F2F2F7]"
              aria-label={showPassword ? "Hide password" : "Show password"}
            >
              {showPassword ? (
                <EyeOffIcon className="size-4" aria-hidden />
              ) : (
                <EyeIcon className="size-4" aria-hidden />
              )}
            </button>
          </Field>

          {error && (
            <p
              className="rounded-xl bg-danger/10 px-3 py-2 text-[12.5px] leading-relaxed text-danger"
              role="alert"
            >
              {error}
            </p>
          )}

          <Button
            type="submit"
            fullWidth
            size="lg"
            variant="primary"
            isDisabled={
              busy ||
              !email.trim() ||
              !password ||
              (isSignup && !fullName.trim())
            }
            className={`${continueButtonClassName} mt-1`}
          >
            {busy ? (
              <span className="relative z-1">One moment…</span>
            ) : (
              <span className="relative z-1 flex items-center justify-center gap-2">
                {isSignup ? "Create account" : "Continue"}
                <ArrowRightIcon
                  className="size-4 transition-transform group-hover:translate-x-0.5"
                  aria-hidden
                />
              </span>
            )}
          </Button>
        </form>

        <p className="mt-4 text-center text-[13px] text-[#8E8E93]">
          {isSignup ? "Already have an account?" : "New to the family?"}{" "}
          <button
            type="button"
            onClick={switchMode}
            className="font-semibold text-accent transition hover:opacity-80"
          >
            {isSignup ? "Sign in" : "Create an account"}
          </button>
        </p>

        <div className="mt-7 flex items-center justify-center gap-2 border-t border-black/6 pt-6 text-[11px] text-[#8E8E93] dark:border-white/8 dark:text-[#636366]">
          <ShieldCheckIcon
            className="size-3.5 shrink-0 text-[#34C759] dark:text-[#30D158]"
            strokeWidth={2}
            aria-hidden
          />
          <span>Invite-only family · Your data stays yours</span>
        </div>
      </AuthCardShell>
    </section>
  );
}
