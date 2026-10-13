import { useState } from "react";
import { type ApiError, asApiError, errorText } from "../api/client";
import type { Card } from "../api/types";
import { fieldClass, primaryButton, secondaryButton } from "../styles";
import { CARD_TEXT_MAX, type CardValues, validateCard } from "../validation";

interface CardEditFormProps {
  card: Card;
  // Rejects with the api error: the form stays open with what was typed
  onSave: (values: CardValues) => Promise<void>;
  onCancel: () => void;
}

export function CardEditForm({ card, onSave, onCancel }: CardEditFormProps) {
  const [values, setValues] = useState<CardValues>({ front: card.front, back: card.back });
  const [isSaving, setIsSaving] = useState(false);
  const [error, setError] = useState<ApiError | null>(null);
  const problems = validateCard(values);

  async function save() {
    setIsSaving(true);
    setError(null);
    try {
      await onSave({ front: values.front.trim(), back: values.back.trim() });
    } catch (err) {
      setError(asApiError(err));
      setIsSaving(false);
    }
  }

  const sides = [
    { key: "front", label: "Recto · question" },
    { key: "back", label: "Verso · réponse" },
  ] as const;

  return (
    <form
      onSubmit={(event) => {
        event.preventDefault();
        if (problems.length === 0) void save();
      }}
      onKeyDown={(event) => {
        if (event.key === "Escape" && !isSaving) onCancel();
      }}
    >
      <fieldset disabled={isSaving} className="space-y-4">
        <legend className="sr-only">Modifier la carte</legend>

        {sides.map((side, index) => {
          const id = `card-${card.id}-${side.key}`;
          const length = values[side.key].trim().length;
          const invalid = length === 0 || length > CARD_TEXT_MAX;
          return (
            <div key={side.key}>
              <label htmlFor={id} className="block text-sm font-medium">
                {side.label}
              </label>
              <textarea
                id={id}
                rows={3}
                className={fieldClass}
                value={values[side.key]}
                // Focus the first field when the form opens
                autoFocus={index === 0}
                aria-describedby={`${id}-counter`}
                onChange={(event) => setValues({ ...values, [side.key]: event.target.value })}
              />
              <p
                id={`${id}-counter`}
                className={`mt-1 text-sm ${invalid ? "text-red-700" : "text-slate-600"}`}
              >
                {length} / {CARD_TEXT_MAX} caractères
              </p>
            </div>
          );
        })}

        {problems.length > 0 && (
          <ul id={`card-${card.id}-problems`} className="list-inside list-disc text-sm text-slate-600">
            {problems.map((problem) => (
              <li key={problem}>{problem}</li>
            ))}
          </ul>
        )}

        <div className="flex flex-wrap gap-2">
          <button
            type="submit"
            disabled={problems.length > 0}
            aria-describedby={problems.length > 0 ? `card-${card.id}-problems` : undefined}
            className={primaryButton}
          >
            {isSaving ? "Enregistrement…" : "Enregistrer"}
          </button>
          <button type="button" onClick={onCancel} className={secondaryButton}>
            Annuler
          </button>
        </div>
      </fieldset>

      {error && (
        <p role="alert" className="mt-3 rounded-md border border-red-200 bg-red-50 p-3 text-sm text-red-900">
          L'enregistrement a échoué. {errorText(error)}
        </p>
      )}
    </form>
  );
}
