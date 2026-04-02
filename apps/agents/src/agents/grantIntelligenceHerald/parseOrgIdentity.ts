export type ParsedOrgGrantProfile = {
  nteeCode: string;
  primaryState: string;
  annualBudgetUsd: number;
  focusAreas: string[];
  warnings: string[];
};

export type ParseOrgIdentityForGrantProfileResult = {
  profile: ParsedOrgGrantProfile | null;
  missing: string[];
  warnings: string[];
};

function extractSection(md: string, header: string): string {
  const re = new RegExp(`^##\\s+${header}\\s*$`, 'mi');
  const m = re.exec(md);
  if (!m) return '';
  const start = m.index + m[0].length;
  const rest = md.slice(start);
  const next = /^##\s+/m.exec(rest);
  return (next ? rest.slice(0, next.index) : rest).trim();
}

function parseTwoLetterStates(text: string): string[] {
  const hits = text.toUpperCase().match(/\b[A-Z]{2}\b/g) ?? [];
  const uniq = Array.from(new Set(hits));
  // Very small allow-list avoids picking up random two-letter words.
  const states = new Set([
    'AL','AK','AZ','AR','CA','CO','CT','DE','FL','GA','HI','ID','IL','IN','IA','KS','KY','LA','ME','MD','MA','MI','MN','MS','MO','MT','NE','NV','NH','NJ','NM','NY','NC','ND','OH','OK','OR','PA','RI','SC','SD','TN','TX','UT','VT','VA','WA','WV','WI','WY','DC',
  ]);
  return uniq.filter(s => states.has(s));
}

function parseFocusAreas(text: string): string[] {
  const lines = text
    .split('\n')
    .map(l => l.trim())
    .filter(Boolean)
    .map(l => l.replace(/^[*-]\s+/, ''));
  return lines
    .flatMap(l => l.split(',').map(x => x.trim()).filter(Boolean))
    .slice(0, 12);
}

function parseNtee(text: string): string | null {
  // Accept typical NTEE like "B20" or "E21"; keep conservative.
  const m = text.toUpperCase().match(/\b[A-Z][0-9]{2}\b/);
  return m ? m[0] : null;
}

export function parseOrgIdentityForGrantProfile(params: {
  orgIdentityMarkdown: string;
  annualRevenueUsdSnapshot: number | null;
}): ParseOrgIdentityForGrantProfileResult {
  const warnings: string[] = [];
  const missing: string[] = [];
  const md = params.orgIdentityMarkdown ?? '';

  const sector = extractSection(md, 'Sector / NTEE');
  const footprint = extractSection(md, 'State footprint');
  const focus = extractSection(md, 'Mission');

  const nteeCode = parseNtee(sector);
  if (!nteeCode) {
    warnings.push('missing_ntee_code');
    missing.push('missing_ntee_code');
  }

  const states = parseTwoLetterStates(footprint);
  const primaryState = states[0] ?? null;
  if (!primaryState) {
    warnings.push('missing_primary_state');
    missing.push('missing_primary_state');
  }

  const annualBudgetUsd =
    params.annualRevenueUsdSnapshot && Number.isFinite(params.annualRevenueUsdSnapshot) && params.annualRevenueUsdSnapshot > 0
      ? Math.round(params.annualRevenueUsdSnapshot)
      : 0;
  if (annualBudgetUsd <= 0) {
    warnings.push('missing_annual_budget_usd');
    missing.push('missing_annual_budget_usd');
  }

  // Best-effort focus areas: try Mission section bullets/commas.
  const focusAreas = parseFocusAreas(focus);
  if (focusAreas.length === 0) warnings.push('missing_focus_areas');

  const profile =
    nteeCode && primaryState && annualBudgetUsd > 0
      ? {
          nteeCode,
          primaryState,
          annualBudgetUsd,
          focusAreas,
          warnings,
        }
      : null;

  return { profile, missing, warnings };
}

