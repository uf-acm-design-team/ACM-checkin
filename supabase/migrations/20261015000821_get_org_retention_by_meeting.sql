create or replace function get_org_retention_by_meeting(
    p_org_id uuid,
    p_start_time timestamptz,
    p_end_time timestamptz
)
returns table (
    meeting_title text,
    meeting_start_time timestamptz,
    meeting_id text,
    first_time bigint,
    "returning" bigint,
    total bigint
)
language plpgsql
security invoker
set search_path = public
as $$
begin
    if not public.is_org_officer(p_org_id) then
        raise exception 'Unauthorized';
    end if;

    return query
    with range_meetings as (
        select id as meeting_id, title as meeting_title, start_time
        from meetings
        where org_id = p_org_id
          and start_time >= p_start_time
          and start_time <= p_end_time
    ),
    all_org_attendance as (
        select 
            a.meeting_id,
            a.attendee_id,
            m.start_time,
            row_number() over (partition by a.attendee_id order by m.start_time asc) as visit_seq
        from attendance a
        join meetings as m on m.id = a.meeting_id
        where m.org_id = p_org_id
    )
    select
        rm.meeting_title as meeting_title,
        rm.start_time as meeting_start_time,
        rm.meeting_id as meeting_id,
        count(*) filter (where aao.visit_seq = 1) as first_time,
        count(*) filter (where aao.visit_seq > 1) as "returning",
        count(aao.attendee_id) as total
    from range_meetings as rm
    left join all_org_attendance as aao on aao.meeting_id = rm.meeting_id
    group by rm.meeting_id
    order by rm.start_time;
end;
$$;