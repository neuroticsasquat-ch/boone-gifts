import { useState, type FormEvent } from "react";
import { Link } from "react-router";
import { forgotPassword } from "../api/auth";
import { useTitle } from "../hooks/useTitle";

export function ForgotPassword() {
  useTitle("Forgot Password");
  const [email, setEmail] = useState("");
  const [submitted, setSubmitted] = useState(false);

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    try {
      await forgotPassword(email);
    } catch {
      // Intentionally swallow — backend already returns 200 for unknown emails to
      // avoid user enumeration, and we mirror that behavior on rate-limit / network
      // failures so the user can't infer anything from the UI.
    }
    setSubmitted(true);
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
                className="w-full bg-blue-600 text-white rounded py-2 hover:bg-blue-700"
              >
                Send reset link
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
