import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type",
};

const UFL_EMAIL_REGEX = /^[^\s@]+@ufl\.edu$/;
const NAME_REGEX = /^[a-zA-Z\s\-']+$/;

interface SignupRequest {
  email: string;
  password: string;
  firstName: string;
  lastName: string;
}

serve(async (req) => {
  // Handle CORS preflight requests
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  try {
    const { email, password, firstName, lastName }: SignupRequest =
      await req.json();

    // Validate email format
    if (!email || !UFL_EMAIL_REGEX.test(email)) {
      return new Response(
        JSON.stringify({
          error: "Invalid email. Must be a valid @ufl.edu email address.",
        }),
        {
          status: 400,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        }
      );
    }

    // Validate password
    if (!password || password.length < 6) {
      return new Response(
        JSON.stringify({
          error: "Password must be at least 6 characters long.",
        }),
        {
          status: 400,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        }
      );
    }

    if (!firstName || !firstName.trim()) {
      return new Response(
        JSON.stringify({ error: "First name is required." }),
        {
          status: 400,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        }
      );
    }

    if (!NAME_REGEX.test(firstName)) {
      return new Response(
        JSON.stringify({
          error:
            "First name can only contain letters, spaces, hyphens, and apostrophes.",
        }),
        {
          status: 400,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        }
      );
    }

    if (!lastName || !lastName.trim()) {
      return new Response(JSON.stringify({ error: "Last name is required." }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    if (!NAME_REGEX.test(lastName)) {
      return new Response(
        JSON.stringify({
          error:
            "Last name can only contain letters, spaces, hyphens, and apostrophes.",
        }),
        {
          status: 400,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        }
      );
    }

    const capitalizeWords = (str: string) => {
      return str
        .trim()
        .split(/\s+/)
        .map(
          (word) => word.charAt(0).toUpperCase() + word.slice(1).toLowerCase()
        )
        .join(" ");
    };

    const formattedFirstName = capitalizeWords(firstName);
    const formattedLastName = capitalizeWords(lastName);
    const fullName = `${formattedFirstName} ${formattedLastName}`;

    // create Supabase client with service role for admin operations
    const supabaseAdmin = createClient(
      Deno.env.get("SUPABASE_URL") ?? "",
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "",
      {
        auth: {
          autoRefreshToken: false,
          persistSession: false,
        },
      }
    );

    const { data, error } = await supabaseAdmin.auth.admin.createUser({
      email,
      password,
      email_confirm: false, // Require email confirmation
      user_metadata: {
        full_name: fullName,
        first_name: formattedFirstName,
        last_name: formattedLastName,
      },
    });

    if (error) {
      return new Response(JSON.stringify({ error: error.message }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // send OTP email for verification
    const { error: otpError } = await supabaseAdmin.auth.admin.generateLink({
      type: "signup",
      email,
    });

    if (otpError) {
      console.error("OTP generation error:", otpError);
      // don't fail the signup if OTP fails, user can resend
    }

    return new Response(
      JSON.stringify({
        success: true,
        message: "User created successfully. Please verify your email.",
        user: {
          id: data.user.id,
          email: data.user.email,
        },
      }),
      {
        status: 200,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      }
    );
  } catch (error) {
    console.error("Error:", error);
    return new Response(
      JSON.stringify({ error: "An unexpected error occurred." }),
      {
        status: 500,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      }
    );
  }
});
