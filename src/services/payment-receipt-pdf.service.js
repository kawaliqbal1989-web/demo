import PDFDocument from "pdfkit";

function money(value) {
  const num = Number(value || 0);
  return num.toFixed(2);
}

function formatDateTime(value) {
  if (!value) return "-";
  const date = value instanceof Date ? value : new Date(value);
  return date.toISOString().replace("T", " ").slice(0, 19);
}

function drawLabelValue(doc, label, value, x, y, width = 250) {
  doc.fontSize(9).fillColor("#555").text(label, x, y, { width });
  doc.fontSize(10).fillColor("#111").text(String(value ?? "-"), x, y + 12, { width });
}

async function renderPaymentReceiptPdf({ receipt }) {
  return new Promise((resolve, reject) => {
    const doc = new PDFDocument({
      size: "A4",
      margin: 40,
      info: {
        Title: `Receipt ${receipt.receiptNumber}`,
        Author: "Abacus Education Platform"
      }
    });

    const chunks = [];
    doc.on("data", (chunk) => chunks.push(chunk));
    doc.on("end", () => resolve(Buffer.concat(chunks)));
    doc.on("error", reject);

    doc.fontSize(18).fillColor("#111").text("Payment Receipt", { align: "left" });
    doc.fontSize(11).fillColor("#444").text(receipt.center?.name || "Center", { align: "left" });
    doc.moveDown(0.5);

    doc.rect(40, doc.y, 515, 1).fill("#d9d9d9");
    doc.moveDown(0.8);

    const startY = doc.y;
    drawLabelValue(doc, "Receipt No", receipt.receiptNumber, 40, startY);
    drawLabelValue(doc, "Status", receipt.status, 300, startY);
    drawLabelValue(doc, "Collected At", formatDateTime(receipt.collectedAt), 40, startY + 36);
    drawLabelValue(doc, "Payment Mode", receipt.paymentMode, 300, startY + 36);
    drawLabelValue(doc, "Reference", receipt.referenceNumber || "-", 40, startY + 72);
    drawLabelValue(doc, "Txn Id", receipt.transactionId || "-", 300, startY + 72);

    doc.y = startY + 112;
    doc.moveDown(0.3);
    doc.rect(40, doc.y, 515, 1).fill("#d9d9d9");
    doc.moveDown(0.8);

    const studentName = [receipt.student?.firstName || "", receipt.student?.lastName || ""].join(" ").trim();
    const studentY = doc.y;
    drawLabelValue(doc, "Student", `${studentName || "-"} (${receipt.student?.admissionNo || "-"})`, 40, studentY, 515);
    drawLabelValue(doc, "Phone", receipt.student?.phonePrimary || "-", 40, studentY + 36);
    drawLabelValue(doc, "Parent Phone", receipt.student?.guardianPhone || "-", 300, studentY + 36);

    doc.y = studentY + 74;
    doc.moveDown(0.3);
    doc.rect(40, doc.y, 515, 1).fill("#d9d9d9");
    doc.moveDown(0.8);

    doc.fontSize(11).fillColor("#111").text("Allocations", 40, doc.y);
    doc.moveDown(0.4);

    const tableX = 40;
    const columns = [0, 170, 280, 390, 485];
    const headerY = doc.y;
    doc.fontSize(9).fillColor("#555");
    doc.text("Due", tableX + columns[0], headerY);
    doc.text("Type", tableX + columns[1], headerY);
    doc.text("Before", tableX + columns[2], headerY, { width: 90, align: "right" });
    doc.text("Allocated", tableX + columns[3], headerY, { width: 90, align: "right" });
    doc.text("After", tableX + columns[4], headerY, { width: 70, align: "right" });

    let rowY = headerY + 16;
    const allocations = receipt.allocations || [];
    for (const allocation of allocations) {
      if (rowY > 700) {
        doc.addPage();
        rowY = 50;
      }
      const dueLabel = allocation.dueDate ? String(allocation.dueDate).slice(0, 10) : "OVERPAYMENT";
      doc.fontSize(9).fillColor("#111");
      doc.text(dueLabel, tableX + columns[0], rowY);
      doc.text(allocation.allocationType, tableX + columns[1], rowY);
      doc.text(money(allocation.duePendingBefore ?? 0), tableX + columns[2], rowY, { width: 90, align: "right" });
      doc.text(money(allocation.allocatedAmount ?? 0), tableX + columns[3], rowY, { width: 90, align: "right" });
      doc.text(money(allocation.duePendingAfter ?? 0), tableX + columns[4], rowY, { width: 70, align: "right" });
      rowY += 16;
    }

    rowY += 8;
    doc.rect(40, rowY, 515, 1).fill("#d9d9d9");
    rowY += 8;

    doc.fontSize(10).fillColor("#111");
    doc.text(`Total Amount: INR ${money(receipt.totalAmount)}`, 40, rowY);
    doc.text(`Allocated: INR ${money(receipt.allocatedAmount)}`, 40, rowY + 16);
    doc.text(`Unallocated: INR ${money(receipt.unallocatedAmount)}`, 40, rowY + 32);

    doc.fontSize(9).fillColor("#666").text("This receipt is system-generated and immutable. For corrections, use refund/cancellation workflows.", 40, 760, { align: "left" });
    doc.fontSize(9).fillColor("#666").text("Authorized Signature: ____________________", 370, 760, { align: "right" });

    doc.end();
  });
}

export { renderPaymentReceiptPdf };
