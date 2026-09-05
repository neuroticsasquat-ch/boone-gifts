import type { RecipientValue } from "../lib/recipient";

/**
 * The "this list is for someone else" control, shared by the create form and the
 * list's edit header (NEU-1216 §2.7).
 *
 * Progressive disclosure: unchecked, the surrounding form is exactly what it was
 * before this feature existed — which is what keeps simple mode's create form to
 * two fields. Checked, it reveals a name and a *required* radio. The radio is
 * required rather than a default-off checkbox because the flag is a property of
 * the person, not the list, and a default is exactly how it would drift across
 * that person's lists.
 */
export function RecipientFields({
  value,
  onChange,
}: {
  value: RecipientValue;
  onChange: (value: RecipientValue) => void;
}) {
  const displayName = value.name.trim();
  // Before a name is typed the radio still has to read as a sentence, and the
  // fallback subject is plural: "Beth uses this app" but "They use this app",
  // so the verb travels with the subject.
  const usesLabel = displayName ? `${displayName} uses this app` : "They use this app";
  const doesNotUseLabel = displayName
    ? `${displayName} doesn't use this app`
    : "They don't use this app";
  // In the warning the name appears twice, once as an object and once as a
  // subject, so the fallback needs both cases to stay grammatical.
  const warningObject = displayName || "them";
  const warningSubject = displayName || "they";

  return (
    <fieldset className="mb-6">
      <label className="flex items-center gap-2">
        <input
          type="checkbox"
          checked={value.enabled}
          onChange={(e) =>
            onChange(
              e.target.checked
                ? { ...value, enabled: true }
                : { enabled: false, name: "", hasAccount: null },
            )
          }
          className="rounded border-gray-300"
        />
        <span className="text-sm text-gray-700">This list is for someone else</span>
      </label>

      {value.enabled && (
        <div className="mt-3 space-y-3 border-l-2 border-gray-200 pl-3">
          <label className="block">
            <span className="text-sm font-medium text-gray-700">Who is this list for?</span>
            <input
              type="text"
              value={value.name}
              onChange={(e) => onChange({ ...value, name: e.target.value })}
              className="mt-1 block w-full rounded border border-gray-300 px-3 py-2"
            />
          </label>

          <div role="radiogroup" aria-label="Does this person use the app?" className="space-y-2">
            <label className="flex items-center gap-2">
              <input
                type="radio"
                name="recipient-has-account"
                checked={value.hasAccount === true}
                onChange={() => onChange({ ...value, hasAccount: true })}
                className="border-gray-300"
              />
              <span className="text-sm text-gray-700">{usesLabel}</span>
            </label>
            <label className="flex items-center gap-2">
              <input
                type="radio"
                name="recipient-has-account"
                checked={value.hasAccount === false}
                onChange={() => onChange({ ...value, hasAccount: false })}
                className="border-gray-300"
              />
              <span className="text-sm text-gray-700">{doesNotUseLabel}</span>
            </label>
          </div>

          {value.hasAccount === false && (
            <p className="text-sm text-gray-600">
              You won't see who's claimed what on this list, and you can't claim anything on
              it yourself. So if there's something you're planning to get {warningObject},
              leave it off — otherwise someone else may buy it too, and {warningSubject} will
              end up with two.
            </p>
          )}
        </div>
      )}
    </fieldset>
  );
}
