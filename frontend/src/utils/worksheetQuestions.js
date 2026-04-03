const OPERATION_SYMBOLS = {
  ADD: "+",
  SUB: "-",
  MUL: "×",
  DIV: "÷"
};

function formatColumnSumPrompt(nums) {
  const safeNums = Array.isArray(nums) ? nums.filter((n) => typeof n === "number" && Number.isFinite(n)) : [];
  if (!safeNums.length) {
    return "";
  }

  const [first, ...rest] = safeNums;
  let output = String(first);
  for (const value of rest) {
    if (value >= 0) {
      output += ` + ${value}`;
    } else {
      output += ` - ${Math.abs(value)}`;
    }
  }
  return output;
}

function getWorksheetQuestionTerms(question) {
  const operands = question?.operands && typeof question.operands === "object" ? question.operands : {};
  if (Array.isArray(operands?.nums)) {
    return operands.nums;
  }
  if (Array.isArray(operands?.terms)) {
    return operands.terms;
  }
  return [];
}

function formatWorksheetQuestionPrompt(question) {
  const operation = question?.operation ? String(question.operation).trim().toUpperCase() : "";
  const operands = question?.operands && typeof question.operands === "object" ? question.operands : {};

  if (typeof operands.expr === "string" && operands.expr.trim()) {
    return operands.expr.trim();
  }

  if (operation === "COLUMN_SUM") {
    const expression = formatColumnSumPrompt(getWorksheetQuestionTerms(question));
    return expression || "COLUMN_SUM";
  }

  const terms = getWorksheetQuestionTerms(question);

  if (operation === "MIX" && terms.length >= 2) {
    const operators = Array.isArray(operands?.operators) ? operands.operators : [];
    return terms
      .map((term, index) => {
        if (index === 0) {
          return String(Number(term));
        }
        const operator = operators[index] || "ADD";
        return `${OPERATION_SYMBOLS[operator] || operator} ${Number(term)}`;
      })
      .join(" ");
  }

  if (terms.length >= 2) {
    if (operation === "ADD") {
      return terms
        .map((term, index) => {
          const value = Number(term);
          if (index === 0) {
            return String(value);
          }
          return value < 0 ? `- ${Math.abs(value)}` : `+ ${value}`;
        })
        .join(" ");
    }

    const sign = OPERATION_SYMBOLS[operation] || operation;
    return terms.map((term) => String(Number(term))).join(` ${sign} `);
  }

  const left = operands.a ?? operands.left ?? operands.x ?? "";
  const right = operands.b ?? operands.right ?? operands.y ?? "";
  const sign = OPERATION_SYMBOLS[operation] || operation;

  if (left !== "" || right !== "") {
    return `${left} ${sign} ${right}`.trim();
  }

  return operation || "—";
}

export { formatColumnSumPrompt, formatWorksheetQuestionPrompt, getWorksheetQuestionTerms };