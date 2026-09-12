import { useState, type FormEvent } from "react";
import { Link } from "react-router";
import { forgotPassword } from "../api/auth";
import { useTitle } from "../hooks/useTitle";
import { failureMessage } from "../lib/request-failure";

export function ForgotPassword() {
  useTitle("Forgot Password");
  const [email, setEmail] = useState("");
  const [submitted, setSubmitted] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    setError(null);
    setSubmitting(true);
    try {
      await forgotPassword(email);
      setSubmitted(true);
    } catch (err) {
      // Anti-enumeration reaches exactly as far as what the backend's answer
      // could reveal, and no further. The only email-dependent answer it gives
      // is 200, so a rejection (`null`) still falls through to the generic
      // success screen — but whether the request arrived, whether we were rate
      // limited by IP, and whether our own mail path broke say nothing about
      // whether the address has an account, and "check your inbox" is a lie the
      // user acts on by waiting.
      const msg = failureMessage(err);
      if (msg) setError(msg);
      else setSubmitted(true);
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div className="min-h-screen flex items-center justify-center bg-gray-50">
      <div className="w-full max-w-sm">
        <h1 className="text-2xl font-bold text-center mb-6">Reset your password</h1>
        <div className="bg-white shadow rounded p-6">
          {submitted ? (
            <>
              <p className="text-gray-700 mb-4">
                If an account exists for that email, we've sent a password reset link.
                Check your inbox.
              </p>
              <p className="text-sm">
                <Link to="/login" className="text-blue-600 hover:underline">
                  Back to log in
                </Link>
              </p>
            </>
          ) : (
            <form onSubmit={handleSubmit}>
              {error && <p className="text-red-600 text-sm mb-4">{error}</p>}
              <p className="text-gray-700 text-sm mb-4">
                Enter your email and we'll send you a link to set a new password.
              </p>
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
              <button
                type="submit"
                className="w-full bg-blue-600 text-white rounded py-2 hover:bg-blue-700 disabled:opacity-50"
                disabled={submitting}
              >
                {submitting ? "Sending…" : "Send reset link"}
              </button>
              <p className="text-sm text-center mt-4">
                <Link to="/login" className="text-blue-600 hover:underline">
                  Back to log in
                </Link>
              </p>
            </form>
          )}
        </div>
      </div>
    </div>
  );
}
