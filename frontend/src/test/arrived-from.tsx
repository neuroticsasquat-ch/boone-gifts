import { useNavigate } from "react-router";

/**
 * The page a viewer arrived *from*, for the back-control tests (NEU-1302).
 *
 * A page's back control reads `← Back` only when the app pushed its way there,
 * so the arrived-from case cannot be faked with a deeper `initialEntries` — that
 * is still an entry location, and still depth 0, exactly as a deep link is.
 * Render this at the starting address, click **arrive**, and the push is real.
 */
export function ArrivedFrom({ to }: { to: string }) {
  const navigate = useNavigate();
  return <button onClick={() => navigate(to)}>arrive</button>;
}
