import { useMemo, useState } from "react";
import { Avatar, Button, Modal, SearchField } from "@heroui/react";
import { CheckIcon, UsersIcon } from "lucide-react";

import { useAuthStore } from "../../store/useAuthStore";
import { useChatStore } from "../../store/useChatStore";
import { getInitials } from "../../lib/chat";

export function NewChatModal({ state }) {
  const modal = state;
  const users = useChatStore((state) => state.users);
  const openDirectChat = useChatStore((state) => state.openDirectChat);
  const createConversation = useChatStore((state) => state.createConversation);

  const authUser = useAuthStore((state) => state.authUser);

  const [mode, setMode] = useState("direct");
  const [query, setQuery] = useState("");
  const [selected, setSelected] = useState([]);
  const [groupName, setGroupName] = useState("");
  const [saving, setSaving] = useState(false);

  const family = useMemo(
    () => users.filter((user) => user._id !== authUser?._id),
    [users, authUser?._id],
  );

  const filtered = family.filter((user) => {
    const term = query.trim().toLowerCase();
    if (!term) return true;
    return (
      user.fullName?.toLowerCase().includes(term) ||
      user.relation?.toLowerCase().includes(term) ||
      user.email?.toLowerCase().includes(term)
    );
  });

  const reset = () => {
    setMode("direct");
    setQuery("");
    setSelected([]);
    setGroupName("");
    setSaving(false);
  };

  const toggle = (userId) => {
    setSelected((current) =>
      current.includes(userId)
        ? current.filter((id) => id !== userId)
        : [...current, userId],
    );
  };

  const handlePick = async (userId) => {
    const conversation = await openDirectChat(userId);
    if (conversation) {
      reset();
      modal.close();
    }
  };

  const handleCreateGroup = async () => {
    if (selected.length === 0) return;
    setSaving(true);
    const conversation = await createConversation({
      type: "group",
      memberIds: selected,
      name: groupName.trim() || "Family group",
    });
    setSaving(false);

    if (conversation) {
      reset();
      modal.close();
    }
  };

  return (
    <Modal.Root state={modal}>
      <Modal.Backdrop variant="opaque">
        <Modal.Container size="md" scroll="inside" placement="center">
          <Modal.Dialog className="border border-border bg-background text-foreground">
            <Modal.Header className="flex flex-row items-center justify-between border-b border-border pb-3">
              <Modal.Heading className="text-lg font-semibold">New conversation</Modal.Heading>
              <Modal.CloseTrigger />
            </Modal.Header>

            <Modal.Body className="space-y-3 pt-3">
              <div className="flex rounded-xl bg-surface p-1">
                <button
                  type="button"
                  onClick={() => setMode("direct")}
                  className={`flex-1 rounded-lg px-3 py-1.5 text-[13px] font-medium ${
                    mode === "direct" ? "bg-background shadow-sm" : "text-muted"
                  }`}
                >
                  One person
                </button>
                <button
                  type="button"
                  onClick={() => setMode("group")}
                  className={`flex-1 rounded-lg px-3 py-1.5 text-[13px] font-medium ${
                    mode === "group" ? "bg-background shadow-sm" : "text-muted"
                  }`}
                >
                  Group
                </button>
              </div>

              {mode === "group" ? (
                <input
                  value={groupName}
                  onChange={(event) => setGroupName(event.target.value)}
                  placeholder="Group name (e.g. The Faraj Family)"
                  className="w-full rounded-xl border border-border bg-surface px-3 py-2 text-[14px] outline-none focus:border-accent"
                />
              ) : null}

              <SearchField
                fullWidth
                variant="secondary"
                value={query}
                onChange={setQuery}
              >
                <SearchField.Group className="rounded-xl">
                  <SearchField.SearchIcon />
                  <SearchField.Input placeholder="Search family" />
                  {query ? <SearchField.ClearButton /> : null}
                </SearchField.Group>
              </SearchField>

              <div className="max-h-[45vh] overflow-y-auto rounded-xl border border-border">
                {filtered.length === 0 ? (
                  <p className="px-4 py-6 text-center text-[13px] text-muted">
                    No family members found.
                  </p>
                ) : (
                  filtered.map((user) => {
                    const isSelected = selected.includes(user._id);
                    return (
                      <button
                        key={user._id}
                        type="button"
                        onClick={() =>
                          mode === "direct" ? handlePick(user._id) : toggle(user._id)
                        }
                        className={`flex w-full items-center gap-3 border-b border-border px-3 py-2.5 text-left last:border-0 ${
                          isSelected ? "bg-accent-soft" : "hover:bg-surface"
                        }`}
                      >
                        <Avatar className="size-10 shrink-0">
                          <Avatar.Image alt={user.fullName} src={user.profilePic} />
                          <Avatar.Fallback className="text-xs font-medium">
                            {getInitials(user.fullName)}
                          </Avatar.Fallback>
                        </Avatar>

                        <div className="min-w-0 flex-1">
                          <p className="truncate text-[14px] font-semibold">
                            {user.fullName}
                          </p>
                          <p className="truncate text-[12px] text-muted">
                            {user.relation || user.email}
                          </p>
                        </div>

                        {mode === "group" ? (
                          <span
                            className={`flex size-5 shrink-0 items-center justify-center rounded-full border ${
                              isSelected
                                ? "border-accent bg-accent text-accent-foreground"
                                : "border-border"
                            }`}
                          >
                            {isSelected ? <CheckIcon className="size-3" strokeWidth={3} /> : null}
                          </span>
                        ) : null}
                      </button>
                    );
                  })
                )}
              </div>
            </Modal.Body>

            {mode === "group" ? (
              <Modal.Footer className="flex items-center justify-between gap-2 border-t border-border pt-3">
                <p className="text-[12px] text-muted">
                  {selected.length} selected
                </p>
                <div className="flex gap-2">
                  <Button variant="ghost" onPress={modal.close}>
                    Cancel
                  </Button>
                  <Button
                    variant="primary"
                    isDisabled={selected.length === 0 || saving}
                    onPress={handleCreateGroup}
                  >
                    <UsersIcon className="size-4" />
                    {saving ? "Creating…" : "Create group"}
                  </Button>
                </div>
              </Modal.Footer>
            ) : null}
          </Modal.Dialog>
        </Modal.Container>
      </Modal.Backdrop>
    </Modal.Root>
  );
}
