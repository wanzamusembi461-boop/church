import { createClient } from "npm:@supabase/supabase-js@2.57.4";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type, Authorization, X-Client-Info, Apikey",
};

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { status: 200, headers: corsHeaders });
  }

  if (req.method !== "POST") {
    return new Response(JSON.stringify({ error: "Method not allowed" }), {
      status: 405,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }

  try {
    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const adminClient = createClient(supabaseUrl, serviceRoleKey, {
      auth: { persistSession: false, autoRefreshToken: false },
    });

    // Find the super_admin member
    const { data: members, error: memberErr } = await adminClient
      .from("members")
      .select("user_id, full_name, phone_number, email")
      .eq("role", "super_admin")
      .limit(1);

    if (memberErr || !members || members.length === 0) {
      return new Response(JSON.stringify({ error: "No super_admin found" }), {
        status: 404,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const admin = members[0];

    // Set a new temporary password
    const newPassword = "R3set!Church_2026#Secure";
    const { error: updateErr } = await adminClient.auth.admin.updateUserById(
      admin.user_id,
      { password: newPassword }
    );

    if (updateErr) {
      return new Response(JSON.stringify({ error: updateErr.message }), {
        status: 500,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Mark password_changed false so they are prompted to change it
    await adminClient
      .from("members")
      .update({ password_changed: false })
      .eq("user_id", admin.user_id);

    // Derive the login email (normalized phone + @church.local)
    let normalized = admin.phone_number.replace(/[^\d+]/g, "");
    if (normalized.startsWith("+254")) normalized = normalized.slice(1);
    const loginEmail = normalized + "@church.local";

    return new Response(
      JSON.stringify({
        success: true,
        message: "Admin password has been reset.",
        login: loginEmail,
        temporary_password: newPassword,
        note: "Please sign in and change your password immediately.",
      }),
      { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  } catch (err) {
    return new Response(JSON.stringify({ error: err.message }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
