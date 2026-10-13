// Same rules as the api (see api/README.md), checked before any call
export const NAME_MAX = 100;
export const TEXT_MIN = 50;
export const TEXT_MAX = 20_000;
export const COUNT_MIN = 1;
export const COUNT_MAX = 30;

export interface FormValues {
  name: string;
  text: string;
  // Kept as typed so that the field can be emptied while editing
  count: string;
}

export const INITIAL_VALUES: FormValues = { name: "", text: "", count: "5" };

// e.g. 20000 gives "20 000"
export function formatNumber(value: number): string {
  return value.toLocaleString("fr-FR");
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
