import { useEffect, useState, type FormEvent } from "react";
import { useNavigate, useSearchParams, Link } from "react-router";
import { isAxiosError } from "axios";
import { getInviteInfo } from "../api/auth";
import { useAuth } from "../hooks/useAuth";
import { useTitle } from "../hooks/useTitle";

export function Register() {
  useTitle("Register");
  const [searchParams] = useSearchParams();
  const token = searchParams.get("token") ?? searchParams.get("family_invite") ?? "";
  const [email, setEmail] = useState("");
  const [name, setName] = useState("");
  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [error, setError] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [loading, setLoading] = useState(true);
  const [invalidToken, setInvalidToken] = useState(false);
  const [familyName, setFamilyName] = useState<string | null>(null);
  const navigate = useNavigate();
  const { register } = useAuth();

  const isFamilyInvite = familyName !== null;

  useEffect(() => {
    if (!token) return;
    getInviteInfo(token)
      .then((info) => {
        setEmail(info.email);
        setFamilyName(info.family_name);
        setLoading(false);
      })
      .catch(() => {
        setInvalidToken(true);
        setLoading(false);
      });
  }, [token]);

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    setError("");
    if (password !== confirm) {
      setError("Passwords don't match.");
      return;
    }
    setSubmitting(true);
    try {
      await register(token, name, password, email);
      navigate("/lists", { replace: true });
    } catch (err) {
      setError(
        isAxiosError(err)
          ? err.response?.data?.detail ?? "Registration failed. Check your invite link."
          : "Registration failed. Check your invite link."
      );
    } finally {
      setSubmitting(false);
    }
  }

  if (!token || invalidToken) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gray-50">
        <p className="text-gray-600">
          Invalid invite link.{" "}
          <Link to="/login" className="text-blue-600 hover:underline">
            Go to login
          </Link>
        </p>
      </div>
    );
  }

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gray-50">
        <div className="h-8 w-8 animate-spin rounded-full border-4 border-gray-200 border-t-blue-600" />
      </div>
    );
  }

  return (
    <div className="min-h-screen flex items-center justify-center bg-gray-50">
      <div className="w-full max-w-sm">
        <h1 className="text-2xl font-bold text-center mb-6">Register</h1>
        {familyName && (
          <p className="text-center text-gray-600 -mt-4 mb-6">
            Join the <span className="font-semibold">{familyName}</span> family on Boone Gifts.
          </p>
        )}
        <form onSubmit={handleSubmit} className="bg-white shadow rounded p-6">
          {error && <p className="text-red-600 text-sm mb-4">{error}</p>}
          <label className="block mb-4">
            <span className="text-sm font-medium text-gray-700">Invite code</span>
            <input
              type="text"
              value={token}
              className="mt-1 block w-full rounded border border-gray-300 bg-gray-50 px-3 py-2 text-gray-500"
              disabled
            />
          </label>
          <label className="block mb-4">
            <span className="text-sm font-medium text-gray-700">Email</span>
            <input
              type="email"
              autoComplete="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              disabled={isFamilyInvite}
              className={`mt-1 block w-full rounded border border-gray-300 px-3 py-2 ${
                isFamilyInvite ? "bg-gray-50 text-gray-500" : ""
              }`}
              required
            />
          </label>
          <label className="block mb-4">
            <span className="text-sm font-medium text-gray-700">Name</span>
            <input
              type="text"
              autoComplete="name"
              value={name}
              onChange={(e) => setName(e.target.value)}
              className="mt-1 block w-full rounded border border-gray-300 px-3 py-2"
              required
            />
          </label>
          <label className="block mb-4">
            <span className="text-sm font-medium text-gray-700">Password</span>
            <input
              type="password"
              autoComplete="new-password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              className="mt-1 block w-full rounded border border-gray-300 px-3 py-2"
              required
              minLength={8}
            />
          </label>
          <label className="block mb-4">
            <span className="text-sm font-medium text-gray-700">Confirm password</span>
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
            {submitting ? "Registering…" : "Register"}
          </button>
        </form>
      </div>
    </div>
  );
}
