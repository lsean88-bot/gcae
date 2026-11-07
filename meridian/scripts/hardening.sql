-- Meridian database hardening. Safe to run more than once.
-- Makes audit_events append-only: no UPDATE, DELETE or TRUNCATE can succeed, for any database user.
-- Run after the schema exists (npx drizzle-kit push). `npm run db:harden` and `npm run setup:passwords` both apply it.

CREATE OR REPLACE FUNCTION audit_events_block_change() RETURNS trigger AS $$
BEGIN
  RAISE EXCEPTION 'audit_events is append-only: % is not permitted', TG_OP USING ERRCODE = 'insufficient_privilege';
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS audit_events_no_update_delete ON audit_events;
CREATE TRIGGER audit_events_no_update_delete
  BEFORE UPDATE OR DELETE ON audit_events
  FOR EACH ROW EXECUTE FUNCTION audit_events_block_change();

DROP TRIGGER IF EXISTS audit_events_no_truncate ON audit_events;
CREATE TRIGGER audit_events_no_truncate
  BEFORE TRUNCATE ON audit_events
  FOR EACH STATEMENT EXECUTE FUNCTION audit_events_block_change();

-- A released Audit Committee pack is frozen: no UPDATE and no DELETE of a row whose status is 'Released'.
-- The Draft -> Released update is allowed because the old row is still a Draft.
CREATE OR REPLACE FUNCTION ac_packs_block_released() RETURNS trigger AS $$
BEGIN
  IF OLD.status = 'Released' THEN
    RAISE EXCEPTION 'ac_packs: a released pack is frozen, % is not permitted', TG_OP USING ERRCODE = 'insufficient_privilege';
  END IF;
  IF TG_OP = 'DELETE' THEN RETURN OLD; END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DO $$
BEGIN
  IF to_regclass('ac_packs') IS NOT NULL THEN
    DROP TRIGGER IF EXISTS ac_packs_released_frozen ON ac_packs;
    CREATE TRIGGER ac_packs_released_frozen
      BEFORE UPDATE OR DELETE ON ac_packs
      FOR EACH ROW EXECUTE FUNCTION ac_packs_block_released();
  END IF;
END $$;

-- Report versions: snapshots are immutable. No DELETE or TRUNCATE. Only status, signed_off_by and signed_off_at may change.
-- Status moves forward only (Draft to Reviewed to Final, or Draft to Final). Final is refused while gate_json.blocking is non-empty.
-- Sign-off is set only on the move to Final, and both fields must then be present. A Final version is frozen entirely.
-- The GCAE-only check stays in the app: the database cannot see the viewer.
CREATE OR REPLACE FUNCTION report_versions_guard() RETURNS trigger AS $$
BEGIN
  IF TG_OP = 'DELETE' OR TG_OP = 'TRUNCATE' THEN
    RAISE EXCEPTION 'report_versions: % is not permitted', TG_OP USING ERRCODE = 'insufficient_privilege';
  END IF;
  IF OLD.status = 'Final' THEN
    RAISE EXCEPTION 'report_versions: a Final version is frozen' USING ERRCODE = 'insufficient_privilege';
  END IF;
  IF NEW.id IS DISTINCT FROM OLD.id
     OR NEW.engagement_id IS DISTINCT FROM OLD.engagement_id
     OR NEW.version_no IS DISTINCT FROM OLD.version_no
     OR NEW.content_json IS DISTINCT FROM OLD.content_json
     OR NEW.gate_json IS DISTINCT FROM OLD.gate_json
     OR NEW.sha256 IS DISTINCT FROM OLD.sha256
     OR NEW.created_by IS DISTINCT FROM OLD.created_by
     OR NEW.created_at IS DISTINCT FROM OLD.created_at THEN
    RAISE EXCEPTION 'report_versions: only status, signed_off_by and signed_off_at may change' USING ERRCODE = 'insufficient_privilege';
  END IF;
  IF NEW.status IS DISTINCT FROM OLD.status
     AND NOT ((OLD.status = 'Draft' AND NEW.status IN ('Reviewed', 'Final')) OR (OLD.status = 'Reviewed' AND NEW.status = 'Final')) THEN
    RAISE EXCEPTION 'report_versions: status may only move forward (Draft, Reviewed, Final); % to % is refused', OLD.status, NEW.status USING ERRCODE = 'insufficient_privilege';
  END IF;
  IF NEW.status = 'Final' THEN
    IF jsonb_typeof(OLD.gate_json->'blocking') IS DISTINCT FROM 'array' OR jsonb_array_length(OLD.gate_json->'blocking') > 0 THEN
      RAISE EXCEPTION 'report_versions: Final is refused while the release gate has blocking items' USING ERRCODE = 'insufficient_privilege';
    END IF;
    IF NEW.signed_off_by IS NULL OR NEW.signed_off_at IS NULL THEN
      RAISE EXCEPTION 'report_versions: Final needs both signed_off_by and signed_off_at' USING ERRCODE = 'insufficient_privilege';
    END IF;
  ELSIF NEW.signed_off_by IS DISTINCT FROM OLD.signed_off_by OR NEW.signed_off_at IS DISTINCT FROM OLD.signed_off_at THEN
    RAISE EXCEPTION 'report_versions: sign-off may be set only on the move to Final' USING ERRCODE = 'insufficient_privilege';
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DO $$
BEGIN
  IF to_regclass('report_versions') IS NOT NULL THEN
    DROP TRIGGER IF EXISTS report_versions_immutable ON report_versions;
    CREATE TRIGGER report_versions_immutable
      BEFORE UPDATE OR DELETE ON report_versions
      FOR EACH ROW EXECUTE FUNCTION report_versions_guard();
    DROP TRIGGER IF EXISTS report_versions_no_truncate ON report_versions;
    CREATE TRIGGER report_versions_no_truncate
      BEFORE TRUNCATE ON report_versions
      FOR EACH STATEMENT EXECUTE FUNCTION report_versions_guard();
  END IF;
END $$;
