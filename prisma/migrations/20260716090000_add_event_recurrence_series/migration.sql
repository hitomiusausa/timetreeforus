-- Nullable fields keep every existing event unchanged while allowing new
-- recurring occurrences to be managed as one series.
ALTER TABLE "events"
ADD COLUMN "recurrence_series_id" TEXT,
ADD COLUMN "recurrence_rule" TEXT;

-- Older repeated/copy batches have the same transaction timestamp. Attach
-- metadata only; no existing event content or deletion state is changed.
WITH "legacy_series" AS (
  SELECT
    "family_space_id",
    "created_by",
    "created_at",
    COUNT(*) AS "occurrence_count",
    MIN("starts_at"::date) AS "first_date",
    MAX("starts_at"::date) AS "last_date",
    'legacy:' || MD5(
      "family_space_id" || '|' || "created_by" || '|' || "created_at"::text
    ) AS "series_id"
  FROM "events"
  GROUP BY "family_space_id", "created_by", "created_at"
  HAVING COUNT(*) > 1
)
UPDATE "events" AS "event"
SET
  "recurrence_series_id" = "series"."series_id",
  "recurrence_rule" = CASE
    WHEN "series"."last_date" - "series"."first_date" = "series"."occurrence_count" - 1 THEN 'daily'
    WHEN "series"."last_date" - "series"."first_date" = ("series"."occurrence_count" - 1) * 7 THEN 'weekly'
    ELSE 'legacy'
  END
FROM "legacy_series" AS "series"
WHERE "event"."family_space_id" = "series"."family_space_id"
  AND "event"."created_by" = "series"."created_by"
  AND "event"."created_at" = "series"."created_at";

CREATE INDEX "events_family_space_id_recurrence_series_id_deleted_at_idx"
ON "events"("family_space_id", "recurrence_series_id", "deleted_at");
