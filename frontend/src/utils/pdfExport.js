/**
 * PDF Export helpers using jsPDF.
 * All functions return a jsPDF instance so the caller can .save() or .output().
 */
import { jsPDF } from "jspdf";
import QRCode from "qrcode";

/**
 * Generate a QR code as a data URL.
 * @param {string} text
 * @returns {Promise<string>} data URL
 */
export async function generateQrDataUrl(text) {
  return QRCode.toDataURL(text, { width: 200, margin: 1 });
}

/**
 * Generate a beautiful certificate PDF.
 * @param {{ studentName: string, levelName: string, certificateNumber: string, issuedAt: string, template?: object, qrDataUrl?: string }} cert
 * @returns {jsPDF}
 */
export function generateCertificatePdf({ studentName, levelName, certificateNumber, issuedAt, template, qrDataUrl }) {
  const doc = new jsPDF({ orientation: "landscape", unit: "mm", format: "a4" });
  const w = doc.internal.pageSize.getWidth();
  const h = doc.internal.pageSize.getHeight();

  // Layout helper: get element position/size from saved layout or use defaults
  const L = template?.layout || {};
  const el = (key, defaults) => {
    const saved = L[key];
    if (!saved) return defaults;
    return {
      x: saved.x ?? defaults.x,
      y: saved.y ?? defaults.y,
      w: saved.w ?? defaults.w,
      h: saved.h ?? defaults.h,
      fontSize: saved.fontSize ?? defaults.fontSize,
      visible: saved.visible ?? defaults.visible
    };
  };

  const bgEl = el("background", { x: 0, y: 0, w, h: h, visible: true });
  const bpLogoEl = el("bpLogo", { x: 22, y: 18, w: 28, h: 28, visible: true });
  const affLogoEl = el("affiliationLogo", { x: w - 50, y: 18, w: 28, h: 28, visible: true });
  const titleEl = el("title", { x: w / 2, y: 55, fontSize: 28, visible: true });
  const subtitleEl = el("subtitle", { x: w / 2, y: 72, fontSize: 14, visible: true });
  const nameEl = el("studentName", { x: w / 2, y: 88, fontSize: 24, visible: true });
  const completionEl = el("completionText", { x: w / 2, y: 106, fontSize: 14, visible: true });
  const levelEl = el("levelName", { x: w / 2, y: 120, fontSize: 20, visible: true });
  const metaEl = el("certMeta", { x: w / 2, y: 145, fontSize: 10, visible: true });
  const sigEl = el("signature", { x: 55, y: 155, w: 40, h: 15, visible: true });
  const sigInfoEl = el("signatoryInfo", { x: 75, y: 175, fontSize: 9, visible: true });
  const stampEl = el("stamp", { x: w - 90, y: 152, w: 30, h: 30, visible: true });
  const qrEl = el("qrCode", { x: w - 45, y: h - 45, w: 25, h: 25, visible: true });

  // Background fill
  doc.setFillColor(255, 251, 235);
  doc.rect(0, 0, w, h, "F");

  // Custom background image (watermark) — rendered behind everything if provided
  if (bgEl.visible !== false && template?.backgroundImageUrl && template._backgroundImageData) {
    try {
      doc.addImage(template._backgroundImageData, "PNG", 0, 0, w, h, undefined, "FAST");
    } catch (_) {
      /* ignore load failures */
    }
  }

  // Gold border
  doc.setDrawColor(217, 119, 6);
  doc.setLineWidth(2);
  doc.rect(10, 10, w - 20, h - 20, "S");
  doc.setLineWidth(0.5);
  doc.rect(14, 14, w - 28, h - 28, "S");

  // BP logo (top-left) if available
  if (bpLogoEl.visible !== false && template?.bpLogoUrl && template._bpLogoData) {
    try {
      doc.addImage(template._bpLogoData, "PNG", bpLogoEl.x, bpLogoEl.y, bpLogoEl.w, bpLogoEl.h, undefined, "FAST");
    } catch (_) {
      /* ignore */
    }
  }

  // Affiliation logo (top-right) if available
  if (affLogoEl.visible !== false && template?.affiliationLogoUrl && template._affiliationLogoData) {
    try {
      doc.addImage(template._affiliationLogoData, "PNG", affLogoEl.x, affLogoEl.y, affLogoEl.w, affLogoEl.h, undefined, "FAST");
    } catch (_) {
      /* ignore */
    }
  }

  // Trophy emoji (simulated with text)
  doc.setFontSize(40);
  doc.text("*", w / 2, 40, { align: "center" });

  // Title (customizable)
  if (titleEl.visible !== false) {
    const certTitle = template?.title || "Certificate of Achievement";
    doc.setFontSize(titleEl.fontSize || 28);
    doc.setFont("helvetica", "bold");
    doc.setTextColor(146, 64, 14);
    doc.text(certTitle, titleEl.x, titleEl.y, { align: "center" });
  }

  // Subtitle
  if (subtitleEl.visible !== false) {
    doc.setFontSize(subtitleEl.fontSize || 14);
    doc.setFont("helvetica", "normal");
    doc.setTextColor(120, 113, 108);
    doc.text("This is to certify that", subtitleEl.x, subtitleEl.y, { align: "center" });
  }

  // Student name
  if (nameEl.visible !== false) {
    doc.setFontSize(nameEl.fontSize || 24);
    doc.setFont("helvetica", "bold");
    doc.setTextColor(30, 41, 59);
    doc.text(studentName, nameEl.x, nameEl.y, { align: "center" });
  }

  // Decorative line
  doc.setDrawColor(217, 119, 6);
  doc.setLineWidth(0.8);
  doc.line(nameEl.x - 50, nameEl.y + 5, nameEl.x + 50, nameEl.y + 5);

  // Completion text
  if (completionEl.visible !== false) {
    doc.setFontSize(completionEl.fontSize || 14);
    doc.setFont("helvetica", "normal");
    doc.setTextColor(120, 113, 108);
    doc.text("has successfully completed", completionEl.x, completionEl.y, { align: "center" });
  }

  // Level name
  if (levelEl.visible !== false) {
    doc.setFontSize(levelEl.fontSize || 20);
    doc.setFont("helvetica", "bold");
    doc.setTextColor(37, 99, 235);
    doc.text(levelName, levelEl.x, levelEl.y, { align: "center" });
  }

  // Meta info
  if (metaEl.visible !== false) {
    doc.setFontSize(metaEl.fontSize || 10);
    doc.setFont("helvetica", "normal");
    doc.setTextColor(107, 114, 128);
    const dateStr = issuedAt ? new Date(issuedAt).toLocaleDateString() : "";
    doc.text(`Certificate #: ${certificateNumber}`, metaEl.x - 40, metaEl.y, { align: "center" });
    doc.text(`Issued: ${dateStr}`, metaEl.x + 40, metaEl.y, { align: "center" });
  }

  // Signature section
  if (sigEl.visible !== false) {
    if (template?.signatureImageUrl && template._signatureImageData) {
      try {
        doc.addImage(template._signatureImageData, "PNG", sigEl.x, sigEl.y, sigEl.w, sigEl.h, undefined, "FAST");
      } catch (_) {
        /* ignore */
      }
    }
    // Signature line
    const sigLineY = sigEl.y + sigEl.h + 2;
    const sigCenterX = sigEl.x + sigEl.w / 2;
    doc.setDrawColor(156, 163, 175);
    doc.setLineWidth(0.3);
    doc.line(sigCenterX - 35, sigLineY, sigCenterX + 35, sigLineY);
  }

  // Signatory info
  if (sigInfoEl.visible !== false) {
    doc.setFontSize(sigInfoEl.fontSize || 9);
    doc.setTextColor(107, 114, 128);
    const sigName = template?.signatoryName || "";
    const sigDesignation = template?.signatoryDesignation || "Director";
    if (sigName) {
      doc.setFont("helvetica", "bold");
      doc.text(sigName, sigInfoEl.x, sigInfoEl.y, { align: "center" });
      doc.setFont("helvetica", "normal");
      doc.text(sigDesignation, sigInfoEl.x, sigInfoEl.y + 5, { align: "center" });
    } else {
      doc.setFont("helvetica", "normal");
      doc.text(sigDesignation, sigInfoEl.x, sigInfoEl.y + 2, { align: "center" });
    }
  }

  // Stamp / seal (right side) if available
  if (stampEl.visible !== false) {
    if (template?.stampImageUrl && template._stampImageData) {
      try {
        doc.addImage(template._stampImageData, "PNG", stampEl.x, stampEl.y, stampEl.w, stampEl.h, undefined, "FAST");
      } catch (_) {
        /* ignore */
      }
    }
    // Date line
    const stampCenterX = stampEl.x + stampEl.w / 2;
    const stampLineY = stampEl.y + stampEl.h + 2;
    doc.setDrawColor(156, 163, 175);
    doc.setLineWidth(0.3);
    doc.line(stampCenterX - 35, stampLineY, stampCenterX + 35, stampLineY);
    doc.setFontSize(9);
    doc.setTextColor(107, 114, 128);
    doc.text("Date", stampCenterX, stampLineY + 7, { align: "center" });
  }

  // QR code (bottom-right corner)
  if (qrEl.visible !== false && qrDataUrl) {
    try {
      doc.addImage(qrDataUrl, "PNG", qrEl.x, qrEl.y, qrEl.w, qrEl.h, undefined, "FAST");
      doc.setFontSize(6);
      doc.setTextColor(150, 150, 150);
      doc.text("Scan to verify", qrEl.x + qrEl.w / 2, qrEl.y + qrEl.h + 4, { align: "center" });
    } catch (_) {
      /* ignore QR rendering failures */
    }
  }

  return doc;
}

/**
 * Pre-load images for the certificate template so jsPDF can embed them.
 * Call this before generateCertificatePdf and spread the result into template.
 * @param {Object} template
 * @returns {Promise<Object>} template with _*Data fields populated
 */
export async function preloadTemplateImages(template) {
  if (!template) return template;

  const entries = [
    ["_bpLogoData", template.bpLogoUrl],
    ["_affiliationLogoData", template.affiliationLogoUrl],
    ["_signatureImageData", template.signatureImageUrl],
    ["_stampImageData", template.stampImageUrl],
    ["_backgroundImageData", template.backgroundImageUrl]
  ];

  const results = await Promise.allSettled(
    entries.map(async ([key, url]) => {
      if (!url) return [key, null];
      const img = new Image();
      img.crossOrigin = "anonymous";
      img.src = url;
      await new Promise((resolve, reject) => {
        img.onload = resolve;
        img.onerror = reject;
      });
      // Convert to data URL for jsPDF
      const canvas = document.createElement("canvas");
      canvas.width = img.naturalWidth;
      canvas.height = img.naturalHeight;
      const ctx = canvas.getContext("2d");
      ctx.drawImage(img, 0, 0);
      return [key, canvas.toDataURL("image/png")];
    })
  );

  const enriched = { ...template };
  for (const result of results) {
    if (result.status === "fulfilled" && result.value) {
      const [key, data] = result.value;
      enriched[key] = data;
    }
  }
  return enriched;
}

/**
 * Generate a worksheet result / scorecard PDF.
 * @param {{ studentName: string, worksheetTitle: string, score: number, totalQuestions: number, correctCount: number, submittedAt: string, totalTimeText?: string, takenTimeText?: string, questions: Array<{questionNumber: number, prompt: string, studentAnswer: string, correctAnswer: string, resultStatus?: string}> }} data
 * @returns {jsPDF}
 */
export function generateWorksheetResultPdf({ studentName, worksheetTitle, score, totalQuestions, correctCount, submittedAt, totalTimeText, takenTimeText, questions = [] }) {
  const doc = new jsPDF({ orientation: "portrait", unit: "mm", format: "a4" });
  const w = doc.internal.pageSize.getWidth();
  let y = 20;

  // Title
  doc.setFontSize(18);
  doc.setFont("helvetica", "bold");
  doc.setTextColor(30, 41, 59);
  doc.text("Worksheet Result", w / 2, y, { align: "center" });
  y += 10;

  // Line
  doc.setDrawColor(209, 213, 219);
  doc.setLineWidth(0.5);
  doc.line(20, y, w - 20, y);
  y += 8;

  // Info
  doc.setFontSize(12);
  doc.setFont("helvetica", "normal");
  doc.setTextColor(55, 65, 81);
  doc.text(`Student: ${studentName}`, 20, y);
  y += 6;
  doc.text(`Worksheet: ${worksheetTitle}`, 20, y);
  y += 6;
  doc.text(`Score: ${score}% (${correctCount}/${totalQuestions})`, 20, y);
  y += 6;
  if (totalTimeText) {
    doc.text(`Total Time: ${totalTimeText}`, 20, y);
    y += 6;
  }
  if (takenTimeText) {
    doc.text(`Taken Time: ${takenTimeText}`, 20, y);
    y += 6;
  }
  if (submittedAt) {
    doc.text(`Submitted: ${new Date(submittedAt).toLocaleString()}`, 20, y);
    y += 6;
  }
  y += 4;

  // Table header
  doc.setFillColor(243, 244, 246);
  doc.rect(20, y, w - 40, 8, "F");
  doc.setFontSize(10);
  doc.setFont("helvetica", "bold");
  doc.setTextColor(55, 65, 81);
  doc.text("#", 24, y + 5.5);
  doc.text("Question", 34, y + 5.5);
  doc.text("Your Answer", 110, y + 5.5);
  doc.text("Correct", 150, y + 5.5);
  doc.text("Result", 175, y + 5.5);
  y += 10;

  doc.setFont("helvetica", "normal");
  doc.setFontSize(9);

  for (const q of questions) {
    if (y > 270) {
      doc.addPage();
      y = 20;
    }

    doc.setTextColor(55, 65, 81);
    doc.text(String(q.questionNumber), 24, y + 4);
    doc.text(String(q.prompt || "").slice(0, 30), 34, y + 4);
    doc.text(String(q.studentAnswer ?? "—"), 110, y + 4);
    doc.text(String(q.correctAnswer ?? "—"), 150, y + 4);

    if (q.resultStatus === "Right") {
      doc.setTextColor(22, 101, 52);
      doc.text("Right", 174, y + 4);
    } else if (q.resultStatus === "Not Attempted") {
      doc.setTextColor(107, 114, 128);
      doc.text("Not Attempted", 160, y + 4);
    } else {
      doc.setTextColor(185, 28, 28);
      doc.text("Wrong", 173, y + 4);
    }

    y += 7;
  }

  return doc;
}

/**
 * Generate a leaderboard PDF.
 * @param {{ title: string, rows: Array<{rank: number, studentName: string, avgScore: number|string, totalWorksheets: number|string}> }} data
 * @returns {jsPDF}
 */
export function generateLeaderboardPdf({ title, rows = [] }) {
  const doc = new jsPDF({ orientation: "portrait", unit: "mm", format: "a4" });
  const w = doc.internal.pageSize.getWidth();
  let y = 20;

  // Title
  doc.setFontSize(18);
  doc.setFont("helvetica", "bold");
  doc.setTextColor(30, 41, 59);
  doc.text(title || "Leaderboard", w / 2, y, { align: "center" });
  y += 10;
  doc.setDrawColor(209, 213, 219);
  doc.setLineWidth(0.5);
  doc.line(20, y, w - 20, y);
  y += 8;

  // Table header
  doc.setFillColor(243, 244, 246);
  doc.rect(20, y, w - 40, 8, "F");
  doc.setFontSize(10);
  doc.setFont("helvetica", "bold");
  doc.setTextColor(55, 65, 81);
  doc.text("Rank", 24, y + 5.5);
  doc.text("Student", 50, y + 5.5);
  doc.text("Avg Score", 130, y + 5.5);
  doc.text("Worksheets", 165, y + 5.5);
  y += 10;

  doc.setFont("helvetica", "normal");
  doc.setFontSize(9);

  for (const r of rows) {
    if (y > 275) {
      doc.addPage();
      y = 20;
    }

    doc.setTextColor(55, 65, 81);
    doc.text(String(r.rank), 28, y + 4);
    doc.text(String(r.studentName || "").slice(0, 40), 50, y + 4);
    doc.text(String(r.avgScore ?? "—") + "%", 133, y + 4);
    doc.text(String(r.totalWorksheets ?? "—"), 173, y + 4);
    y += 7;
  }

  return doc;
}
