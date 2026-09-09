import React, { useState } from "react";
import { downloadMarkdown } from "./reportExport";
import { downloadPdf } from "./reportPdf";

export default function ReportExportButtons({
  getMarkdown,
  filename,
  label = "Download report",
  compact = false,
  className = "",
}) {
  const [status, setStatus] = useState(null);

  const runExport = (format) => {
    const markdown = typeof getMarkdown === "function" ? getMarkdown() : "";
    if (!markdown?.trim()) {
      setStatus("empty");
      setTimeout(() => setStatus(null), 2500);
      return;
    }

    const baseName = filename || "pocketlink-report";
    if (format === "md") {
      downloadMarkdown(baseName, markdown);
    } else {
      downloadPdf(baseName, markdown);
    }

    setStatus(format);
    setTimeout(() => setStatus(null), 2500);
  };

  const btnClass = compact ? "btn btn-ghost-sm" : "btn btn-ghost";

  return (
    <div className={`report-export-actions ${className}`.trim()} role="group" aria-label={label}>
      <span className="report-export-label">{label}</span>
      <button type="button" className={btnClass} onClick={() => runExport("md")}>
        {status === "md" ? "Markdown saved ✓" : "Markdown (.md)"}
      </button>
      <button type="button" className={btnClass} onClick={() => runExport("pdf")}>
        {status === "pdf" ? "PDF saved ✓" : "PDF"}
      </button>
      {status === "empty" && <span className="report-export-hint">Nothing to export yet.</span>}
    </div>
  );
}
