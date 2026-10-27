import { useState } from "react";
import { Button } from "@heroui/react";
import { KeyRoundIcon, LogOutIcon, ShieldCheckIcon } from "lucide-react";
import toast from "react-hot-toast";

import { axiosInstance } from "../lib/axios";
import { useAuthStore } from "../store/useAuthStore";
import { APP_NAME, AppLogo } from "../components/AppLogo";
import { useWallpaper } from "../context/wallpaper";

export function PendingApproval() {
  const authUser = useAuthStore((store) => store.authUser);
  const refreshAuth = useAuthStore((store) => store.refreshAuth);
  const logout = useAuthStore((store) => store.logout);
  const { frameStyle } = useWallpaper();

  const [code, setCode] = useState("");
  const [busy, setBusy] = useState(false);

  const redeem = async () => {
    if (!code.trim()) return;
    setBusy(true);
    try {
      await axiosInstance.post("/invites/redeem", { code: code.trim() });
      const user = await refreshAuth();
      if (user?.isApproved) {
        toast.success("Welcome to the family");
      } else {
        toast.error("That code didn't unlock your account");
      }
    } catch (error) {
      toast.error(error.response?.data?.message || "That invite code didn't work");
    } finally {
      setBusy(false);
    }
  };

  return (
    <div
      className="flex min-h-dvh items-center justify-center p-4"
      style={frameStyle}
    >
      <div className="w-full max-w-md rounded-3xl border border-border bg-background p-6 text-foreground shadow-xl">
        <div className="flex flex-col items-center text-center">
          <AppLogo size={56} className="rounded-xl" />
          <h1 className="mt-4 text-xl font-bold tracking-tight">
            {APP_NAME}
          </h1>
          <p className="mt-1 text-[13px] text-muted">
            Private chat for your family
          </p>
        </div>

        <div className="mt-6 rounded-2xl border border-border bg-surface/60 p-4 text-center">
          <ShieldCheckIcon className="mx-auto size-7 text-accent" />
          <p className="mt-2 text-[14px] font-semibold">
            Waiting for approval
          </p>
          <p className="mt-1 text-[12px] leading-relaxed text-muted">
            {authUser?.fullName ? `Hi ${authUser.fullName}. ` : ""}
            A family admin needs to approve your account. If you have an
            invite code, enter it below to get in right away.
          </p>
        </div>

        <div className="mt-4">
          <label className="mb-1 block text-[12px] font-medium text-muted">
            Invite code
          </label>
          <div className="flex gap-2">
            <input
              value={code}
              onChange={(event) => setCode(event.target.value.toUpperCase())}
              onKeyDown={(event) => {
                if (event.key === "Enter") redeem();
              }}
              placeholder="ABCD2345"
              className="w-full rounded-xl border border-border bg-surface px-3 py-2 font-mono text-[15px] tracking-widest outline-none focus:border-accent"
            />
            <Button variant="primary" isDisabled={busy || !code.trim()} onPress={redeem}>
              <KeyRoundIcon className="size-4" />
              {busy ? "Checking…" : "Enter"}
            </Button>
          </div>
        </div>

        <Button
          variant="ghost"
          className="mt-5 w-full text-muted"
          onPress={logout}
        >
          <LogOutIcon className="size-4" /> Sign out
        </Button>
      </div>
    </div>
  );
}
