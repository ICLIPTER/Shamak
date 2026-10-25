import { useEffect, useState } from "react";
import { Button, Modal, SearchField } from "@heroui/react";

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

function SearchContent({ modal, conversationId }) {
  const searchMessages = useChatStore((store) => store.searchMessages);
  const clearSearch = useChatStore((store) => store.clearSearch);
  const searchResults = useChatStore((store) => store.searchResults);
  const isSearching = useChatStore((store) => store.isSearching);

  const [query, setQuery] = useState("");

  useEffect(() => {
    const term = query.trim();

    if (term.length < 2) {
      const timer = setTimeout(() => clearSearch(), 0);
      return () => clearTimeout(timer);
    }

    const timer = setTimeout(() => searchMessages(term, conversationId), 250);
    return () => clearTimeout(timer);
  }, [query, conversationId, searchMessages, clearSearch]);

  return (
    <>
      <Modal.Header className="flex flex-row items-center justify-between border-b border-border pb-3">
        <Modal.Heading className="text-lg font-semibold">Search this chat</Modal.Heading>
        <Modal.CloseTrigger />
      </Modal.Header>

      <Modal.Body className="space-y-3 pt-3">
        <SearchField fullWidth variant="secondary" value={query} onChange={setQuery}>
          <SearchField.Group className="rounded-xl">
            <SearchField.SearchIcon />
            <SearchField.Input placeholder="Search messages" />
            {query ? <SearchField.ClearButton /> : null}
          </SearchField.Group>
        </SearchField>

        <div className="max-h-[50vh] space-y-2 overflow-y-auto">
          {isSearching ? (
            <p className="py-4 text-center text-[13px] text-muted">Searching…</p>
          ) : query.trim().length < 2 ? (
            <p className="py-4 text-center text-[13px] text-muted">
              Type at least 2 characters.
            </p>
          ) : searchResults.length === 0 ? (
            <p className="py-4 text-center text-[13px] text-muted">
              No messages found.
            </p>
          ) : (
            searchResults.map((message) => (
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
                <p className="mt-1 line-clamp-2 text-[13px]">{message.text}</p>
              </button>
            ))
          )}
        </div>
      </Modal.Body>

      <Modal.Footer className="border-t border-border pt-3">
        <Button variant="ghost" onPress={modal.close}>
          Close
        </Button>
      </Modal.Footer>
    </>
  );
}

export function MessageSearchModal({ state, conversationId }) {
  const modal = state;

  return (
    <Modal.Root state={modal}>
      <Modal.Backdrop variant="opaque">
        <Modal.Container size="md" scroll="inside" placement="center">
          <Modal.Dialog className="border border-border bg-background text-foreground">
            {modal.isOpen ? (
              <SearchContent modal={modal} conversationId={conversationId} />
            ) : null}
          </Modal.Dialog>
        </Modal.Container>
      </Modal.Backdrop>
    </Modal.Root>
  );
}
