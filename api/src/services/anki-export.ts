export interface ExportCard {
  front: string;
  back: string;
}

// Make a value fit in one field of a pipe-separated line
export function cleanField(value: string): string {
  return value.replaceAll("|", "/").replace(/\s+/g, " ").trim();
}

// Text file importable in Anki (File > Import), one card per line: front|back
export function buildAnkiExport(deckName: string, cards: ExportCard[]): string {
  const lines = ["#separator:Pipe", "#html:false", `#deck:${cleanField(deckName)}`];

  for (const card of cards) {
    let front = cleanField(card.front);
    // Anki treats a line starting with "#" as a header or a comment
    if (front.startsWith("#")) {
      front = ` ${front}`;
    }
    lines.push(`${front}|${cleanField(card.back)}`);
  }

  return `${lines.join("\n")}\n`;
}

// e.g. 3 and "Réseaux & Docker" give "deckgen-3-reseaux-docker.txt"
export function exportFileName(deckId: number, deckName: string): string {
  const slug = deckName
    .normalize("NFD") // "é" becomes "e" followed by a combining accent
    .replace(/\p{M}/gu, "") // remove the combining accents
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "");
  return slug ? `deckgen-${deckId}-${slug}.txt` : `deckgen-${deckId}.txt`;
}
