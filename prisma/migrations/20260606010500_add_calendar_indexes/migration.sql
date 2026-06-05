-- CreateIndex
CREATE INDEX "sessions_user_id_idx" ON "sessions"("user_id");

-- CreateIndex
CREATE INDEX "family_members_user_id_created_at_idx" ON "family_members"("user_id", "created_at");

-- CreateIndex
CREATE INDEX "event_categories_family_space_id_sort_order_idx" ON "event_categories"("family_space_id", "sort_order");

-- CreateIndex
CREATE INDEX "events_family_space_id_deleted_at_starts_at_idx" ON "events"("family_space_id", "deleted_at", "starts_at");
