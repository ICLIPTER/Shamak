import { useEffect, useState } from "react";
import { Button, Modal } from "@heroui/react";
import { LoaderIcon, PinIcon } from "lucide-react";

import { axiosInstance } from "../../lib/axios";
import { formatDayLabel } from "../../lib/chat";
import { useChatStore } from "../../store/useChatStore";

function jumpToMessage(messageId, close) {
  close();
  requestAnimationFrame(() => {
    const element = document.getElementById(`msg-${messageId}`);
    element?.scrollIntoView({ behavior: "smooth", block: "center" });
    element?.classList.add("ring-2", "ring-accent", "rounded-2xl");
    setTimeout(() => {
      element?.classList.remove("ring-2", "ring-accent", "rounded-2xl");
    }, 1600);
  });
}

function PinnedContent({ modal, conversationId }) {
  const conversations = useChatStore((state) => state.conversations);
  const [messages, setMessages] = useState([]);
  const [loading, setLoading] = useState(true);

  const pinnedIds =
    conversations.find((conversation) => conversation._id === conversationId)
      ?.pinnedMessages || [];

  useEffect(() => {
    let cancelled = false;

    axiosInstance
      .get(`/conversations/${conversationId}/pins`)
      .then((res) => {
        if (!cancelled) setMessages(res.data);
      })
      .catch(() => {
        if (!cancelled) setMessages([]);
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });

    return () => {
      cancelled = true;
    };
  }, [conversationId, pinnedIds.length]);

  return (
    <>
      <Modal.Header className="flex flex-row items-center justify-between border-b border-border pb-3">
        <Modal.Heading className="flex items-center gap-2 text-lg font-semibold">
          <PinIcon className="size-4" /> Pinned messages
        </Modal.Heading>
        <Modal.CloseTrigger />
      </Modal.Header>

      <Modal.Body className="space-y-2 pt-4">
        {loading ? (
          <p className="flex items-center justify-center gap-2 py-6 text-center text-[13px] text-muted">
            <LoaderIcon className="size-3.5 animate-spin" /> Loading…
          </p>
        ) : messages.length === 0 ? (
          <p className="py-6 text-center text-[13px] text-muted">
            Nothing pinned in this chat yet.
          </p>
        ) : (
          messages.map((message) => (
            <button
              key={message._id}
              type="button"
              onClick={() => jumpToMessage(message._id, modal.close)}
              className="w-full rounded-xl border border-border bg-surface/60 p-3 text-left hover:border-accent/60"
            >
              <div className="flex items-center justify-between gap-2">
                <span className="text-[12px] font-semibold text-accent">
                  {message.sender?.fullName || "Member"}
                </span>
                <span className="text-[11px] text-muted">
                  {formatDayLabel(message.createdAt)}
                </span>
              </div>
              <p className="mt-1 line-clamp-3 text-[13px]">
                {message.text ||
                  (message.image
                    ? "📷 Photo"
                    : message.audio
                      ? "🎙️ Voice message"
                      : message.video
                        ? "🎥 Video"
                        : "Poll")}
              </p>
            </button>
          ))
        )}
      </Modal.Body>

      <Modal.Footer className="border-t border-border pt-3">
        <Button variant="ghost" onPress={modal.close}>
          Close
        </Button>
      </Modal.Footer>
    </>
  );
}

export function PinnedMessagesModal({ state, conversationId }) {
  const modal = state;

  return (
    <Modal.Root state={modal}>
      <Modal.Backdrop variant="opaque">
        <Modal.Container size="md" scroll="inside" placement="center">
          <Modal.Dialog className="border border-border bg-background text-foreground">
            {modal.isOpen ? (
              <PinnedContent modal={modal} conversationId={conversationId} />
            ) : null}
          </Modal.Dialog>
        </Modal.Container>
      </Modal.Backdrop>
    </Modal.Root>
  );
}
