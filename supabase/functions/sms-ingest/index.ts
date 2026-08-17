import { createClient } from "npm:@supabase/supabase-js@2.57.4";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET, POST, PUT, DELETE, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type, Authorization, X-Client-Info, Apikey",
};

interface SmsIngestPayload {
  sms_body: string;
  sender?: string;
  recipient?: string;
  device_id?: string;
  received_timestamp?: string;
  parsed_amount?: number;
  parsed_reference?: string;
}

interface ParsedSms {
  amount: number | null;
  reference: string | null;
  phone: string | null;
  name: string | null;
  date: string | null;
  provider: string | null;
}

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

/** Extract amount from M-Pesa / common Kenyan SMS formats */
function parseAmount(text: string): number | null {
  // Match "KES 1,500" / "Ksh 1,500.00" / "Amount: 1,500" / "Sent 2,500"
  const patterns = [
    /(?:KES|KSh|KSH|Ksh\.?|Sh\.?|Shillings)\s*\.?\s*([\d,]+\.?\d*)/i,
    /(?:Amount|Amt|Sent|Received|Paid|Deposit|Deposited)\s*\.?\s*of\s*\.?\s*([\d,]+\.?\d*)/i,
    /(?:Amount|Amt)\s*:?\s*([\d,]+\.?\d*)/i,
    /([\d,]+\.\d{2})\s*(?:has been|was|is)/i,
  ];
  for (const p of patterns) {
    const m = text.match(p);
    if (m && m[1]) {
      const val = parseFloat(m[1].replace(/,/g, ""));
      if (!isNaN(val) && val > 0) return val;
    }
  }
  // Fallback: any "KES" followed by number
  const kesMatch = text.match(/KES?\s*([\d,]+\.?\d*)/i);
  if (kesMatch) {
    const val = parseFloat(kesMatch[1].replace(/,/g, ""));
    if (!isNaN(val) && val > 0) return val;
  }
  return null;
}

/** Extract transaction reference (M-Pesa codes look like QI9XZ1L2) */
function parseReference(text: string): string | null {
  // M-Pesa transaction code: alphanumeric, usually 10 chars
  const patterns = [
    /(?:Reference|Ref|Transaction|Trans|Code|Confirmation)\s*\.?\s*:?\s*([A-Z0-9]{8,12})/i,
    /\b([A-Z]{2}\d{2}[A-Z0-9]{4,8})\b/,
    /\bTransaction\s*Code\s*([A-Z0-9]{8,12})/i,
    /Transaction\s*ID\s*[:\s]+([A-Z0-9]{6,15})/i,
  ];
  for (const p of patterns) {
    const m = text.match(p);
    if (m && m[1]) return m[1].toUpperCase();
  }
  return null;
}

/** Extract phone number from SMS body */
function parsePhone(text: string): string | null {
  const patterns = [
    /(?:from|sender|phone|number|account)\s*\.?\s*:?\s*(\+?\d{10,13})/i,
    /(\+254\d{9})/,
    /(254\d{9})/,
    /(0[17]\d{8})/,
  ];
  for (const p of patterns) {
    const m = text.match(p);
    if (m && m[1]) {
      const normalized = normalizeKenyanPhone(m[1]);
      if (normalized) return normalized;
    }
  }
  return null;
}

/** Extract member name */
function parseName(text: string): string | null {
  const patterns = [
    /(?:from|sender|name|customer)\s*\.?\s*:?\s*([A-Za-z][A-Za-z\s\.]{2,40})/i,
    /Name\s*\.?\s*:?\s*([A-Za-z][A-Za-z\s\.]{2,40})/i,
  ];
  for (const p of patterns) {
    const m = text.match(p);
    if (m && m[1]) {
      const name = m[1].trim();
      if (name.length > 2 && name.length < 50) return name;
    }
  }
  return null;
}

/** Detect payment provider */
function detectProvider(text: string): string | null {
  const t = text.toLowerCase();
  if (t.includes("mpesa") || t.includes("m-pesa") || t.includes("safaricom")) return "M-Pesa";
  if (t.includes("airtel") || t.includes("airtel money")) return "Airtel Money";
  if (t.includes("tkash") || t.includes("t-kash") || t.includes("telkom")) return "T-Kash";
  if (t.includes("bank") || t.includes("equity") || t.includes("kcb") || t.includes("coop")) return "Bank";
  if (t.includes("pesapal") || t.includes("jenga")) return "Pesapal";
  return null;
}

/** Parse date from SMS */
function parseDate(text: string, receivedAt: Date): string | null {
  const patterns = [
    /(\d{1,2}[\/\-]\d{1,2}[\/\-]\d{2,4})/,
    /(\d{1,2}[\/\-]\d{1,2}[\/\-]\d{2,4}\s+\d{1,2}:\d{2}(?:\s*[AP]M)?)/i,
    /(\d{4}[\/\-]\d{1,2}[\/\-]\d{1,2})/,
  ];
  for (const p of patterns) {
    const m = text.match(p);
    if (m && m[1]) {
      const d = new Date(m[1]);
      if (!isNaN(d.getTime())) return d.toISOString();
    }
  }
  return receivedAt.toISOString();
}

function parseSms(body: string, receivedAt: Date): ParsedSms {
  return {
    amount: parseAmount(body),
    reference: parseReference(body),
    phone: parsePhone(body),
    name: parseName(body),
    date: parseDate(body, receivedAt),
    provider: detectProvider(body),
  };
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
    // Authenticate via Bearer token (SMS API key or service role)
    const authHeader = req.headers.get("Authorization") || "";
    const apiKey = authHeader.replace("Bearer ", "").trim();

    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

    // Check SMS API key from admin_settings OR allow service role key
    const adminClient = createClient(supabaseUrl, serviceRoleKey, {
      auth: { persistSession: false, autoRefreshToken: false },
    });

    // If the key is the service role key, allow directly
    if (apiKey !== serviceRoleKey) {
      // Check against stored SMS API key
      const { data: settings } = await adminClient
        .from("admin_settings")
        .select("sms_api_key_encrypted")
        .limit(1)
        .maybeSingle();

      if (!settings || !settings.sms_api_key_encrypted || apiKey !== settings.sms_api_key_encrypted) {
        return new Response(
          JSON.stringify({ status: "unauthorized", error: "Invalid API key" }),
          { status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }
    }

    const payload: SmsIngestPayload = await req.json();

    if (!payload.sms_body || typeof payload.sms_body !== "string" || payload.sms_body.trim().length < 5) {
      return new Response(
        JSON.stringify({ status: "invalid", error: "sms_body is required and must be non-empty text" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const receivedAt = payload.received_timestamp ? new Date(payload.received_timestamp) : new Date();
    if (isNaN(receivedAt.getTime())) {
      return new Response(
        JSON.stringify({ status: "invalid", error: "Invalid received_timestamp" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Parse the SMS
    const parsed = parseSms(payload.sms_body, receivedAt);

    // Use provided parsed values as hints, but always re-parse from body for trust
    const finalAmount = parsed.amount ?? (payload.parsed_amount && payload.parsed_amount > 0 ? payload.parsed_amount : null);
    const finalReference = parsed.reference ?? payload.parsed_reference ?? null;

    if (!finalAmount || finalAmount <= 0) {
      // Store SMS but mark as failed - can't extract amount
      const { data: failedSms } = await adminClient.from("sms_messages").insert({
        raw_text: payload.sms_body,
        sender: payload.sender || parsed.phone,
        recipient: payload.recipient,
        device_id: payload.device_id,
        received_at: receivedAt.toISOString(),
        parsed_amount: finalAmount,
        parsed_reference: finalReference,
        parsed_phone: parsed.phone,
        parsed_name: parsed.name,
        parsed_date: parsed.date ? new Date(parsed.date).toISOString() : null,
        parsed_provider: parsed.provider,
        processing_status: "failed",
        error_message: "Could not extract amount from SMS",
      }).select("id").single();

      return new Response(
        JSON.stringify({ status: "invalid", message: "Could not extract payment amount from SMS", sms_id: failedSms?.id }),
        { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Duplicate detection by reference
    if (finalReference) {
      const { data: existingTx } = await adminClient.from("transactions")
        .select("id, reference")
        .eq("reference", finalReference)
        .maybeSingle();

      if (existingTx) {
        // Also store duplicate SMS record
        const { data: dupSms } = await adminClient.from("sms_messages").insert({
          raw_text: payload.sms_body,
          sender: payload.sender || parsed.phone,
          recipient: payload.recipient,
          device_id: payload.device_id,
          received_at: receivedAt.toISOString(),
          parsed_amount: finalAmount,
          parsed_reference: finalReference,
          parsed_phone: parsed.phone,
          parsed_name: parsed.name,
          parsed_date: parsed.date ? new Date(parsed.date).toISOString() : null,
          parsed_provider: parsed.provider,
          processing_status: "duplicate",
          transaction_id: existingTx.id,
          error_message: "Duplicate transaction reference",
        }).select("id").single();

        return new Response(
          JSON.stringify({ status: "duplicate", message: "Transaction with this reference already exists", sms_id: dupSms?.id }),
          { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }

      // Also check existing SMS with same reference already processed
      const { data: existingSms } = await adminClient.from("sms_messages")
        .select("id, processing_status")
        .eq("parsed_reference", finalReference)
        .in("processing_status", ["processed", "pending"])
        .maybeSingle();

      if (existingSms) {
        await adminClient.from("sms_messages").insert({
          raw_text: payload.sms_body,
          sender: payload.sender || parsed.phone,
          recipient: payload.recipient,
          device_id: payload.device_id,
          received_at: receivedAt.toISOString(),
          parsed_amount: finalAmount,
          parsed_reference: finalReference,
          parsed_phone: parsed.phone,
          parsed_name: parsed.name,
          parsed_date: parsed.date ? new Date(parsed.date).toISOString() : null,
          parsed_provider: parsed.provider,
          processing_status: "duplicate",
          error_message: "Duplicate SMS reference",
        });

        return new Response(
          JSON.stringify({ status: "duplicate", message: "SMS with this reference already processed" }),
          { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }
    }

    // Member matching by phone number
    let matchedMember: { id: string; full_name: string } | null = null;
    if (parsed.phone) {
      const { data: member } = await adminClient.from("members")
        .select("id, full_name")
        .eq("phone_number", parsed.phone)
        .eq("is_active", true)
        .maybeSingle();
      matchedMember = member;
    }

    // Store SMS record
    const { data: smsRecord, error: smsError } = await adminClient.from("sms_messages").insert({
      raw_text: payload.sms_body,
      sender: payload.sender || parsed.phone,
      recipient: payload.recipient,
      device_id: payload.device_id,
      received_at: receivedAt.toISOString(),
      parsed_amount: finalAmount,
      parsed_reference: finalReference,
      parsed_phone: parsed.phone,
      parsed_name: parsed.name,
      parsed_date: parsed.date ? new Date(parsed.date).toISOString() : null,
      parsed_provider: parsed.provider,
      processing_status: matchedMember ? "processed" : "unmatched",
      member_id: matchedMember?.id || null,
    }).select("id").single();

    if (smsError || !smsRecord) {
      return new Response(
        JSON.stringify({ status: "processing_error", error: "Failed to store SMS record" }),
        { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    if (matchedMember) {
      // Create transaction - assign to default/general category if not identifiable
      // The admin can reassign category during reconciliation
      const { data: tx } = await adminClient.from("transactions").insert({
        member_id: matchedMember.id,
        sms_message_id: smsRecord.id,
        amount: finalAmount,
        reference: finalReference,
        provider: parsed.provider,
        transaction_date: parsed.date ? new Date(parsed.date).toISOString() : receivedAt.toISOString(),
        status: "completed",
        matched_by: "sms_auto",
      }).select("id").single();

      // Link SMS to transaction
      await adminClient.from("sms_messages").update({
        transaction_id: tx?.id,
        processing_status: "processed",
      }).eq("id", smsRecord.id);

      return new Response(
        JSON.stringify({
          status: "accepted",
          message: "SMS processed and contribution recorded",
          member: matchedMember.full_name,
          amount: finalAmount,
          reference: finalReference,
          sms_id: smsRecord.id,
          transaction_id: tx?.id,
        }),
        { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    } else {
      // Unmatched - store for manual assignment
      await adminClient.from("unmatched_transactions").insert({
        sms_message_id: smsRecord.id,
        amount: finalAmount,
        reference: finalReference,
        phone_number: parsed.phone,
        sender_name: parsed.name,
        provider: parsed.provider,
        transaction_date: parsed.date ? new Date(parsed.date).toISOString() : receivedAt.toISOString(),
        status: "unmatched",
      });

      return new Response(
        JSON.stringify({
          status: "unmatched",
          message: "SMS received but member could not be auto-matched. Pending manual assignment.",
          amount: finalAmount,
          reference: finalReference,
          phone: parsed.phone,
          sms_id: smsRecord.id,
        }),
        { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }
  } catch (err) {
    return new Response(
      JSON.stringify({ status: "processing_error", error: err.message }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
