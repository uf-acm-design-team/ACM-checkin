import { describe, it, expect, vi } from 'vitest';
import { getOrgAttendance } from './analytics-data';
import { getOrgRetention } from './analytics-data';
import { createServiceSupabaseClient } from '@/app/utils/supabase/server';
import type { SupabaseClient } from '@supabase/supabase-js';

vi.mock('@/app/utils/supabase/server', () => ({
  createServiceSupabaseClient: vi.fn(),
}));

describe('getOrgAttendance', () => {
  it('fetches and returns attendance records successfully', async () => {
    const mockData = [
      {
        meeting_id: 'm1',
        meeting_title: 'General Meeting',
        meeting_start_time: '2026-10-01T12:00:00Z',
        total_attendees: 20,
        member_count: 15,
        guest_count: 5,
      },
    ];

    const mockRpc = vi.fn().mockResolvedValue({ data: mockData, error: null });
    vi.mocked(createServiceSupabaseClient).mockReturnValue({
      rpc: mockRpc,
    } as unknown as SupabaseClient);

    const result = await getOrgAttendance('org-123', '2026-10-01T00:00:00Z', '2026-10-31T23:59:59Z');

    expect(mockRpc).toHaveBeenCalledWith('get_org_attendance_by_meeting', {
      p_org_id: 'org-123',
      p_start_time: '2026-10-01T00:00:00Z',
      p_end_time: '2026-10-31T23:59:59Z',
    });
    expect(result).toEqual(mockData);
  });

  it('throws an error when Supabase returns an error', async () => {
    const mockRpc = vi.fn().mockResolvedValue({ data: null, error: { message: 'DB error' } });
    vi.mocked(createServiceSupabaseClient).mockReturnValue({
      rpc: mockRpc,
    } as unknown as SupabaseClient);

    await expect(
      getOrgAttendance('org-123', '2026-10-01T00:00:00Z', '2026-10-31T23:59:59Z')
    ).rejects.toThrow('Failed to fetch attendance data: DB error');
  });
});

describe('getOrgRetention', () => {
  it('fetches and returns retention records successfully', async () => {
    const mockData = [
      {
        meeting_id: 'm1',
        meeting_title: 'General Meeting',
        meeting_start_time: '2026-10-01T12:00:00Z',
        total: 20,
        first_time: 5,
        returning: 15,
      },
    ];

    const mockRpc = vi.fn().mockResolvedValue({ data: mockData, error: null });
    vi.mocked(createServiceSupabaseClient).mockReturnValue({
      rpc: mockRpc,
    } as unknown as SupabaseClient);

    const result = await getOrgRetention('org-123', '2026-10-01T00:00:00Z', '2026-10-31T23:59:59Z');

    expect(mockRpc).toHaveBeenCalledWith('get_org_retention_by_meeting', {
      p_org_id: 'org-123',
      p_start_time: '2026-10-01T00:00:00Z',
      p_end_time: '2026-10-31T23:59:59Z',
    });
    expect(result).toEqual(mockData);
  });

  it('throws an error when Supabase returns an error', async () => {
    const mockRpc = vi.fn().mockResolvedValue({ data: null, error: { message: 'DB error' } });
    vi.mocked(createServiceSupabaseClient).mockReturnValue({
      rpc: mockRpc,
    } as unknown as SupabaseClient);

    await expect(
      getOrgRetention('org-123', '2026-10-01T00:00:00Z', '2026-10-31T23:59:59Z')
    ).rejects.toThrow('Failed to fetch attendance data: DB error');
  });
});