import { createClient } from "npm:@supabase/supabase-js@2.57.4";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET, POST, PUT, DELETE, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type, Authorization, X-Client-Info, Apikey",
};

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { status: 200, headers: corsHeaders });
  }

  if (req.method !== "POST") {
    return new Response(JSON.stringify({ error: "Method not allowed" }), {
      status: 405, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }

  try {
    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const adminClient = createClient(supabaseUrl, serviceRoleKey, {
      auth: { persistSession: false, autoRefreshToken: false },
    });

    // Check if any super_admin already exists
    const { data: existingAdmins } = await adminClient.from("members")
      .select("id")
      .eq("role", "super_admin")
      .limit(1);

    if (existingAdmins && existingAdmins.length > 0) {
      return new Response(JSON.stringify({ error: "Setup already completed. An admin account exists." }), {
        status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const body = await req.json();
    const { full_name, phone_number, password, church_name, church_address, church_phone, church_email, sms_api_key } = body;

    if (!full_name || !phone_number || !password) {
      return new Response(JSON.stringify({ error: "full_name, phone_number, and password are required" }), {
        status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Normalize phone
    let normalized = phone_number.replace(/[^\d+]/g, "");
    if (normalized.startsWith("+254")) normalized = normalized.slice(1);
    else if (normalized.startsWith("07")) normalized = "254" + normalized.slice(1);
    else if (normalized.startsWith("01")) normalized = "254" + normalized.slice(1);
    else if (normalized.startsWith("7")) normalized = "254" + normalized;
    else if (normalized.startsWith("1")) normalized = "254" + normalized;

    if (!normalized.startsWith("254") || normalized.length !== 12) {
      return new Response(JSON.stringify({ error: "Invalid Kenyan phone number" }), {
        status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const fullPhone = "+" + normalized;
    const adminEmail = normalized + "@church.local";

    // Create auth user with super_admin role in app_metadata
    const { data: authData, error: authError } = await adminClient.auth.admin.createUser({
      email: adminEmail,
      password,
      email_confirm: true,
      user_metadata: { full_name, phone_number: fullPhone },
      app_metadata: { role: "super_admin" },
    });

    if (authError) {
      return new Response(JSON.stringify({ error: authError.message }), {
        status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Insert member with super_admin role
    const { error: memberError } = await adminClient.from("members").insert({
      user_id: authData.user.id,
      full_name: full_name.trim(),
      phone_number: fullPhone,
      email: church_email || null,
      role: "super_admin",
      password_changed: false,
      is_active: true,
    });

    if (memberError) {
      return new Response(JSON.stringify({ error: "Failed to create member: " + memberError.message }), {
        status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Save church settings
    if (church_name) {
      await adminClient.from("church_settings").insert({
        church_name: church_name.trim(),
        address: church_address || null,
        phone: church_phone || null,
        email: church_email || null,
        setup_completed: true,
      });
    }

    // Save admin settings with SMS key
    const settingsInsert: Record<string, unknown> = {};
    if (sms_api_key) settingsInsert.sms_api_key_encrypted = sms_api_key;
    await adminClient.from("admin_settings").insert(settingsInsert);

    // Audit log
    await adminClient.from("audit_logs").insert({
      actor_id: authData.user.id,
      actor_name: adminEmail,
      action: "system_setup",
      entity_type: "system",
      details: "Initial system setup completed. Admin account created.",
    });

    return new Response(JSON.stringify({
      success: true,
      message: "Setup complete. You can now sign in with your phone number and password.",
      login_hint: { phone: fullPhone, email: adminEmail },
    }), {
      status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (err) {
    return new Response(JSON.stringify({ error: err.message }), {
      status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
