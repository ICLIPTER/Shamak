import { useEffect, useRef } from "react";
import { Button, TextArea } from "@heroui/react";
import {
  ImageIcon,
  LoaderIcon,
  MicIcon,
  SendHorizontalIcon,
  SquareIcon,
  Trash2Icon,
  XIcon,
} from "lucide-react";

import useKeyboardSound from "../../hooks/useKeyboardSound";
import { useVoiceRecorder } from "../../hooks/useVoiceRecorder";
import { useChatStore } from "../../store/useChatStore";
import { useSelectedConversation } from "../../hooks/useSelectedConversation";
import { formatDuration } from "../../lib/chat";
import { compressImage } from "../../lib/compress";
import { PollModal } from "./PollModal";

export function ChatComposer() {
  const composerText = useChatStore((state) => state.composerText);
  const isSoundEnabled = useChatStore((state) => state.isSoundEnabled);
  const isSendingMedia = useChatStore((state) => state.isSendingMedia);
  const mediaUploadProgress = useChatStore((state) => state.mediaUploadProgress);
  const replyTo = useChatStore((state) => state.replyTo);
  const editingMessage = useChatStore((state) => state.editingMessage);

  const setComposerText = useChatStore((state) => state.setComposerText);
  const sendTextMessage = useChatStore((state) => state.sendTextMessage);
  const sendMediaMessage = useChatStore((state) => state.sendMediaMessage);
  const sendVoiceMessage = useChatStore((state) => state.sendVoiceMessage);
  const editMessage = useChatStore((state) => state.editMessage);
  const cancelReply = useChatStore((state) => state.cancelReply);
  const cancelEditing = useChatStore((state) => state.cancelEditing);
  const sendTyping = useChatStore((state) => state.sendTyping);

  const { activeConversationId } = useSelectedConversation();
  const { playRandomKeyStrokeSound } = useKeyboardSound();
  const recorder = useVoiceRecorder();

  const mediaInputRef = useRef(null);
  const typingTimerRef = useRef(null);

  const playSoundIfEnabled = () => {
    if (isSoundEnabled) playRandomKeyStrokeSound();
  };

  const stopTyping = () => {
    if (typingTimerRef.current) clearTimeout(typingTimerRef.current);
    typingTimerRef.current = null;
    sendTyping(activeConversationId, false);
  };

  useEffect(() => stopTyping, [activeConversationId]); // eslint-disable-line react-hooks/exhaustive-deps

  const handleSend = async () => {
    if (!activeConversationId) return;
    stopTyping();

    const didSend = editingMessage
      ? await editMessage(editingMessage._id, composerText)
      : await sendTextMessage(activeConversationId);

    if (didSend) playSoundIfEnabled();
  };

  const handleComposerTextChange = (event) => {
    setComposerText(event.target.value);
    playSoundIfEnabled();

    if (!activeConversationId) return;

    sendTyping(activeConversationId, true);
    if (typingTimerRef.current) clearTimeout(typingTimerRef.current);
    typingTimerRef.current = setTimeout(() => {
      sendTyping(activeConversationId, false);
    }, 1800);
  };

  const handleMediaPick = async (event) => {
    const file = event.target.files?.[0];
    event.target.value = "";
    if (!file) return;

    // Shrink photos before upload so sends are fast on any connection.
    const compressed = await compressImage(file);

    const didSend = await sendMediaMessage({
      conversationId: activeConversationId,
      file: compressed,
    });

    if (didSend) playSoundIfEnabled();
  };

  const handleStartRecording = async () => {
    await recorder.start();
  };

  const handleStopAndSend = async () => {
    const duration = recorder.seconds;
    const blob = await recorder.stop();
    if (!blob || blob.size === 0) return;

    const didSend = await sendVoiceMessage({
      conversationId: activeConversationId,
      blob,
      duration,
    });

    if (didSend) playSoundIfEnabled();
  };

  const canSend = composerText.trim().length > 0;

  return (
    <footer className="shrink-0 border-t border-border px-1.5 pb-2 pt-2 sm:px-2">
      {isSendingMedia ? (
        <div className="mx-auto mb-2 flex max-w-full items-center gap-2 rounded-xl border border-border bg-surface px-3 py-2 text-sm text-muted">
          <LoaderIcon className="size-4 shrink-0 animate-spin text-accent" strokeWidth={2} aria-hidden />
          <span className="truncate">
            {mediaUploadProgress > 0 && mediaUploadProgress < 100
              ? `Uploading… ${mediaUploadProgress}%`
              : "Uploading…"}
          </span>
        </div>
      ) : null}

      {editingMessage ? (
        <div className="mx-auto mb-2 flex max-w-full items-start gap-2 rounded-xl border-l-2 border-accent bg-surface px-3 py-2">
          <div className="min-w-0 flex-1">
            <p className="text-[11px] font-semibold text-accent">Editing message</p>
            <p className="truncate text-[13px] text-muted">{editingMessage.text}</p>
          </div>
          <button
            type="button"
            onClick={cancelEditing}
            className="shrink-0 text-muted hover:text-foreground"
            aria-label="Cancel edit"
          >
            <XIcon className="size-4" />
          </button>
        </div>
      ) : null}

      {replyTo && !editingMessage ? (
        <div className="mx-auto mb-2 flex max-w-full items-start gap-2 rounded-xl border-l-2 border-accent bg-surface px-3 py-2">
          <div className="min-w-0 flex-1">
            <p className="text-[11px] font-semibold text-accent">
              Replying to {replyTo.sender?.fullName || "message"}
            </p>
            <p className="truncate text-[13px] text-muted">
              {replyTo.text || (replyTo.image ? "📷 Photo" : replyTo.audio ? "🎙️ Voice message" : replyTo.video ? "🎥 Video" : "Poll")}
            </p>
          </div>
          <button
            type="button"
            onClick={cancelReply}
            className="shrink-0 text-muted hover:text-foreground"
            aria-label="Cancel reply"
          >
            <XIcon className="size-4" />
          </button>
        </div>
      ) : null}

      {recorder.isRecording ? (
        <div className="mx-auto flex w-full items-center gap-2 rounded-2xl border border-border bg-surface px-3 py-2">
          <span className="size-2.5 animate-pulse rounded-full bg-danger" aria-hidden />
          <span className="text-[13px] font-medium tabular-nums">
            {formatDuration(recorder.seconds)}
          </span>
          <span className="flex-1 text-[13px] text-muted">Recording voice message…</span>

          <Button
            variant="ghost"
            size="sm"
            isIconOnly
            onPress={recorder.cancel}
            aria-label="Discard recording"
          >
            <Trash2Icon className="size-4.5 text-danger" />
          </Button>

          <Button
            variant="primary"
            size="sm"
            isIconOnly
            onPress={handleStopAndSend}
            aria-label="Send voice message"
          >
            <SquareIcon className="size-4" />
          </Button>
        </div>
      ) : (
        <div className="mx-auto flex w-full items-end gap-1 px-0.5 sm:gap-1.5 sm:px-1">
          <input
            ref={mediaInputRef}
            type="file"
            accept="image/*,video/*"
            className="sr-only"
            disabled={isSendingMedia}
            tabIndex={-1}
            aria-hidden
            onChange={handleMediaPick}
          />

          <Button
            variant="ghost"
            size="sm"
            isIconOnly
            isDisabled={isSendingMedia}
            className="size-9 shrink-0 touch-manipulation self-end text-accent"
            aria-label="Attach media"
            onPress={() => mediaInputRef.current?.click()}
          >
            <ImageIcon className="size-5 sm:size-6" strokeWidth={2} />
          </Button>

          <PollModal conversationId={activeConversationId} />

          <TextArea
            fullWidth
            variant="secondary"
            placeholder={editingMessage ? "Edit your message" : "Shamak"}
            rows={1}
            value={composerText}
            onChange={handleComposerTextChange}
            onBlur={stopTyping}
            onKeyDown={(event) => {
              if (event.key === "Enter" && !event.shiftKey) {
                event.preventDefault();
                handleSend();
              }
              if (event.key === "Escape") {
                if (editingMessage) cancelEditing();
                else if (replyTo) cancelReply();
              }
            }}
            className="flex-1 rounded-full"
          />

          {!canSend ? (
            <Button
              variant="ghost"
              size="sm"
              isIconOnly
              isDisabled={isSendingMedia}
              className="size-9 shrink-0 text-accent"
              aria-label="Record voice message"
              onPress={handleStartRecording}
            >
              <MicIcon className="size-5" />
            </Button>
          ) : null}

          <Button
            variant="primary"
            isIconOnly
            isDisabled={!canSend}
            onPress={handleSend}
            aria-label="Send message"
          >
            <SendHorizontalIcon className="size-5" />
          </Button>
        </div>
      )}

      {recorder.error ? (
        <p className="mt-1 text-center text-[11px] text-danger">{recorder.error}</p>
      ) : null}
    </footer>
  );
}
