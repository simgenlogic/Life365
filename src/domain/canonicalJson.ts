/**
 * Deterministic JSON serialization with sorted object keys.
 *
 * Two structurally-equal values always serialize to the same string regardless
 * of key insertion order, which lets installation logic compare definition and
 * packet content by value without a deep-equality walk. Array order is
 * preserved, because order is meaningful for packet content such as prompt
 * options and output-recipe sections.
 *
 * This is a pure function: it never touches persistent or React state.
 */
export function canonicalJson(value: unknown): string {
  return JSON.stringify(canonicalize(value));
}

function canonicalize(value: unknown): unknown {
  if (Array.isArray(value)) {
    return value.map(canonicalize);
  }
  if (value !== null && typeof value === 'object') {
    const source = value as Record<string, unknown>;
    const out: Record<string, unknown> = {};
    for (const key of Object.keys(source).sort()) {
      out[key] = canonicalize(source[key]);
    }
    return out;
  }
  return value;
}
