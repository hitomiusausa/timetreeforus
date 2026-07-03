CREATE TABLE "event_title_presets" (
    "id" TEXT NOT NULL,
    "family_space_id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "sort_order" INTEGER NOT NULL DEFAULT 0,
    "created_by" TEXT NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "event_title_presets_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "event_title_presets_family_space_id_name_key" ON "event_title_presets"("family_space_id", "name");
CREATE INDEX "event_title_presets_family_space_id_sort_order_idx" ON "event_title_presets"("family_space_id", "sort_order");

ALTER TABLE "event_title_presets"
ADD CONSTRAINT "event_title_presets_family_space_id_fkey"
FOREIGN KEY ("family_space_id") REFERENCES "family_spaces"("id") ON DELETE CASCADE ON UPDATE CASCADE;
