import { createClient } from "npm:@supabase/supabase-js@2.57.4";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET, POST, PUT, DELETE, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type, Authorization, X-Client-Info, Apikey",
};

interface ImportMember {
  full_name: string;
  phone_number: string;
  email?: string;
}

const DEFAULT_PASSWORD = "Member2026";

/** Normalize Kenyan phone numbers to +254XXXXXXXXX format */
function normalizeKenyanPhone(raw: string): string | null {
  if (!raw) return null;
  let digits = raw.replace(/[^\d+]/g, "");
  if (digits.startsWith("+254")) digits = digits.slice(1);
  else if (digits.startsWith("254")) {
    // keep as is
  } else if (digits.startsWith("07")) digits = "254" + digits.slice(1);
  else if (digits.startsWith("01")) digits = "254" + digits.slice(1);
  else if (digits.startsWith("7")) digits = "254" + digits;
  else if (digits.startsWith("1")) digits = "254" + digits;
  else return null;
  if (digits.length === 12 && digits.startsWith("254")) return "+" + digits;
  return null;
}

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { status: 200, headers: corsHeaders });
  }

  if (req.method !== "POST") {
    return new Response(
      JSON.stringify({ error: "Method not allowed" }),
      { status: 405, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }

  try {
    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

    const adminClient = createClient(supabaseUrl, serviceRoleKey, {
      auth: { persistSession: false, autoRefreshToken: false },
    });

    // Verify caller is admin
    const authHeader = req.headers.get("Authorization") || "";
    const userToken = authHeader.replace("Bearer ", "").trim();

    const userClient = createClient(supabaseUrl, Deno.env.get("SUPABASE_ANON_KEY")!, {
      auth: { persistSession: false, autoRefreshToken: false },
      global: { headers: { Authorization: `Bearer ${userToken}` } },
    });

    const { data: { user }, error: userErr } = await userClient.auth.getUser();
    if (userErr || !user) {
      return new Response(
        JSON.stringify({ error: "Unauthorized" }),
        { status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const { data: adminMember } = await adminClient.from("members")
      .select("role")
      .eq("user_id", user.id)
      .maybeSingle();

    if (!adminMember || !["super_admin", "treasurer"].includes(adminMember.role)) {
      return new Response(
        JSON.stringify({ error: "Forbidden: admin access required" }),
        { status: 403, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const { members }: { members: ImportMember[] } = await req.json();

    if (!Array.isArray(members) || members.length === 0) {
      return new Response(
        JSON.stringify({ error: "Members array is required" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const results: {
      created: number;
      skipped: number;
      failed: number;
      duplicates: number;
      errors: { row: number; name: string; phone: string; error: string }[];
    } = { created: 0, skipped: 0, failed: 0, duplicates: 0, errors: [] };

    // Get existing phone numbers for dedup
    const phoneNumbers = members.map(m => normalizeKenyanPhone(m.phone_number)).filter(Boolean) as string[];
    const { data: existingMembers } = await adminClient.from("members")
      .select("phone_number")
      .in("phone_number", phoneNumbers);

    const existingPhones = new Set((existingMembers || []).map(m => m.phone_number));

    for (let i = 0; i < members.length; i++) {
      const m = members[i];
      const normalizedPhone = normalizeKenyanPhone(m.phone_number);

      if (!normalizedPhone) {
        results.failed++;
        results.errors.push({ row: i + 1, name: m.full_name || "", phone: m.phone_number, error: "Invalid Kenyan phone number" });
        continue;
      }

      if (!m.full_name || m.full_name.trim().length < 2) {
        results.failed++;
        results.errors.push({ row: i + 1, name: m.full_name || "", phone: m.phone_number, error: "Missing or invalid name" });
        continue;
      }

      if (existingPhones.has(normalizedPhone)) {
        results.duplicates++;
        results.errors.push({ row: i + 1, name: m.full_name, phone: m.phone_number, error: "Duplicate phone number (already registered)" });
        continue;
      }

      // Create auth user with phone as email (so Supabase auth works)
      // Use phone_number@church.local as the email since Supabase auth requires email
      const fakeEmail = normalizedPhone.replace("+", "") + "@church.local";

      const { data: authData, error: authError } = await adminClient.auth.admin.createUser({
        email: fakeEmail,
        password: DEFAULT_PASSWORD,
        email_confirm: true,
        user_metadata: { full_name: m.full_name, phone_number: normalizedPhone },
      });

      if (authError) {
        results.failed++;
        results.errors.push({ row: i + 1, name: m.full_name, phone: m.phone_number, error: authError.message });
        continue;
      }

      // Insert member record
      const { error: memberError } = await adminClient.from("members").insert({
        user_id: authData.user.id,
        full_name: m.full_name.trim(),
        phone_number: normalizedPhone,
        email: m.email || null,
        role: "member",
        password_changed: false,
        is_active: true,
      });

      if (memberError) {
        results.failed++;
        results.errors.push({ row: i + 1, name: m.full_name, phone: m.phone_number, error: memberError.message });
        continue;
      }

      existingPhones.add(normalizedPhone);
      results.created++;
    }

    // Log audit
    await adminClient.from("audit_logs").insert({
      actor_id: user.id,
      actor_name: user.email,
      action: "member_import",
      entity_type: "members",
      details: `Imported ${results.created} members, ${results.duplicates} duplicates, ${results.failed} failed`,
      after_values: results,
    });

    return new Response(
      JSON.stringify({ success: true, results }),
      { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  } catch (err) {
    return new Response(
      JSON.stringify({ error: err.message }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
