import { formatWorksheetQuestionPreview } from "../worksheetQuestionPreview";

describe("formatWorksheetQuestionPreview", () => {
  it("prefers an explicit expr operand when present", () => {
    expect(
      formatWorksheetQuestionPreview({
        operation: "ADD",
        prompt: "ignored",
        operands: { expr: "8 + 3 - 1" }
      })
    ).toBe("8 + 3 - 1");
  });

  it("renders COLUMN_SUM prompts with signed terms", () => {
    expect(
      formatWorksheetQuestionPreview({
        operation: "COLUMN_SUM",
        operands: { terms: [12, -4, 9] }
      })
    ).toBe("12 - 4 + 9");
  });

  it("renders MIX prompts using operator codes", () => {
    expect(
      formatWorksheetQuestionPreview({
        operation: "MIX",
        operands: {
          terms: [9, 3, 2],
          operators: ["", "SUB", "MUL"]
        }
      })
    ).toBe("9 - 3 × 2");
  });

  it("renders add prompts with negative terms clearly", () => {
    expect(
      formatWorksheetQuestionPreview({
        operation: "ADD",
        operands: { nums: [5, -2, 7] }
      })
    ).toBe("5 - 2 + 7");
  });

  it("falls back to linked question-bank prompt when worksheet operands are empty", () => {
    expect(
      formatWorksheetQuestionPreview({
        operation: "ADD",
        operands: { terms: [], operators: [] },
        questionBank: {
          prompt: "Upper Deck 4 operations - 6",
          operands: { terms: [], operators: [] }
        }
      })
    ).toBe("Upper Deck 4 operations - 6");
  });
});