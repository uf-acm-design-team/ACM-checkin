import { describe, it, expect, vi, beforeEach } from 'vitest';

const rpc = vi.fn();

vi.mock('@/app/utils/supabase/server', () => ({
  createClerkSupabaseClient: vi.fn(() => ({ rpc })),
}));

import { getOrgAttendance, getOrgRetention } from './analytics-data';

describe('getOrgAttendance', () => {
  beforeEach(() => rpc.mockReset());

  it('calls the RPC with the right params and returns data', async () => {
    const rows = [
      {
        meeting_id: 'm1',
        title: 'Weekly',
        start_time: '2026-10-01T18:00:00Z',
        total: 10,
        members: 8,
        guests: 2,
      },
    ];
    rpc.mockResolvedValue({ data: rows, error: null });

    const result = await getOrgAttendance('org_1', '2026-10-01', '2026-10-31');

    expect(rpc).toHaveBeenCalledWith('get_org_attendance_by_meeting', {
      p_org_id: 'org_1',
      p_start_time: '2026-10-01',
      p_end_time: '2026-10-31',
    });
    expect(result).toEqual(rows);
  });

  it('returns [] when data is null', async () => {
    rpc.mockResolvedValue({ data: null, error: null });
    expect(await getOrgAttendance('org_1', 'a', 'b')).toEqual([]);
  });

  it('throws when the RPC errors', async () => {
    rpc.mockResolvedValue({ data: null, error: { message: 'boom' } });
    await expect(getOrgAttendance('org_1', 'a', 'b')).rejects.toThrow(
      'Failed to fetch retention data: boom'
    );
  });
});

describe('getOrgRetention', () => {
  beforeEach(() => rpc.mockReset());

  it('calls the retention RPC and returns data', async () => {
    const rows = [
      {
        meeting_id: 'm1',
        meeting_title: 'Weekly',
        meeting_start_time: '2026-10-01T18:00:00Z',
        first_time: 3,
        returning: 7,
        total: 10,
      },
    ];
    rpc.mockResolvedValue({ data: rows, error: null });

    const result = await getOrgRetention('org_1', 'a', 'b');

    expect(rpc).toHaveBeenCalledWith('get_org_retention_by_meeting', {
      p_org_id: 'org_1',
      p_start_time: 'a',
      p_end_time: 'b',
    });
    expect(result).toEqual(rows);
  });

  it('throws when the RPC errors', async () => {
    rpc.mockResolvedValue({ data: null, error: { message: 'boom' } });
    await expect(getOrgRetention('org_1', 'a', 'b')).rejects.toThrow('boom');
  });
});