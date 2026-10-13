import { describe, expect, it } from "vitest";
import { buildAnkiExport, cleanField, exportFileName } from "../src/services/anki-export.js";

describe("cleanField", () => {
  it("replaces the pipe separator with a slash", () => {
    expect(cleanField("stdout | grep")).toBe("stdout / grep");
  });

  it("replaces line breaks and tabs with a single space", () => {
    expect(cleanField("première ligne\r\nseconde\tligne")).toBe("première ligne seconde ligne");
  });

  it("collapses repeated spaces and trims both ends", () => {
    expect(cleanField("   Le   port   80.  ")).toBe("Le port 80.");
  });
});

describe("buildAnkiExport", () => {
  it("starts with the three Anki header lines", () => {
    const lines = buildAnkiExport("Docker", [{ front: "Q", back: "R" }]).split("\n");

    expect(lines.slice(0, 3)).toEqual(["#separator:Pipe", "#html:false", "#deck:Docker"]);
  });

  it("writes one front|back line per card, ending with a newline", () => {
    const content = buildAnkiExport("Docker", [
      { front: "Q1 ?", back: "R1" },
      { front: "Q2 ?", back: "R2" },
    ]);

    expect(content).toBe("#separator:Pipe\n#html:false\n#deck:Docker\nQ1 ?|R1\nQ2 ?|R2\n");
  });

  it("cleans both sides of each card", () => {
    const content = buildAnkiExport("Docker", [{ front: "Le pipe | ?", back: "Ligne 1\nLigne 2" }]);

    expect(content.split("\n")[3]).toBe("Le pipe / ?|Ligne 1 Ligne 2");
  });

  it("adds a space before a front starting with # so Anki does not read it as a comment", () => {
    const content = buildAnkiExport("Docker", [{ front: "#1 Quel port ?", back: "80" }]);

    expect(content.split("\n")[3]).toBe(" #1 Quel port ?|80");
  });

  it("cleans the deck name of the #deck line", () => {
    const content = buildAnkiExport("Réseaux |\nDocker", []);

    expect(content.split("\n")[2]).toBe("#deck:Réseaux / Docker");
  });

  it("exports only the header lines for a deck without cards", () => {
    expect(buildAnkiExport("Vide", [])).toBe("#separator:Pipe\n#html:false\n#deck:Vide\n");
  });
});

describe("exportFileName", () => {
  it("builds a lowercase name without accents nor special characters", () => {
    expect(exportFileName(3, "Réseaux & Docker")).toBe("deckgen-3-reseaux-docker.txt");
  });

  it("removes dashes at both ends of the simplified name", () => {
    expect(exportFileName(7, "  (Java) !  ")).toBe("deckgen-7-java.txt");
  });

  it("keeps only the id when nothing is left of the name", () => {
    expect(exportFileName(5, "日本語")).toBe("deckgen-5.txt");
  });
});
