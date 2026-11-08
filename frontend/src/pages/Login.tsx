import { useState, type FormEvent } from "react";
import { useNavigate, useLocation, Link } from "react-router";
import { useAuth } from "../hooks/useAuth";
import { useTitle } from "../hooks/useTitle";
import { failureMessage } from "../lib/request-failure";

export function Login() {
  useTitle("Log In");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const { login } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();
  const from = (location.state as { from?: string })?.from ?? "/lists";

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    setError("");
    setSubmitting(true);
    try {
      await login(email, password);
    } catch (err) {
      // A 4xx is the server rejecting these credentials; anything else is a
      // failure that has nothing to do with the password. The wording below
      // stays uniform across "no such email" and "wrong password" on purpose —
      // distinguishing them would tell an attacker which addresses have
      // accounts (CONTEXT.md rule 10).
      setError(failureMessage(err) ?? "Invalid email or password");
      return;
    } finally {
      setSubmitting(false);
    }
    // Outside the `try`: a throw from routing is not a login failure, and
    // leaving it inside means a successful login can render an error.
    navigate(from, { replace: true });
  }

  return (
    <div className="min-h-screen flex items-center justify-center bg-gray-50">
      <div className="w-full max-w-sm">
        <h1 className="text-2xl font-bold text-center mb-6">Boone Gifts</h1>
        <form onSubmit={handleSubmit} className="bg-white shadow rounded p-6">
          {error && <p className="text-red-600 text-sm mb-4">{error}</p>}
          <label className="block mb-4">
            <span className="text-sm font-medium text-gray-700">Email</span>
            <input
              type="email"
              autoComplete="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              className="mt-1 block w-full rounded border border-gray-300 px-3 py-2"
              required
            />
          </label>
          <label className="block mb-4">
            <span className="text-sm font-medium text-gray-700">Password</span>
            <input
              type="password"
              autoComplete="current-password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              className="mt-1 block w-full rounded border border-gray-300 px-3 py-2"
              required
            />
          </label>
          <button
            type="submit"
            className="w-full bg-blue-600 text-white rounded py-2 hover:bg-blue-700 disabled:opacity-50"
            disabled={submitting}
          >
            {submitting ? "Logging in…" : "Log in"}
          </button>
          <p className="text-sm text-center mt-4">
            <Link to="/forgot-password" className="text-blue-600 hover:underline">
              Forgot password?
            </Link>
          </p>
        </form>
      </div>
    </div>
  );
}
