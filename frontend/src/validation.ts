import { formatNumber } from "./format";

// Same rules as the api (see api/README.md), checked before any call
export const NAME_MAX = 100;
export const TEXT_MIN = 50;
export const TEXT_MAX = 20_000;
export const COUNT_MIN = 1;
export const COUNT_MAX = 30;
export const CARD_TEXT_MAX = 500;

export interface FormValues {
  name: string;
  text: string;
  // Kept as typed so that the field can be emptied while editing
  count: string;
}

export const INITIAL_VALUES: FormValues = { name: "", text: "", count: "5" };

export interface CardValues {
  front: string;
  back: string;
}

// What is missing or invalid; an empty list means the form can be sent
export function validateForm(values: FormValues): string[] {
  const problems: string[] = [];
  const nameLength = values.name.trim().length;
  const textLength = values.text.trim().length;
  const count = Number(values.count);

  if (nameLength === 0) {
    problems.push("Donnez un nom au deck.");
  } else if (nameLength > NAME_MAX) {
    problems.push(`Le nom du deck ne doit pas dépasser ${NAME_MAX} caractères.`);
  }

  if (textLength < TEXT_MIN) {
    problems.push(`Collez un cours d'au moins ${TEXT_MIN} caractères.`);
  } else if (textLength > TEXT_MAX) {
    problems.push(`Le cours ne doit pas dépasser ${formatNumber(TEXT_MAX)} caractères.`);
  }

  if (!Number.isInteger(count) || count < COUNT_MIN || count > COUNT_MAX) {
    problems.push(`Choisissez un nombre de cartes entier entre ${COUNT_MIN} et ${COUNT_MAX}.`);
  }

  return problems;
}

// Same rules as PUT /cards/:id: 1 to 500 characters once trimmed, for each side
export function validateCard(values: CardValues): string[] {
  const problems: string[] = [];
  const sides = [
    { label: "Le recto", length: values.front.trim().length },
    { label: "Le verso", length: values.back.trim().length },
  ];

  for (const side of sides) {
    if (side.length === 0) {
      problems.push(`${side.label} ne peut pas être vide.`);
    } else if (side.length > CARD_TEXT_MAX) {
      problems.push(`${side.label} ne doit pas dépasser ${CARD_TEXT_MAX} caractères.`);
    }
  }

  return problems;
}
