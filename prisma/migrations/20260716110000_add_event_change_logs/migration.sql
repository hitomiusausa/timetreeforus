CREATE TABLE "event_change_logs" (
    "id" TEXT NOT NULL,
    "family_space_id" TEXT NOT NULL,
    "event_id" TEXT,
    "user_id" TEXT NOT NULL,
    "action" TEXT NOT NULL,
    "event_title" TEXT NOT NULL,
    "scope" TEXT NOT NULL DEFAULT 'occurrence',
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "event_change_logs_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "event_change_logs_family_space_id_created_at_idx"
ON "event_change_logs"("family_space_id", "created_at");

ALTER TABLE "event_change_logs"
ADD CONSTRAINT "event_change_logs_family_space_id_fkey"
FOREIGN KEY ("family_space_id") REFERENCES "family_spaces"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "event_change_logs"
ADD CONSTRAINT "event_change_logs_event_id_fkey"
FOREIGN KEY ("event_id") REFERENCES "events"("id") ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "event_change_logs"
ADD CONSTRAINT "event_change_logs_user_id_fkey"
FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;
