-- Membership roles (docs/security/MEMBERSHIP-ROLES.md, MR-1 / MR-5).
-- Closes docs/releases/7430ad0.md §7: "role: 'admin' hardcoded in login:96 and
-- refresh:71 … No role column exists."
--
-- Additive only (SPEC-P0 R8): this file creates a type and a column and sets
-- values; it removes and renames nothing.

-- MR-1: authority is a property of a worker IN an organization — it lives on
-- the membership row, never on the Worker.
CREATE TYPE "OrgRole" AS ENUM ('ADMIN', 'MEMBER');

-- MR-5 (new rows): least privilege by default. An invite-shaped insert that
-- omits role produces a MEMBER, never an ADMIN.
ALTER TABLE "WorkerOrgRelationship"
  ADD COLUMN "role" "OrgRole" NOT NULL DEFAULT 'MEMBER';

-- MR-5 (existing rows): every membership that exists at migration time has
-- been EFFECTIVELY admin since the token claim was hardcoded. Backfilling
-- MEMBER would be a silent narrowing that could lock the real operators out
-- the day the first admin-only route ships. Backfilling ADMIN changes nobody's
-- effective authority; it makes the existing implicit grant explicit and
-- revocable per row. The operator then reviews and demotes (spec §5), exactly
-- as §6 of the release record asks for the six ACTIVE organizations.
UPDATE "WorkerOrgRelationship" SET "role" = 'ADMIN';
