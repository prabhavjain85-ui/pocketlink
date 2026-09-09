import { REPORT_FOOTER } from "./reportExport";

/** PocketLink brand teal (#0F766E) as RGB for PDF helpers. */
export const PDF_BRAND = {
  primary: [15, 118, 110],
  primaryLight: [240, 253, 250],
  text: [15, 23, 42],
  textMuted: [100, 116, 139],
  border: [226, 232, 240],
  surfaceSubtle: [248, 250, 252],
  white: [255, 255, 255],
};

const METRIC_LABEL_RE =
  /^(predicted\s+d?g|d\s*g|estimated\s+ki|pose\s+rank|rmsd|hydrogen\s+bonds|hydrophobic\s+contacts|score|verdict|duration|lead\s+candidate|recommended\s+lead)/i;

/**
 * Normalize scientific symbols to ASCII-safe text for Helvetica PDF output.
 */
export function normalizeScientificChars(text) {
  return String(text ?? "")
    .replace(/\*\*(.*?)\*\*/g, "$1")
    .replace(/\*(.*?)\*/g, "$1")
    .replace(/`/g, "")
    .replace(/Δ/g, "d")
    .replace(/Å/g, "A")
    .replace(/±/g, "+/-")
    .replace(/→/g, "->")
    .replace(/•/g, "-")
    .replace(/[\u2018\u2019]/g, "'")
    .replace(/[\u201C\u201D]/g, '"')
    .replace(/[\u2013\u2014]/g, "-")
    .replace(/\u00B7/g, " · ");
}

export function normalizeScientificText(text) {
  return normalizeScientificChars(text).replace(/\s+/g, " ").trim();
}

export function stripMarkdownInline(text) {
  return normalizeScientificText(text);
}

/**
 * Parse inline **bold** and *italic* into styled segments for PDF rendering.
 */
export function parseInlineSegments(text) {
  const input = String(text || "");
  const segments = [];
  const regex = /\*\*(.+?)\*\*|\*(.+?)\*|([^*]+)/g;
  let match;
  while ((match = regex.exec(input)) !== null) {
    if (match[1]) segments.push({ text: normalizeScientificChars(match[1]), style: "bold" });
    else if (match[2]) segments.push({ text: normalizeScientificChars(match[2]), style: "italic" });
    else if (match[3]) segments.push({ text: normalizeScientificChars(match[3]), style: "normal" });
  }
  if (!segments.length && input) {
    segments.push({ text: normalizeScientificChars(input), style: "normal" });
  }
  return segments;
}

function parseMetaLine(line) {
  const generated = line.match(/^\*\*Generated:\*\*\s*(.+)$/i);
  if (generated) return { key: "generated", value: stripMarkdownInline(generated[1]) };
  const module = line.match(/^\*\*Module:\*\*\s*(.+)$/i);
  if (module) return { key: "module", value: stripMarkdownInline(module[1]) };
  const session = line.match(/^\*\*Session:\*\*\s*(.+)$/i);
  if (session) return { key: "sessionTitle", value: stripMarkdownInline(session[1]) };
  return null;
}

function parseBulletLine(line) {
  const trimmed = line.trim();
  if (!trimmed.startsWith("- ")) return null;
  const body = trimmed.slice(2);
  const labeled = body.match(/^\*\*(.+?):\*\*\s*(.*)$/);
  if (labeled) {
    return {
      type: "bullet",
      label: stripMarkdownInline(labeled[1]),
      value: stripMarkdownInline(labeled[2]),
      raw: stripMarkdownInline(body),
    };
  }
  return {
    type: "bullet",
    label: null,
    value: null,
    raw: stripMarkdownInline(body),
  };
}

function parseTableRow(line) {
  const trimmed = line.trim();
  if (!trimmed.startsWith("|")) return null;
  const cells = trimmed
    .split("|")
    .slice(1, -1)
    .map((cell) => stripMarkdownInline(cell.replace(/\\(.)/g, "$1")));
  if (!cells.length) return null;
  if (cells.every((cell) => /^:?-{2,}:?$/.test(cell))) return { type: "tableDivider" };
  return { type: "tableRow", cells };
}

function isMetricBullet(bullet) {
  if (!bullet?.label) return false;
  const label = bullet.label.toLowerCase();
  if (METRIC_LABEL_RE.test(label)) return true;
  const value = bullet.value || "";
  return /(-?\d|\/100|nM|uM|mM|kcal\/mol|%)/i.test(value) && value.length <= 40;
}

function flushSection(sections, current) {
  if (!current) return;
  sections.push(current);
}

/**
 * Parse PocketLink markdown reports into a structured document for PDF rendering.
 */
export function parseMarkdownReport(markdown) {
  const lines = String(markdown || "").split("\n");
  const doc = {
    title: "",
    meta: {},
    disclaimer: "",
    sections: [],
    footer: REPORT_FOOTER,
    codeBlock: null,
  };

  let section = null;
  let tableHeaders = null;
  let tableRows = null;
  let inFooter = false;
  let inCodeBlock = false;
  let codeLines = [];

  const pushBlock = (block) => {
    if (!section) {
      section = { title: "", level: 2, blocks: [], metrics: [] };
    }
    section.blocks.push(block);
  };

  const flushTable = () => {
    if (tableHeaders && tableRows?.length) {
      pushBlock({ type: "table", headers: tableHeaders, rows: tableRows });
    }
    tableHeaders = null;
    tableRows = null;
  };

  const ensureSection = (title, level = 2) => {
    flushTable();
    flushSection(doc.sections, section);
    section = { title: stripMarkdownInline(title), level, blocks: [], metrics: [] };
    tableHeaders = null;
    tableRows = null;
  };

  for (const rawLine of lines) {
    const line = rawLine.trimEnd();

    if (inCodeBlock) {
      if (line.trim().startsWith("```")) {
        pushBlock({ type: "code", text: codeLines.join("\n") });
        codeLines = [];
        inCodeBlock = false;
      } else {
        codeLines.push(line);
      }
      continue;
    }

    if (!line.trim()) continue;

    if (line.trim().startsWith("```")) {
      inCodeBlock = true;
      codeLines = [];
      continue;
    }

    if (line.startsWith("# ")) {
      doc.title = stripMarkdownInline(line.slice(2));
      continue;
    }

    if (inFooter) {
      doc.footer = stripMarkdownInline([doc.footer, line.replace(/^>\s*/, "")].filter(Boolean).join(" "));
      continue;
    }

    if (line.trim() === "---") {
      flushTable();
      inFooter = true;
      flushSection(doc.sections, section);
      section = null;
      continue;
    }

    const meta = parseMetaLine(line.trim());
    if (meta) {
      doc.meta[meta.key] = meta.value;
      continue;
    }

    if (line.startsWith("> ")) {
      doc.disclaimer = stripMarkdownInline(line.slice(2));
      continue;
    }

    if (line.startsWith("## ")) {
      ensureSection(line.slice(3), 2);
      continue;
    }

    if (line.startsWith("### ")) {
      flushTable();
      pushBlock({ type: "subheading", text: stripMarkdownInline(line.slice(4)) });
      continue;
    }

    const tableRow = parseTableRow(line);
    if (tableRow?.type === "tableDivider") continue;
    if (tableRow?.type === "tableRow") {
      if (!tableHeaders) {
        flushTable();
        tableHeaders = tableRow.cells;
        tableRows = [];
      } else {
        tableRows.push(tableRow.cells);
      }
      continue;
    }

    flushTable();

    const bullet = parseBulletLine(line);
    if (bullet) {
      if (isMetricBullet(bullet) && section && section.metrics.length < 4) {
        section.metrics.push({
          label: bullet.label,
          value: bullet.value,
        });
      } else {
        pushBlock(bullet);
      }
      continue;
    }

    if (line.startsWith("_") && line.endsWith("_")) {
      pushBlock({ type: "paragraph", text: stripMarkdownInline(line.slice(1, -1)), italic: true });
      continue;
    }

    pushBlock({ type: "paragraph", text: stripMarkdownInline(line) });
  }

  flushTable();
  flushSection(doc.sections, section);

  if (doc.codeBlock) {
    doc.sections.push({
      title: "Session Data",
      level: 2,
      blocks: [{ type: "code", text: doc.codeBlock }],
      metrics: [],
    });
  }

  return doc;
}
