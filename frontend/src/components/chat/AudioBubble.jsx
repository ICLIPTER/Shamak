import { useEffect, useRef, useState } from "react";
import { PauseIcon, PlayIcon } from "lucide-react";

import { formatDuration } from "../../lib/chat";

/** Compact, dependency-free voice note player. */
export function AudioBubble({ src, duration = 0, isMine = false }) {
  const audioRef = useRef(null);
  const [playing, setPlaying] = useState(false);
  const [progress, setProgress] = useState(0);
  const [total, setTotal] = useState(duration);

  useEffect(() => {
    const audio = audioRef.current;
    if (!audio) return undefined;

    const onTime = () => {
      if (audio.duration && Number.isFinite(audio.duration)) {
        setTotal(audio.duration);
      }
      setProgress(audio.currentTime);
    };
    const onEnd = () => {
      setPlaying(false);
      setProgress(0);
    };

    audio.addEventListener("timeupdate", onTime);
    audio.addEventListener("ended", onEnd);
    audio.addEventListener("loadedmetadata", onTime);

    return () => {
      audio.removeEventListener("timeupdate", onTime);
      audio.removeEventListener("ended", onEnd);
      audio.removeEventListener("loadedmetadata", onTime);
    };
  }, []);

  const toggle = () => {
    const audio = audioRef.current;
    if (!audio) return;

    if (playing) {
      audio.pause();
      setPlaying(false);
    } else {
      audio.play().then(() => setPlaying(true)).catch(() => setPlaying(false));
    }
  };

  const percent = total > 0 ? Math.min(100, (progress / total) * 100) : 0;

  return (
    <div className="flex min-w-44 items-center gap-2.5 py-0.5">
      <audio ref={audioRef} src={src} preload="metadata" />

      <button
        type="button"
        onClick={toggle}
        className={`flex size-9 shrink-0 items-center justify-center rounded-full ${
          isMine ? "bg-accent-foreground/20" : "bg-accent text-accent-foreground"
        }`}
        aria-label={playing ? "Pause voice message" : "Play voice message"}
      >
        {playing ? (
          <PauseIcon className="size-4" />
        ) : (
          <PlayIcon className="size-4" />
        )}
      </button>

      <div className="flex-1">
        <div
          className={`h-1.5 overflow-hidden rounded-full ${
            isMine ? "bg-accent-foreground/25" : "bg-border"
          }`}
        >
          <div
            className={`h-full rounded-full transition-[width] ${
              isMine ? "bg-accent-foreground" : "bg-accent"
            }`}
            style={{ width: `${percent}%` }}
          />
        </div>
        <p
          className={`mt-1 text-[11px] tabular-nums ${
            isMine ? "text-accent-foreground/75" : "text-muted"
          }`}
        >
          {formatDuration(playing || progress ? progress : total)}
        </p>
      </div>
    </div>
  );
}
