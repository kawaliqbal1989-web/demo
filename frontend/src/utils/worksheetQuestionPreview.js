const OP_SYMBOLS = {
  ADD: "+",
  SUB: "-",
  MUL: "×",
  DIV: "÷"
};

function normalizeOperation(operation) {
  return String(operation || "").trim().toUpperCase();
}

function hasOwnProperty(object, key) {
  return Object.prototype.hasOwnProperty.call(object, key);
}

function hasRenderableOperands(operands) {
  if (!operands || typeof operands !== "object") {
    return false;
  }

  if (typeof operands.expr === "string" && operands.expr.trim()) {
    return true;
  }

  if (Array.isArray(operands.nums) && operands.nums.length > 0) {
    return true;
  }

  if (Array.isArray(operands.terms) && operands.terms.length > 0) {
    return true;
  }

  return ["a", "b", "left", "right", "x", "y"].some((key) => hasOwnProperty(operands, key));
}

function getQuestionOperands(question) {
  const directOperands = question?.operands && typeof question.operands === "object" ? question.operands : null;
  if (hasRenderableOperands(directOperands)) {
    return directOperands;
  }

  const linkedOperands = question?.questionBank?.operands && typeof question.questionBank.operands === "object"
    ? question.questionBank.operands
    : null;
  if (hasRenderableOperands(linkedOperands)) {
    return linkedOperands;
  }

  return directOperands || linkedOperands || {};
}

function getQuestionPrompt(question) {
  const prompt = question?.prompt;
  if (typeof prompt === "string" && prompt.trim()) {
    return prompt.trim();
  }

  const linkedPrompt = question?.questionBank?.prompt;
  if (typeof linkedPrompt === "string" && linkedPrompt.trim()) {
    return linkedPrompt.trim();
  }

  return "";
}

function getQuestionTerms(question) {
  const operands = getQuestionOperands(question);

  if (Array.isArray(operands?.nums)) {
    return operands.nums;
  }

  if (Array.isArray(operands?.terms)) {
    return operands.terms;
  }

  return [];
}

function formatSignedTerms(terms) {
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

function formatMixedTerms(terms, operators) {
  return terms
    .map((term, index) => {
      if (index === 0) {
        return String(Number(term));
      }

      const operation = normalizeOperation(operators[index] || "ADD");
      return `${OP_SYMBOLS[operation] || operation} ${Number(term)}`;
    })
    .join(" ");
}

function formatColumnSumPrompt(terms) {
  const safeTerms = Array.isArray(terms)
    ? terms.filter((value) => Number.isFinite(Number(value))).map((value) => Number(value))
    : [];

  if (!safeTerms.length) {
    return "";
  }

  const [first, ...rest] = safeTerms;
  return rest.reduce((output, value) => {
    return value < 0 ? `${output} - ${Math.abs(value)}` : `${output} + ${value}`;
  }, String(first));
}

function formatWorksheetQuestionPreview(question) {
  const operation = normalizeOperation(question?.operation || question?.questionBank?.operation);
  const operands = getQuestionOperands(question);
  const prompt = getQuestionPrompt(question);

  if (typeof operands.expr === "string" && operands.expr.trim()) {
    return operands.expr.trim();
  }

  const terms = getQuestionTerms(question);

  if (operation === "COLUMN_SUM") {
    return formatColumnSumPrompt(terms) || String(question?.prompt || "COLUMN_SUM");
  }

  if (operation === "MIX" && terms.length >= 2) {
    const operators = Array.isArray(operands?.operators) ? operands.operators : [];
    return formatMixedTerms(terms, operators);
  }

  if (terms.length >= 2) {
    if (operation === "ADD") {
      return formatSignedTerms(terms);
    }

    const sign = OP_SYMBOLS[operation] || operation;
    return terms.map((term) => String(Number(term))).join(` ${sign} `);
  }

  const left = operands?.a ?? operands?.left ?? operands?.x ?? "";
  const right = operands?.b ?? operands?.right ?? operands?.y ?? "";
  if (left !== "" || right !== "") {
    const sign = OP_SYMBOLS[operation] || operation;
    return `${left} ${sign} ${right}`.trim();
  }

  return String(prompt || operation || "—");
}

export { formatWorksheetQuestionPreview };