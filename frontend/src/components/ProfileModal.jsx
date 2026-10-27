import { useEffect, useState } from "react";
import { Button, Modal } from "@heroui/react";
import { BellIcon, BellOffIcon, LogOutIcon } from "lucide-react";
import toast from "react-hot-toast";

import { axiosInstance } from "../lib/axios";
import {
  disablePush,
  enablePush,
  getPushState,
  supportsPush,
} from "../lib/push";
import { useAuthStore } from "../store/useAuthStore";

const FIELDS = [
  { key: "fullName", label: "Full name", type: "text", placeholder: "Your name" },
  { key: "relation", label: "In the family", type: "text", placeholder: "e.g. Dad's sister" },
  { key: "birthday", label: "Birthday", type: "date" },
  { key: "phone", label: "Phone", type: "tel", placeholder: "+1 555 000 0000" },
];

function ProfileContent({ modal }) {
  const authUser = useAuthStore((store) => store.authUser);
  const refreshAuth = useAuthStore((store) => store.refreshAuth);
  const logout = useAuthStore((store) => store.logout);

  // Mounted fresh each time the modal opens, so the initializer is always
  // reading the latest profile — no syncing effect required.
  const [form, setForm] = useState(() => ({
    fullName: authUser?.fullName || "",
    relation: authUser?.relation || "",
    phone: authUser?.phone || "",
    birthday: authUser?.birthday
      ? new Date(authUser.birthday).toISOString().slice(0, 10)
      : "",
  }));
  const [bio, setBio] = useState(authUser?.bio || "");
  const [saving, setSaving] = useState(false);
  const [pushState, setPushState] = useState("loading");

  useEffect(() => {
    let cancelled = false;

    getPushState()
      .then((state) => {
        if (!cancelled) setPushState(state);
      })
      .catch(() => {
        if (!cancelled) setPushState("unsupported");
      });

    return () => {
      cancelled = true;
    };
  }, []);

  const save = async () => {
    setSaving(true);
    try {
      await axiosInstance.patch("/users/me", { ...form, bio });
      await refreshAuth();
      toast.success("Profile updated");
      modal.close();
    } catch (error) {
      toast.error(error.response?.data?.message || "Could not save profile");
    } finally {
      setSaving(false);
    }
  };

  const togglePush = async () => {
    try {
      if (pushState === "enabled") {
        await disablePush();
        setPushState("disabled");
        toast.success("Notifications turned off");
      } else {
        await enablePush();
        setPushState("enabled");
        toast.success("Notifications turned on");
      }
    } catch (error) {
      toast.error(error.message || "Could not update notifications");
    }
  };

  return (
    <>
      <Modal.Header className="flex flex-row items-center justify-between border-b border-border pb-3">
        <Modal.Heading className="text-lg font-semibold">Your profile</Modal.Heading>
        <Modal.CloseTrigger />
      </Modal.Header>

      <Modal.Body className="space-y-3 pt-4">
        {FIELDS.map((field) => (
          <label key={field.key} className="block">
            <span className="mb-1 block text-[12px] font-medium text-muted">
              {field.label}
            </span>
            <input
              type={field.type}
              value={form[field.key] || ""}
              placeholder={field.placeholder}
              onChange={(event) =>
                setForm({ ...form, [field.key]: event.target.value })
              }
              className="w-full rounded-xl border border-border bg-surface px-3 py-2 text-[14px] outline-none focus:border-accent"
            />
          </label>
        ))}

        <label className="block">
          <span className="mb-1 block text-[12px] font-medium text-muted">
            About you
          </span>
          <textarea
            value={bio}
            rows={2}
            maxLength={280}
            onChange={(event) => setBio(event.target.value)}
            placeholder="A line your family will recognise"
            className="w-full rounded-xl border border-border bg-surface px-3 py-2 text-[14px] outline-none focus:border-accent"
          />
        </label>

        <div className="flex items-center justify-between rounded-xl border border-border p-3">
          <div className="flex items-center gap-2">
            {pushState === "enabled" ? (
              <BellIcon className="size-4 text-accent" />
            ) : (
              <BellOffIcon className="size-4 text-muted" />
            )}
            <div>
              <p className="text-[13px] font-medium">Notifications</p>
              <p className="text-[11px] text-muted">
                {pushState === "loading"
                  ? "Checking…"
                  : pushState === "unsupported"
                    ? "Not supported in this browser"
                    : pushState === "enabled"
                      ? "On for this device"
                      : "Get pinged when the family posts"}
              </p>
            </div>
          </div>
          <Button
            size="sm"
            variant={pushState === "enabled" ? "ghost" : "primary"}
            isDisabled={!supportsPush() || pushState === "unsupported" || pushState === "loading"}
            onPress={togglePush}
          >
            {pushState === "enabled" ? "Turn off" : "Turn on"}
          </Button>
        </div>

        <Button variant="ghost" className="w-full text-danger" onPress={logout}>
          <LogOutIcon className="size-4" /> Sign out
        </Button>
      </Modal.Body>

      <Modal.Footer className="flex justify-end gap-2 border-t border-border pt-3">
        <Button variant="ghost" onPress={modal.close}>
          Cancel
        </Button>
        <Button variant="primary" isDisabled={saving} onPress={save}>
          {saving ? "Saving…" : "Save"}
        </Button>
      </Modal.Footer>
    </>
  );
}

export function ProfileModal({ state }) {
  const modal = state;

  return (
    <Modal.Root state={modal}>
      <Modal.Backdrop variant="opaque">
        <Modal.Container size="md" scroll="inside" placement="center">
          <Modal.Dialog className="border border-border bg-background text-foreground">
            {modal.isOpen ? <ProfileContent modal={modal} /> : null}
          </Modal.Dialog>
        </Modal.Container>
      </Modal.Backdrop>
    </Modal.Root>
  );
}
