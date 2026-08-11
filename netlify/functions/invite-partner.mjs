import { createClient } from "@supabase/supabase-js";

export default async (request) => {
  if (request.method !== "POST") {
    return new Response(
      JSON.stringify({ error: "Method not allowed" }),
      {
        status: 405,
        headers: { "Content-Type": "application/json" }
      }
    );
  }

  try {
    const { email, full_name } = await request.json();

    if (!email) {
      return new Response(
        JSON.stringify({ error: "Email address is required" }),
        {
          status: 400,
          headers: { "Content-Type": "application/json" }
        }
      );
    }

    const supabaseUrl = Netlify.env.get("SUPABASE_URL");
    const serviceRoleKey = Netlify.env.get("SUPABASE_SERVICE_ROLE_KEY");

    if (!supabaseUrl || !serviceRoleKey) {
      throw new Error("Supabase environment variables are missing");
    }

    const supabase = createClient(supabaseUrl, serviceRoleKey);

    const origin = new URL(request.url).origin;

    const { data, error } = await supabase.auth.admin.inviteUserByEmail(
      email,
      {
        data: {
          full_name: full_name || "",
          role: "partner"
        },
        redirectTo: `${origin}/set-password.html`
      }
    );

    if (error) {
      throw error;
    }

    return new Response(
      JSON.stringify({
        success: true,
        user: data.user
      }),
      {
        status: 200,
        headers: { "Content-Type": "application/json" }
      }
    );

  } catch (error) {
    console.error("Partner invitation failed:", error);

    return new Response(
      JSON.stringify({
        error: error.message || "Unable to invite partner"
      }),
      {
        status: 500,
        headers: { "Content-Type": "application/json" }
      }
    );
  }
};
