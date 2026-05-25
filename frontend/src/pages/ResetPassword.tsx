import { useState, type FormEvent } from "react";
import { Link, useNavigate, useSearchParams } from "react-router";
import { resetPassword } from "../api/auth";
import { useTitle } from "../hooks/useTitle";

export function ResetPassword() {
  useTitle("Set a new password");
  const [searchParams] = useSearchParams();
  const token = searchParams.get("token") ?? "";
  const [newPassword, setNewPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [tokenError, setTokenError] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const navigate = useNavigate();

  if (!token) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gray-50">
        <div className="w-full max-w-sm bg-white shadow rounded p-6 text-center">
          <p className="text-gray-700 mb-4">Invalid or missing reset link.</p>
          <Link to="/forgot-password" className="text-blue-600 hover:underline">
            Request a new link
          </Link>
        </div>
      </div>
    );
  }

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    setError(null);
    if (newPassword !== confirm) {
      setError("Passwords don't match.");
      return;
    }
    setSubmitting(true);
    try {
      await resetPassword(token, newPassword);
      navigate("/login", { replace: true });
    } catch {
      setTokenError(true);
    } finally {
      setSubmitting(false);
    }
  }

  if (tokenError) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gray-50">
        <div className="w-full max-w-sm bg-white shadow rounded p-6 text-center">
          <p className="text-gray-700 mb-4">
            This reset link is invalid or expired.
          </p>
          <Link to="/forgot-password" className="text-blue-600 hover:underline">
            Request a new link
          </Link>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen flex items-center justify-center bg-gray-50">
      <div className="w-full max-w-sm">
        <h1 className="text-2xl font-bold text-center mb-6">Set a new password</h1>
        <form onSubmit={handleSubmit} className="bg-white shadow rounded p-6">
          {error && <p className="text-red-600 text-sm mb-4">{error}</p>}
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
            className="w-full bg-blue-600 text-white rounded py-2 hover:bg-blue-700 disabled:opacity-50"
            disabled={submitting}
          >
            {submitting ? "Saving…" : "Set new password"}
          </button>
        </form>
      </div>
    </div>
  );
}
