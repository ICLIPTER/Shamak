import { useMemo, useState } from "react";
import { Avatar, Button, Modal } from "@heroui/react";
import {
  CakeIcon,
  LogOutIcon,
  PhoneIcon,
  PlusIcon,
  Trash2Icon,
  UserRoundIcon,
} from "lucide-react";
import toast from "react-hot-toast";

import { axiosInstance } from "../../lib/axios";
import { useAuthStore } from "../../store/useAuthStore";
import { useChatStore } from "../../store/useChatStore";
import {
  conversationAvatar,
  conversationTitle,
  getInitials,
  isGroup,
} from "../../lib/chat";

function formatBirthday(value) {
  if (!value) return "";
  return new Date(value).toLocaleDateString([], {
    month: "long",
    day: "numeric",
  });
}

export function GroupInfoModal({ state, conversation, onLeft }) {
  const modal = state;
  const meId = useAuthStore((state) => state.authUser?._id);
  const myRole = useAuthStore((state) => state.authUser?.role);
  const users = useChatStore((state) => state.users);
  const getConversations = useChatStore((state) => state.getConversations);
  const removeConversation = useChatStore((state) => state.removeConversation);

  const [name, setName] = useState(conversation?.name || "");
  const [adding, setAdding] = useState(false);
  const [saving, setSaving] = useState(false);

  const group = isGroup(conversation);
  const isAdmin =
    (conversation?.admins || []).includes(meId) || myRole === "admin";

  const nonMembers = useMemo(() => {
    if (!conversation) return [];
    const memberIds = new Set((conversation.members || []).map((m) => m._id));
    return users.filter((user) => !memberIds.has(user._id));
  }, [users, conversation]);

  if (!conversation) return null;

  const refresh = async () => {
    await getConversations({ silent: true });
  };

  const saveName = async () => {
    if (!group || !name.trim() || name.trim() === conversation.name) return;
    setSaving(true);
    try {
      await axiosInstance.patch(`/conversations/${conversation._id}`, {
        name: name.trim(),
      });
      await refresh();
      toast.success("Group renamed");
    } catch (error) {
      toast.error(error.response?.data?.message || "Could not rename group");
    } finally {
      setSaving(false);
    }
  };

  const addMember = async (userId) => {
    try {
      await axiosInstance.post(`/conversations/${conversation._id}/members`, {
        memberIds: [userId],
      });
      await refresh();
      toast.success("Member added");
    } catch (error) {
      toast.error(error.response?.data?.message || "Could not add member");
    }
  };

  const removeMember = async (userId) => {
    try {
      await axiosInstance.delete(
        `/conversations/${conversation._id}/members/${userId}`,
      );
      await refresh();
      toast.success("Member removed");
    } catch (error) {
      toast.error(error.response?.data?.message || "Could not remove member");
    }
  };

  const leave = async () => {
    try {
      await axiosInstance.post(`/conversations/${conversation._id}/leave`);
      removeConversation(conversation._id);
      onLeft?.();
      modal.close();
      toast.success("You left the conversation");
    } catch (error) {
      toast.error(error.response?.data?.message || "Could not leave");
    }
  };

  return (
    <Modal.Root state={modal}>
      <Modal.Backdrop variant="opaque">
        <Modal.Container size="md" scroll="inside" placement="center">
          <Modal.Dialog className="border border-border bg-background text-foreground">
            <Modal.Header className="flex flex-row items-center justify-between border-b border-border pb-3">
              <Modal.Heading className="text-lg font-semibold">
                {group ? "Group details" : "Contact"}
              </Modal.Heading>
              <Modal.CloseTrigger />
            </Modal.Header>

            <Modal.Body className="space-y-4 pt-4">
              <div className="flex flex-col items-center gap-2 text-center">
                <Avatar className="size-20">
                  <Avatar.Image
                    alt={conversationTitle(conversation)}
                    src={conversationAvatar(conversation)}
                  />
                  <Avatar.Fallback className="text-xl font-semibold">
                    {getInitials(conversationTitle(conversation))}
                  </Avatar.Fallback>
                </Avatar>
                <p className="text-lg font-semibold">
                  {conversationTitle(conversation)}
                </p>
                {group ? (
                  <p className="text-[13px] text-muted">
                    {conversation.memberCount} members
                  </p>
                ) : (
                  <p className="text-[13px] text-muted">
                    {conversation.peer?.relation || conversation.peer?.email}
                  </p>
                )}
              </div>

              {!group && conversation.peer ? (
                <div className="space-y-2 rounded-xl border border-border p-3 text-[13px]">
                  {conversation.peer.relation ? (
                    <p className="flex items-center gap-2">
                      <UserRoundIcon className="size-4 text-muted" />
                      {conversation.peer.relation}
                    </p>
                  ) : null}
                  {conversation.peer.birthday ? (
                    <p className="flex items-center gap-2">
                      <CakeIcon className="size-4 text-muted" />
                      {formatBirthday(conversation.peer.birthday)}
                    </p>
                  ) : null}
                  {conversation.peer.phone ? (
                    <a
                      href={`tel:${conversation.peer.phone}`}
                      className="flex items-center gap-2 text-accent"
                    >
                      <PhoneIcon className="size-4" />
                      {conversation.peer.phone}
                    </a>
                  ) : null}
                  {conversation.peer.bio ? (
                    <p className="text-muted">{conversation.peer.bio}</p>
                  ) : null}
                </div>
              ) : null}

              {group ? (
                <>
                  {isAdmin ? (
                    <div>
                      <label className="mb-1.5 block text-[13px] font-medium">
                        Group name
                      </label>
                      <div className="flex gap-2">
                        <input
                          value={name}
                          onChange={(event) => setName(event.target.value)}
                          onBlur={saveName}
                          className="w-full rounded-xl border border-border bg-surface px-3 py-2 text-[14px] outline-none focus:border-accent"
                        />
                        <Button
                          variant="ghost"
                          isDisabled={saving || !name.trim()}
                          onPress={saveName}
                        >
                          Save
                        </Button>
                      </div>
                    </div>
                  ) : null}

                  <div>
                    <div className="mb-1.5 flex items-center justify-between">
                      <span className="text-[13px] font-medium">Members</span>
                      {isAdmin && nonMembers.length > 0 ? (
                        <button
                          type="button"
                          onClick={() => setAdding((value) => !value)}
                          className="flex items-center gap-1 text-[12px] font-medium text-accent"
                        >
                          <PlusIcon className="size-3.5" />
                          {adding ? "Done" : "Add"}
                        </button>
                      ) : null}
                    </div>

                    <div className="max-h-56 overflow-y-auto rounded-xl border border-border">
                      {(conversation.members || []).map((member) => (
                        <div
                          key={member._id}
                          className="flex items-center gap-2.5 border-b border-border px-3 py-2 last:border-0"
                        >
                          <Avatar className="size-8 shrink-0">
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
                          </div>
                          {(conversation.admins || []).includes(member._id) ? (
                            <span className="rounded-full bg-accent-soft px-2 py-0.5 text-[10px] font-semibold text-accent">
                              admin
                            </span>
                          ) : null}
                          {isAdmin && member._id !== meId ? (
                            <button
                              type="button"
                              onClick={() => removeMember(member._id)}
                              className="text-muted hover:text-danger"
                              aria-label={`Remove ${member.fullName}`}
                            >
                              <Trash2Icon className="size-4" />
                            </button>
                          ) : null}
                        </div>
                      ))}

                      {adding
                        ? nonMembers.map((user) => (
                            <button
                              key={user._id}
                              type="button"
                              onClick={() => addMember(user._id)}
                              className="flex w-full items-center gap-2.5 border-b border-border px-3 py-2 text-left last:border-0 hover:bg-surface"
                            >
                              <Avatar className="size-8 shrink-0">
                                <Avatar.Image alt={user.fullName} src={user.profilePic} />
                                <Avatar.Fallback className="text-[11px]">
                                  {getInitials(user.fullName)}
                                </Avatar.Fallback>
                              </Avatar>
                              <span className="flex-1 truncate text-[13px]">
                                {user.fullName}
                              </span>
                              <PlusIcon className="size-4 text-accent" />
                            </button>
                          ))
                        : null}
                    </div>
                  </div>
                </>
              ) : null}
            </Modal.Body>

            <Modal.Footer className="border-t border-border pt-3">
              {group ? (
                <Button variant="ghost" className="text-danger" onPress={leave}>
                  <LogOutIcon className="size-4" />
                  Leave group
                </Button>
              ) : (
                <Button variant="ghost" onPress={modal.close}>
                  Close
                </Button>
              )}
            </Modal.Footer>
          </Modal.Dialog>
        </Modal.Container>
      </Modal.Backdrop>
    </Modal.Root>
  );
}
