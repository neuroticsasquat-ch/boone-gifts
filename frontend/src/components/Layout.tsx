import { Link, Outlet } from "react-router";
import { useAuth } from "../hooks/useAuth";

export function Layout() {
  const { user, logout } = useAuth();

  return (
    <div className="min-h-screen bg-gray-50">
      <nav className="bg-white shadow">
        <div className="mx-auto max-w-7xl px-4 py-3 flex items-center justify-between">
          <div className="flex items-center gap-6">
            <Link to="/" className="text-xl font-bold text-gray-900">
              Boone Gifts
            </Link>
            <Link to="/lists" className="text-gray-600 hover:text-gray-900">
              Lists
            </Link>
            <Link to="/connections" className="text-gray-600 hover:text-gray-900">
              Connections
            </Link>
            <Link to="/collections" className="text-gray-600 hover:text-gray-900">
              Collections
            </Link>
          </div>
          <div className="flex items-center gap-4">
            <span className="text-sm text-gray-600">{user?.email}</span>
            <button
              onClick={logout}
              className="text-sm text-gray-600 hover:text-gray-900"
            >
              Logout
            </button>
          </div>
        </div>
      </nav>
      <main className="mx-auto max-w-7xl px-4 py-6">
        <Outlet />
      </main>
    </div>
  );
}
