// e.g. 20000 gives "20 000"
export function formatNumber(value: number): string {
  return value.toLocaleString("fr-FR");
}

// e.g. "2026-10-13T07:14:28.962Z" gives "13 octobre 2026"
export function formatDate(isoDate: string): string {
  return new Date(isoDate).toLocaleDateString("fr-FR", {
    day: "numeric",
    month: "long",
    year: "numeric",
  });
}

// "0 carte", "1 carte", "5 cartes" (in French, 0 takes the singular)
export function cardCountLabel(count: number): string {
  return `${count} carte${count > 1 ? "s" : ""}`;
}
