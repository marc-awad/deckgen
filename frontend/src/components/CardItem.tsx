import { useState } from "react";
import { asApiError, deleteCard, errorText, updateCard } from "../api/client";
import type { Card } from "../api/types";
import { dangerButton, secondaryButton } from "../styles";
import type { CardValues } from "../validation";
import { CardEditForm } from "./CardEditForm";

interface CardItemProps {
  card: Card;
  number: number;
  isEditing: boolean;
  // Another card is being edited: only one card can be edited at a time
  editLocked: boolean;
  onEdit: () => void;
  onCancel: () => void;
  onSaved: (card: Card) => void;
  onDeleted: (cardId: number) => void;
}

export function CardItem({
  card,
  number,
  isEditing,
  editLocked,
  onEdit,
  onCancel,
  onSaved,
  onDeleted,
}: CardItemProps) {
  const [isDeleting, setIsDeleting] = useState(false);
  const [deleteError, setDeleteError] = useState<string | null>(null);
  // Give the focus back to "Modifier" when the form closes (autoFocus applies on mount)
  const [focusEditButton, setFocusEditButton] = useState(false);

  async function save(values: CardValues) {
    const updated = await updateCard(card.id, values.front, values.back);
    setFocusEditButton(true);
    onSaved(updated);
  }

  function cancel() {
    setFocusEditButton(true);
    onCancel();
  }

  async function remove() {
    if (!window.confirm(`Supprimer la carte ${number} ? Cette action est définitive.`)) return;
    setIsDeleting(true);
    setDeleteError(null);
    try {
      await deleteCard(card.id);
      onDeleted(card.id);
    } catch (err) {
      setDeleteError(errorText(asApiError(err)));
      setIsDeleting(false);
    }
  }

  return (
    <li className="rounded-lg border border-slate-200 bg-white p-4 shadow-sm">
      <p className="mb-2 text-xs font-medium text-slate-500">Carte {number}</p>

      {isEditing ? (
        <CardEditForm card={card} onSave={save} onCancel={cancel} />
      ) : (
        <>
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

          <div className="mt-4 flex flex-wrap gap-2">
            <button
              type="button"
              onClick={onEdit}
              disabled={editLocked || isDeleting}
              autoFocus={focusEditButton}
              aria-label={`Modifier la carte ${number}`}
              className={secondaryButton}
            >
              Modifier
            </button>
            <button
              type="button"
              onClick={() => void remove()}
              disabled={isDeleting}
              aria-label={`Supprimer la carte ${number}`}
              className={dangerButton}
            >
              {isDeleting ? "Suppression…" : "Supprimer"}
            </button>
          </div>

          {deleteError && (
            <p role="alert" className="mt-3 rounded-md border border-red-200 bg-red-50 p-3 text-sm text-red-900">
              La suppression a échoué. {deleteError}
            </p>
          )}
        </>
      )}
    </li>
  );
}
