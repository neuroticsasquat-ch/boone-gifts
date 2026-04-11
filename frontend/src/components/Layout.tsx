import { useState, useEffect } from "react";
import { Link, Outlet, useLocation } from "react-router";
import { useAuth } from "../hooks/useAuth";

export function Layout() {
  const { user, logout } = useAuth();
  const [drawerOpen, setDrawerOpen] = useState(false);
  const location = useLocation();

  // Close drawer on navigation
  useEffect(() => {
    setDrawerOpen(false);
  }, [location.pathname]);

  // Close drawer on Escape key
  useEffect(() => {
    if (!drawerOpen) return;
    const handler = (e: KeyboardEvent) => {
      if (e.key === "Escape") setDrawerOpen(false);
    };
    document.addEventListener("keydown", handler);
    return () => document.removeEventListener("keydown", handler);
  }, [drawerOpen]);

  return (
    <div className="min-h-screen bg-gray-50">
      <nav className="bg-white shadow">
        <div className="mx-auto max-w-7xl px-4 py-3 flex items-center justify-between">
          <div className="flex items-center gap-6">
            <Link to="/" className="text-xl font-bold text-gray-900">
              Boone Gifts
            </Link>
            <Link to="/lists" className="hidden md:inline text-gray-600 hover:text-gray-900">
              Lists
            </Link>
            <Link to="/connections" className="hidden md:inline text-gray-600 hover:text-gray-900">
              Connections
            </Link>
            <Link to="/collections" className="hidden md:inline text-gray-600 hover:text-gray-900">
              Collections
            </Link>
          </div>
          <div className="hidden md:flex items-center gap-4">
            <span className="text-sm text-gray-600">{user?.email}</span>
            <button
              onClick={logout}
              className="text-sm text-gray-600 hover:text-gray-900"
            >
              Logout
            </button>
          </div>
          <button
            onClick={() => setDrawerOpen(true)}
            className="md:hidden p-2 text-gray-600 hover:text-gray-900"
            aria-label="Open menu"
            aria-expanded={drawerOpen}
          >
            <svg className="h-6 w-6" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M4 6h16M4 12h16M4 18h16" />
            </svg>
          </button>
        </div>
      </nav>

      {/* Mobile drawer backdrop — always in DOM for transition */}
      <div
        className={`fixed inset-0 z-40 bg-black/50 transition-opacity duration-300 ${
          drawerOpen ? "opacity-100" : "opacity-0 pointer-events-none"
        }`}
        data-testid="drawer-backdrop"
        onClick={() => setDrawerOpen(false)}
      />

      {/* Mobile drawer — always in DOM, slides via translate */}
      <div
        {...(drawerOpen ? { role: "dialog", "aria-modal": true } : {})}
        className={`fixed inset-y-0 right-0 z-50 w-64 bg-white shadow-lg transition-transform duration-300 ease-in-out ${
          drawerOpen ? "translate-x-0" : "translate-x-full"
        }`}
      >
        <div className="flex items-center justify-end px-4 py-3 border-b border-gray-200">
          <button
            onClick={() => setDrawerOpen(false)}
            className="p-2 text-gray-600 hover:text-gray-900"
            aria-label="Close menu"
          >
            <svg className="h-6 w-6" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>
        <div className="flex flex-col px-4 py-4 gap-4">
          <Link to="/lists" className="text-gray-600 hover:text-gray-900 py-2">
            Lists
          </Link>
          <Link to="/connections" className="text-gray-600 hover:text-gray-900 py-2">
            Connections
          </Link>
          <Link to="/collections" className="text-gray-600 hover:text-gray-900 py-2">
            Collections
          </Link>
          <hr className="border-gray-200" />
          <span className="text-sm text-gray-600">{user?.email}</span>
          <button
            onClick={logout}
            className="text-left text-sm text-gray-600 hover:text-gray-900"
          >
            Logout
          </button>
        </div>
      </div>

      <main className="mx-auto max-w-7xl px-4 py-6">
        <Outlet />
      </main>
    </div>
  );
}
