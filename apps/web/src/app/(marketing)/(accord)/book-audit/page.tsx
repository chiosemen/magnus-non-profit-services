import type { Metadata } from 'next';
import { Icon } from '../components/Icon';

export const metadata: Metadata = {
  title: 'Apply for the Design Partner Beta — Magnus Accord',
  description:
    'Apply to join the Magnus Accord design-partner program: bring one real restricted-gift or grant workflow and help shape restricted gift assurance for nonprofits.',
};

/**
 * /book-audit — the Design Partner Beta application step.
 * Applications go through the organization's existing contact address; no
 * unauthenticated intake surface is added to the app by this page.
 */
const APPLY_SUBJECT = encodeURIComponent('Design Partner Beta application — Magnus Accord');
const APPLY_BODY = encodeURIComponent(
  [
    'Hello Magnus team,',
    '',
    'We would like to apply for the Accord Design Partner Beta.',
    '',
    'Organization:',
    'Your role:',
    'The restricted gift, grant, or board-reporting workflow we would bring:',
    '',
  ].join('\n')
);
const APPLY_MAILTO = `mailto:hello@magnusnonprofitservices.com?subject=${APPLY_SUBJECT}&body=${APPLY_BODY}`;

export default function BookAuditPage() {
  return (
    <div className="ac-apply">
      <div>
        <p className="ac-eyebrow">Design Partner Beta</p>
        <h1 className="ac-h2">Apply for the Design Partner Beta</h1>
        <p className="ac-lead">
          Accord is in a controlled private beta with a small group of design partners. Tell us
          about the restricted gifts, grants, or board-reporting workflows your team manages, and
          we will follow up directly.
        </p>

        <ol className="ac-apply-steps">
          <li>
            Send us a short application by email — who you are, your organization, and the workflow
            you would bring. The button on this page starts a pre-addressed draft for you.
          </li>
          <li>
            We review every application personally and reply by email, usually within a few
            business days.
          </li>
          <li>
            If it is a fit on both sides, we hold a short working conversation and scope a
            design-partner engagement together, with direct implementation support from the team.
          </li>
        </ol>

        <p className="ac-hero-trust">
          <Icon name="shield-check" size={16} />
          AI prepares the work. Your team retains authority.
        </p>
      </div>

      <div className="ac-apply-card">
        <h2 className="ac-h3">What to include</h2>
        <ul className="ac-apply-list">
          <li>
            <Icon name="check" size={15} />
            Your name, role, and organization
          </li>
          <li>
            <Icon name="check" size={15} />
            One real restricted gift, grant, or board-reporting workflow you would bring
          </li>
          <li>
            <Icon name="check" size={15} />
            Roughly how many restricted funds and reporting obligations your team manages
          </li>
        </ul>

        <a className="ac-btn ac-btn--primary" href={APPLY_MAILTO}>
          <Icon name="mail" size={16} />
          Apply for the Design Partner Beta
        </a>

        <p className="ac-apply-note">
          The button opens a pre-addressed email draft to hello@magnusnonprofitservices.com in your
          own mail client — nothing is sent until you send it. We use what you share only to
          evaluate and respond to your application.
        </p>
      </div>
    </div>
  );
}
