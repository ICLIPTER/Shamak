import { useState } from "react";
import { Button, Modal, useOverlayState } from "@heroui/react";
import { BarChart3Icon, PlusIcon, Trash2Icon } from "lucide-react";

import { useChatStore } from "../../store/useChatStore";

export function PollModal({ conversationId }) {
  const modal = useOverlayState();
  const createPoll = useChatStore((state) => state.createPoll);

  const [question, setQuestion] = useState("");
  const [options, setOptions] = useState(["", ""]);
  const [multiple, setMultiple] = useState(false);
  const [saving, setSaving] = useState(false);

  const reset = () => {
    setQuestion("");
    setOptions(["", ""]);
    setMultiple(false);
  };

  const handleCreate = async () => {
    const cleanOptions = options.map((option) => option.trim()).filter(Boolean);
    if (!question.trim() || cleanOptions.length < 2) return;

    setSaving(true);
    const ok = await createPoll(conversationId, {
      question: question.trim(),
      options: cleanOptions,
      multiple,
    });
    setSaving(false);

    if (ok) {
      reset();
      modal.close();
    }
  };

  return (
    <Modal.Root state={modal}>
      <Modal.Trigger>
        <Button
          variant="ghost"
          size="sm"
          isIconOnly
          aria-label="Create a poll"
          className="hidden shrink-0 text-accent sm:flex"
        >
          <BarChart3Icon className="size-5" strokeWidth={2} />
        </Button>
      </Modal.Trigger>

      <Modal.Backdrop variant="opaque">
        <Modal.Container size="md" scroll="inside" placement="center">
          <Modal.Dialog className="border border-border bg-background text-foreground">
            <Modal.Header className="flex flex-row items-center justify-between border-b border-border pb-3">
              <Modal.Heading className="text-lg font-semibold">New poll</Modal.Heading>
              <Modal.CloseTrigger />
            </Modal.Header>

            <Modal.Body className="space-y-4 pt-4">
              <label className="block">
                <span className="mb-1.5 block text-[13px] font-medium">Question</span>
                <input
                  value={question}
                  onChange={(event) => setQuestion(event.target.value)}
                  placeholder="Where should we go for dinner?"
                  className="w-full rounded-xl border border-border bg-surface px-3 py-2 text-[15px] outline-none focus:border-accent"
                />
              </label>

              <div>
                <span className="mb-1.5 block text-[13px] font-medium">Options</span>
                <div className="space-y-2">
                  {options.map((option, index) => (
                    <div key={index} className="flex items-center gap-2">
                      <input
                        value={option}
                        onChange={(event) =>
                          setOptions((current) =>
                            current.map((value, i) =>
                              i === index ? event.target.value : value,
                            ),
                          )
                        }
                        placeholder={`Option ${index + 1}`}
                        className="w-full rounded-xl border border-border bg-surface px-3 py-2 text-[14px] outline-none focus:border-accent"
                      />
                      {options.length > 2 ? (
                        <button
                          type="button"
                          onClick={() =>
                            setOptions((current) =>
                              current.filter((_, i) => i !== index),
                            )
                          }
                          className="shrink-0 text-muted hover:text-danger"
                          aria-label="Remove option"
                        >
                          <Trash2Icon className="size-4" />
                        </button>
                      ) : null}
                    </div>
                  ))}
                </div>

                {options.length < 10 ? (
                  <button
                    type="button"
                    onClick={() => setOptions((current) => [...current, ""])}
                    className="mt-2 flex items-center gap-1 text-[13px] font-medium text-accent"
                  >
                    <PlusIcon className="size-4" /> Add option
                  </button>
                ) : null}
              </div>

              <label className="flex items-center gap-2 text-[13px]">
                <input
                  type="checkbox"
                  checked={multiple}
                  onChange={(event) => setMultiple(event.target.checked)}
                  className="size-4 accent-[var(--accent)]"
                />
                Allow multiple answers
              </label>
            </Modal.Body>

            <Modal.Footer className="flex justify-end gap-2 border-t border-border pt-3">
              <Button variant="ghost" onPress={modal.close}>
                Cancel
              </Button>
              <Button
                variant="primary"
                isDisabled={!question.trim() || saving}
                onPress={handleCreate}
              >
                {saving ? "Creating…" : "Create poll"}
              </Button>
            </Modal.Footer>
          </Modal.Dialog>
        </Modal.Container>
      </Modal.Backdrop>
    </Modal.Root>
  );
}
