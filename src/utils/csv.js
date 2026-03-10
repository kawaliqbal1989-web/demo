function escapeCsvCell(value) {
  if (value === null || value === undefined) {
    return "";
  }

  const text = String(value);
  const mustQuote = /[",\n\r]/.test(text);
  const escaped = text.replace(/"/g, '""');
  return mustQuote ? `"${escaped}"` : escaped;
}

function toCsv({ headers, rows }) {
  const headerLine = headers.map((h) => escapeCsvCell(h)).join(",");
  const lines = [headerLine];

  for (const row of rows) {
    lines.push(row.map((cell) => escapeCsvCell(cell)).join(","));
  }

  return lines.join("\n");
}

export { escapeCsvCell, toCsv };
