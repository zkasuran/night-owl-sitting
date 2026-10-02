import { Link } from "@tanstack/react-router";
import { cn } from "@/lib/utils";

/** A small owl on a crescent — the lamp in the window. */
export function OwlMark({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 64 64" fill="none" className={cn("h-8 w-8", className)} aria-hidden="true">
      <path
        d="M46 8c-9 3-15 11-15 21 0 12 9 22 21 22 3 0 6-.6 8-1.6C56 56 47 62 37 62 21.5 62 9 49.5 9 34S21.5 6 37 6c3.2 0 6.2.7 9 2Z"
        fill="currentColor"
        opacity="0.28"
      />
      <path
        d="M22 27c0-4 2-8 5-10l-1-6 5 4h6l5-4-1 6c3 2 5 6 5 10v9c0 7-5 12-12 12s-12-5-12-12v-9Z"
        fill="currentColor"
      />
      <circle cx="28.5" cy="30" r="4.2" fill="oklch(0.1858 0.0294 271.15)" />
      <circle cx="39.5" cy="30" r="4.2" fill="oklch(0.1858 0.0294 271.15)" />
      <circle cx="29.6" cy="29" r="1.5" fill="currentColor" />
      <circle cx="40.6" cy="29" r="1.5" fill="currentColor" />
      <path d="M34 34.5l-2.4 3h4.8l-2.4-3Z" fill="oklch(0.1858 0.0294 271.15)" />
    </svg>
  );
}

export function Wordmark({ className, compact = false }: { className?: string; compact?: boolean }) {
  return (
    <Link to="/" className={cn("group inline-flex items-center gap-2.5", className)} aria-label="Night Owl Sitting Co. home">
      <span className="grid h-9 w-9 place-items-center rounded-xl bg-gold-soft text-gold ring-1 ring-gold/25 transition-shadow group-hover:lamp-glow">
        <OwlMark className="h-6 w-6" />
      </span>
      <span className="font-display text-lg leading-none text-foreground">
        Night Owl <span className={cn("text-muted-foreground", compact && "hidden sm:inline")}>Sitting Co.</span>
      </span>
    </Link>
  );
}
