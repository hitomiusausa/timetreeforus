-- Archiving replaces destructive calendar deletion. Existing calendars remain active.
ALTER TABLE "family_spaces"
ADD COLUMN "archived_at" TIMESTAMP(3);

CREATE INDEX "family_spaces_archived_at_idx"
ON "family_spaces"("archived_at");
