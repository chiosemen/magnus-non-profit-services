import type { Metadata } from 'next';
import Link from 'next/link';
import { Icon, type IconName } from './components/Icon';
import { Faq } from './components/Faq';
import { EvidenceTimelineMock, HeroActionHubMock, HubDetailMock } from './mocks';

export const metadata: Metadata = {
  title: 'Magnus Accord — Restricted Gift Assurance',
  description:
    'Magnus Accord connects donor restrictions, financial activity, and board oversight in one governed workflow, so nonprofit teams can catch exceptions early and produce board-ready evidence. Now recruiting design partners.',
};

const WORKFLOW_STEPS: { title: string; ai: string; human: string }[] = [
  {
    title: 'Capture the source document',
    ai: 'Ingests the gift agreement, grant letter, or pledge and keeps the original attached.',
    human: 'Decides which documents belong in scope.',
  },
  {
    title: 'Extract restrictions with citations',
    ai: 'Drafts each restriction — purpose, time, and reporting terms — citing the exact page and paragraph.',
    human: 'Sees precisely where every interpretation came from.',
  },
  {
    title: 'Confirm the interpretation',
    ai: 'Holds every extraction in a proposed state; nothing takes effect on its own.',
    human: 'Confirms, edits, or rejects each restriction before it governs anything.',
  },
  {
    title: 'Monitor relevant activity',
    ai: 'Watches coded financial activity and deadlines against the confirmed restrictions.',
    human: 'Keeps working in your existing accounting and donor systems.',
  },
  {
    title: 'Surface exceptions',
    ai: 'Flags spending, timing, and documentation issues into one prioritized Action Hub.',
    human: 'Reviews each exception and decides what happens next.',
  },
  {
    title: 'Assemble board-ready evidence',
    ai: 'Prepares the trail — sources, confirmations, resolutions — into reviewable evidence.',
    human: 'Approves what goes to the board and signs the formal record.',
  },
];

const HUB_ITEMS: { icon: IconName; text: string }[] = [
  { icon: 'alert-triangle', text: 'Restriction conflicts between overlapping gifts and grants' },
  { icon: 'folder', text: 'Missing source documentation and acknowledgement letters' },
  { icon: 'calendar-clock', text: 'Funds approaching time or purpose limits' },
  { icon: 'receipt', text: 'Expenditures that need a human decision before they harden' },
  { icon: 'scroll', text: 'Upcoming grant reports and funder obligations' },
  { icon: 'user-check', text: 'AI-prepared classifications waiting on approval' },
  { icon: 'book-check', text: 'Evidence gaps in the next board packet' },
];

const PANELS: { icon: IconName; title: string; body: string }[] = [
  {
    icon: 'hand-heart',
    title: 'Donor Operations',
    body: 'Preserve donor intent from the first conversation: restriction language, acknowledgement requirements, and communication history stay attached to the gift they belong to.',
  },
  {
    icon: 'landmark',
    title: 'Finance & Grants',
    body: 'Connect confirmed restrictions and grant conditions to actual financial activity — so exceptions and reporting dates surface while there is still time to act.',
  },
  {
    icon: 'users',
    title: 'Boards & Governance',
    body: 'Walk into finance committee with traceable evidence instead of a reconstructed story — while formal approval stays with the people authorized to give it.',
  },
];

const ASSURANCE_ITEMS: { icon: IconName; title: string; body: string }[] = [
  { icon: 'file-search', title: 'Source-grounded outputs', body: 'Every interpretation cites the document, page, and paragraph it came from.' },
  { icon: 'user-check', title: 'Human approval states', body: 'AI work stays proposed until a named person confirms it.' },
  { icon: 'fingerprint', title: 'Role-aware access', body: 'People see and approve only what their role allows.' },
  { icon: 'building', title: 'Organization-scoped data', body: 'Your records stay inside your organization’s boundary.' },
  { icon: 'history', title: 'Audit history', body: 'Uploads, proposals, confirmations, and resolutions are all recorded.' },
  { icon: 'calendar-clock', title: 'Provenance & timestamps', body: 'Who did what, when, and on which evidence — on every record.' },
  { icon: 'undo', title: 'Reversible AI proposals', body: 'Anything Accord prepares can be edited, rejected, or rolled back.' },
  { icon: 'lock', title: 'Explicit boundaries', body: 'External and irreversible actions are outside what Accord can do.' },
];

const BETA_POINTS = [
  'Bring one real restricted-gift or grant workflow from your organization',
  'Help validate the exception and approval rules against your actual policies',
  'Review board-ready evidence outputs before they set the standard',
  'Influence integration and reporting priorities for the roadmap',
  'Receive direct implementation support from the team building Accord',
];

const FAQ_ITEMS = [
  {
    q: 'Is Accord a replacement for our CRM or accounting system?',
    a: 'No. Your CRM and accounting system remain the systems of record. Accord sits alongside them as an assurance layer: it connects donor restrictions, financial activity, and board obligations into one reviewable workflow, and points back to the records your existing systems already hold.',
  },
  {
    q: 'Can Accord move money or submit reports automatically?',
    a: 'No. Accord drafts, summarizes, monitors, flags, and prepares. Financial decisions, money movement, external submissions, donor communications, filing status, and formal board records always require an authorized person to act.',
  },
  {
    q: 'How does Accord handle AI-generated interpretations?',
    a: 'Every AI-prepared interpretation is grounded in a source document and cites where it came from. It is held in a proposed state until a person with the right role confirms, edits, or rejects it — and it stays reversible after that. Nothing Accord drafts takes effect on its own.',
  },
  {
    q: 'What information is included in the audit trail?',
    a: 'Document uploads, AI proposals with their citations, human confirmations with role and timestamp, flagged exceptions, the decisions made on them, and the evidence assembled for board reporting. The goal is that any AI-assisted result can be explained and defended after the fact.',
  },
  {
    q: 'Who is the design-partner beta for?',
    a: 'Nonprofits managing multiple restricted gifts, grants, reporting obligations, and board-accountability workflows — typically without a large compliance team. The people we work with most closely are CFOs, controllers, executive directors, grant managers, and board treasurers.',
  },
  {
    q: 'What happens during a design-partner engagement?',
    a: 'We start with one real workflow from your organization — a restricted gift or a grant with reporting obligations. Together we validate how restrictions are captured and confirmed, how exceptions should surface, and what board-ready evidence needs to contain. You get direct support from the team throughout; we get a product shaped by real practice.',
  },
];

export default function AccordLandingPage() {
  return (
    <>
      {/* Hero */}
      <section className="ac-hero" aria-labelledby="ac-hero-h">
        <div className="ac-container">
          <div className="ac-hero-grid">
            <div>
              <p className="ac-eyebrow">Magnus Accord · Restricted Gift Assurance</p>
              <h1 id="ac-hero-h" className="ac-h1">
                Every restricted gift carries a promise. Accord helps you prove it was kept.
              </h1>
              <p className="ac-lead">
                Magnus Accord connects donor restrictions, financial activity, and board oversight
                in one governed workflow — so your team can catch exceptions early and produce
                evidence without rebuilding the story by hand.
              </p>
              <div className="ac-hero-ctas">
                <Link href="/book-audit" className="ac-btn ac-btn--primary">
                  Apply for the Design Partner Beta
                  <Icon name="arrow-right" size={16} />
                </Link>
                <a href="#how-it-works" className="ac-btn ac-btn--ghost">
                  See how Accord works
                </a>
              </div>
              <p className="ac-hero-trust">
                <Icon name="shield-check" size={16} />
                AI prepares the work. Your team retains authority.
              </p>
            </div>

            <HeroActionHubMock />
          </div>
        </div>
      </section>

      {/* Buyer problem */}
      <section className="ac-section ac-section--tint" aria-labelledby="ac-problem-h">
        <div className="ac-container">
          <div className="ac-section-head">
            <p className="ac-eyebrow">The operational gap</p>
            <h2 id="ac-problem-h" className="ac-h2">
              The promise is recorded in one system. The proof is scattered across five.
            </h2>
            <p className="ac-lead">
              When a restricted gift is questioned — by an auditor, a funder, or your own board —
              someone has to reassemble what happened from every system it touched.
            </p>
          </div>

          <div className="ac-problem-grid">
            <div className="ac-problem-tile">
              <b><Icon name="file-text" /> Gift agreements</b>
              <p>Restriction language lives in PDFs and email threads.</p>
            </div>
            <div className="ac-problem-tile">
              <b><Icon name="hand-heart" /> Donor records</b>
              <p>The CRM knows the donor, not what the money may be used for.</p>
            </div>
            <div className="ac-problem-tile">
              <b><Icon name="landmark" /> Accounting activity</b>
              <p>The ledger records spending without the restriction beside it.</p>
            </div>
            <div className="ac-problem-tile">
              <b><Icon name="calendar-clock" /> Grant deadlines</b>
              <p>Reporting dates sit in calendars and spreadsheets.</p>
            </div>
            <div className="ac-problem-tile">
              <b><Icon name="folder" /> Supporting documents</b>
              <p>Receipts and acknowledgements live in shared drives.</p>
            </div>
            <div className="ac-problem-tile">
              <b><Icon name="book-check" /> Board reporting</b>
              <p>The packet is rebuilt by hand each quarter, under deadline.</p>
            </div>
          </div>

          <div className="ac-problem-resolve">
            <Icon name="clipboard-check" size={20} />
            <span>
              Accord holds the restriction, the activity, and the evidence in one governed record —
              each part still owned by the system and the people responsible for it.
            </span>
          </div>
        </div>
      </section>

      {/* Promise-to-proof workflow */}
      <section className="ac-section" id="how-it-works" aria-labelledby="ac-flow-h">
        <div className="ac-container">
          <div className="ac-section-head">
            <p className="ac-eyebrow">From promise to proof</p>
            <h2 id="ac-flow-h" className="ac-h2">
              One governed workflow, with a person at every consequential step.
            </h2>
            <p className="ac-lead">
              Accord prepares the work; your team confirms it. At no step does an AI-generated
              interpretation take effect without human approval.
            </p>
          </div>

          <ol className="ac-flow">
            {WORKFLOW_STEPS.map((s) => (
              <li key={s.title} className="ac-flow-step">
                <h3 className="ac-h3">{s.title}</h3>
                <div className="ac-flow-split">
                  <span className="ai">
                    <b>AI prepares</b> {s.ai}
                  </span>
                  <span className="human">
                    <b>You approve</b> {s.human}
                  </span>
                </div>
              </li>
            ))}
          </ol>
        </div>
      </section>

      {/* Restricted Gift Action Hub */}
      <section className="ac-section ac-section--tint" id="product" aria-labelledby="ac-hub-h">
        <div className="ac-container">
          <div className="ac-hub-grid">
            <div>
              <p className="ac-eyebrow">Restricted Gift Action Hub</p>
              <h2 id="ac-hub-h" className="ac-h2">
                Not another dashboard. A queue of decisions that need you.
              </h2>
              <p className="ac-lead">
                The Action Hub turns restrictions, deadlines, and financial activity into a short
                list of things a person should look at — each one arriving with its source, its
                context, and the decision it needs.
              </p>
              <ul className="ac-hub-list">
                {HUB_ITEMS.map(({ icon, text }) => (
                  <li key={text}>
                    <Icon name={icon} size={17} />
                    {text}
                  </li>
                ))}
              </ul>
            </div>

            <HubDetailMock />
          </div>
        </div>
      </section>

      {/* Cross-functional value */}
      <section className="ac-section" aria-labelledby="ac-panels-h">
        <div className="ac-container">
          <div className="ac-section-head ac-section-head--center">
            <p className="ac-eyebrow">Across the organization</p>
            <h2 id="ac-panels-h" className="ac-h2">
              One record of the promise, three teams who can stand behind it.
            </h2>
          </div>
          <div className="ac-panels">
            {PANELS.map(({ icon, title, body }) => (
              <div key={title} className="ac-panel">
                <Icon name={icon} size={22} />
                <h3 className="ac-h3">{title}</h3>
                <p>{body}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* Governed AI and assurance */}
      <section className="ac-section ac-section--tint" id="assurance" aria-labelledby="ac-assurance-h">
        <div className="ac-container">
          <div className="ac-assurance-grid">
            <div>
              <p className="ac-eyebrow">Governed AI</p>
              <h2 id="ac-assurance-h" className="ac-h2">
                Useful AI should also be accountable.
              </h2>
              <p className="ac-lead">
                Accord is built so that every AI-assisted result can be explained, defended, and —
                if needed — reversed. Assurance is the product, not a feature of it.
              </p>
              <ul className="ac-assurance-list">
                {ASSURANCE_ITEMS.map(({ icon, title, body }) => (
                  <li key={title}>
                    <Icon name={icon} size={17} />
                    <div>
                      <b>{title}</b>
                      <span>{body}</span>
                    </div>
                  </li>
                ))}
              </ul>
            </div>

            <EvidenceTimelineMock />
          </div>
        </div>
      </section>

      {/* Design-partner offer */}
      <section className="ac-section" id="beta" aria-labelledby="ac-beta-h">
        <div className="ac-container">
          <div className="ac-beta">
            <div>
              <p className="ac-eyebrow">Design Partner Beta</p>
              <h2 id="ac-beta-h" className="ac-h2">
                Help shape the assurance layer nonprofits are missing.
              </h2>
              <p className="ac-lead">
                We are working with a small group of organizations in a controlled private beta —
                a collaboration, not a self-serve product. Design partners get direct access to the
                team and real influence over what Accord becomes.
              </p>
              <div className="ac-hero-ctas">
                <Link href="/book-audit" className="ac-btn ac-btn--primary">
                  Apply for the Design Partner Beta
                  <Icon name="arrow-right" size={16} />
                </Link>
              </div>
            </div>
            <ul className="ac-beta-points">
              {BETA_POINTS.map((p) => (
                <li key={p}>
                  <Icon name="check-circle" size={17} />
                  {p}
                </li>
              ))}
            </ul>
          </div>
        </div>
      </section>

      {/* FAQ */}
      <section className="ac-section ac-section--tint" aria-labelledby="ac-faq-h">
        <div className="ac-container">
          <div className="ac-section-head ac-section-head--center">
            <p className="ac-eyebrow">Questions</p>
            <h2 id="ac-faq-h" className="ac-h2">
              Asked by every careful finance team.
            </h2>
          </div>
          <Faq items={FAQ_ITEMS} />
        </div>
      </section>

      {/* Final CTA */}
      <section className="ac-section" aria-labelledby="ac-final-h">
        <div className="ac-container">
          <div className="ac-final">
            <p className="ac-eyebrow">Restricted Gift Assurance</p>
            <h2 id="ac-final-h" className="ac-h2">
              Turn donor promises into evidence your board can stand behind.
            </h2>
            <p className="ac-lead">
              Bring one real restricted-gift workflow. We will show you what governed,
              human-approved assurance looks like on your own gifts and grants.
            </p>
            <div className="ac-hero-ctas">
              <Link href="/book-audit" className="ac-btn ac-btn--primary">
                Apply for the Design Partner Beta
                <Icon name="arrow-right" size={16} />
              </Link>
            </div>
          </div>
        </div>
      </section>
    </>
  );
}
