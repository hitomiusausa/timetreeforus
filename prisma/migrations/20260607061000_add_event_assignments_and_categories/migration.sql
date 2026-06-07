-- CreateTable
CREATE TABLE "event_assignments" (
    "id" TEXT NOT NULL,
    "event_id" TEXT NOT NULL,
    "user_id" TEXT NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "event_assignments_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "event_assignments_event_id_user_id_key" ON "event_assignments"("event_id", "user_id");

-- CreateIndex
CREATE INDEX "event_assignments_user_id_idx" ON "event_assignments"("user_id");

-- AddForeignKey
ALTER TABLE "event_assignments" ADD CONSTRAINT "event_assignments_event_id_fkey" FOREIGN KEY ("event_id") REFERENCES "events"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "event_assignments" ADD CONSTRAINT "event_assignments_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- Backfill legacy single assignees into the new assignment table.
INSERT INTO "event_assignments" ("id", "event_id", "user_id", "created_at")
SELECT md5(random()::text || clock_timestamp()::text), e."id", e."assigned_to", CURRENT_TIMESTAMP
FROM "events" e
WHERE e."assigned_to" IS NOT NULL
ON CONFLICT ("event_id", "user_id") DO NOTHING;

-- Add new default categories to existing calendars.
INSERT INTO "event_categories" ("id", "family_space_id", "name", "color", "sort_order")
SELECT md5(random()::text || clock_timestamp()::text), fs."id", '友達', '#52DE3F', 5
FROM "family_spaces" fs
WHERE NOT EXISTS (
    SELECT 1
    FROM "event_categories" c
    WHERE c."family_space_id" = fs."id"
      AND c."name" = '友達'
);

INSERT INTO "event_categories" ("id", "family_space_id", "name", "color", "sort_order")
SELECT md5(random()::text || clock_timestamp()::text), fs."id", '趣味仲間', '#96A0ED', 6
FROM "family_spaces" fs
WHERE NOT EXISTS (
    SELECT 1
    FROM "event_categories" c
    WHERE c."family_space_id" = fs."id"
      AND c."name" = '趣味仲間'
);
