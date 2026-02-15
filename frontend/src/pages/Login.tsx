import { useState, type FormEvent } from "react";
import { useNavigate, useLocation, Link } from "react-router";
import { useAuth } from "../hooks/useAuth";

export function Login() {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const { login } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();
  const from = (location.state as { from?: string })?.from ?? "/";

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    setError("");
    try {
      await login(email, password);
      navigate(from, { replace: true });
    } catch {
      setError("Invalid email or password");
    }
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
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              className="mt-1 block w-full rounded border border-gray-300 px-3 py-2"
              required
            />
          </label>
          <button
            type="submit"
            className="w-full bg-blue-600 text-white rounded py-2 hover:bg-blue-700"
          >
            Log in
          </button>
          <p className="text-sm text-center mt-4 text-gray-600">
            Have an invite?{" "}
            <Link to="/register" className="text-blue-600 hover:underline">
              Register
            </Link>
          </p>
        </form>
      </div>
    </div>
  );
}
