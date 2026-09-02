import type { Metadata } from 'next';
import Link from 'next/link';
import { Icon } from '../components/Icon';

export const metadata: Metadata = {
  title: 'Free Funding Snapshot — Magnus Accord',
  description:
    'Send your organization’s name and get a free one-page picture of your revenue mix, three-year trend, and funding concentration, read from your public Form 990. No call, nothing confidential, nothing retained.',
};

/**
 * /snapshot — the free funding-concentration snapshot, carried over from the
 * previous apex site. Same channel as the beta application: a pre-addressed
 * draft to the existing contact address. No form, no new intake surface,
 * nothing stored.
 */
const SNAPSHOT_SUBJECT = encodeURIComponent('Free funding snapshot request — Magnus Accord');
const SNAPSHOT_BODY = encodeURIComponent(
  [
    'Hello Magnus team,',
    '',
    'Please send us the free funding snapshot.',
    '',
    'Organization name:',
    'City and state (only if the name is common):',
    '',
  ].join('\n')
);
const SNAPSHOT_MAILTO = `mailto:hello@magnusnonprofitservices.com?subject=${SNAPSHOT_SUBJECT}&body=${SNAPSHOT_BODY}`;

const SNAPSHOT_CONTENTS = [
  'Your revenue mix for the most recent filed year, by source category',
  'Your three-year total revenue trend',
  'A concentration measure, and one plain sentence naming what it means',
  'One sentence on what typically comes under pressure first if the dominant source moves',
];

export default function SnapshotPage() {
  return (
    <div className="ac-apply">
      <div>
        <p className="ac-eyebrow">Free funding snapshot</p>
        <h1 className="ac-h2">
          Most boards learn how concentrated their funding is at the wrong meeting.
        </h1>
        <p className="ac-lead">
          Your Form 990 already shows where the money comes from. Send your organization’s name
          and we read it and send back a one-page picture of your revenue mix and three-year trend
          — free, and without a call.
        </p>

        <ol className="ac-apply-steps">
          <li>
            Send your organization’s name. That is the whole request — everything needed to build
            the page is already public.
          </li>
          <li>
            We read your most recent filed Form 990 ourselves and build the page. It takes about
            twenty minutes of our time and none of yours.
          </li>
          <li>
            You get one page back by email. If it raises a question you want to work through,
            that is what the Design Partner Beta is for — but the page is yours either way.
          </li>
        </ol>

        <p className="ac-hero-trust">
          <Icon name="shield-check" size={16} />
          Nothing confidential is used, and nothing is retained beyond what is needed to produce
          the page.
        </p>
      </div>

      <div className="ac-apply-card">
        <h2 className="ac-h3">What the page shows</h2>
        <ul className="ac-apply-list">
          {SNAPSHOT_CONTENTS.map((item) => (
            <li key={item}>
              <Icon name="check" size={15} />
              {item}
            </li>
          ))}
        </ul>

        <a className="ac-btn ac-btn--primary" href={SNAPSHOT_MAILTO}>
          <Icon name="mail" size={16} />
          Request your free snapshot
        </a>

        <p className="ac-apply-note">
          The button opens a pre-addressed email draft to hello@magnusnonprofitservices.com in your
          own mail client — nothing is sent until you send it. It is free and there is no catch
          worth hiding: it is the most honest sample of our work we can give you.
        </p>

        <Link href="/book-audit" className="ac-btn ac-btn--ghost">
          Ready for more? Apply for the beta
          <Icon name="arrow-right" size={16} />
        </Link>
      </div>
    </div>
  );
}
