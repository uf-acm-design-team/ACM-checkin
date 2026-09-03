-- Deleting a meeting takes its attendance rows with it.
--
-- attendance_meeting_id_fkey (20260518000000_remote_baseline.sql) was created
-- with no referential action, so it defaulted to NO ACTION: any meeting that
-- had ever been checked into could not be deleted at all. The admin dashboard
-- pre-empted the resulting 23503 with its own guard and told officers to close
-- the meeting instead -- which is right for a real meeting, but left test and
-- mistake meetings permanently on the dashboard with no in-app way to remove
-- them, and no way to remove them at all short of database access.
--
-- ON DELETE CASCADE rather than a delete policy on attendance: a referential
-- action is performed by the system as part of the parent delete, so it needs
-- neither a DELETE grant nor an RLS policy on attendance. Granting
-- `authenticated` a direct DELETE on attendance would be a much wider opening
-- -- it would let a caller remove individual check-in rows, which nothing in
-- the product should be able to do -- so the narrow mechanism is the correct
-- one. Who may delete a meeting is still decided entirely by
-- meetings_officer_delete.
--
-- The destructive edge is deliberately left to the UI: the admin dashboard now
-- states the check-in count in its confirm dialog before calling delete.
-- audit_meeting_delete still fires, so a cascading delete is recorded in
-- audit_log with the meeting's title exactly as any other deletion is.

ALTER TABLE "public"."attendance"
    DROP CONSTRAINT IF EXISTS "attendance_meeting_id_fkey";

ALTER TABLE "public"."attendance"
    ADD CONSTRAINT "attendance_meeting_id_fkey"
    FOREIGN KEY ("meeting_id")
    REFERENCES "public"."meetings"("id")
    ON DELETE CASCADE;
