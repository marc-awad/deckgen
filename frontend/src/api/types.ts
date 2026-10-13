// Shapes of the api responses (see api/README.md); dates arrive as ISO strings in JSON

export interface Deck {
  id: number;
  name: string;
  createdAt: string;
}

export interface Card {
  id: number;
  deckId: number;
  front: string;
  back: string;
  createdAt: string;
}

// One entry of "errors" in a 422 response
export interface FieldError {
  field: string;
  message: string;
}
