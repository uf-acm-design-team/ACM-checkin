"use client";

import React, { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "../../utils/supabase/client";

interface Organization {
  id: string;
  name: string;
  slug: string;
}

export default function page({
  params,
}: {
  params: Promise<{ orgSlug: string }>;
}) {
  const { orgSlug } = React.use(params);
  const [user, setUser] = useState<any>(null);
  const [organization, setOrganization] = useState<Organization | null>(null);
  const [meeting, setMeeting] = useState<any>(null);
  const [attendance, setAttendance] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
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
        // To do: allow user to choose 2 options:
        //1 check in with just an email
        //2 log in/sign up
        // router.push("/");
      }
    };

    getUser();
  }, [supabase.auth, router]);

  useEffect(() => {
    const fetchOrganization = async () => {
      try {
        console.log(orgSlug); // prints passed in slug
        const { data, error } = await supabase
          .from("organizations")
          .select("id, name, slug")
          .eq("slug", orgSlug)
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
  }, [orgSlug, supabase]);

  useEffect(() => {
    const checkMeeting = async () => {
      if (!organization) return;

      try {
        const { data, error } = await supabase
          .from("meetings")
          .select("id, org_id, title, status")
          .eq("org_id", organization.id)
          .order("start_time", { ascending: false })
          .limit(1)
          .single(); // remove in the future?

        if (error) {
          console.error("Error fetching meeting:", error);
        } else {
          // const now = new Date();
          // const startTime = new Date(data.start_time);
          // const endTime = new Date(data.end_time);

          if (!data.status) {
            setError("No active meeting for this club at the moment.");
          } else {
            setMeeting(data);
          }
        }
      } catch (err) {
        console.error("Unexpected error fetching meeting:", err);
      }
    };

    checkMeeting();
  }, [organization, supabase]);

  useEffect(() => {
    const getAttendance = async () => {
      if (!meeting || !user) return;

      try {
        const { data, error } = await supabase
          .from("attendance")
          .select("*")
          .eq("meeting_id", meeting.id)
          .eq("user_id", user.id)
          .single();
      } catch (error) {
        console.error("Error fetching attendance:", error);
      }
    };

    getAttendance();
  }, [meeting, user, supabase]);

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
        <p className="text-white text-center">
          Current Event: {meeting ? meeting.title : "No active meeting"}
        </p>
      </div>
    </div>
  );
}
