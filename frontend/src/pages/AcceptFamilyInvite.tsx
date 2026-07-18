import { useEffect, useRef, useState } from "react";
import { Link, useNavigate, useParams } from "react-router";
import { useQueryClient } from "@tanstack/react-query";
import { isAxiosError } from "axios";
import toast from "react-hot-toast";
import { acceptFamilyInvite } from "../api/families";
import { useTitle } from "../hooks/useTitle";
import { Spinner } from "../components/Spinner";

export function AcceptFamilyInvite() {
  useTitle("Accept family invite");
  const { token } = useParams<{ token: string }>();
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const [error, setError] = useState<string | null>(null);
  const attempted = useRef(false);

  useEffect(() => {
    // token is always present via the :token route param; guard keeps types happy.
    // attempted ref guards against React StrictMode's double-invoke re-firing accept.
    if (!token || attempted.current) return;
    attempted.current = true;

    acceptFamilyInvite(token)
      .then((result) => {
        queryClient.invalidateQueries({ queryKey: ["familyInvites"] });
        queryClient.invalidateQueries({ queryKey: ["families"] });
        // ["lists","family"] backs the family-lists view — refresh so the new family's lists appear
        queryClient.invalidateQueries({ queryKey: ["lists", "family"] });
        toast.success(`You've joined the ${result.family.name} family.`);
        navigate("/family-lists", { replace: true });
      })
      .catch((err: unknown) => {
        if (isAxiosError(err) && err.response?.status === 409) {
          setError("This invite is no longer valid — it may have already been accepted, declined, or expired.");
        } else if (isAxiosError(err) && err.response?.status === 404) {
          setError("This invite link is invalid or has been revoked.");
        } else {
          setError("Something went wrong accepting this invite. Please try again.");
        }
      });
  }, [token, navigate, queryClient]);

  const message = !token ? "This invite link is invalid." : error;

  if (message) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gray-50">
        <div className="w-full max-w-sm bg-white shadow rounded p-6 text-center">
          <p className="text-gray-700 mb-4">{message}</p>
          <Link to="/families" className="text-blue-600 hover:underline">
            Go to your families
          </Link>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen flex flex-col items-center justify-center bg-gray-50">
      <Spinner />
      <p className="text-gray-700">Joining family…</p>
    </div>
  );
}
