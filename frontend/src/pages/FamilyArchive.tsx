import { Link } from "react-router";
import { useQuery } from "@tanstack/react-query";
import { getFamily } from "../api/families";
import { getFamilyOccasions } from "../api/occasions";
import { useTitle } from "../hooks/useTitle";
import { Spinner } from "../components/Spinner";
import { useNumericId } from "../components/NumericId";
import { ArchiveIcon } from "../components/Icons";
import { BackControl, backToFamily } from "../components/BackControl";

/**
 * A family's archived occasions (`/people/families/:id/archive`, project spec
 * §9.5).
 *
 * The family page's entry point lands here, replacing the "View archived
 * occasions" toggle `OccasionsSection` used to carry — so the section on the
 * family page is now the family's *active* occasions and nothing else
 * (NEU-1278).
 *
 * Every member may look. Unarchiving stays organizer-only and stays on the
 * occasion's own page, which already gates and enforces it; a row here is the
 * way to reach that page, not a second copy of its controls.
 *
 * The two reads fail independently and are reported that way. A family read
 * that failed must not be allowed to read as the bare word "Family" in the
 * header — that is a failure wearing a plausible default, which is the thing
 * the sibling archive page's per-section error arms exist to prevent.
 */
export function FamilyArchive() {
  const familyId = useNumericId();

  const family = useQuery({
    queryKey: ["family", familyId],
    queryFn: () => getFamily(familyId),
  });

  // Shares the family page's key and its `archived` shape, so archiving or
  // unarchiving — both of which invalidate the `["occasions", familyId]`
  // prefix — refreshes this page too.
  const occasions = useQuery({
    queryKey: ["occasions", familyId, { archived: true }],
    queryFn: () => getFamilyOccasions(familyId, true),
  });

  useTitle(family.data ? `${family.data.name} archive` : "Archive");

  return (
    <div className="space-y-8">
      <header>
        <BackControl fallback={backToFamily(familyId, family.data?.name)} />
        {family.isError && (
          <p className="mt-1 text-sm text-red-600">
            This family&apos;s name couldn&apos;t be loaded. The archived occasions below are
            still its own.
          </p>
        )}
        <h1 className="mt-1 flex items-center gap-2 text-2xl font-bold text-gray-900">
          <ArchiveIcon className="h-6 w-6" /> Archived Occasions
        </h1>
        <p className="mt-2 text-xs text-gray-500">
          Archiving takes an occasion out of the default views and does nothing else. The
          lists shared to it are still shared, and your shopping and budget for it are
          still here — open one to pick it back up.
        </p>
      </header>

      {occasions.isPending ? (
        <Spinner />
      ) : occasions.isError ? (
        <p className="text-sm text-red-600">Couldn&apos;t load occasions.</p>
      ) : occasions.data.length === 0 ? (
        <p className="text-gray-500">No archived occasions.</p>
      ) : (
        <ul className="divide-y divide-gray-200 rounded-lg bg-white shadow">
          {occasions.data.map((occasion) => (
            <li key={occasion.id}>
              <Link
                to={`/occasions/${occasion.id}`}
                className="block px-4 py-3 font-medium text-gray-900 hover:bg-gray-50"
              >
                {occasion.name}
              </Link>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
