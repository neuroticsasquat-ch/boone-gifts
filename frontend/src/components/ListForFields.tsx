import { NO_RECIPIENT } from "../lib/recipient";
import { LIST_FOR_SOMEONE_ELSE, type ListForValue } from "../lib/list-for";
import { RecipientDetails, RecipientFields } from "./RecipientFields";
import type { Account } from "../types";

/**
 * "Who is this list for?" on the create form and the list's edit header
 * (NEU-1237; project spec §5.2).
 *
 * On a **shared** account every list says which of the account's people it is
 * for, so the question is a required radio group: one option per person, "Both of
 * us" for a household list, and "Someone else" for a person with no account. The
 * API permits a list that names neither — this form is what makes the answer
 * explicit, and "Both of us" is how it is said out loud.
 *
 * On a **non-shared** account there is no question to ask: the account is one
 * person, and the form is today's, with the "for someone else" disclosure alone.
 *
 * `account` is undefined until `GET /account` answers. Rendering the non-shared
 * form in the meantime is deliberate — it is the shape every account had before
 * this feature, and the picker replaces it in place once the answer arrives.
 */
export function ListForFields({
  account,
  value,
  onChange,
}: {
  account: Account | undefined;
  value: ListForValue;
  onChange: (value: ListForValue) => void;
}) {
  if (!account?.is_shared_account) {
    // A list already marked for an account person cannot be drawn as the
    // non-shared form: its disclosure reads "for no one", and one click on it
    // would send that, silently dropping the assignment. There is nothing honest
    // to show until `GET /account` answers, so show nothing.
    if (value.kind === "person") return null;

    return (
      <RecipientFields
        value={value.kind === "someone-else" ? value.recipient : NO_RECIPIENT}
        onChange={(recipient) =>
          onChange(recipient.enabled ? { kind: "someone-else", recipient } : { kind: "household" })
        }
      />
    );
  }

  return (
    <fieldset className="mb-6">
      <legend className="text-sm font-medium text-gray-700">Who is this list for?</legend>
      <div role="radiogroup" aria-label="Who is this list for?" className="mt-2 space-y-2">
        {account.people.map((person) => (
          <label key={person.id} className="flex items-center gap-2">
            <input
              type="radio"
              name="list-for"
              checked={value.kind === "person" && value.personId === person.id}
              onChange={() => onChange({ kind: "person", personId: person.id })}
              className="border-gray-300"
            />
            <span className="text-sm text-gray-700">{person.name}</span>
          </label>
        ))}
        <label className="flex items-center gap-2">
          <input
            type="radio"
            name="list-for"
            checked={value.kind === "household"}
            onChange={() => onChange({ kind: "household" })}
            className="border-gray-300"
          />
          <span className="text-sm text-gray-700">Both of us</span>
        </label>
        <label className="flex items-center gap-2">
          <input
            type="radio"
            name="list-for"
            checked={value.kind === "someone-else"}
            onChange={() => onChange(LIST_FOR_SOMEONE_ELSE)}
            className="border-gray-300"
          />
          <span className="text-sm text-gray-700">Someone else</span>
        </label>
      </div>

      {value.kind === "someone-else" && (
        <div className="mt-3 space-y-3 border-l-2 border-gray-200 pl-3">
          <RecipientDetails
            value={value.recipient}
            onChange={(recipient) => onChange({ kind: "someone-else", recipient })}
            nameLabel="Their name"
          />
        </div>
      )}
    </fieldset>
  );
}
