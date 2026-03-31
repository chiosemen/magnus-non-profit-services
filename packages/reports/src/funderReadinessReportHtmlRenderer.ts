import {
  FunderReadinessReport,
  FunderReadinessReportItem,
  FunderReadinessReportSection,
} from './funderReadinessReportService';

export class FunderReadinessReportHtmlRenderer {
  render(report: FunderReadinessReport): string {
    const title = `${report.identity.organizationName} - Funder Readiness Report`;

    return [
      '<!doctype html>',
      '<html lang="en">',
      '<head>',
      '<meta charset="utf-8" />',
      '<meta name="viewport" content="width=device-width, initial-scale=1" />',
      `<title>${escapeHtml(title)}</title>`,
      '<style>',
      this.styles(),
      '</style>',
      '</head>',
      '<body>',
      '<main class="page">',
      '<header class="hero">',
      '<div>',
      '<p class="eyebrow">Magnus Accord</p>',
      '<h1>Funder Readiness Report</h1>',
      `<p class="identity">${escapeHtml(report.identity.organizationName)} | EIN ${escapeHtml(report.identity.ein)} | Tax Year ${report.identity.taxYear}</p>`,
      '</div>',
      `<div class="score-panel"><div class="score-label">990 Health Score</div><div class="score-value">${report.overallScore}</div><div class="score-copy">${escapeHtml(report.overallExplanation)}</div></div>`,
      '</header>',
      '<section class="section">',
      '<h2>Category Scores</h2>',
      '<div class="grid">',
      ...report.sections.map(section => this.renderSection(section)),
      '</div>',
      '</section>',
      '<section class="columns">',
      '<div class="column">',
      '<h2>Top Risks and Watchouts</h2>',
      '<ol class="items">',
      ...report.watchouts.map(item => this.renderItem(item)),
      '</ol>',
      '</div>',
      '<div class="column">',
      '<h2>Top 3 Recommended Actions</h2>',
      '<ol class="items">',
      ...report.recommendedActions.map(item => this.renderItem(item)),
      '</ol>',
      '</div>',
      '</section>',
      '<footer class="footer">',
      `<p>${escapeHtml(report.scoreMethodology)}</p>`,
      '<p>Renderer: funder-readiness-report-html-v1</p>',
      '</footer>',
      '</main>',
      '</body>',
      '</html>',
    ].join('');
  }

  private renderSection(section: FunderReadinessReportSection): string {
    return [
      `<article class="card card-${section.rating}">`,
      `<div class="card-head"><h3>${escapeHtml(section.title)}</h3><span class="badge">${section.score}</span></div>`,
      `<p class="metric">${escapeHtml(section.metricLabel)}</p>`,
      `<p class="detail">${escapeHtml(section.explanation)}</p>`,
      `<p class="formula">Formula: <code>${escapeHtml(section.formula)}</code></p>`,
      '</article>',
    ].join('');
  }

  private renderItem(item: FunderReadinessReportItem): string {
    return [
      `<li class="item priority-${item.priority}">`,
      `<strong>${escapeHtml(item.title)}</strong>`,
      `<p>${escapeHtml(item.detail)}</p>`,
      '</li>',
    ].join('');
  }

  private styles(): string {
    return `
      :root {
        --ink: #16324f;
        --text: #243647;
        --muted: #5f7080;
        --line: #d8e1e8;
        --paper: #f7f8fa;
        --brand: #0f5b78;
        --accent: #d9843b;
        --strong: #e8f3ec;
        --stable: #edf4f8;
        --watch: #fff3df;
        --weak: #fde8e4;
      }
      * { box-sizing: border-box; }
      body {
        margin: 0;
        background: var(--paper);
        color: var(--text);
        font-family: Georgia, "Times New Roman", serif;
      }
      .page {
        width: 8.5in;
        min-height: 11in;
        margin: 0 auto;
        padding: 0.55in;
        background: #ffffff;
      }
      .hero {
        display: grid;
        grid-template-columns: 1.4fr 0.9fr;
        gap: 24px;
        align-items: start;
        padding-bottom: 24px;
        border-bottom: 2px solid var(--line);
      }
      .eyebrow {
        margin: 0 0 8px;
        letter-spacing: 0.16em;
        text-transform: uppercase;
        font: 600 12px/1.2 Arial, sans-serif;
        color: var(--brand);
      }
      h1, h2, h3 {
        margin: 0;
        color: var(--ink);
      }
      h1 { font-size: 32px; line-height: 1.1; }
      h2 { font-size: 18px; margin-bottom: 14px; }
      h3 { font-size: 17px; }
      .identity {
        margin: 12px 0 0;
        color: var(--muted);
        font: 14px/1.5 Arial, sans-serif;
      }
      .score-panel {
        border: 1px solid var(--line);
        padding: 20px;
        background: linear-gradient(180deg, #f8fbfc 0%, #eef5f7 100%);
      }
      .score-label, .metric, .formula, .footer, .item p, .detail {
        font-family: Arial, sans-serif;
      }
      .score-label {
        font-size: 12px;
        letter-spacing: 0.12em;
        text-transform: uppercase;
        color: var(--brand);
      }
      .score-value {
        margin: 10px 0 6px;
        font-size: 56px;
        line-height: 0.95;
        color: var(--ink);
      }
      .score-copy {
        font: 14px/1.5 Arial, sans-serif;
        color: var(--text);
      }
      .section {
        margin-top: 28px;
      }
      .grid {
        display: grid;
        grid-template-columns: repeat(2, minmax(0, 1fr));
        gap: 14px;
      }
      .card {
        border: 1px solid var(--line);
        padding: 16px;
        break-inside: avoid;
      }
      .card-strong { background: var(--strong); }
      .card-stable { background: var(--stable); }
      .card-watch { background: var(--watch); }
      .card-weak { background: var(--weak); }
      .card-head {
        display: flex;
        justify-content: space-between;
        align-items: baseline;
        gap: 12px;
      }
      .badge {
        min-width: 40px;
        text-align: center;
        padding: 5px 8px;
        border: 1px solid rgba(22, 50, 79, 0.16);
        background: rgba(255, 255, 255, 0.72);
        font: 700 18px/1 Arial, sans-serif;
        color: var(--ink);
      }
      .metric {
        margin: 10px 0 8px;
        font-size: 13px;
        color: var(--brand);
        text-transform: uppercase;
        letter-spacing: 0.08em;
      }
      .detail {
        margin: 0 0 12px;
        font-size: 13px;
        line-height: 1.55;
      }
      .formula {
        margin: 0;
        font-size: 12px;
        color: var(--muted);
      }
      .columns {
        display: grid;
        grid-template-columns: repeat(2, minmax(0, 1fr));
        gap: 22px;
        margin-top: 28px;
      }
      .column {
        border-top: 2px solid var(--line);
        padding-top: 16px;
      }
      .items {
        margin: 0;
        padding-left: 20px;
      }
      .item {
        margin-bottom: 12px;
        padding-left: 4px;
      }
      .item strong {
        color: var(--ink);
        font-size: 15px;
      }
      .item p {
        margin: 6px 0 0;
        font-size: 13px;
        line-height: 1.5;
      }
      .footer {
        margin-top: 24px;
        padding-top: 14px;
        border-top: 1px solid var(--line);
        font-size: 12px;
        line-height: 1.5;
        color: var(--muted);
      }
      code {
        font-family: "SFMono-Regular", Consolas, "Liberation Mono", monospace;
        font-size: 11px;
      }
      @media print {
        body { background: #ffffff; }
        .page {
          width: auto;
          min-height: auto;
          margin: 0;
          padding: 0.45in;
        }
      }
    `;
  }
}

function escapeHtml(value: string): string {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

export default FunderReadinessReportHtmlRenderer;
