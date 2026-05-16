import { beforeEach, describe, expect, it, vi } from "vitest";

let currentDoc = null;

function createMockDoc() {
  const textCalls = [];
  const lineCalls = [];
  const imageCalls = [];

  return {
    textCalls,
    lineCalls,
    imageCalls,
    internal: {
      pageSize: {
        getWidth: () => 297,
        getHeight: () => 210
      }
    },
    setFillColor: vi.fn(),
    rect: vi.fn(),
    setDrawColor: vi.fn(),
    setLineWidth: vi.fn(),
    addImage: vi.fn((...args) => {
      imageCalls.push(args);
    }),
    setFontSize: vi.fn(),
    setFont: vi.fn(),
    setTextColor: vi.fn(),
    text: vi.fn((...args) => {
      textCalls.push(args);
    }),
    line: vi.fn((...args) => {
      lineCalls.push(args);
    })
  };
}

vi.mock("jspdf", () => ({
  jsPDF: vi.fn(() => {
    currentDoc = createMockDoc();
    return currentDoc;
  })
}));

vi.mock("qrcode", () => ({
  default: {
    toDataURL: vi.fn()
  }
}));

import { generateCertificatePdf } from "../pdfExport";

describe("generateCertificatePdf", () => {
  beforeEach(() => {
    currentDoc = null;
  });

  it("renders stamp as a pure image without adding a date footer or extra line", () => {
    const basePayload = {
      studentName: "Sample Student",
      levelName: "Level 1",
      certificateNumber: "CERT-001",
      issuedAt: "2026-05-09T12:00:00.000Z",
      template: {}
    };

    generateCertificatePdf(basePayload);
    const lineCountWithoutStamp = currentDoc.lineCalls.length;

    const transparentSeal = "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVQIHWP4z8DwHwAFgwJ/lxJsebAAAAAASUVORK5CYII=";
    generateCertificatePdf({
      ...basePayload,
      template: {
        stampImageUrl: "/uploads/stamp.png",
        _stampImageData: transparentSeal
      }
    });

    expect(currentDoc.imageCalls.some((args) => args[0] === transparentSeal)).toBe(true);
    expect(currentDoc.textCalls.some((args) => args[0] === "Date")).toBe(false);
    expect(currentDoc.lineCalls).toHaveLength(lineCountWithoutStamp);
  });

  it("supports multiple templates without leaking footer text under the seal", () => {
    const opaqueSeal = "data:image/png;base64,opaque-seal";
    const transparentSeal = "data:image/png;base64,transparent-seal";

    generateCertificatePdf({
      studentName: "Student A",
      levelName: "Level A",
      certificateNumber: "CERT-A",
      issuedAt: "2026-05-09T12:00:00.000Z",
      template: {
        stampImageUrl: "/uploads/seal-a.png",
        _stampImageData: opaqueSeal
      }
    });
    const firstTemplateTexts = currentDoc.textCalls.map((args) => args[0]);

    generateCertificatePdf({
      studentName: "Student B",
      levelName: "Level B",
      certificateNumber: "CERT-B",
      issuedAt: "2026-05-10T12:00:00.000Z",
      template: {
        stampImageUrl: "/uploads/seal-b.png",
        _stampImageData: transparentSeal
      }
    });
    const secondTemplateTexts = currentDoc.textCalls.map((args) => args[0]);

    expect(firstTemplateTexts).not.toContain("Date");
    expect(secondTemplateTexts).not.toContain("Date");
    expect(currentDoc.imageCalls.some((args) => args[0] === transparentSeal)).toBe(true);
  });

  it("renders a signature date only when explicitly enabled on the signature layout", () => {
    const issuedAt = "2026-05-09T12:00:00.000Z";
    const expectedDate = new Date(issuedAt).toLocaleDateString();

    generateCertificatePdf({
      studentName: "Student A",
      levelName: "Level A",
      certificateNumber: "CERT-A",
      issuedAt,
      template: {
        signatureImageUrl: "/uploads/signature.png",
        _signatureImageData: "data:image/png;base64,signature",
        layout: {
          signature: {
            showDate: false
          }
        }
      }
    });
    expect(currentDoc.textCalls.some((args) => args[0] === expectedDate)).toBe(false);

    generateCertificatePdf({
      studentName: "Student A",
      levelName: "Level A",
      certificateNumber: "CERT-A",
      issuedAt,
      template: {
        signatureImageUrl: "/uploads/signature.png",
        _signatureImageData: "data:image/png;base64,signature",
        layout: {
          signature: {
            showDate: true
          }
        }
      }
    });
    expect(currentDoc.textCalls.some((args) => args[0] === expectedDate)).toBe(true);
    expect(currentDoc.textCalls.some((args) => args[0] === "Date")).toBe(false);
  });
});
