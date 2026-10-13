import { useEffect, useState } from "react";
import type { ApiError } from "../api/client";

interface GenerationStatusProps {
  isGenerating: boolean;
  error: ApiError | null;
  onRetry: () => void;
}

// Api field names shown with the labels of the form
const FIELD_LABELS: Record<string, string> = {
  name: "Nom du deck",
  text: "Cours",
  count: "Nombre de cartes",
};

function errorMessage(error: ApiError): string {
  switch (error.status) {
    case 0:
      return error.message;
    case 422:
      return "Le serveur a refusé certaines données :";
    case 502:
      return "Le modèle a renvoyé une réponse invalide. Une nouvelle tentative donne souvent un meilleur résultat.";
    case 503:
      return "Le service de génération est indisponible pour le moment. Réessayez dans quelques instants.";
    case 504:
      return "La génération a pris trop de temps. Essayez avec un cours plus court ou moins de cartes.";
    default:
      return `Une erreur inattendue est survenue (code ${error.status}). Réessayez dans un instant.`;
  }
}

function LoadingIndicator() {
  const [seconds, setSeconds] = useState(0);

  // Mounted only during a generation, so the counter restarts from 0 each time
  useEffect(() => {
    const timer = setInterval(() => setSeconds((value) => value + 1), 1000);
    return () => clearInterval(timer);
  }, []);

  return (
    <div className="flex items-center gap-3 rounded-lg border border-blue-200 bg-blue-50 p-4 text-blue-900">
      <span
        aria-hidden="true"
        className="size-5 shrink-0 animate-spin rounded-full border-2 border-blue-300 border-t-blue-700 motion-reduce:animate-none"
      />
      <div>
        <p className="font-medium">Génération en cours…</p>
        <p className="text-sm">La génération peut prendre jusqu'à une minute.</p>
        {/* role="timer" is not announced on every tick, unlike the rest of the live region */}
        <p role="timer" aria-live="off" className="text-sm tabular-nums">
          {seconds} s écoulée{seconds > 1 ? "s" : ""}
        </p>
      </div>
    </div>
  );
}

export function GenerationStatus({ isGenerating, error, onRetry }: GenerationStatusProps) {
  return (
    // Always rendered, so screen readers announce what appears inside
    <div aria-live="polite" className="mt-6">
      {isGenerating && <LoadingIndicator />}

      {!isGenerating && error && (
        <div role="alert" className="rounded-lg border border-red-200 bg-red-50 p-4 text-red-900">
          <p className="font-medium">{errorMessage(error)}</p>
          {error.fieldErrors.length > 0 && (
            <ul className="mt-2 list-inside list-disc text-sm">
              {error.fieldErrors.map((fieldError) => (
                <li key={fieldError.field}>
                  {FIELD_LABELS[fieldError.field] ?? fieldError.field} : {fieldError.message}
                </li>
              ))}
            </ul>
          )}
          {/* Sending the same invalid data again would fail the same way */}
          {error.status !== 422 && (
            <button
              type="button"
              onClick={onRetry}
              className="mt-3 rounded-md border border-red-300 bg-white px-4 py-2 font-medium text-red-900 hover:bg-red-100"
            >
              Réessayer
            </button>
          )}
        </div>
      )}
    </div>
  );
}
