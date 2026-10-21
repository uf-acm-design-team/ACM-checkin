import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { createClerkSupabaseClient } from "@/app/utils/supabase/server";


const supabase = createClerkSupabaseClient();;

describe('Supabase Analytics RPC Integration Tests', () => {
  const testOrgId = '11111111-1111-1111-1111-111111111111';
  const testMeetingId = '22222222-2222-2222-2222-222222222222';

  beforeAll(async () => {
    // Insert a mock organization (adjust table name if your org table differs)
    await supabase.from('organizations').upsert({
      id: testOrgId,
      name: 'Test Organization',
    });

    // Insert a mock meeting within the test date range
    await supabase.from('meetings').upsert({
      id: testMeetingId,
      org_id: testOrgId,
      title: 'Integration Test Meeting',
      start_time: '2026-10-15T12:00:00Z',
    });

    // Insert mock attendance: 2 members and 1 guest
    await supabase.from('attendance').insert([
      { meeting_id: testMeetingId, attendee_id: '33333333-3333-3333-3333-333333333333', source: 'member' },
      { meeting_id: testMeetingId, attendee_id: '44444444-4444-4444-4444-444444444444', source: 'member' },
      { meeting_id: testMeetingId, attendee_id: null, source: 'guest' },
    ]);
  });

  afterAll(async () => {
    // Cleanup test data
    await supabase.from('attendance').delete().eq('meeting_id', testMeetingId);
    await supabase.from('meetings').delete().eq('id', testMeetingId);
    await supabase.from('organizations').delete().eq('id', testOrgId);
  });

  it('executes get_org_attendance_by_meeting and returns correct counts', async () => {
    const { data, error } = await supabase.rpc('get_org_attendance_by_meeting', {
      p_org_id: testOrgId,
      p_start_time: '2026-10-01T00:00:00Z',
      p_end_time: '2026-10-31T23:59:59Z',
    });

    expect(error).toBeNull();
    expect(data).toBeDefined();
    expect(data.length).toBeGreaterThan(0);

    const meetingResult = data.find((m: { meeting_id: string; }) => m.meeting_id === testMeetingId);
    expect(meetingResult).toMatchObject({
      title: 'Integration Test Meeting',
      total: 3,
      members: 2,
      guests: 1,
    });
  });

  it('executes get_org_retention_by_meeting and returns correct metrics', async () => {
    const { data, error } = await supabase.rpc('get_org_retention_by_meeting', {
      p_org_id: testOrgId,
      p_start_time: '2026-10-01T00:00:00Z',
      p_end_time: '2026-10-31T23:59:59Z',
    });

    expect(error).toBeNull();
    expect(data).toBeDefined();
    expect(data.length).toBeGreaterThan(0);

    const meetingResult = data.find((m: { meeting_id: string; }) => m.meeting_id === testMeetingId);
    expect(meetingResult).toMatchObject({
      meeting_title: 'Integration Test Meeting',
      total: 3,
      first_time: 3,
      returning : 0
    });
  });
});