import { jsPDF } from "jspdf";
import { sanitizeReportFilename } from "./reportExport";

export function downloadPdf(filename, markdown) {
  const doc = new jsPDF({ unit: "pt", format: "letter" });
  const margin = 48;
  const pageHeight = doc.internal.pageSize.getHeight();
  const pageWidth = doc.internal.pageSize.getWidth();
  const maxWidth = pageWidth - margin * 2;
  let y = margin;

  const ensureSpace = (height) => {
    if (y + height > pageHeight - margin) {
      doc.addPage();
      y = margin;
    }
  };

  const writeWrapped = (text, fontSize, extraGap = 0) => {
    doc.setFont("helvetica", "normal");
    doc.setFontSize(fontSize);
    const wrapped = doc.splitTextToSize(text, maxWidth);
    const lineHeight = Math.max(12, fontSize * 1.35);
    ensureSpace(wrapped.length * lineHeight + extraGap);
    doc.text(wrapped, margin, y);
    y += wrapped.length * lineHeight + extraGap;
  };

  for (const rawLine of String(markdown || "").split("\n")) {
    const line = rawLine.trimEnd();
    if (!line.trim()) {
      y += 6;
      continue;
    }
    if (line.startsWith("# ")) {
      writeWrapped(line.slice(2), 16, 8);
      continue;
    }
    if (line.startsWith("## ")) {
      y += 4;
      writeWrapped(line.slice(3), 13, 6);
      continue;
    }
    if (line.startsWith("### ")) {
      writeWrapped(line.slice(4), 11, 4);
      continue;
    }
    if (line.startsWith("|")) {
      writeWrapped(line.replace(/\|/g, "  ").replace(/---/g, "").trim(), 9, 2);
      continue;
    }
    if (line.startsWith("- ")) {
      writeWrapped(`• ${line.slice(2)}`, 10, 2);
      continue;
    }
    writeWrapped(line, 10, 2);
  }

  doc.save(`${sanitizeReportFilename(filename)}.pdf`);
}
