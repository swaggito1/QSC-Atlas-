// Parsers for the line-structured Notion text fields. The Atlas stores some data
// as plain text with a simple convention so it is easy to edit in Notion:
//   Gov Actors / Process Participation: one "name | role" per line
//   Migration Timeline:                 one "year | milestone" per line
//   Standard Families / Algorithms:      comma-separated
// These turn that text into structured data the components can render.

/** A "name | role" pair. `role` is null when a line has no pipe. */
export interface NameRole {
  name: string;
  role: string | null;
}

/** Parse a multi-line "name | role" field. Empty/blank input gives []. */
export function parseNameRole(raw: string | null | undefined): NameRole[] {
  if (!raw) return [];
  return raw
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean)
    .map((line) => {
      const [name, ...rest] = line.split('|');
      const role = rest.join('|').trim();
      return { name: name.trim(), role: role === '' ? null : role };
    })
    .filter((pair) => pair.name !== '');
}

/** A migration milestone. `year` is a number when parseable, else the raw marker (e.g. "Phased"). */
export interface Milestone {
  year: number | string;
  label: string;
}

/** Parse a multi-line "year | milestone" field. Empty input gives [] (caller shows the empty state). */
export function parseTimeline(raw: string | null | undefined): Milestone[] {
  if (!raw) return [];
  return raw
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean)
    .map((line) => {
      const [yearPart, ...rest] = line.split('|');
      const yearStr = yearPart.trim();
      const yearNum = Number(yearStr);
      const isNumber = yearStr !== '' && Number.isFinite(yearNum);
      return { year: isNumber ? yearNum : yearStr, label: rest.join('|').trim() };
    })
    .filter((m) => m.label !== '' || typeof m.year === 'number');
}

/** Split a comma-separated field (Standard Families, Algorithms) into trimmed items. */
export function parseList(raw: string | null | undefined): string[] {
  if (!raw) return [];
  return raw.split(',').map((s) => s.trim()).filter(Boolean);
}

/** A governing instrument: "instrument | level | status" per line. */
export interface Regulation {
  instrument: string;
  level: string | null;
  status: string | null;
}

/** Parse a multi-line "instrument | level | status" field. Empty input gives []. */
export function parseRegulation(raw: string | null | undefined): Regulation[] {
  if (!raw) return [];
  return raw
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean)
    .map((line) => {
      const [instrument, level, status] = line.split('|').map((s) => s.trim());
      return {
        instrument: instrument ?? '',
        level: level ? level : null,
        status: status ? status : null,
      };
    })
    .filter((r) => r.instrument !== '');
}
