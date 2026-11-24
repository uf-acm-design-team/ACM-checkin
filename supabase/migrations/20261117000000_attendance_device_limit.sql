-- Web check-in supplies a server-signed browser identity from an HttpOnly
-- cookie. Both member and guest actions write it with the attendance row,
-- so failed forms/profile lookups do not consume a device's check-in.
ALTER TABLE public.attendance ADD COLUMN device_id uuid;

-- NULL preserves historical attendance and existing native/officer callers.
-- A meeting is the scope: the same device can attend future meetings.
CREATE UNIQUE INDEX attendance_meeting_device_key
    ON public.attendance (meeting_id, device_id)
    WHERE device_id IS NOT NULL;

COMMENT ON COLUMN public.attendance.device_id IS
    'Opaque browser identity for web check-in; one attendee per device per meeting.';

NOTIFY pgrst, 'reload schema';
