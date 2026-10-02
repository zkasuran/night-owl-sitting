import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import {
  Outlet,
  Link,
  createRootRouteWithContext,
  useRouter,
  HeadContent,
  Scripts,
  type ErrorComponentProps,
} from "@tanstack/react-router";
import { useEffect, type ReactNode } from "react";

import appCss from "../styles.css?url";
import { reportLovableError } from "../lib/lovable-error-reporting";
import { Toaster } from "@/components/ui/sonner";
import { OwlMark } from "@/components/night/Brand";

function NotFoundComponent() {
  return (
    <div className="night-sky flex min-h-screen items-center justify-center px-4">
      <div className="card-night max-w-md p-8 text-center animate-fade-up">
        <OwlMark className="mx-auto h-12 w-12 text-gold" />
        <h1 className="mt-5 text-3xl font-medium text-foreground">This page went to bed.</h1>
        <p className="mt-2 text-sm text-muted-foreground">
          The link you followed doesn't lead anywhere. Robin's calendar is still open, though.
        </p>
        <div className="mt-6">
          <Link
            to="/"
            className="inline-flex h-11 items-center justify-center rounded-xl bg-primary px-5 text-sm font-medium text-primary-foreground shadow-soft transition-all hover:shadow-lamp"
          >
            Back to the front door
          </Link>
        </div>
      </div>
    </div>
  );
}

function ErrorComponent({ error, reset }: ErrorComponentProps) {
  console.error(error);
  const router = useRouter();
  useEffect(() => {
    reportLovableError(error, { boundary: "tanstack_root_error_component" });
  }, [error]);

  return (
    <div className="night-sky flex min-h-screen items-center justify-center px-4">
      <div className="card-night max-w-md p-8 text-center animate-fade-up">
        <OwlMark className="mx-auto h-12 w-12 text-gold" />
        <h1 className="mt-5 text-2xl font-medium text-foreground">Something flickered.</h1>
        <p className="mt-2 text-sm text-muted-foreground">
          The page didn't load properly. Try again, or head back to the front door.
        </p>
        <div className="mt-6 flex flex-wrap justify-center gap-2">
          <button
            onClick={() => {
              router.invalidate();
              reset();
            }}
            className="inline-flex h-11 items-center justify-center rounded-xl bg-primary px-5 text-sm font-medium text-primary-foreground shadow-soft transition-all hover:shadow-lamp"
          >
            Try again
          </button>
          <a
            href="/"
            className="inline-flex h-11 items-center justify-center rounded-xl border border-border px-5 text-sm font-medium text-foreground transition-colors hover:bg-secondary"
          >
            Front door
          </a>
        </div>
      </div>
    </div>
  );
}

export const Route = createRootRouteWithContext<{ queryClient: QueryClient }>()({
  head: () => ({
    meta: [
      { charSet: "utf-8" },
      { name: "viewport", content: "width=device-width, initial-scale=1, viewport-fit=cover" },
      { name: "theme-color", content: "#0E1220" },
      { name: "author", content: "Night Owl Sitting Co." },
      { property: "og:type", content: "website" },
      { property: "og:site_name", content: "Night Owl Sitting Co." },
      { name: "twitter:card", content: "summary_large_image" },
    ],
    links: [
      { rel: "preconnect", href: "https://fonts.googleapis.com" },
      { rel: "preconnect", href: "https://fonts.gstatic.com", crossOrigin: "anonymous" },
      {
        rel: "stylesheet",
        href: "https://fonts.googleapis.com/css2?family=Fraunces:ital,opsz,wght,SOFT,WONK@0,9..144,300..700,0..100,0..1;1,9..144,300..700,0..100,0..1&family=Inter:wght@400;500;600&display=swap",
      },
      { rel: "stylesheet", href: appCss },
      { rel: "icon", href: "/favicon.ico", type: "image/x-icon" },
      { rel: "apple-touch-icon", href: "/apple-touch-icon.png" },
    ],
  }),
  shellComponent: RootShell,
  component: RootComponent,
  notFoundComponent: NotFoundComponent,
  errorComponent: ErrorComponent,
});

function RootShell({ children }: { children: ReactNode }) {
  return (
    <html lang="en" className="dark">
      <head>
        <HeadContent />
      </head>
      <body>
        {children}
        <Scripts />
      </body>
    </html>
  );
}

function RootComponent() {
  const { queryClient } = Route.useRouteContext();

  return (
    <QueryClientProvider client={queryClient}>
      {/* Required: nested routes render here. Removing <Outlet /> breaks all child routes. */}
      <Outlet />
      <Toaster position="top-center" richColors={false} />
    </QueryClientProvider>
  );
}
