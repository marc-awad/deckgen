import { describe, expect, it } from "vitest";
import { type FormValues, validateCard, validateForm } from "./validation";

const VALID_FORM: FormValues = { name: "Docker", text: "x".repeat(50), count: "5" };

describe("validateForm", () => {
  it("accepts a valid form", () => {
    expect(validateForm(VALID_FORM)).toEqual([]);
  });

  it("refuses a name made only of spaces", () => {
    expect(validateForm({ ...VALID_FORM, name: "   " })).toEqual(["Donnez un nom au deck."]);
  });

  it("accepts a name of exactly 100 characters", () => {
    expect(validateForm({ ...VALID_FORM, name: "x".repeat(100) })).toEqual([]);
  });

  it("refuses a name of 101 characters", () => {
    expect(validateForm({ ...VALID_FORM, name: "x".repeat(101) })).toHaveLength(1);
  });

  it("counts the course length without the spaces around it", () => {
    expect(validateForm({ ...VALID_FORM, text: `   ${"x".repeat(49)}   ` })).toEqual([
      "Collez un cours d'au moins 50 caractères.",
    ]);
  });

  it("accepts a course of exactly 20 000 characters", () => {
    expect(validateForm({ ...VALID_FORM, text: "x".repeat(20_000) })).toEqual([]);
  });

  it("refuses a course of 20 001 characters", () => {
    expect(validateForm({ ...VALID_FORM, text: "x".repeat(20_001) })).toHaveLength(1);
  });

  it.each(["1", "30"])("accepts %s cards, a bound of the allowed range", (count) => {
    expect(validateForm({ ...VALID_FORM, count })).toEqual([]);
  });

  it.each(["0", "31", "2.5", "", "abc"])("refuses the count %j", (count) => {
    expect(validateForm({ ...VALID_FORM, count })).toEqual([
      "Choisissez un nombre de cartes entier entre 1 et 30.",
    ]);
  });

  it("lists every problem at once", () => {
    expect(validateForm({ name: "", text: "", count: "0" })).toHaveLength(3);
  });
});

describe("validateCard", () => {
  it("accepts a card with both sides filled", () => {
    expect(validateCard({ front: "Q ?", back: "R." })).toEqual([]);
  });

  it("refuses a front made only of spaces", () => {
    expect(validateCard({ front: "   ", back: "R." })).toEqual(["Le recto ne peut pas être vide."]);
  });

  it("refuses an empty back", () => {
    expect(validateCard({ front: "Q ?", back: "" })).toEqual(["Le verso ne peut pas être vide."]);
  });

  it("accepts 500 characters once the spaces around are removed", () => {
    expect(validateCard({ front: `  ${"x".repeat(500)}  `, back: "R." })).toEqual([]);
  });

  it("refuses a side over 500 characters", () => {
    expect(validateCard({ front: "Q ?", back: "x".repeat(501) })).toEqual([
      "Le verso ne doit pas dépasser 500 caractères.",
    ]);
  });
});
