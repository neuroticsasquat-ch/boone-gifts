import { useState, useEffect, useRef } from "react";
import { Link, Outlet, useLocation } from "react-router";
import { useQuery } from "@tanstack/react-query";
import { useAuth } from "../hooks/useAuth";
import { GiftIcon } from "./Icons";
import { getConnectionRequests } from "../api/connections";
import { getUnseenShareCount } from "../api/lists";
import { Badge } from "./Badge";

function HomeIcon({ className }: { className?: string }) {
  return (
    <svg className={className} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
      <path strokeLinecap="round" strokeLinejoin="round" d="M3 12l2-2m0 0l7-7 7 7M5 10v10a1 1 0 001 1h3m10-11l2 2m-2-2v10a1 1 0 01-1 1h-3m-4 0a1 1 0 01-1-1v-4a1 1 0 011-1h2a1 1 0 011 1v4a1 1 0 01-1 1" />
    </svg>
  );
}

function ListIcon({ className }: { className?: string }) {
  return (
    <svg className={className} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
      <path strokeLinecap="round" strokeLinejoin="round" d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2" />
    </svg>
  );
}

function PeopleIcon({ className }: { className?: string }) {
  return (
    <svg className={className} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
      <path strokeLinecap="round" strokeLinejoin="round" d="M17 20h5v-2a3 3 0 00-5.356-1.857M17 20H7m10 0v-2c0-.656-.126-1.283-.356-1.857M7 20H2v-2a3 3 0 015.356-1.857M7 20v-2c0-.656.126-1.283.356-1.857m0 0a5.002 5.002 0 019.288 0M15 7a3 3 0 11-6 0 3 3 0 016 0z" />
    </svg>
  );
}

function FolderIcon({ className }: { className?: string }) {
  return (
    <svg className={className} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
      <path strokeLinecap="round" strokeLinejoin="round" d="M3 7v10a2 2 0 002 2h14a2 2 0 002-2V9a2 2 0 00-2-2h-6l-2-2H5a2 2 0 00-2 2z" />
    </svg>
  );
}

function UserIcon({ className }: { className?: string }) {
  return (
    <svg className={className} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
      <path strokeLinecap="round" strokeLinejoin="round" d="M5.121 17.804A13.937 13.937 0 0112 16c2.5 0 4.847.655 6.879 1.804M15 10a3 3 0 11-6 0 3 3 0 016 0z" />
    </svg>
  );
}

const TABS = [
  { to: "/", label: "Home", Icon: HomeIcon, match: (p: string) => p === "/" },
  { to: "/lists", label: "Lists", Icon: ListIcon, match: (p: string) => p.startsWith("/lists") },
  { to: "/connections", label: "Connect", Icon: PeopleIcon, match: (p: string) => p.startsWith("/connections") },
  { to: "/collections", label: "Collect", Icon: FolderIcon, match: (p: string) => p.startsWith("/collections") },
];

export function Layout() {
  const { user, logout } = useAuth();
  const location = useLocation();
  const [menuOpen, setMenuOpen] = useState(false);
  const menuRef = useRef<HTMLDivElement>(null);

  const requests = useQuery({ queryKey: ["connectionRequests"], queryFn: getConnectionRequests });
  const unseenShares = useQuery({ queryKey: ["unseen-shares"], queryFn: getUnseenShareCount });

  const requestCount = requests.data?.length ?? 0;
  const unseenCount = unseenShares.data ?? 0;

  useEffect(() => {
    if (!menuOpen) return;
    const handler = (e: MouseEvent) => {
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) {
        setMenuOpen(false);
      }
    };
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, [menuOpen]);

  return (
    <div className="min-h-screen bg-gray-50 pb-16 md:pb-0">
      {/* Top bar */}
      <nav className="bg-white shadow">
        <div className="mx-auto max-w-7xl px-4 py-3 flex items-center justify-between">
          <div className="flex items-center gap-6">
            <Link to="/" className="flex items-center gap-1.5 text-xl font-bold text-gray-900">
              <GiftIcon className="h-6 w-6" /> Boone Gifts
            </Link>
            <Link to="/lists" className="hidden md:inline relative text-gray-600 hover:text-gray-900">
              Lists
              {unseenCount > 0 && (
                <span className="ml-1 inline-flex h-4 w-4 items-center justify-center rounded-full bg-red-500 text-[10px] font-bold text-white">
                  {unseenCount > 9 ? "9+" : unseenCount}
                </span>
              )}
            </Link>
            <Link to="/connections" className="hidden md:inline relative text-gray-600 hover:text-gray-900">
              Connections
              {requestCount > 0 && (
                <span className="ml-1 inline-flex h-4 w-4 items-center justify-center rounded-full bg-red-500 text-[10px] font-bold text-white">
                  {requestCount > 9 ? "9+" : requestCount}
                </span>
              )}
            </Link>
            <Link to="/collections" className="hidden md:inline text-gray-600 hover:text-gray-900">
              Collections
            </Link>
          </div>

          {/* Account dropdown — all screen sizes */}
          <div className="relative" ref={menuRef}>
            <button
              onClick={() => setMenuOpen(!menuOpen)}
              className="flex items-center gap-2 rounded-full p-1.5 text-gray-600 hover:text-gray-900 hover:bg-gray-100"
              aria-label="Account menu"
              aria-expanded={menuOpen}
            >
              <UserIcon className="h-6 w-6" />
              <span className="hidden md:inline text-sm">{user?.email}</span>
            </button>

            {menuOpen && (
              <div className="absolute right-0 mt-2 w-56 rounded-lg bg-white shadow-lg ring-1 ring-black/5 z-50">
                <div className="px-4 py-3 border-b border-gray-100 md:hidden">
                  <p className="text-sm font-medium text-gray-900 truncate">{user?.email}</p>
                </div>
                <div className="py-1">
                  <Link to="/account" onClick={() => setMenuOpen(false)} className="block px-4 py-2 text-sm text-gray-700 hover:bg-gray-50">
                    Account Settings
                  </Link>
                  {user?.role === "admin" && (
                    <>
                      <hr className="my-1 border-gray-100" />
                      <Link to="/admin/invites" onClick={() => setMenuOpen(false)} className="block px-4 py-2 text-sm text-gray-700 hover:bg-gray-50">
                        Manage Invites
                      </Link>
                      <Link to="/admin/users" onClick={() => setMenuOpen(false)} className="block px-4 py-2 text-sm text-gray-700 hover:bg-gray-50">
                        Manage Users
                      </Link>
                    </>
                  )}
                  <hr className="my-1 border-gray-100" />
                  <button
                    onClick={logout}
                    className="block w-full text-left px-4 py-2 text-sm text-gray-700 hover:bg-gray-50"
                  >
                    Logout
                  </button>
                </div>
              </div>
            )}
          </div>
        </div>
      </nav>

      <main className="mx-auto max-w-7xl px-4 py-6">
        <Outlet />
      </main>

      {/* Bottom tab bar — mobile only */}
      <nav className="fixed bottom-0 inset-x-0 z-40 bg-white border-t border-gray-200 md:hidden">
        <div className="flex justify-around">
          {TABS.map(({ to, label, Icon, match }) => {
            const active = match(location.pathname);
            let badgeCount = 0;
            if (to === "/connections") badgeCount = requestCount;
            if (to === "/lists") badgeCount = unseenCount;
            return (
              <Link
                key={to}
                to={to}
                className={`flex flex-col items-center py-2 px-3 text-xs ${
                  active ? "text-blue-600" : "text-gray-500"
                }`}
              >
                <span className="relative">
                  <Icon className="h-6 w-6" />
                  <Badge count={badgeCount} />
                </span>
                <span className="mt-0.5">{label}</span>
              </Link>
            );
          })}
        </div>
      </nav>
    </div>
  );
}
