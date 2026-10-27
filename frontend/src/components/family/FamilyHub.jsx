import { useCallback, useEffect, useState } from "react";
import { Avatar, Button, Modal, Tabs } from "@heroui/react";
import {
  CakeIcon,
  CalendarPlusIcon,
  CheckIcon,
  CopyIcon,
  ImageIcon,
  KeyRoundIcon,
  PinIcon,
  PlusIcon,
  Trash2Icon,
  UserCheckIcon,
  XIcon,
} from "lucide-react";
import toast from "react-hot-toast";

import { axiosInstance } from "../../lib/axios";
import { formatDaysUntil, getInitials } from "../../lib/chat";
import { withTransform } from "../../lib/imageKit";
import { useAuthStore } from "../../store/useAuthStore";

const NOTE_CATEGORIES = ["info", "contact", "rule", "address", "reminder"];

function BoardTab() {
  const [notes, setNotes] = useState([]);
  const [loading, setLoading] = useState(true);
  const [form, setForm] = useState({ title: "", body: "", category: "info" });
  const [showForm, setShowForm] = useState(false);

  const load = useCallback(async () => {
    try {
      const res = await axiosInstance.get("/notes");
      setNotes(res.data);
    } catch {
      setNotes([]);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    // Fetch on mount; state updates happen after the request resolves.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    load();
  }, [load]);

  const create = async () => {
    if (!form.title.trim()) return;
    try {
      await axiosInstance.post("/notes", form);
      setForm({ title: "", body: "", category: "info" });
      setShowForm(false);
      load();
      toast.success("Note saved");
    } catch (error) {
      toast.error(error.response?.data?.message || "Could not save note");
    }
  };

  const remove = async (id) => {
    try {
      await axiosInstance.delete(`/notes/${id}`);
      setNotes((current) => current.filter((note) => note._id !== id));
    } catch {
      toast.error("Could not delete note");
    }
  };

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between">
        <p className="text-[13px] text-muted">
          Shared info for the whole family — WiFi, contacts, house rules.
        </p>
        <Button
          size="sm"
          variant="primary"
          onPress={() => setShowForm((value) => !value)}
        >
          <PlusIcon className="size-4" /> New
        </Button>
      </div>

      {showForm ? (
        <div className="space-y-2 rounded-xl border border-border p-3">
          <input
            value={form.title}
            onChange={(event) => setForm({ ...form, title: event.target.value })}
            placeholder="Title (e.g. WiFi password)"
            className="w-full rounded-lg border border-border bg-surface px-3 py-2 text-[14px] outline-none focus:border-accent"
          />
          <textarea
            value={form.body}
            onChange={(event) => setForm({ ...form, body: event.target.value })}
            placeholder="Details"
            rows={3}
            className="w-full rounded-lg border border-border bg-surface px-3 py-2 text-[14px] outline-none focus:border-accent"
          />
          <div className="flex flex-wrap gap-1.5">
            {NOTE_CATEGORIES.map((category) => (
              <button
                key={category}
                type="button"
                onClick={() => setForm({ ...form, category })}
                className={`rounded-full px-2.5 py-1 text-[11px] font-medium capitalize ${
                  form.category === category
                    ? "bg-accent text-accent-foreground"
                    : "bg-surface text-muted"
                }`}
              >
                {category}
              </button>
            ))}
          </div>
          <div className="flex justify-end gap-2">
            <Button size="sm" variant="ghost" onPress={() => setShowForm(false)}>
              Cancel
            </Button>
            <Button size="sm" variant="primary" onPress={create}>
              Save note
            </Button>
          </div>
        </div>
      ) : null}

      {loading ? (
        <p className="py-6 text-center text-[13px] text-muted">Loading…</p>
      ) : notes.length === 0 ? (
        <p className="py-6 text-center text-[13px] text-muted">
          The board is empty. Add the first note.
        </p>
      ) : (
        notes.map((note) => (
          <div
            key={note._id}
            className="rounded-xl border border-border bg-surface/50 p-3"
          >
            <div className="flex items-start justify-between gap-2">
              <div className="min-w-0">
                <p className="flex items-center gap-1.5 text-[14px] font-semibold">
                  {note.pinned ? <PinIcon className="size-3.5 text-accent" /> : null}
                  {note.title}
                </p>
                <p className="mt-0.5 text-[10px] uppercase tracking-wide text-accent">
                  {note.category}
                </p>
              </div>
              <button
                type="button"
                onClick={() => remove(note._id)}
                className="shrink-0 text-muted hover:text-danger"
                aria-label="Delete note"
              >
                <Trash2Icon className="size-4" />
              </button>
            </div>
            {note.body ? (
              <p className="mt-2 whitespace-pre-wrap text-[13px] text-foreground/85">
                {note.body}
              </p>
            ) : null}
            <p className="mt-2 text-[10px] text-muted">
              Added by {note.createdBy?.fullName || "a family member"}
            </p>
          </div>
        ))
      )}
    </div>
  );
}

function DatesTab() {
  const [events, setEvents] = useState([]);
  const [loading, setLoading] = useState(true);
  const [showForm, setShowForm] = useState(false);
  const [form, setForm] = useState({
    title: "",
    date: "",
    type: "gathering",
    yearly: false,
  });

  const load = useCallback(async () => {
    try {
      const res = await axiosInstance.get("/events", { params: { days: 365 } });
      setEvents(res.data);
    } catch {
      setEvents([]);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    // Fetch on mount; state updates happen after the request resolves.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    load();
  }, [load]);

  const create = async () => {
    if (!form.title.trim() || !form.date) return;
    try {
      await axiosInstance.post("/events", form);
      setForm({ title: "", date: "", type: "gathering", yearly: false });
      setShowForm(false);
      load();
      toast.success("Added to the family calendar");
    } catch (error) {
      toast.error(error.response?.data?.message || "Could not add event");
    }
  };

  const remove = async (id) => {
    try {
      await axiosInstance.delete(`/events/${id}`);
      load();
    } catch {
      toast.error("Could not delete event");
    }
  };

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between">
        <p className="text-[13px] text-muted">
          Birthdays and family dates, soonest first.
        </p>
        <Button
          size="sm"
          variant="primary"
          onPress={() => setShowForm((value) => !value)}
        >
          <CalendarPlusIcon className="size-4" /> Add
        </Button>
      </div>

      {showForm ? (
        <div className="space-y-2 rounded-xl border border-border p-3">
          <input
            value={form.title}
            onChange={(event) => setForm({ ...form, title: event.target.value })}
            placeholder="Event title"
            className="w-full rounded-lg border border-border bg-surface px-3 py-2 text-[14px] outline-none focus:border-accent"
          />
          <div className="flex flex-wrap items-center gap-2">
            <input
              type="date"
              value={form.date}
              onChange={(event) => setForm({ ...form, date: event.target.value })}
              className="rounded-lg border border-border bg-surface px-3 py-2 text-[14px] outline-none focus:border-accent"
            />
            <select
              value={form.type}
              onChange={(event) => setForm({ ...form, type: event.target.value })}
              className="rounded-lg border border-border bg-surface px-3 py-2 text-[14px] outline-none focus:border-accent"
            >
              <option value="gathering">Gathering</option>
              <option value="anniversary">Anniversary</option>
              <option value="reminder">Reminder</option>
            </select>
            <label className="flex items-center gap-1.5 text-[12px]">
              <input
                type="checkbox"
                checked={form.yearly}
                onChange={(event) =>
                  setForm({ ...form, yearly: event.target.checked })
                }
                className="size-4 accent-[var(--accent)]"
              />
              Repeats yearly
            </label>
          </div>
          <div className="flex justify-end gap-2">
            <Button size="sm" variant="ghost" onPress={() => setShowForm(false)}>
              Cancel
            </Button>
            <Button size="sm" variant="primary" onPress={create}>
              Save
            </Button>
          </div>
        </div>
      ) : null}

      {loading ? (
        <p className="py-6 text-center text-[13px] text-muted">Loading…</p>
      ) : events.length === 0 ? (
        <p className="py-6 text-center text-[13px] text-muted">
          No upcoming dates yet.
        </p>
      ) : (
        events.map((event) => (
          <div
            key={event._id}
            className="flex items-center gap-3 rounded-xl border border-border bg-surface/50 p-3"
          >
            <div
              className={`flex size-10 shrink-0 items-center justify-center rounded-xl ${
                event.type === "birthday"
                  ? "bg-pink-500/15 text-pink-500"
                  : "bg-accent-soft text-accent"
              }`}
            >
              {event.type === "birthday" ? (
                <CakeIcon className="size-5" />
              ) : (
                <CalendarPlusIcon className="size-5" />
              )}
            </div>

            <div className="min-w-0 flex-1">
              <p className="truncate text-[14px] font-semibold">{event.title}</p>
              <p className="text-[12px] text-muted">
                {new Date(event.date).toLocaleDateString([], {
                  month: "long",
                  day: "numeric",
                })}
                {" · "}
                <span className="font-medium text-accent">
                  {formatDaysUntil(event.daysUntil)}
                </span>
              </p>
            </div>

            {event.type !== "birthday" ? (
              <button
                type="button"
                onClick={() => remove(event._id)}
                className="shrink-0 text-muted hover:text-danger"
                aria-label="Delete event"
              >
                <Trash2Icon className="size-4" />
              </button>
            ) : null}
          </div>
        ))
      )}
    </div>
  );
}

function AlbumTab() {
  const [photos, setPhotos] = useState([]);
  const [loading, setLoading] = useState(true);
  const [active, setActive] = useState(null);

  useEffect(() => {
    let cancelled = false;
    axiosInstance
      .get("/messages/album", { params: { limit: 60 } })
      .then((res) => {
        if (!cancelled) setPhotos(res.data.photos || []);
      })
      .catch(() => {
        if (!cancelled) setPhotos([]);
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });

    return () => {
      cancelled = true;
    };
  }, []);

  if (loading) {
    return <p className="py-6 text-center text-[13px] text-muted">Loading…</p>;
  }

  if (photos.length === 0) {
    return (
      <div className="flex flex-col items-center gap-2 py-10 text-center">
        <ImageIcon className="size-8 text-muted" />
        <p className="text-[13px] text-muted">
          Photos shared in any chat will appear here.
        </p>
      </div>
    );
  }

  return (
    <>
      <div className="grid grid-cols-3 gap-1.5 sm:grid-cols-4">
        {photos.map((photo) => (
          <button
            key={photo._id}
            type="button"
            onClick={() => setActive(photo)}
            className="aspect-square overflow-hidden rounded-lg bg-surface"
          >
            <img
              src={withTransform(photo.image, "q-auto,w-300,f-auto")}
              alt=""
              loading="lazy"
              decoding="async"
              className="size-full object-cover"
            />
          </button>
        ))}
      </div>

      {active ? (
        <button
          type="button"
          onClick={() => setActive(null)}
          className="fixed inset-0 z-[60] flex flex-col items-center justify-center gap-3 bg-black/90 p-4"
          aria-label="Close photo"
        >
          <img
            src={active.image}
            alt=""
            className="max-h-[80vh] max-w-full rounded-lg object-contain"
          />
          <p className="text-[12px] text-white/70">
            {active.sender?.fullName} ·{" "}
            {new Date(active.createdAt).toLocaleDateString()}
          </p>
        </button>
      ) : null}
    </>
  );
}

function MembersTab() {
  const meId = useAuthStore((store) => store.authUser?._id);

  const [pending, setPending] = useState([]);
  const [members, setMembers] = useState([]);
  const [invites, setInvites] = useState([]);
  const [loading, setLoading] = useState(true);
  const [inviteEmail, setInviteEmail] = useState("");
  const [inviteRole, setInviteRole] = useState("member");

  const load = useCallback(async () => {
    try {
      const [pendingRes, membersRes, invitesRes] = await Promise.all([
        axiosInstance.get("/users/pending"),
        axiosInstance.get("/users"),
        axiosInstance.get("/invites"),
      ]);
      setPending(pendingRes.data);
      setMembers(membersRes.data);
      setInvites(invitesRes.data);
    } catch {
      setPending([]);
      setMembers([]);
      setInvites([]);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    // Fetch on mount; state updates happen after the request resolves.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    load();
  }, [load]);

  useEffect(() => {
    // Invites are consumed live (redemption or webhook auto-approval);
    // keep the admin's lists current without a manual reload.
    const socket = useAuthStore.getState().socket;
    if (!socket) return undefined;

    const reload = () => load();
    socket.on("invite:changed", reload);
    return () => socket.off("invite:changed", reload);
  }, [load]);

  const approve = async (id) => {
    try {
      await axiosInstance.post(`/users/${id}/approve`);
      setPending((current) => current.filter((user) => user._id !== id));
      toast.success("Member approved");
    } catch {
      toast.error("Could not approve");
    }
  };

  // Generate a temporary password for an account (migrated from Clerk or a
  // forgotten password). Shown once to the admin; auto-copied to clipboard.
  const resetPassword = async (id) => {
    try {
      const res = await axiosInstance.post(`/users/${id}/reset-password`);
      const tempPassword = res.data?.tempPassword || "";
      try {
        await navigator.clipboard.writeText(tempPassword);
        toast.success(`Temp password: ${tempPassword} — copied`, {
          duration: 12000,
        });
      } catch {
        toast.success(`Temp password: ${tempPassword}`, { duration: 12000 });
      }
    } catch {
      toast.error("Could not reset password");
    }
  };

  const [confirmDeleteId, setConfirmDeleteId] = useState(null);

  // Delete an approved member's account. Not offered for the owner/me rows,
  // and admins are refused by the server as a second guard.
  const deleteMember = async (id) => {
    setConfirmDeleteId(null);
    try {
      await axiosInstance.delete(`/users/${id}/reject`);
      setMembers((current) => current.filter((member) => member._id !== id));
      setPending((current) => current.filter((user) => user._id !== id));
      toast.success("Account deleted");
    } catch {
      toast.error("Could not delete that account");
    }
  };

  const reject = async (id) => {
    try {
      await axiosInstance.delete(`/users/${id}/reject`);
      setPending((current) => current.filter((user) => user._id !== id));
    } catch {
      toast.error("Could not reject");
    }
  };

  const createInvite = async () => {
    try {
      const res = await axiosInstance.post("/invites", {
        email: inviteEmail.trim(),
        role: inviteRole,
      });
      setInvites((current) => [
        { ...res.data, used: false, createdAt: new Date() },
        ...current,
      ]);
      setInviteEmail("");
      toast.success(`Invite code: ${res.data.code}`);
    } catch (error) {
      toast.error(error.response?.data?.message || "Could not create invite");
    }
  };

  const copyCode = async (code) => {
    try {
      await navigator.clipboard.writeText(code);
      toast.success("Code copied");
    } catch {
      toast.error("Could not copy");
    }
  };

  const deleteInvite = async (id) => {
    try {
      await axiosInstance.delete(`/invites/${id}`);
      setInvites((current) => current.filter((invite) => invite._id !== id));
      toast.success("Invite deleted");
    } catch (error) {
      toast.error(error.response?.data?.message || "Could not delete invite");
    }
  };

  const toggleRole = async (member) => {
    const nextRole = member.role === "admin" ? "member" : "admin";

    try {
      const res = await axiosInstance.patch(`/users/${member._id}/role`, {
        role: nextRole,
      });
      setMembers((current) =>
        current.map((item) =>
          item._id === member._id ? { ...item, role: res.data.role } : item,
        ),
      );
      toast.success(
        nextRole === "admin"
          ? `${member.fullName} is now an admin`
          : `${member.fullName} is now a member`,
      );
    } catch (error) {
      toast.error(error.response?.data?.message || "Could not change role");
    }
  };

  return (
    <div className="space-y-5">
      <section>
        <h3 className="mb-2 text-[13px] font-semibold">Waiting for approval</h3>
        {loading ? (
          <p className="text-[13px] text-muted">Loading…</p>
        ) : pending.length === 0 ? (
          <p className="text-[13px] text-muted">Nobody is waiting.</p>
        ) : (
          <div className="space-y-2">
            {pending.map((user) => (
              <div
                key={user._id}
                className="flex items-center gap-2.5 rounded-xl border border-border bg-surface/50 p-2.5"
              >
                <Avatar className="size-9 shrink-0">
                  <Avatar.Image alt={user.fullName} src={user.profilePic} />
                  <Avatar.Fallback className="text-[11px]">
                    {getInitials(user.fullName)}
                  </Avatar.Fallback>
                </Avatar>
                <div className="min-w-0 flex-1">
                  <p className="truncate text-[13px] font-medium">{user.fullName}</p>
                  <p className="truncate text-[11px] text-muted">{user.email}</p>
                </div>
                <button
                  type="button"
                  onClick={() => approve(user._id)}
                  className="flex size-8 items-center justify-center rounded-full bg-success/15 text-success"
                  aria-label="Approve"
                >
                  <CheckIcon className="size-4" />
                </button>
                <button
                  type="button"
                  onClick={() => reject(user._id)}
                  className="flex size-8 items-center justify-center rounded-full bg-danger/15 text-danger"
                  aria-label="Reject"
                >
                  <XIcon className="size-4" />
                </button>
              </div>
            ))}
          </div>
        )}
      </section>

      <section>
        <h3 className="mb-2 text-[13px] font-semibold">Family members</h3>
        {loading ? (
          <p className="text-[13px] text-muted">Loading…</p>
        ) : members.length === 0 ? (
          <p className="text-[13px] text-muted">No members yet.</p>
        ) : (
          <div className="space-y-2">
            {members.map((member) => (
              <div
                key={member._id}
                className="flex items-center gap-2.5 rounded-xl border border-border bg-surface/50 p-2.5"
              >
                <Avatar className="size-9 shrink-0">
                  <Avatar.Image alt={member.fullName} src={member.profilePic} />
                  <Avatar.Fallback className="text-[11px]">
                    {getInitials(member.fullName)}
                  </Avatar.Fallback>
                </Avatar>
                <div className="min-w-0 flex-1">
                  <p className="truncate text-[13px] font-medium">
                    {member.fullName}
                    {member._id === meId ? " (you)" : ""}
                  </p>
                  <p className="truncate text-[11px] text-muted">{member.email}</p>
                </div>

                {member.role === "admin" ? (
                  <span className="rounded-full bg-accent/15 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-accent">
                    Admin
                  </span>
                ) : null}

                {member._id === meId ? null : (
                  <button
                    type="button"
                    onClick={() => resetPassword(member._id)}
                    className="flex size-8 shrink-0 items-center justify-center rounded-full bg-surface text-muted transition hover:text-foreground"
                    aria-label="Reset password"
                    title="Reset password"
                  >
                    <KeyRoundIcon className="size-4" />
                  </button>
                )}

                {member._id === meId || member.role === "admin" ? null : confirmDeleteId === member._id ? (
                  <button
                    type="button"
                    onClick={() => deleteMember(member._id)}
                    className="shrink-0 rounded-full bg-danger px-3 py-1 text-[11px] font-semibold text-white"
                  >
                    Confirm?
                  </button>
                ) : (
                  <button
                    type="button"
                    onClick={() => {
                      setConfirmDeleteId(member._id);
                      // Safety: disarm automatically if they walk away.
                      setTimeout(
                        () => setConfirmDeleteId((current) =>
                          current === member._id ? null : current,
                        ),
                        4000,
                      );
                    }}
                    className="flex size-8 shrink-0 items-center justify-center rounded-full bg-surface text-muted transition hover:text-danger"
                    aria-label="Delete account"
                    title="Delete account"
                  >
                    <Trash2Icon className="size-4" />
                  </button>
                )}

                {member._id === meId ? null : (
                  <Button size="sm" variant="ghost" onPress={() => toggleRole(member)}>
                    {member.role === "admin" ? "Make member" : "Make admin"}
                  </Button>
                )}
              </div>
            ))}
          </div>
        )}
      </section>

      <section>
        <h3 className="mb-2 text-[13px] font-semibold">Invite a family member</h3>
        <div className="flex flex-wrap gap-2">
          <input
            value={inviteEmail}
            onChange={(event) => setInviteEmail(event.target.value)}
            placeholder="Email (optional)"
            className="min-w-40 flex-1 rounded-lg border border-border bg-surface px-3 py-2 text-[13px] outline-none focus:border-accent"
          />
          <select
            value={inviteRole}
            onChange={(event) => setInviteRole(event.target.value)}
            className="rounded-lg border border-border bg-surface px-2 py-2 text-[13px] outline-none focus:border-accent"
          >
            <option value="member">Member</option>
            <option value="admin">Admin</option>
          </select>
          <Button size="sm" variant="primary" onPress={createInvite}>
            <KeyRoundIcon className="size-4" /> Create
          </Button>
        </div>

        <div className="mt-3 space-y-2">
          {invites.length === 0 ? (
            <p className="text-[13px] text-muted">No invites yet.</p>
          ) : (
            invites.map((invite) => (
              <div
                key={invite._id}
                className="flex items-center gap-2 rounded-xl border border-border bg-surface/50 p-2.5"
              >
                <div className="min-w-0 flex-1">
                  <p className="font-mono text-[15px] font-semibold tracking-wider">
                    {invite.code}
                  </p>
                  <p className="truncate text-[11px] text-muted">
                    {[
                      invite.used
                        ? `Used by ${invite.usedBy}`
                        : invite.email || "Any family email",
                      invite.role,
                      invite.expiresAt
                        ? `expires ${new Date(invite.expiresAt).toLocaleDateString()}`
                        : "",
                    ]
                      .filter(Boolean)
                      .join(" · ")}
                  </p>
                </div>

                {invite.used ? null : (
                  <button
                    type="button"
                    onClick={() => copyCode(invite.code)}
                    className="text-muted hover:text-foreground"
                    aria-label="Copy invite code"
                  >
                    <CopyIcon className="size-4" />
                  </button>
                )}

                <button
                  type="button"
                  onClick={() => deleteInvite(invite._id)}
                  className="text-muted hover:text-danger"
                  aria-label="Delete invite code"
                >
                  <Trash2Icon className="size-4" />
                </button>
              </div>
            ))
          )}
        </div>
      </section>
    </div>
  );
}

export function FamilyHub({ state }) {
  const modal = state;
  const authUser = useAuthStore((store) => store.authUser);
  const isAdmin = authUser?.role === "admin";
  const [tab, setTab] = useState("board");

  return (
    <Modal.Root state={modal}>
      <Modal.Backdrop variant="opaque">
        <Modal.Container size="lg" scroll="inside" placement="center">
          <Modal.Dialog className="border border-border bg-background text-foreground">
            <Modal.Header className="flex flex-row items-center justify-between border-b border-border pb-3">
              <Modal.Heading className="text-lg font-semibold">Family hub</Modal.Heading>
              <Modal.CloseTrigger />
            </Modal.Header>

            <Modal.Body className="pt-2">
              <Tabs
                selectedKey={tab}
                onSelectionChange={(key) => setTab(String(key))}
                variant="secondary"
                className="flex flex-col"
              >
                <Tabs.ListContainer className="mb-3">
                  <Tabs.List className="w-full gap-0.5">
                    <Tabs.Tab id="board" className="flex-1 justify-center gap-1.5 text-[12px]">
                      <PinIcon className="size-3.5" /> Board
                    </Tabs.Tab>
                    <Tabs.Tab id="dates" className="flex-1 justify-center gap-1.5 text-[12px]">
                      <CakeIcon className="size-3.5" /> Dates
                    </Tabs.Tab>
                    <Tabs.Tab id="album" className="flex-1 justify-center gap-1.5 text-[12px]">
                      <ImageIcon className="size-3.5" /> Album
                    </Tabs.Tab>
                    {isAdmin ? (
                      <Tabs.Tab
                        id="members"
                        className="flex-1 justify-center gap-1.5 text-[12px]"
                      >
                        <UserCheckIcon className="size-3.5" /> Admin
                      </Tabs.Tab>
                    ) : null}
                  </Tabs.List>
                </Tabs.ListContainer>

                <Tabs.Panel id="board" className="outline-none">
                  <BoardTab />
                </Tabs.Panel>
                <Tabs.Panel id="dates" className="outline-none">
                  <DatesTab />
                </Tabs.Panel>
                <Tabs.Panel id="album" className="outline-none">
                  <AlbumTab />
                </Tabs.Panel>
                {isAdmin ? (
                  <Tabs.Panel id="members" className="outline-none">
                    <MembersTab />
                  </Tabs.Panel>
                ) : null}
              </Tabs>
            </Modal.Body>
          </Modal.Dialog>
        </Modal.Container>
      </Modal.Backdrop>
    </Modal.Root>
  );
}
