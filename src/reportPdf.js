import { jsPDF } from "jspdf";
import autoTable from "jspdf-autotable";
import { sanitizeReportFilename } from "./reportExport";
import { PDF_BRAND, parseInlineSegments, parseMarkdownReport } from "./reportPdfParser";

const PAGE = {
  marginX: 48,
  marginTop: 72,
  marginBottom: 56,
  headerHeight: 42,
  footerHeight: 28,
};

const APP_URL = "https://pocketlink-nine.vercel.app/";

function rgb(doc, color) {
  doc.setFillColor(...color);
  doc.setDrawColor(...color);
  doc.setTextColor(...color);
}

function setTextColor(doc, color) {
  doc.setTextColor(...color);
}

function pageWidth(doc) {
  return doc.internal.pageSize.getWidth();
}

function pageHeight(doc) {
  return doc.internal.pageSize.getHeight();
}

function contentWidth(doc) {
  return pageWidth(doc) - PAGE.marginX * 2;
}

function drawPageChrome(doc, report, pageNumber, totalPages) {
  const width = pageWidth(doc);
  const height = pageHeight(doc);

  rgb(doc, PDF_BRAND.primary);
  doc.rect(0, 0, width, PAGE.headerHeight, "F");

  doc.setFont("helvetica", "bold");
  doc.setFontSize(11);
  doc.setTextColor(...PDF_BRAND.white);
  doc.text("PocketLink", PAGE.marginX, 26);

  doc.setFont("helvetica", "normal");
  doc.setFontSize(9);
  const moduleLabel = report.meta.module || "Research Report";
  doc.text(moduleLabel, PAGE.marginX + 92, 26);

  if (report.meta.generated) {
    const stamp = report.meta.generated;
    const stampWidth = doc.getTextWidth(stamp);
    doc.text(stamp, width - PAGE.marginX - stampWidth, 26);
  }

  doc.setDrawColor(...PDF_BRAND.border);
  doc.setLineWidth(0.5);
  doc.line(PAGE.marginX, height - PAGE.footerHeight, width - PAGE.marginX, height - PAGE.footerHeight);

  doc.setFont("helvetica", "normal");
  doc.setFontSize(8);
  setTextColor(doc, PDF_BRAND.textMuted);
  doc.text("Computational assessment only — not experimental validation.", PAGE.marginX, height - 14);

  const pageLabel = `Page ${pageNumber} of ${totalPages}`;
  const pageLabelWidth = doc.getTextWidth(pageLabel);
  doc.text(pageLabel, width - PAGE.marginX - pageLabelWidth, height - 14);

  doc.setFontSize(7.5);
  const footerRight = APP_URL.replace(/^https?:\/\//, "");
  const footerRightWidth = doc.getTextWidth(footerRight);
  doc.text(footerRight, width - PAGE.marginX - footerRightWidth, height - 5);
}

function ensureSpace(doc, state, heightNeeded) {
  const bottom = pageHeight(doc) - PAGE.marginBottom;
  if (state.y + heightNeeded <= bottom) return;

  doc.addPage();
  state.pageNumber += 1;
  state.y = PAGE.marginTop;
}

function writeWrappedText(doc, state, text, options = {}) {
  const {
    fontSize = 10,
    fontStyle = "normal",
    color = PDF_BRAND.text,
    extraGap = 6,
    indent = 0,
    maxWidth = contentWidth(doc) - indent,
  } = options;

  doc.setFont("helvetica", fontStyle);
  doc.setFontSize(fontSize);
  setTextColor(doc, color);

  const wrapped = doc.splitTextToSize(String(text || ""), maxWidth);
  const lineHeight = Math.max(12, fontSize * 1.4);
  ensureSpace(doc, state, wrapped.length * lineHeight + extraGap);
  doc.text(wrapped, PAGE.marginX + indent, state.y);
  state.y += wrapped.length * lineHeight + extraGap;
}

function writeRichLine(doc, state, text, options = {}) {
  const segments = parseInlineSegments(text);
  const plain = segments.map((segment) => segment.text).join("");
  const { fontSize = 10, indent = 0, extraGap = 4, bullet = false } = options;
  const bulletIndent = bullet ? 12 : 0;
  const maxWidth = contentWidth(doc) - indent - bulletIndent;
  const lineHeight = Math.max(12, fontSize * 1.4);

  doc.setFont("helvetica", "normal");
  doc.setFontSize(fontSize);
  const wrapped = doc.splitTextToSize(plain, maxWidth);
  ensureSpace(doc, state, wrapped.length * lineHeight + extraGap);

  wrapped.forEach((lineText, lineIndex) => {
    let x = PAGE.marginX + indent + (lineIndex > 0 ? bulletIndent : 0);
    const y = state.y + lineIndex * lineHeight;

    if (bullet && lineIndex === 0) {
      setTextColor(doc, PDF_BRAND.primary);
      doc.text("•", PAGE.marginX + indent, y);
      x += bulletIndent;
    }

    if (lineIndex === 0 && segments.some((segment) => segment.style === "bold")) {
      let remaining = lineText;
      for (const segment of segments) {
        if (!remaining) break;
        const chunk = segment.text;
        if (!remaining.startsWith(chunk.slice(0, remaining.length)) && !remaining.includes(chunk)) {
          continue;
        }
        const take = remaining.startsWith(chunk) ? chunk : remaining;
        const style = segment.style === "bold" ? "bold" : segment.style === "italic" ? "italic" : "normal";
        doc.setFont("helvetica", style);
        setTextColor(doc, segment.style === "bold" ? PDF_BRAND.text : PDF_BRAND.textMuted);
        doc.text(take, x, y);
        x += doc.getTextWidth(take);
        remaining = remaining.slice(take.length);
      }
      if (remaining) {
        doc.setFont("helvetica", "normal");
        setTextColor(doc, PDF_BRAND.textMuted);
        doc.text(remaining, x, y);
      }
    } else {
      doc.setFont("helvetica", "normal");
      setTextColor(doc, PDF_BRAND.textMuted);
      doc.text(lineText, x, y);
    }
  });

  state.y += wrapped.length * lineHeight + extraGap;
}

function drawDisclaimerBox(doc, state, text) {
  if (!text?.trim()) return;

  const boxWidth = contentWidth(doc);
  const padding = 10;
  doc.setFont("helvetica", "normal");
  doc.setFontSize(9);
  const wrapped = doc.splitTextToSize(text, boxWidth - padding * 2);
  const boxHeight = wrapped.length * 12 + padding * 2;

  ensureSpace(doc, state, boxHeight + 10);

  rgb(doc, PDF_BRAND.primaryLight);
  doc.setDrawColor(...PDF_BRAND.primary);
  doc.setLineWidth(0.75);
  doc.roundedRect(PAGE.marginX, state.y - 4, boxWidth, boxHeight, 4, 4, "FD");

  setTextColor(doc, PDF_BRAND.textMuted);
  doc.text(wrapped, PAGE.marginX + padding, state.y + padding + 2);
  state.y += boxHeight + 12;
}

function drawSubheading(doc, state, title) {
  if (!title) return;
  ensureSpace(doc, state, 20);
  doc.setFont("helvetica", "bold");
  doc.setFontSize(10.5);
  setTextColor(doc, PDF_BRAND.text);
  doc.text(title, PAGE.marginX + 6, state.y);
  state.y += 14;
}

function drawSectionHeading(doc, state, title, level = 2) {
  if (!title) return;
  const fontSize = level >= 3 ? 11 : 13;
  const gap = level >= 3 ? 8 : 12;
  ensureSpace(doc, state, 28);

  rgb(doc, PDF_BRAND.primary);
  doc.rect(PAGE.marginX, state.y - 10, 3, fontSize + 4, "F");

  doc.setFont("helvetica", "bold");
  doc.setFontSize(fontSize);
  setTextColor(doc, PDF_BRAND.text);
  doc.text(title, PAGE.marginX + 10, state.y);
  state.y += gap;

  doc.setDrawColor(...PDF_BRAND.border);
  doc.setLineWidth(0.5);
  doc.line(PAGE.marginX, state.y, PAGE.marginX + contentWidth(doc), state.y);
  state.y += 10;
}

function drawMetricCards(doc, state, metrics) {
  if (!metrics?.length) return;

  const gap = 8;
  const cardCount = Math.min(metrics.length, 4);
  const cardWidth = (contentWidth(doc) - gap * (cardCount - 1)) / cardCount;
  const cardHeight = 46;

  ensureSpace(doc, state, cardHeight + 12);

  metrics.slice(0, cardCount).forEach((metric, index) => {
    const x = PAGE.marginX + index * (cardWidth + gap);
    const y = state.y;

    doc.setFillColor(...PDF_BRAND.surfaceSubtle);
    doc.setDrawColor(...PDF_BRAND.border);
    doc.setLineWidth(0.5);
    doc.roundedRect(x, y, cardWidth, cardHeight, 4, 4, "FD");

    doc.setFont("helvetica", "normal");
    doc.setFontSize(8);
    setTextColor(doc, PDF_BRAND.textMuted);
    const labelLines = doc.splitTextToSize(metric.label || "Metric", cardWidth - 12);
    doc.text(labelLines.slice(0, 2), x + 8, y + 14);

    doc.setFont("helvetica", "bold");
    doc.setFontSize(12);
    setTextColor(doc, PDF_BRAND.primary);
    const valueLines = doc.splitTextToSize(metric.value || "—", cardWidth - 12);
    doc.text(valueLines.slice(0, 2), x + 8, y + 32);
  });

  state.y += cardHeight + 14;
}

function drawTable(doc, state, table) {
  if (!table?.headers?.length || !table?.rows?.length) return;

  ensureSpace(doc, state, 40);

  autoTable(doc, {
    startY: state.y,
    head: [table.headers],
    body: table.rows,
    margin: {
      top: PAGE.marginTop,
      bottom: PAGE.marginBottom,
      left: PAGE.marginX,
      right: PAGE.marginX,
    },
    theme: "plain",
    styles: {
      font: "helvetica",
      fontSize: 8.5,
      cellPadding: 5,
      textColor: PDF_BRAND.text,
      lineColor: PDF_BRAND.border,
      lineWidth: 0.4,
      overflow: "linebreak",
    },
    headStyles: {
      fillColor: PDF_BRAND.primary,
      textColor: PDF_BRAND.white,
      fontStyle: "bold",
      halign: "left",
    },
    alternateRowStyles: {
      fillColor: PDF_BRAND.surfaceSubtle,
    },
    columnStyles: {
      0: { cellWidth: "wrap" },
    },
    didDrawPage: () => {
      // page chrome added in post-pass
    },
  });

  state.y = (doc.lastAutoTable?.finalY || state.y) + 14;
}

function drawCodeBlock(doc, state, text) {
  if (!text?.trim()) return;
  writeWrappedText(doc, state, text, {
    fontSize: 8,
    fontStyle: "normal",
    color: PDF_BRAND.textMuted,
    extraGap: 8,
  });
}

function renderReportPdf(doc, report) {
  const state = { y: PAGE.marginTop, pageNumber: 1 };

  doc.setFont("helvetica", "bold");
  doc.setFontSize(20);
  setTextColor(doc, PDF_BRAND.text);
  const titleLines = doc.splitTextToSize(report.title || "PocketLink Report", contentWidth(doc));
  ensureSpace(doc, state, titleLines.length * 24 + 8);
  doc.text(titleLines, PAGE.marginX, state.y);
  state.y += titleLines.length * 22 + 4;

  if (report.meta.sessionTitle) {
    writeWrappedText(doc, state, report.meta.sessionTitle, {
      fontSize: 11,
      fontStyle: "normal",
      color: PDF_BRAND.textMuted,
      extraGap: 8,
    });
  }

  drawDisclaimerBox(doc, state, report.disclaimer);

  for (const section of report.sections) {
    drawSectionHeading(doc, state, section.title, section.level);
    drawMetricCards(doc, state, section.metrics);

    for (const block of section.blocks) {
      if (block.type === "subheading") {
        drawSubheading(doc, state, block.text);
      } else if (block.type === "table") {
        drawTable(doc, state, block);
      } else if (block.type === "code") {
        drawCodeBlock(doc, state, block.text);
      } else if (block.type === "bullet") {
        if (block.label) {
          writeRichLine(doc, state, `**${block.label}:** ${block.value || ""}`, {
            fontSize: 10,
            bullet: true,
            extraGap: 3,
            indent: 4,
          });
        } else {
          writeRichLine(doc, state, block.raw, { fontSize: 10, bullet: true, extraGap: 3, indent: 4 });
        }
      } else if (block.type === "paragraph") {
        writeWrappedText(doc, state, block.text, {
          fontSize: 10,
          fontStyle: block.italic ? "italic" : "normal",
          color: block.italic ? PDF_BRAND.textMuted : PDF_BRAND.text,
          extraGap: 4,
        });
      }
    }

    state.y += 4;
  }

  const totalPages = doc.getNumberOfPages();
  for (let page = 1; page <= totalPages; page += 1) {
    doc.setPage(page);
    drawPageChrome(doc, report, page, totalPages);
  }
}

export function renderPdfDocument(markdown) {
  const report = parseMarkdownReport(markdown);
  const doc = new jsPDF({ unit: "pt", format: "letter" });
  renderReportPdf(doc, report);
  return doc;
}

export function downloadPdf(filename, markdown) {
  const doc = renderPdfDocument(markdown);
  doc.save(`${sanitizeReportFilename(filename)}.pdf`);
}
