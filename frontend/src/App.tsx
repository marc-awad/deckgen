import { useState } from "react";
import { ApiError, createDeck, generateCards } from "./api/client";
import type { Card, Deck } from "./api/types";
import { CardList } from "./components/CardList";
import { GenerateForm } from "./components/GenerateForm";
import { GenerationStatus } from "./components/GenerationStatus";
import { type FormValues, INITIAL_VALUES } from "./validation";

export default function App() {
  const [values, setValues] = useState<FormValues>(INITIAL_VALUES);
  const [deck, setDeck] = useState<Deck | null>(null);
  const [cards, setCards] = useState<Card[] | null>(null);
  const [isGenerating, setIsGenerating] = useState(false);
  const [error, setError] = useState<ApiError | null>(null);

  async function generate() {
    setError(null);
    setIsGenerating(true);
    try {
      // After a failed generation the deck already exists: only the generation is retried
      const target = deck ?? (await createDeck(values.name.trim()));
      setDeck(target);
      setCards(await generateCards(target.id, values.text.trim(), Number(values.count)));
    } catch (err) {
      setError(err instanceof ApiError ? err : new ApiError(0, "Une erreur inattendue est survenue."));
    } finally {
      setIsGenerating(false);
    }
  }

  function reset() {
    setValues(INITIAL_VALUES);
    setDeck(null);
    setCards(null);
    setError(null);
  }

  return (
    <div className="min-h-screen bg-slate-50 text-slate-900">
      <header className="border-b border-slate-200 bg-white">
        <div className="mx-auto max-w-3xl px-4 py-4">
          <h1 className="text-2xl font-bold text-blue-700">deckgen</h1>
          <p className="text-sm text-slate-600">Transformez un cours en flashcards de révision.</p>
        </div>
      </header>

      <main className="mx-auto max-w-3xl px-4 py-6 sm:py-8">
        {deck && cards ? (
          <>
            <CardList deckName={deck.name} cards={cards} />
            <button
              type="button"
              onClick={reset}
              className="mt-6 w-full rounded-md bg-blue-600 px-4 py-2 font-medium text-white hover:bg-blue-700 sm:w-auto"
            >
              Nouveau deck
            </button>
          </>
        ) : (
          <>
            <GenerateForm
              values={values}
              onChange={setValues}
              onSubmit={generate}
              isGenerating={isGenerating}
              deckCreated={deck !== null}
            />
            <GenerationStatus isGenerating={isGenerating} error={error} onRetry={generate} />
          </>
        )}
      </main>
    </div>
  );
}
