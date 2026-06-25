function toCellValue(value) {
  if (value === null || value === undefined) {
    return "";
  }
  if (typeof value === "number" || typeof value === "boolean") {
    return value;
  }
  if (value instanceof Date) {
    return value.toISOString();
  }
  if (typeof value === "object") {
    try {
      return JSON.stringify(value);
    } catch {
      return "[object]";
    }
  }
  return String(value);
}

function createDeterministicWorkbookDefinition(report) {
  const tables = Array.isArray(report?.tables) ? report.tables : [];

  return {
    reportKey: report?.reportKey || null,
    generatedAt: report?.generatedAt || null,
    sheets: tables.map((table) => {
      const columns = Array.isArray(table?.columns)
        ? table.columns.map((column) => ({
            key: String(column?.key || "value"),
            label: String(column?.label || column?.key || "Value")
          }))
        : [{ key: "value", label: "Value" }];

      const rows = Array.isArray(table?.rows)
        ? table.rows.map((row) =>
            columns.reduce((accumulator, column) => {
              accumulator[column.key] = toCellValue(row?.[column.key]);
              return accumulator;
            }, {})
          )
        : [];

      return {
        id: table?.id || null,
        title: table?.title || null,
        columns,
        rows
      };
    })
  };
}

export { createDeterministicWorkbookDefinition };
