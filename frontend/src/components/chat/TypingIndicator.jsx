import { useSelectedConversation } from "../../hooks/useSelectedConversation";

export function TypingIndicator() {
  const { typingUsers, activeConversation } = useSelectedConversation();

  if (typingUsers.length === 0) return null;

  const label =
    activeConversation?.type === "group"
      ? `${typingUsers.map((entry) => entry.name).join(", ")} ${
          typingUsers.length === 1 ? "is" : "are"
        } typing`
      : "typing";

  return (
    <div className="flex items-center gap-2 px-2 py-1 text-[12px] text-muted">
      <span className="flex items-center gap-1">
        {[0, 1, 2].map((index) => (
          <span
            key={index}
            className="size-1.5 animate-bounce rounded-full bg-muted"
            style={{ animationDelay: `${index * 120}ms` }}
          />
        ))}
      </span>
      <span>{label}</span>
    </div>
  );
}
