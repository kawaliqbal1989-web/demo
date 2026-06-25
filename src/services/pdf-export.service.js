import { buildPdfBuffer, buildReportFilename } from "./report-export.service.js";

function createPrintablePdfExport(report) {
  const buffer = buildPdfBuffer(report || {});
  return {
    mimeType: "application/pdf",
    fileName: buildReportFilename(report || {}, "pdf"),
    byteLength: buffer.byteLength,
    buffer
  };
}

export { createPrintablePdfExport };
