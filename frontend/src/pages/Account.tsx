import { useState, type FormEvent } from "react";
import { useAuth } from "../hooks/useAuth";
import { useTitle } from "../hooks/useTitle";
import { CogIcon } from "../components/Icons";

interface AxiosLikeError {
  response?: { status?: number; data?: { detail?: string } };
}

function isAxiosLikeError(err: unknown): err is AxiosLikeError {
  return typeof err === "object" && err !== null && "response" in err;
}

export function Account() {
  useTitle("Account");
  const { user, changePassword } = useAuth();
  const [currentPassword, setCurrentPassword] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState(false);

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    setError(null);
    setSuccess(false);

    if (newPassword !== confirm) {
      setError("Passwords don't match.");
      return;
    }

    try {
      await changePassword(currentPassword, newPassword);
      setSuccess(true);
      setCurrentPassword("");
      setNewPassword("");
      setConfirm("");
    } catch (err) {
      if (isAxiosLikeError(err) && err.response?.status === 400) {
        setError(err.response.data?.detail ?? "Current password is incorrect.");
      } else {
        setError("Could not update password. Try again.");
      }
    }
  }

  return (
    <div className="max-w-md mx-auto">
      <h1 className="flex items-center gap-2 text-2xl font-bold mb-2"><CogIcon className="h-6 w-6" /> Account</h1>
      {user && <p className="text-sm text-gray-600 mb-6">{user.email}</p>}

      <div className="bg-white shadow rounded p-6">
        <h2 className="text-lg font-semibold mb-4">Change password</h2>
        <form onSubmit={handleSubmit}>
          {error && <p className="text-red-600 text-sm mb-4">{error}</p>}
          {success && (
            <p className="text-green-700 bg-green-50 border border-green-200 rounded p-3 text-sm mb-4">
              Password updated.
            </p>
          )}
          <label className="block mb-4">
            <span className="text-sm font-medium text-gray-700">Current password</span>
            <input
              type="password"
              autoComplete="current-password"
              value={currentPassword}
              onChange={(e) => setCurrentPassword(e.target.value)}
              className="mt-1 block w-full rounded border border-gray-300 px-3 py-2"
              required
            />
          </label>
          <label className="block mb-4">
            <span className="text-sm font-medium text-gray-700">New password</span>
            <input
              type="password"
              autoComplete="new-password"
              value={newPassword}
              onChange={(e) => setNewPassword(e.target.value)}
              className="mt-1 block w-full rounded border border-gray-300 px-3 py-2"
              required
              minLength={8}
            />
          </label>
          <label className="block mb-4">
            <span className="text-sm font-medium text-gray-700">Confirm new password</span>
            <input
              type="password"
              autoComplete="new-password"
              value={confirm}
              onChange={(e) => setConfirm(e.target.value)}
              className="mt-1 block w-full rounded border border-gray-300 px-3 py-2"
              required
              minLength={8}
            />
          </label>
          <button
            type="submit"
            className="w-full bg-blue-600 text-white rounded py-2 hover:bg-blue-700"
          >
            Change password
          </button>
        </form>
      </div>
    </div>
  );
}
