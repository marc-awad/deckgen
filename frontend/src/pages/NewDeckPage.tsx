import { useState } from "react";
import { useNavigate } from "react-router";
import { type ApiError, asApiError, createDeck, generateCards } from "../api/client";
import type { Deck } from "../api/types";
import { GenerateForm } from "../components/GenerateForm";
import { GenerationStatus } from "../components/GenerationStatus";
import { PageTitle } from "../components/PageTitle";
import { cardCountLabel } from "../format";
import { type FormValues, INITIAL_VALUES } from "../validation";

export function NewDeckPage() {
  const navigate = useNavigate();
  const [values, setValues] = useState<FormValues>(INITIAL_VALUES);
  const [deck, setDeck] = useState<Deck | null>(null);
  const [isGenerating, setIsGenerating] = useState(false);
  const [error, setError] = useState<ApiError | null>(null);

  async function generate() {
    setError(null);
    setIsGenerating(true);
    try {
      // After a failed generation the deck already exists: only the generation is retried
      const target = deck ?? (await createDeck(values.name.trim()));
      setDeck(target);
      const cards = await generateCards(target.id, values.text.trim(), Number(values.count));
      const generated = cards.length > 1 ? "générées" : "générée";
      navigate(`/decks/${target.id}`, {
        state: { notice: `${cardCountLabel(cards.length)} ${generated}.` },
      });
    } catch (err) {
      setError(asApiError(err));
      setIsGenerating(false);
    }
  }

  return (
    <>
      <PageTitle title="Nouveau deck" />
      <p className="mt-1 text-slate-600">Collez un cours : deckgen en tire des flashcards de révision.</p>
      <GenerateForm
        values={values}
        onChange={setValues}
        onSubmit={generate}
        isGenerating={isGenerating}
        deckCreated={deck !== null}
      />
      <GenerationStatus isGenerating={isGenerating} error={error} onRetry={generate} />
    </>
  );
}
