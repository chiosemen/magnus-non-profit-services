/**
 * Minimal formatting utilities for the Grant Generator.
 */

export function countWords(text: string): number {
  // Treat consecutive whitespace as a single separator.
  const trimmed = text.trim();
  if (!trimmed) return 0;
  return trimmed.split(/\s+/).length;
}

