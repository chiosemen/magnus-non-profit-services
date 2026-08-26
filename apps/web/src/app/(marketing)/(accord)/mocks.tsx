import { Icon, type IconName } from './components/Icon';

/**
 * High-fidelity, non-interactive product compositions for the Accord landing.
 * Each composition is exposed to assistive technology as a single described
 * image (role="img") so screen readers get the meaning without traversing
 * inert mock UI. Nothing inside is a real control — mock "buttons" are <i>
 * elements inside an aria-hidden subtree.
 */

type StatusKind = 'review' | 'due' | 'missing' | 'confirmed' | 'pending';

const STATUS: Record<StatusKind, { label: string; icon: IconName; cls: string }> = {
  review: { label: 'Requires review', icon: 'alert-triangle', cls: 'ac-status--review' },
  due: { label: 'Due soon', icon: 'clock', cls: 'ac-status--due' },
  missing: { label: 'Evidence missing', icon: 'alert-circle', cls: 'ac-status--missing' },
  confirmed: { label: 'Confirmed', icon: 'check-circle', cls: 'ac-status--confirmed' },
  pending: { label: 'Awaiting approval', icon: 'user-check', cls: 'ac-status--pending' },
};

function StatusChip({ kind }: { kind: StatusKind }) {
  const { label, icon, cls } = STATUS[kind];
  return (
    <span className={`ac-status ${cls}`}>
      <Icon name={icon} size={12} />
      {label}
    </span>
  );
}

function QueueRow({ title, sub, status }: { title: string; sub: string; status: StatusKind }) {
  return (
    <div className="ac-mock-row">
      <div className="t">
        <b>{title}</b>
        <span>{sub}</span>
      </div>
      <StatusChip kind={status} />
    </div>
  );
}

export function HeroActionHubMock() {
  return (
    <div
      role="img"
      aria-label="Preview of the Magnus Accord Restricted Gift Action Hub: a work queue for the fictional Harborlight Community Fund showing 3 restrictions awaiting confirmation, 2 transactions requiring review, a grant report due in 12 days, and 1 board evidence gap. Queue items are labeled Requires review, Awaiting approval, Due soon, Evidence missing, or Confirmed, and a footer notes that AI prepared 6 items today with zero actions taken without human approval."
    >
      <div className="ac-mock" aria-hidden="true">
        <div className="ac-mock-titlebar">
          <span className="ac-mock-dotrow">
            <i />
            <i />
            <i />
          </span>
          <strong>Restricted Gift Action Hub</strong>
          <span>· Harborlight Community Fund</span>
        </div>
        <div className="ac-mock-body">
          <div className="ac-mock-summary">
            <div className="ac-mock-stat ac-mock-stat--brand">
              <div className="v ac-num">3</div>
              <div className="l">Restrictions awaiting confirmation</div>
            </div>
            <div className="ac-mock-stat ac-mock-stat--attn">
              <div className="v ac-num">2</div>
              <div className="l">Transactions requiring review</div>
            </div>
            <div className="ac-mock-stat ac-mock-stat--attn">
              <div className="v ac-num">12d</div>
              <div className="l">Until grant report due</div>
            </div>
            <div className="ac-mock-stat">
              <div className="v ac-num">1</div>
              <div className="l">Board evidence gap</div>
            </div>
          </div>

          <div className="ac-mock-rows">
            <QueueRow
              title="Scholarship endowment draw"
              sub="Expenditure may fall outside stated purpose · $4,800"
              status="review"
            />
            <QueueRow
              title="Capital gift — AI-prepared classification"
              sub="Restricted, building fund · cites gift letter p.2"
              status="pending"
            />
            <QueueRow
              title="Youth arts grant — Q3 narrative report"
              sub="Due to funder in 12 days · owner: Grants"
              status="due"
            />
            <QueueRow
              title="Gala proceeds allocation"
              sub="Donor acknowledgement letter not on file"
              status="missing"
            />
            <QueueRow
              title="Food security fund purchases"
              sub="Receipts matched to restriction · $12,340"
              status="confirmed"
            />
          </div>

          <div className="ac-mock-foot">
            <Icon name="shield-check" size={14} />
            <span>AI prepared 6 items today · 0 actions taken without approval</span>
          </div>
        </div>
      </div>
    </div>
  );
}

export function HubDetailMock() {
  return (
    <div
      role="img"
      aria-label="Detail view of one Action Hub exception: a scholarship endowment draw flagged for review. Accord cites the restriction language from page 2 of the gift agreement, shows the flagged transaction, and offers two human decisions: approve with a note, or return to finance. A provenance line records who confirmed the restriction and when."
    >
      <div className="ac-mock" aria-hidden="true">
        <div className="ac-mock-titlebar">
          <span className="ac-mock-dotrow">
            <i />
            <i />
            <i />
          </span>
          <strong>Exception detail</strong>
          <span>· Scholarship endowment draw</span>
        </div>
        <div className="ac-mock-body">
          <div className="ac-mock-rows">
            <QueueRow
              title="Check #2041 — $4,800 · Program supplies"
              sub="Posted 14 Aug · fund 205 — Whitfield Scholarship Endowment"
              status="review"
            />
          </div>

          <div className="ac-mock-detail">
            <div className="cite">
              “…to be used exclusively for tuition assistance for students of the county public
              school system.”
              <small>Gift agreement, p.2 ¶4 · uploaded 3 Mar · confirmed by Controller, 5 Mar</small>
            </div>
            <div className="note">
              This expenditure is coded to program supplies, which does not appear in the confirmed
              purpose. Accord prepared this exception for review — it has not changed the ledger.
            </div>
            <div className="ac-mock-actions">
              <i className="approve">Approve with note</i>
              <i className="return">Return to finance</i>
            </div>
          </div>

          <div className="ac-mock-foot">
            <Icon name="shield-check" size={14} />
            <span>Every decision recorded with role, timestamp, and source citation</span>
          </div>
        </div>
      </div>
    </div>
  );
}

export function EvidenceTimelineMock() {
  return (
    <div
      role="img"
      aria-label="Example evidence record: each step of a restricted gift's life is logged with its actor, source, and timestamp — from the gift agreement upload, through an AI-proposed restriction held for confirmation, a controller's confirmation, an AI-flagged expenditure exception, to the CFO's resolution recorded in the board packet."
    >
      <ol className="ac-timeline" aria-hidden="true">
        <li>
          <span className="dot"><i /></span>
          <b>Gift agreement uploaded</b>
          <p>Whitfield Scholarship Endowment · 14 pages</p>
          <span className="meta">3 Mar · 10:42 · Development Associate</span>
        </li>
        <li>
          <span className="dot"><i /></span>
          <b>Restriction extracted</b>
          <p>“Exclusively for tuition assistance…” — cites p.2 ¶4</p>
          <span className="who who--ai">AI proposed</span>
          <span className="meta">3 Mar · 10:44 · held for confirmation</span>
        </li>
        <li>
          <span className="dot dot--human"><i /></span>
          <b>Interpretation confirmed</b>
          <p>Classified restricted — purpose · fund 205</p>
          <span className="who who--human">Human approved</span>
          <span className="meta">5 Mar · 09:12 · Controller</span>
        </li>
        <li>
          <span className="dot"><i /></span>
          <b>Expenditure flagged</b>
          <p>Check #2041 coded outside confirmed purpose</p>
          <span className="who who--ai">AI flagged</span>
          <span className="meta">14 Aug · 16:03 · exception opened</span>
        </li>
        <li>
          <span className="dot dot--human"><i /></span>
          <b>Exception resolved</b>
          <p>Recoded with note · included in Q3 board packet</p>
          <span className="who who--human">Human approved</span>
          <span className="meta">15 Aug · 11:27 · CFO</span>
        </li>
      </ol>
    </div>
  );
}
