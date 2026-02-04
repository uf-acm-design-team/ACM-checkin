"use client";

import React, { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "../../../utils/supabase/client";

interface Organization {
  id: string;
  name: string;
  slug: string;
}

interface Meeting {
  id: string;
  org_id: string;
  title: string;
  start_time: string;
  end_time: string;
  status: string;
  created_at: string;
  created_by: string;
}

export default function page({ params }: { params: Promise<{ id: string }> }) {
  const { id } = React.use(params);
  const [user, setUser] = useState<any>(null);
  const [organization, setOrganization] = useState<Organization | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [meetings, setMeetings] = useState<Meeting[]>([]);
  const [meetingsLoading, setMeetingsLoading] = useState(true);
  const router = useRouter();
  const supabase = createClient();

  useEffect(() => {
    const getUser = async () => {
      const {
        data: { user },
      } = await supabase.auth.getUser();
      setUser(user);
      if (!user) {
        console.log("not a user");
        // router.push("/");
      }
    };

    getUser();
  }, [supabase.auth, router]);

  useEffect(() => {
    const fetchOrganization = async () => {
      try {
        console.log(id);
        const { data, error } = await supabase
          .from("organizations")
          .select("id, name, slug")
          .eq("slug", id)
          .single();

        if (error) {
          console.error("Error fetching organization:", error);
          setError("Club does not exist");
        } else {
          setOrganization(data);
        }
      } catch (err) {
        console.error("Unexpected error:", err);
        setError("Club does not exist");
      } finally {
        setLoading(false);
      }
    };

    fetchOrganization();
  }, [id, supabase]);

  useEffect(() => {
    const fetchMeetings = async () => {
      if (!organization) return;

      try {
        const { data, error } = await supabase
        .from("meetings")
        .select("id, org_id, title, start_time, end_time, status, created_at, created_by")
        .eq("org_id", organization.id)
        .eq("status", "active")
        .order("start_time", { ascending: true});
        
        if (error) {
        console.error("Error fetching meetings:", error);
        } else {
          setMeetings(data || []);
        }
      } catch (err) {
        console.error("Error", err);
      } finally {
      setMeetingsLoading(false);
      }
    };

  fetchMeetings();
}, [organization, supabase]);

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-screen">
        <div className="text-white text-xl">Loading...</div>
      </div>
    );
  }

  if (error || !organization) {
    return (
      <div className="flex flex-col items-center justify-center min-h-screen p-4">
        <div className="text-center mb-8">
          <h1 className="text-5xl font-bold text-white mb-2">Club Check-In</h1>
          <p className="text-white/90 text-lg">Powered by ACM</p>
        </div>
        <div className="bg-white/10 backdrop-blur-md rounded-2xl shadow-2xl p-8 w-full max-w-2xl border border-white/20">
          <p className="text-white text-center text-xl">{error}</p>
        </div>
      </div>
    );
  }

  return (
  <div className="flex flex-col items-center justify-center min-h-screen p-4">
    <div className="text-center mb-8">
      <h1 className="text-5xl font-bold text-white mb-2">
        {organization.name} Check-In
      </h1>
      <p className="text-white/90 text-lg">Powered by ACM</p>
    </div>
    
    <div className="bg-white/10 backdrop-blur-md rounded-2xl shadow-2xl p-8 w-full max-w-2xl border border-white/20">
      <h3 className="text-xl font-semibold text-white mb-4">
        Active Meetings
      </h3>
      
      {meetingsLoading ? (
        <p className="text-white/70">Loading meetings...</p>
      ) : meetings.length > 0 ? (
        <div className="space-y-3">
          {meetings.map((meeting) => (
            <div
              key={meeting.id}
              className="bg-white/10 rounded-lg p-4 border border-white/20 hover:bg-white/20 transition-all cursor-pointer"
            >
              <h4 className="text-lg font-semibold text-white mb-2">
                {meeting.title}
              </h4>
              <div className="text-white/70 text-sm space-y-1">
                <p>Start: {new Date(meeting.start_time).toLocaleString()}</p>
                <p>End: {new Date(meeting.end_time).toLocaleString()}</p>
              </div>
            </div>
          ))}
        </div>
      ) : (
        <p className="text-white/70">No active meetings at this time.</p>
      )}
    </div>
  </div>
);
}
