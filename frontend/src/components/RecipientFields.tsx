import type { RecipientValue } from "../lib/recipient";

/**
 * The "this list is for someone else" control, as a non-shared account sees it:
 * a disclosure checkbox over the recipient's details (NEU-1216 §2.7).
 *
 * Progressive disclosure: unchecked, the surrounding form is exactly what it was
 * before this feature existed. Checked, it reveals `RecipientDetails`.
 *
 * On a *shared* account this control is not used: the picker in `ListForFields`
 * asks the same question of the whole account, and "Someone else" is one of its
 * answers rather than a checkbox beside it (NEU-1237).
 */
export function RecipientFields({
  value,
  onChange,
}: {
  value: RecipientValue;
  onChange: (value: RecipientValue) => void;
}) {
  return (
    <fieldset className="mb-6">
      <label className="flex items-center gap-2">
        <input
          type="checkbox"
          checked={value.enabled}
          onChange={(e) =>
            onChange(e.target.checked ? { ...value, enabled: true } : { enabled: false, name: "" })
          }
          className="rounded border-gray-300"
        />
        <span className="text-sm text-gray-700">This list is for someone else</span>
      </label>

      {value.enabled && (
        <div className="mt-3 space-y-3 border-l-2 border-gray-200 pl-3">
          <RecipientDetails value={value} onChange={onChange} />
        </div>
      )}
    </fieldset>
  );
}

/**
 * Who the list is for — the body of the control, with no disclosure of its own.
 * Rendered under the checkbox above, and under "Someone else" in the
 * shared-account picker.
 *
 * "Someone else" now means one thing only: a person who does not use the app
 * (NEU-1241; project spec §5.4). The co-resident case the old "they use this
 * app" radio described is the account-people picker instead, so the keeper's
 * warning is unconditional here — it is the only case left.
 *
 * `nameLabel` exists because the same field asks a differently-shaped question in
 * each place: standing alone it *is* "Who is this list for?", while under the
 * picker that question has already been asked and answered by the radio above it.
 */
export function RecipientDetails({
  value,
  onChange,
  nameLabel = "Who is this list for?",
}: {
  value: RecipientValue;
  onChange: (value: RecipientValue) => void;
  nameLabel?: string;
}) {
  const displayName = value.name.trim();
  // In the warning the name appears twice, once as an object and once as a
  // subject, so the fallback needs both cases to stay grammatical.
  const warningObject = displayName || "them";
  const warningSubject = displayName || "they";

  return (
    <>
      <label className="block">
        <span className="text-sm font-medium text-gray-700">{nameLabel}</span>
        <input
          type="text"
          value={value.name}
          onChange={(e) => onChange({ ...value, name: e.target.value })}
          className="mt-1 block w-full rounded border border-gray-300 px-3 py-2"
        />
      </label>

      <p className="text-sm text-gray-600">
        You won't see who's claimed what on this list, and you can't claim anything on
        it yourself. So if there's something you're planning to get {warningObject},
        leave it off — otherwise someone else may buy it too, and {warningSubject} will
        end up with two.
      </p>
    </>
  );
}
