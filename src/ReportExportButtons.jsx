import React, { useState } from "react";
import { downloadMarkdown } from "./reportExport";

export default function ReportExportButtons({
  getMarkdown,
  filename,
  label = "Download report",
  compact = false,
  className = "",
}) {
  const [status, setStatus] = useState(null);
  const [pdfLoading, setPdfLoading] = useState(false);

  const runExport = async (format) => {
    const markdown = typeof getMarkdown === "function" ? getMarkdown() : "";
    if (!markdown?.trim()) {
      setStatus("empty");
      setTimeout(() => setStatus(null), 2500);
      return;
    }

    const baseName = filename || "pocketlink-report";
    if (format === "md") {
      downloadMarkdown(baseName, markdown);
      setStatus(format);
      setTimeout(() => setStatus(null), 2500);
      return;
    }

    setPdfLoading(true);
    try {
      const { downloadPdf } = await import("./reportPdf");
      await downloadPdf(baseName, markdown);
      setStatus(format);
      setTimeout(() => setStatus(null), 2500);
    } catch {
      setStatus("pdf-error");
      setTimeout(() => setStatus(null), 3500);
    } finally {
      setPdfLoading(false);
    }
  };

  const btnClass = compact ? "btn btn-ghost-sm" : "btn btn-ghost";

  return (
    <div className={`report-export-actions ${className}`.trim()} role="group" aria-label={label}>
      <span className="report-export-label">{label}</span>
      <button type="button" className={btnClass} onClick={() => runExport("md")} disabled={pdfLoading}>
        {status === "md" ? "Markdown saved ✓" : "Markdown (.md)"}
      </button>
      <button type="button" className={btnClass} onClick={() => runExport("pdf")} disabled={pdfLoading}>
        {pdfLoading ? "Generating PDF…" : status === "pdf" ? "PDF saved ✓" : "PDF"}
      </button>
      {status === "empty" && <span className="report-export-hint">Nothing to export yet.</span>}
      {status === "pdf-error" && (
        <span className="report-export-hint">PDF export failed — try Markdown or refresh.</span>
      )}
    </div>
  );
}
