import { useState, type FormEvent } from "react";
import { useNavigate, useSearchParams, Link } from "react-router";
import { register } from "../api/auth";

export function Register() {
  const [searchParams] = useSearchParams();
  const token = searchParams.get("token") ?? "";
  const [name, setName] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [success, setSuccess] = useState(false);
  const navigate = useNavigate();

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    setError("");
    try {
      await register(token, name, password);
      setSuccess(true);
      setTimeout(() => navigate("/login"), 2000);
    } catch {
      setError("Registration failed. Check your invite link.");
    }
  }

  if (!token) {
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

  return (
    <div className="min-h-screen flex items-center justify-center bg-gray-50">
      <div className="w-full max-w-sm">
        <h1 className="text-2xl font-bold text-center mb-6">Register</h1>
        <form onSubmit={handleSubmit} className="bg-white shadow rounded p-6">
          {error && <p className="text-red-600 text-sm mb-4">{error}</p>}
          {success && (
            <p className="text-green-600 text-sm mb-4">
              Account created! Redirecting to login...
            </p>
          )}
          <label className="block mb-4">
            <span className="text-sm font-medium text-gray-700">Name</span>
            <input
              type="text"
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
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              className="mt-1 block w-full rounded border border-gray-300 px-3 py-2"
              required
            />
          </label>
          <button
            type="submit"
            className="w-full bg-blue-600 text-white rounded py-2 hover:bg-blue-700"
            disabled={success}
          >
            Register
          </button>
        </form>
      </div>
    </div>
  );
}
