import type { Card } from "../api/types";
import { CardItem } from "./CardItem";

interface CardListProps {
  cards: Card[];
  // Id of the card being edited, null if none
  editingId: number | null;
  onEditingChange: (cardId: number | null) => void;
  onCardSaved: (card: Card) => void;
  onCardDeleted: (cardId: number) => void;
}

export function CardList({
  cards,
  editingId,
  onEditingChange,
  onCardSaved,
  onCardDeleted,
}: CardListProps) {
  return (
    <ol className="mt-6 space-y-4">
      {cards.map((card, index) => (
        <CardItem
          key={card.id}
          card={card}
          number={index + 1}
          isEditing={editingId === card.id}
          editLocked={editingId !== null && editingId !== card.id}
          onEdit={() => onEditingChange(card.id)}
          onCancel={() => onEditingChange(null)}
          onSaved={onCardSaved}
          onDeleted={onCardDeleted}
        />
      ))}
    </ol>
  );
}
