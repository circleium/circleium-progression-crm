import { createClient } from "@supabase/supabase-js";

export default async (request) => {
  if (request.method !== "POST") {
    return new Response(JSON.stringify({ error: "Method not allowed" }), {
      status: 405,
      headers: { "Content-Type": "application/json" }
    });
  }

  try {
    const token = (request.headers.get("authorization") || "").replace(/^Bearer\s+/i, "");
    if (!token) {
      return new Response(JSON.stringify({ error: "Missing authorization" }), {
        status: 401,
        headers: { "Content-Type": "application/json" }
      });
    }

    const supabaseUrl = Netlify.env.get("SUPABASE_URL");
    const adminKey =
      Netlify.env.get("SUPABASE_SECRET_KEY") ||
      Netlify.env.get("SUPABASE_SERVICE_ROLE_KEY");

    if (!supabaseUrl || !adminKey) {
      throw new Error("Supabase environment variables are missing");
    }

    const admin = createClient(supabaseUrl, adminKey, {
      auth: { autoRefreshToken: false, persistSession: false }
    });

    const { data: authCheck, error: authError } = await admin.auth.getUser(token);
    if (authError || !authCheck?.user) {
      return new Response(JSON.stringify({ error: "Invalid session" }), {
        status: 401,
        headers: { "Content-Type": "application/json" }
      });
    }

    const { data: caller } = await admin
      .from("profiles")
      .select("role,active")
      .eq("id", authCheck.user.id)
      .single();

    if (caller?.role !== "admin" || !caller?.active) {
      return new Response(JSON.stringify({ error: "Admin access required" }), {
        status: 403,
        headers: { "Content-Type": "application/json" }
      });
    }

    const body = await request.json();
    const {
      name,
      email,
      counties = [],
      areas = [],
      categories = [],
      redirectTo
    } = body;

    if (!name || !email) throw new Error("Partner name and email are required");

    const inviteOptions = {
      data: { full_name: name, role: "partner" }
    };
    if (redirectTo) inviteOptions.redirectTo = redirectTo;

    const { data: invitation, error: inviteError } =
      await admin.auth.admin.inviteUserByEmail(email, inviteOptions);

    if (inviteError) throw inviteError;

    const uid = invitation.user.id;

    const { error: profileError } = await admin
      .from("profiles")
      .upsert({
        id: uid,
        full_name: name,
        role: "partner",
        active: true
      });
    if (profileError) throw profileError;

    const { data: existingPartner } = await admin
      .from("partners")
      .select("id")
      .eq("user_id", uid)
      .maybeSingle();

    let partnerId = existingPartner?.id;

    if (partnerId) {
      const { error } = await admin
        .from("partners")
        .update({
          name,
          email: email.toLowerCase(),
          active: true,
          accepting_new: true
        })
        .eq("id", partnerId);
      if (error) throw error;
    } else {
      const { data: partner, error } = await admin
        .from("partners")
        .insert({
          user_id: uid,
          name,
          email: email.toLowerCase(),
          active: true,
          accepting_new: true
        })
        .select()
        .single();
      if (error) throw error;
      partnerId = partner.id;
    }

    await admin.from("partner_areas").delete().eq("partner_id", partnerId);
    const areaRows = [];
    for (const county of counties) {
      for (const area of areas) {
        if (String(county).trim() && String(area).trim()) {
          areaRows.push({
            partner_id: partnerId,
            county: String(county).trim(),
            area: String(area).trim()
          });
        }
      }
    }
    if (areaRows.length) {
      const { error } = await admin.from("partner_areas").insert(areaRows);
      if (error) throw error;
    }

    await admin.from("partner_categories").delete().eq("partner_id", partnerId);
    if (categories.length) {
      const { error } = await admin.from("partner_categories").insert(
        categories
          .filter(Boolean)
          .map(category => ({
            partner_id: partnerId,
            category: String(category).trim()
          }))
      );
      if (error) throw error;
    }

    return new Response(
      JSON.stringify({ ok: true, partnerId }),
      { status: 200, headers: { "Content-Type": "application/json" } }
    );
  } catch (error) {
    console.error("Partner invitation failed:", error);
    return new Response(
      JSON.stringify({ error: error.message || "Unable to invite partner" }),
      { status: 400, headers: { "Content-Type": "application/json" } }
    );
  }
};
