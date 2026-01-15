"use client";

import React, { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "../../../utils/supabase/client";

interface Organization {
  id: string;
  name: string;
  slug: string;
}

export default function page({ params }: { params: Promise<{ id: string }> }) {
  const { id } = React.use(params);
  const [user, setUser] = useState<any>(null);
  const [organization, setOrganization] = useState<Organization | null>(null);
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
        <p className="text-white text-center">Check-in functionality coming soon...</p>
      </div>
    </div>
  );
}
