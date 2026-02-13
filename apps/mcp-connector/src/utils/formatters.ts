/**
 * Minimal formatting helpers used across MCP Connector.
 * Kept intentionally small and deterministic to avoid business-logic drift.
 */

export function formatCurrency(
  amount: number,
  options: { currency?: string; locale?: string; maximumFractionDigits?: number } = {}
): string {
  const currency = options.currency ?? 'USD';
  const locale = options.locale ?? 'en-US';
  const maximumFractionDigits = options.maximumFractionDigits ?? 0;
  return new Intl.NumberFormat(locale, {
    style: 'currency',
    currency,
    maximumFractionDigits,
  }).format(amount);
}

export function formatPercentage(value: number, fractionDigits = 1): string {
  // Accept either 0-1 or 0-100 input; if <=1, treat as ratio.
  const pct = value <= 1 ? value * 100 : value;
  return `${pct.toFixed(fractionDigits)}%`;
}

export function formatEIN(ein: string): string {
  const digits = ein.replace(/\D/g, '');
  if (digits.length !== 9) return ein;
  return `${digits.slice(0, 2)}-${digits.slice(2)}`;
}

export function formatDateShort(input: string | Date): string {
  const d = input instanceof Date ? input : new Date(input);
  if (Number.isNaN(d.getTime())) return String(input);
  return d.toLocaleDateString('en-US', { year: 'numeric', month: 'short', day: '2-digit' });
}

export function formatDeadline(input: string | Date): string {
  return formatDateShort(input);
}

export function formatGrantRange(minAmount: number, maxAmount: number): string {
  if (minAmount <= 0 && maxAmount <= 0) return 'Varies';
  if (minAmount > 0 && maxAmount > 0) return `${formatCurrency(minAmount)}–${formatCurrency(maxAmount)}`;
  if (minAmount > 0) return `${formatCurrency(minAmount)}+`;
  return `Up to ${formatCurrency(maxAmount)}`;
}

