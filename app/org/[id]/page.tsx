'use client'

import React, { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "../../utils/supabase/client";
import { routerServerGlobal } from "next/dist/server/lib/router-utils/router-server-context";

export default function page() {
  const [user, setUser] = useState<any>(null);
  const supabase = createClient();
  const router = useRouter();


  useEffect(() => {
      const getUser = async () => {
        const {
          data: { user },
        } = await supabase.auth.getUser();
        setUser(user);
        if (!user) {
          console.log("not a user");
          router.push("/");
        }
      };
  
      getUser();
    }, [supabase.auth, router]);
  return <div>diddy</div>;
}
