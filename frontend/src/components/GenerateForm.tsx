import {
  COUNT_MAX,
  COUNT_MIN,
  type FormValues,
  formatNumber,
  NAME_MAX,
  TEXT_MAX,
  TEXT_MIN,
  validateForm,
} from "../validation";

interface GenerateFormProps {
  values: FormValues;
  onChange: (values: FormValues) => void;
  onSubmit: () => void;
  isGenerating: boolean;
  // True after a failed generation: the deck exists, its name can no longer change
  deckCreated: boolean;
}

const fieldClass =
  "mt-1 block w-full rounded-md border border-slate-300 bg-white px-3 py-2 shadow-sm " +
  "disabled:bg-slate-100 disabled:text-slate-500";

export function GenerateForm({
  values,
  onChange,
  onSubmit,
  isGenerating,
  deckCreated,
}: GenerateFormProps) {
  const problems = validateForm(values);
  const textLength = values.text.trim().length;
  const textOutOfRange = textLength > 0 && (textLength < TEXT_MIN || textLength > TEXT_MAX);

  return (
    <form
      className="rounded-lg border border-slate-200 bg-white p-4 shadow-sm sm:p-6"
      onSubmit={(event) => {
        event.preventDefault();
        if (problems.length === 0) onSubmit();
      }}
    >
      {/* A disabled fieldset disables every field and button inside it */}
      <fieldset disabled={isGenerating} className="space-y-5">
        <legend className="text-lg font-semibold">Nouveau deck</legend>

        <div>
          <label htmlFor="deck-name" className="block text-sm font-medium">
            Nom du deck
          </label>
          <input
            id="deck-name"
            type="text"
            className={fieldClass}
            value={values.name}
            maxLength={NAME_MAX}
            disabled={deckCreated}
            aria-describedby={deckCreated ? "deck-name-hint" : undefined}
            onChange={(event) => onChange({ ...values, name: event.target.value })}
          />
          {deckCreated && (
            <p id="deck-name-hint" className="mt-1 text-sm text-slate-600">
              Ce deck est déjà créé : seule la génération sera relancée.
            </p>
          )}
        </div>

        <div>
          <label htmlFor="course-text" className="block text-sm font-medium">
            Cours
          </label>
          <textarea
            id="course-text"
            rows={10}
            className={fieldClass}
            value={values.text}
            placeholder="Collez ici le texte de votre cours…"
            aria-describedby="course-text-counter"
            onChange={(event) => onChange({ ...values, text: event.target.value })}
          />
          <p
            id="course-text-counter"
            className={`mt-1 text-sm ${textOutOfRange ? "text-red-700" : "text-slate-600"}`}
          >
            {formatNumber(textLength)} / {formatNumber(TEXT_MAX)} caractères (minimum {TEXT_MIN})
          </p>
        </div>

        <div>
          <label htmlFor="card-count" className="block text-sm font-medium">
            Nombre maximum de cartes
          </label>
          <input
            id="card-count"
            type="number"
            inputMode="numeric"
            min={COUNT_MIN}
            max={COUNT_MAX}
            step={1}
            className={`${fieldClass} sm:w-32`}
            value={values.count}
            aria-describedby="card-count-hint"
            onChange={(event) => onChange({ ...values, count: event.target.value })}
          />
          <p id="card-count-hint" className="mt-1 text-sm text-slate-600">
            Entre {COUNT_MIN} et {COUNT_MAX}. Le modèle peut en créer moins si le cours est court.
          </p>
        </div>

        <div className="space-y-3">
          <button
            type="submit"
            disabled={problems.length > 0}
            aria-describedby={problems.length > 0 ? "form-problems" : undefined}
            className="w-full rounded-md bg-blue-600 px-4 py-2 font-medium text-white hover:bg-blue-700 disabled:cursor-not-allowed disabled:opacity-50 sm:w-auto"
          >
            {isGenerating ? "Génération en cours…" : "Générer les cartes"}
          </button>
          {problems.length > 0 && (
            <ul id="form-problems" className="list-inside list-disc text-sm text-slate-600">
              {problems.map((problem) => (
                <li key={problem}>{problem}</li>
              ))}
            </ul>
          )}
        </div>
      </fieldset>
    </form>
  );
}
