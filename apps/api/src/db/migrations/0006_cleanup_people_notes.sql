-- Strip structured KEY: value headers from the notes field.
-- These headers (ROLE, RELATIONSHIP, EMAIL, CONTEXT, PRIORITIES, CHANNEL_*)
-- were a legacy workaround before dedicated columns existed. The actual
-- free-form notes live after the NOTES: line. Records without a NOTES:
-- section but with structured headers have no real notes — set to NULL.
--
-- NOTE: This migration was already applied manually (23 rows updated).
-- Running again is safe — all structured-header notes are already cleaned.
UPDATE people
SET notes = CASE
  -- Has a NOTES: section — extract only that portion
  -- Use chr(10) for newline since E'\n' may not work in all psql modes
  WHEN position((chr(10) || 'NOTES: ') IN notes) > 0
    THEN trim(substring(notes FROM position((chr(10) || 'NOTES: ') IN notes) + 8))
  -- Starts with a structured header but no NOTES: line — pure metadata, no actual notes
  WHEN notes ~ '^(ROLE|RELATIONSHIP|EMAIL|CONTEXT|PRIORITIES|CHANNEL_)'
    THEN NULL
  -- Unrecognized format — leave unchanged
  ELSE notes
END
WHERE notes IS NOT NULL
  AND notes ~ '^(ROLE|RELATIONSHIP|EMAIL|CONTEXT|PRIORITIES|CHANNEL_)';
