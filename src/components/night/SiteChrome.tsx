import { Link } from "@tanstack/react-router";
import { MessageCircle, Moon } from "lucide-react";
import { Wordmark } from "@/components/night/Brand";
import { cn } from "@/lib/utils";

export function SiteHeader({ className }: { className?: string }) {
  return (
    <header className={cn("sticky top-0 z-40 border-b border-border/60 bg-background/80 backdrop-blur-md", className)}>
      <div className="mx-auto flex h-16 max-w-5xl items-center justify-between px-4 sm:px-6">
        <Wordmark compact />
        <nav className="flex items-center gap-1 text-sm">
          <Link
            to="/inbound"
            className="inline-flex h-9 items-center gap-1.5 rounded-lg px-3 text-muted-foreground transition-colors hover:bg-secondary hover:text-foreground"
            activeProps={{ className: "text-foreground bg-secondary" }}
          >
            <MessageCircle className="h-4 w-4" />
            <span>Text Robin</span>
          </Link>
          <Link
            to="/backup"
            className="hidden h-9 items-center rounded-lg px-3 text-muted-foreground transition-colors hover:bg-secondary hover:text-foreground sm:inline-flex"
            activeProps={{ className: "text-foreground bg-secondary" }}
          >
            Backup list
          </Link>
          <Link
            to="/tonight"
            className="ml-1 inline-flex h-9 items-center gap-1.5 rounded-lg border border-border px-3 text-muted-foreground transition-colors hover:border-gold/40 hover:text-gold"
            activeProps={{ className: "text-gold border-gold/40" }}
          >
            <Moon className="h-4 w-4" />
            <span className="hidden sm:inline">Robin's door</span>
            <span className="sm:hidden">Robin</span>
          </Link>
        </nav>
      </div>
    </header>
  );
}

export function SiteFooter() {
  return (
    <footer className="mt-20 border-t border-border/60">
      <div className="mx-auto flex max-w-5xl flex-col gap-3 px-4 py-8 text-sm text-muted-foreground sm:flex-row sm:items-center sm:justify-between sm:px-6">
        <p>
          <span className="font-display text-foreground">Night Owl Sitting Co.</span> · Austin, TX · One sitter, a
          small circle of families.
        </p>
        <p className="tabular">Fri &amp; Sat · 6:00–11:00pm Central · $20 hold, released after the sit.</p>
      </div>
    </footer>
  );
}

export function PageShell({ children, className }: { children: React.ReactNode; className?: string }) {
  return (
    <div className="night-sky min-h-screen">
      <SiteHeader />
      <main className={cn("mx-auto w-full max-w-5xl px-4 pb-10 pt-8 sm:px-6", className)}>{children}</main>
      <SiteFooter />
    </div>
  );
}
