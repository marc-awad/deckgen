import { useEffect, useRef } from "react";
import type { Card } from "../api/types";

interface CardListProps {
  deckName: string;
  cards: Card[];
}

export function CardList({ deckName, cards }: CardListProps) {
  const headingRef = useRef<HTMLHeadingElement>(null);

  // Move the focus to the result, so keyboard and screen reader users land on it
  useEffect(() => {
    headingRef.current?.focus();
  }, []);

  return (
    <section aria-labelledby="result-title">
      <h2 id="result-title" ref={headingRef} tabIndex={-1} className="text-xl font-semibold">
        {deckName}
        <span className="ml-2 text-base font-normal text-slate-600">
          · {cards.length} carte{cards.length > 1 ? "s" : ""}
        </span>
      </h2>

      <ol className="mt-4 space-y-4">
        {cards.map((card) => (
          <li key={card.id} className="rounded-lg border border-slate-200 bg-white p-4 shadow-sm">
            <dl>
              <dt className="text-xs font-semibold tracking-wide text-blue-700 uppercase">
                Recto · question
              </dt>
              <dd className="mt-1 font-medium break-words">{card.front}</dd>
              <dt className="mt-3 border-t border-slate-100 pt-3 text-xs font-semibold tracking-wide text-emerald-700 uppercase">
                Verso · réponse
              </dt>
              <dd className="mt-1 break-words text-slate-700">{card.back}</dd>
            </dl>
          </li>
        ))}
      </ol>
    </section>
  );
}
