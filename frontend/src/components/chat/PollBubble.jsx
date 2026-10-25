import { useAuthStore } from "../../store/useAuthStore";
import { useChatStore } from "../../store/useChatStore";

export function PollBubble({ message, isMine }) {
  const votePoll = useChatStore((state) => state.votePoll);
  const meId = useAuthStore((state) => state.authUser?._id);

  const poll = message.poll;
  if (!poll) return null;

  const totalVotes = poll.options.reduce(
    (sum, option) => sum + option.votes.length,
    0,
  );

  return (
    <div className="min-w-56 max-w-full">
      <p className="mb-1.5 text-[11px] font-semibold uppercase tracking-wide opacity-70">
        Poll
      </p>
      <p className="mb-2 font-semibold leading-snug">{poll.question}</p>

      <div className="space-y-1.5">
        {poll.options.map((option) => {
          const votes = option.votes.length;
          const mine = option.votes.includes(meId);
          const percent = totalVotes ? Math.round((votes / totalVotes) * 100) : 0;

          return (
            <button
              key={option.id}
              type="button"
              disabled={poll.closed || message.deletedAt}
              onClick={() => votePoll(message._id, option.id)}
              className={`relative w-full overflow-hidden rounded-lg border px-2.5 py-1.5 text-left text-[13px] transition-colors ${
                isMine
                  ? "border-accent-foreground/30"
                  : "border-border hover:border-accent/60"
              } ${poll.closed ? "opacity-70" : ""}`}
            >
              <span
                className={`absolute inset-y-0 left-0 ${
                  isMine ? "bg-accent-foreground/20" : "bg-accent-soft"
                }`}
                style={{ width: `${percent}%` }}
                aria-hidden
              />
              <span className="relative flex items-center justify-between gap-2">
                <span className="flex items-center gap-1.5">
                  <span
                    className={`flex size-3.5 items-center justify-center rounded-full border ${
                      mine
                        ? isMine
                          ? "border-accent-foreground bg-accent-foreground text-accent"
                          : "border-accent bg-accent text-accent-foreground"
                        : "border-current opacity-50"
                    }`}
                    aria-hidden
                  >
                    {mine ? <span className="size-1.5 rounded-full bg-current" /> : null}
                  </span>
                  <span className="font-medium">{option.text}</span>
                </span>
                <span className="shrink-0 tabular-nums opacity-75">{votes}</span>
              </span>
            </button>
          );
        })}
      </div>

      <p className={`mt-1.5 text-[11px] ${isMine ? "text-accent-foreground/70" : "text-muted"}`}>
        {totalVotes} {totalVotes === 1 ? "vote" : "votes"}
        {poll.multiple ? " · multiple choice" : ""}
        {poll.closed ? " · closed" : ""}
      </p>
    </div>
  );
}
