-- Magnus Nonprofit OS — Migration 001: Initial Schema
-- Covers: Organizations, Users, Compliance, Grant Applications, Audit Log
-- Run: prisma migrate dev --name initial_schema

BEGIN;

-- ─── Extensions ───────────────────────────────────────────────────────────────
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";
CREATE EXTENSION IF NOT EXISTS "pgcrypto";

-- ─── Organizations ─────────────────────────────────────────────────────────────
CREATE TABLE organizations (
  id                  UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  ein                 VARCHAR(9)   NOT NULL UNIQUE,
  name                TEXT         NOT NULL,
  city                VARCHAR(100),
  state               CHAR(2),
  ntee_code           VARCHAR(10),
  mission_statement   TEXT,
  founding_year       SMALLINT,
  annual_budget       NUMERIC(15, 2),
  program_ratio       NUMERIC(5, 2),
  employee_count      INTEGER,
  volunteer_count     INTEGER,
  website_url         TEXT,
  filing_status       VARCHAR(20)  NOT NULL DEFAULT 'unknown',
  last_synced_at      TIMESTAMPTZ,
  created_at          TIMESTAMPTZ  NOT NULL DEFAULT NOW(),
  updated_at          TIMESTAMPTZ  NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_organizations_ein ON organizations(ein);
CREATE INDEX idx_organizations_state_ntee ON organizations(state, ntee_code);

-- ─── Users ────────────────────────────────────────────────────────────────────
CREATE TABLE users (
  id              UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  email           TEXT         NOT NULL UNIQUE,
  name            TEXT,
  password_hash   TEXT         NOT NULL,
  roles           TEXT[]       NOT NULL DEFAULT ARRAY['viewer'],
  is_active       BOOLEAN      NOT NULL DEFAULT TRUE,
  last_login_at   TIMESTAMPTZ,
  created_at      TIMESTAMPTZ  NOT NULL DEFAULT NOW(),
  updated_at      TIMESTAMPTZ  NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_users_email ON users(email);

-- ─── User → Organization ───────────────────────────────────────────────────────
CREATE TABLE user_organizations (
  id              UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  user_id         UUID         NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  organization_id UUID         NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  role            VARCHAR(50)  NOT NULL DEFAULT 'member',
  permissions     TEXT[]       NOT NULL DEFAULT '{}',
  created_at      TIMESTAMPTZ  NOT NULL DEFAULT NOW(),
  UNIQUE(user_id, organization_id)
);

CREATE INDEX idx_user_org_user ON user_organizations(user_id);
CREATE INDEX idx_user_org_org  ON user_organizations(organization_id);

-- ─── Sessions ─────────────────────────────────────────────────────────────────
CREATE TABLE user_sessions (
  id               UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  user_id          UUID         NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  client_id        TEXT         NOT NULL,
  ip_address       INET,
  user_agent       TEXT,
  expires_at       TIMESTAMPTZ  NOT NULL,
  is_active        BOOLEAN      NOT NULL DEFAULT TRUE,
  last_activity_at TIMESTAMPTZ  NOT NULL DEFAULT NOW(),
  created_at       TIMESTAMPTZ  NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_sessions_user_active ON user_sessions(user_id, is_active);
CREATE INDEX idx_sessions_expires    ON user_sessions(expires_at);

-- ─── Compliance Records ────────────────────────────────────────────────────────
CREATE TABLE compliance_records (
  id                    UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  organization_id       UUID         NOT NULL REFERENCES organizations(id),
  ein                   VARCHAR(9)   NOT NULL,
  filing_type           VARCHAR(10)  NOT NULL,
  tax_year              SMALLINT     NOT NULL,
  filing_date           DATE,
  tax_period_end        VARCHAR(8),
  total_revenue         BIGINT,
  total_expenses        BIGINT,
  net_assets            BIGINT,
  program_expenses      BIGINT,
  admin_expenses        BIGINT,
  fundraising_expenses  BIGINT,
  employee_count        INTEGER,
  pdf_url               TEXT,
  is_amended            BOOLEAN      NOT NULL DEFAULT FALSE,
  created_at            TIMESTAMPTZ  NOT NULL DEFAULT NOW(),
  updated_at            TIMESTAMPTZ  NOT NULL DEFAULT NOW(),
  UNIQUE(ein, tax_year)
);

CREATE INDEX idx_compliance_ein      ON compliance_records(ein);
CREATE INDEX idx_compliance_tax_year ON compliance_records(tax_year);

-- ─── Grant Applications ────────────────────────────────────────────────────────
CREATE TABLE grant_applications (
  id                UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  organization_id   UUID         NOT NULL REFERENCES organizations(id),
  funder_ein        VARCHAR(9),
  funder_name       TEXT         NOT NULL,
  program_name      TEXT         NOT NULL,
  project_name      TEXT         NOT NULL,
  requested_amount  NUMERIC(12, 2) NOT NULL,
  total_project_cost NUMERIC(12, 2),
  project_start_date DATE,
  project_end_date  DATE,
  status            VARCHAR(30)  NOT NULL DEFAULT 'draft',
  target_population TEXT,
  geographic_area   TEXT,
  number_to_serve   INTEGER,
  submitted_at      TIMESTAMPTZ,
  awarded_at        TIMESTAMPTZ,
  awarded_amount    NUMERIC(12, 2),
  created_at        TIMESTAMPTZ  NOT NULL DEFAULT NOW(),
  updated_at        TIMESTAMPTZ  NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_grants_org_id    ON grant_applications(organization_id);
CREATE INDEX idx_grants_status    ON grant_applications(status);
CREATE INDEX idx_grants_funder    ON grant_applications(funder_name);

-- ─── Grant Proposal Sections ───────────────────────────────────────────────────
CREATE TABLE grant_proposal_sections (
  id                    UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  application_id        UUID         NOT NULL REFERENCES grant_applications(id) ON DELETE CASCADE,
  section_type          VARCHAR(50)  NOT NULL,
  title                 TEXT         NOT NULL,
  content               TEXT         NOT NULL DEFAULT '',
  word_count            INTEGER      NOT NULL DEFAULT 0,
  word_limit            INTEGER,
  status                VARCHAR(30)  NOT NULL DEFAULT 'draft',
  generation_attempts   INTEGER      NOT NULL DEFAULT 0,
  quality_score         SMALLINT,
  completeness_score    SMALLINT,
  ai_model              VARCHAR(100),
  prompt_tokens         INTEGER,
  completion_tokens     INTEGER,
  generated_at          TIMESTAMPTZ,
  approved_at           TIMESTAMPTZ,
  revision_notes        TEXT,
  created_at            TIMESTAMPTZ  NOT NULL DEFAULT NOW(),
  updated_at            TIMESTAMPTZ  NOT NULL DEFAULT NOW(),
  UNIQUE(application_id, section_type)
);

CREATE INDEX idx_sections_app_id ON grant_proposal_sections(application_id);
CREATE INDEX idx_sections_status ON grant_proposal_sections(status);

-- ─── Grant Intake Responses ────────────────────────────────────────────────────
CREATE TABLE grant_intake_responses (
  id              UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  application_id  UUID         NOT NULL REFERENCES grant_applications(id) ON DELETE CASCADE,
  field_name      VARCHAR(100) NOT NULL,
  field_value     TEXT         NOT NULL DEFAULT '',
  field_type      VARCHAR(20)  NOT NULL DEFAULT 'text',
  is_required     BOOLEAN      NOT NULL DEFAULT FALSE,
  created_at      TIMESTAMPTZ  NOT NULL DEFAULT NOW(),
  updated_at      TIMESTAMPTZ  NOT NULL DEFAULT NOW(),
  UNIQUE(application_id, field_name)
);

CREATE INDEX idx_intake_app_id ON grant_intake_responses(application_id);

-- ─── Grant Opportunities ───────────────────────────────────────────────────────
CREATE TABLE grant_opportunities (
  id                    UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  funder_name           TEXT         NOT NULL,
  funder_ein            VARCHAR(9),
  program_name          TEXT         NOT NULL,
  description           TEXT,
  focus_areas           TEXT[]       NOT NULL DEFAULT '{}',
  eligible_ntee_codes   TEXT[]       NOT NULL DEFAULT '{}',
  eligible_states       TEXT[]       NOT NULL DEFAULT '{}',
  min_grant_amount      NUMERIC(12, 2),
  max_grant_amount      NUMERIC(12, 2),
  total_giving          NUMERIC(15, 2),
  application_deadline  DATE,
  loi_deadline          DATE,
  is_rolling_deadline   BOOLEAN      NOT NULL DEFAULT FALSE,
  application_url       TEXT,
  contact_email         TEXT,
  requires_loi          BOOLEAN      NOT NULL DEFAULT FALSE,
  accepts_unsolicited   BOOLEAN      NOT NULL DEFAULT TRUE,
  average_grant_size    NUMERIC(12, 2),
  grant_count           INTEGER,
  data_source           VARCHAR(50)  NOT NULL DEFAULT 'candid',
  last_updated          TIMESTAMPTZ  NOT NULL DEFAULT NOW(),
  created_at            TIMESTAMPTZ  NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_opportunities_deadline ON grant_opportunities(application_deadline);
CREATE INDEX idx_opportunities_funder   ON grant_opportunities(funder_ein);

-- ─── Funder Profiles ──────────────────────────────────────────────────────────
CREATE TABLE funder_profiles (
  id                    UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  ein                   VARCHAR(9)   NOT NULL UNIQUE,
  name                  TEXT         NOT NULL,
  type                  VARCHAR(50),
  location              TEXT,
  annual_giving         NUMERIC(15, 2),
  average_grant         NUMERIC(12, 2),
  total_assets          NUMERIC(15, 2),
  focus_areas           TEXT[]       NOT NULL DEFAULT '{}',
  geographic_focus      TEXT[]       NOT NULL DEFAULT '{}',
  ntee_focus            TEXT[]       NOT NULL DEFAULT '{}',
  accepts_unsolicited   BOOLEAN      NOT NULL DEFAULT FALSE,
  has_loi_requirement   BOOLEAN      NOT NULL DEFAULT FALSE,
  application_cycle     VARCHAR(20),
  website_url           TEXT,
  staff_contact         TEXT,
  last_researched       TIMESTAMPTZ  NOT NULL DEFAULT NOW(),
  created_at            TIMESTAMPTZ  NOT NULL DEFAULT NOW(),
  updated_at            TIMESTAMPTZ  NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_funders_ein ON funder_profiles(ein);

-- ─── Audit Log (Immutable — NO UPDATE, NO DELETE) ─────────────────────────────
CREATE TABLE audit_logs (
  id              UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  user_id         UUID         REFERENCES users(id),
  org_id          UUID,
  tool_name       VARCHAR(100) NOT NULL,
  action          VARCHAR(50)  NOT NULL DEFAULT 'tool_call',
  params          JSONB,
  result          TEXT,
  success         BOOLEAN      NOT NULL,
  status_code     SMALLINT,
  duration_ms     INTEGER,
  ip_address      INET,
  user_agent      TEXT,
  request_id      TEXT,
  timestamp       TIMESTAMPTZ  NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_audit_user_id   ON audit_logs(user_id);
CREATE INDEX idx_audit_org_id    ON audit_logs(org_id);
CREATE INDEX idx_audit_tool_name ON audit_logs(tool_name);
CREATE INDEX idx_audit_timestamp ON audit_logs(timestamp);
CREATE INDEX idx_audit_request   ON audit_logs(request_id);

-- Prevent modifications to audit log (immutability enforcement)
CREATE RULE audit_no_update AS ON UPDATE TO audit_logs DO INSTEAD NOTHING;
CREATE RULE audit_no_delete AS ON DELETE TO audit_logs DO INSTEAD NOTHING;

-- ─── Generated Documents ──────────────────────────────────────────────────────
CREATE TABLE generated_documents (
  id                UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  application_id    UUID         NOT NULL,
  format            VARCHAR(10)  NOT NULL,
  file_name         TEXT         NOT NULL,
  file_path         TEXT         NOT NULL,
  file_size         INTEGER      NOT NULL,
  page_count        SMALLINT,
  storage_provider  VARCHAR(20)  NOT NULL DEFAULT 'local',
  storage_url       TEXT,
  generated_at      TIMESTAMPTZ  NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_documents_app_id ON generated_documents(application_id);

-- ─── Prompt Templates ─────────────────────────────────────────────────────────
CREATE TABLE grant_prompt_templates (
  id               UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  section_type     VARCHAR(50)  NOT NULL UNIQUE,
  title            TEXT         NOT NULL,
  word_limit       INTEGER      NOT NULL,
  word_minimum     INTEGER      NOT NULL DEFAULT 0,
  system_prompt    TEXT         NOT NULL,
  user_prompt      TEXT         NOT NULL,
  revision_prompt  TEXT         NOT NULL,
  version          INTEGER      NOT NULL DEFAULT 1,
  is_active        BOOLEAN      NOT NULL DEFAULT TRUE,
  created_at       TIMESTAMPTZ  NOT NULL DEFAULT NOW(),
  updated_at       TIMESTAMPTZ  NOT NULL DEFAULT NOW()
);

-- ─── Update Trigger ────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION update_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trg_organizations_updated   BEFORE UPDATE ON organizations   FOR EACH ROW EXECUTE FUNCTION update_updated_at();
CREATE TRIGGER trg_users_updated           BEFORE UPDATE ON users           FOR EACH ROW EXECUTE FUNCTION update_updated_at();
CREATE TRIGGER trg_compliance_updated      BEFORE UPDATE ON compliance_records FOR EACH ROW EXECUTE FUNCTION update_updated_at();
CREATE TRIGGER trg_applications_updated    BEFORE UPDATE ON grant_applications FOR EACH ROW EXECUTE FUNCTION update_updated_at();
CREATE TRIGGER trg_sections_updated        BEFORE UPDATE ON grant_proposal_sections FOR EACH ROW EXECUTE FUNCTION update_updated_at();
CREATE TRIGGER trg_funder_profiles_updated BEFORE UPDATE ON funder_profiles  FOR EACH ROW EXECUTE FUNCTION update_updated_at();
CREATE TRIGGER trg_templates_updated       BEFORE UPDATE ON grant_prompt_templates FOR EACH ROW EXECUTE FUNCTION update_updated_at();

COMMIT;
