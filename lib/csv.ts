/**
 * RFC 4180-style CSV parser used for Google Play statistics exports.
 * Supports UTF-8/UTF-16 decoding performed by caller, quoted commas,
 * newlines, escaped quotes and CRLF without turning malformed data into zero.
 */
export function parseCsv(input: string): { headers: string[]; rows: string[][] } {
  const records: string[][] = [];
  let record: string[] = [];
  let field = "";
  let quoted = false;
  let fieldStarted = false;

  for (let i = 0; i < input.length; i++) {
    const ch = input[i];
    if (quoted) {
      if (ch === '"') {
        if (input[i + 1] === '"') {
          field += '"';
          i++;
        } else {
          quoted = false;
        }
      } else {
        field += ch;
      }
      continue;
    }

    if (ch === '"') {
      if (fieldStarted) throw new Error("Malformed CSV: quote inside unquoted field.");
      quoted = true;
      fieldStarted = true;
    } else if (ch === ",") {
      record.push(field);
      field = "";
      fieldStarted = false;
    } else if (ch === "\n" || ch === "\r") {
      if (ch === "\r" && input[i + 1] === "\n") i++;
      record.push(field);
      if (record.some((cell) => cell.length > 0)) records.push(record);
      record = [];
      field = "";
      fieldStarted = false;
    } else {
      field += ch;
      fieldStarted = true;
    }
  }

  if (quoted) throw new Error("Malformed CSV: unterminated quoted field.");
  if (fieldStarted || record.length > 0) {
    record.push(field);
    if (record.some((cell) => cell.length > 0)) records.push(record);
  }
  if (records.length === 0) return { headers: [], rows: [] };
  const [first, ...rows] = records;
  const headers = first.map((header) => header.replace(/^\uFEFF/, "").trim());
  for (const row of rows) {
    if (row.length !== headers.length) {
      throw new Error(`Malformed CSV: expected ${headers.length} columns, got ${row.length}.`);
    }
  }
  return { headers, rows };
}

/** Missing/invalid metrics are unknown, not zero. */
export function parseNonnegativeInteger(value: string | undefined): number | undefined {
  if (value === undefined || value.trim() === "") return undefined;
  const clean = value.trim().replace(/,/g, "");
  if (!/^\d+$/.test(clean)) return undefined;
  const num = Number(clean);
  return Number.isSafeInteger(num) ? num : undefined;
}
