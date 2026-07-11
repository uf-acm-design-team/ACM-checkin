-- Add a nullable meeting summary officers can write. Surfaced in the member
-- stats view (meeting-list-item / details modal).
ALTER TABLE "public"."meetings"
    ADD COLUMN IF NOT EXISTS "description" "text";
