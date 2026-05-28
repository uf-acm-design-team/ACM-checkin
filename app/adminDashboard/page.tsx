"use client"

import {useState} from 'react'
import { useUser } from "@clerk/nextjs";
import { createClient } from "../utils/supabase/client";

//TODO: Create Club Form(s) For A/Each Club that will be able to add the name and slug to the DB (must verify attendee (the user) is an admin)

// Form(Name, slug);
export default function AdminDashboard() {
  // receives user from clerk
  const { user } = useUser();

  // holds the Name and slug for the Form -> Form(name, slug) stored as objects in UseState
  const [orgData, setOrgData] = useState({
    name: "", 
    slug: "",
  });
  
  // supabase client feature initialized
  const supabase = createClient();

  const handleChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    setOrgData({ ...orgData, [e.target.name]: e.target.value });
  };
  
  const insertFormData = async (e: React.FormEvent<HTMLFormElement>) =>{
    e.preventDefault(); // stops page refresh when submitting

    if (!user) return; // prevents access if user not loaded
    
    try {
      // inspo from dashboard.tsx
          const { data: admin, error: adminError } = await supabase
            // grabs admin attendees from attendees table
            .from("attendees")
            .select("admin") // selects admins from supabase
            .eq("user_id", user.id)
            .maybeSingle(); // expects user but wont crash if nothing found

          
            // COMMENT OUT TO TEST UNTIL WE CAN ASSIGN ADMIN TO SPECIFIC ATTENDEES ON DB!
          if (adminError || !admin?.admin){
            console.error("Not authorized");
            return;
          }
          
          const { error: orgInsertError } = await supabase
            .from("organizations")
            .insert({
              name: orgData.name,
              slug: orgData.slug,
            });

          if(orgInsertError){
            console.error("Error creating organization:", orgInsertError);
          } else {
            console.log("Organization created");
          }
        
    } catch (err) {
      console.error("Error verifying admin:", err);
    }
  };
  
  return (
    <div>
      <h1>Admin Dashboard</h1>
      <form onSubmit={insertFormData}>
        <input
          type="text"
          name="name"
          value={orgData.name}
          onChange={handleChange} // responds to any change such as keystroke made on app
          placeholder="Organization Name"
        />
        
        <input
          type="text"
          name="slug"
          value={orgData.slug}
          onChange={handleChange}
          placeholder="Slug"
        />
        <button type="submit">Create Organization</button>
      </form>
    </div>
    );
};