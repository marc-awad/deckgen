import { useEffect } from "react";
import { Link, NavLink, Outlet, useLocation } from "react-router";
import { APP_VERSION } from "../version";

// Message passed between pages, e.g. navigate("/", { state: { notice: "Deck supprimé." } })
function readNotice(state: unknown): string | null {
  return typeof state === "object" && state !== null && "notice" in state && typeof state.notice === "string"
    ? state.notice
    : null;
}

function navClass({ isActive }: { isActive: boolean }): string {
  const base = "rounded-md px-3 py-2 text-sm font-medium";
  return isActive
    ? `${base} bg-blue-50 text-blue-700`
    : `${base} text-slate-600 hover:bg-slate-100 hover:text-slate-900`;
}

export function Layout() {
  const location = useLocation();
  const notice = readNotice(location.state);

  // On each page change, move the focus to the page title (keyboard and screen reader users)
  useEffect(() => {
    document.querySelector<HTMLElement>("main h1")?.focus();
  }, [location.pathname]);

  return (
    <div className="min-h-screen bg-slate-50 text-slate-900">
      <header className="border-b border-slate-200 bg-white">
        <div className="mx-auto flex max-w-3xl flex-wrap items-center justify-between gap-2 px-4 py-3">
          <Link to="/" className="text-2xl font-bold text-blue-700">
            deckgen
          </Link>
          <nav aria-label="Navigation principale" className="flex gap-1">
            {/* NavLink sets aria-current="page" on the active link; "end": "/" only matches "/" */}
            <NavLink to="/" end className={navClass}>
              Mes decks
            </NavLink>
            <NavLink to="/new" className={navClass}>
              Nouveau deck
            </NavLink>
          </nav>
        </div>
      </header>

      <main className="mx-auto max-w-3xl px-4 py-6 sm:py-8">
        {/* Always rendered (the layout never unmounts), so a notice is announced on arrival */}
        <div aria-live="polite">
          {notice && (
            <p className="mb-4 rounded-lg border border-emerald-200 bg-emerald-50 p-3 text-emerald-900">
              {notice}
            </p>
          )}
        </div>
        <Outlet />
      </main>

      <footer className="mx-auto max-w-3xl px-4 pb-6 text-xs text-slate-500">
        deckgen v{APP_VERSION}
      </footer>
    </div>
  );
}
