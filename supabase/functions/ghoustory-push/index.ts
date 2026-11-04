import { createClient } from "npm:@supabase/supabase-js@2";
import webpush from "npm:web-push@3.6.7";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  if (req.method !== "POST") return new Response("Method not allowed", { status: 405, headers: corsHeaders });

  try {
    const authHeader = req.headers.get("Authorization") || "";
    const token = authHeader.replace(/^Bearer\s+/i, "");
    if (!token) return new Response(JSON.stringify({ error: "Unauthorized" }), { status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" } });

    const url = Deno.env.get("SUPABASE_URL")!;
    const anonKey = Deno.env.get("SUPABASE_ANON_KEY")!;
    const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const publicKey = Deno.env.get("VAPID_PUBLIC_KEY")!;
    const privateKey = Deno.env.get("VAPID_PRIVATE_KEY")!;
    const subject = Deno.env.get("VAPID_SUBJECT") || "mailto:admin@ghoustory.com";
    if (!url || !anonKey || !serviceKey || !publicKey || !privateKey) {
      throw new Error("Push secrets belum dikonfigurasi di Supabase.");
    }

    const userClient = createClient(url, anonKey, { global: { headers: { Authorization: authHeader } }, auth: { persistSession: false } });
    const { data: authData, error: authError } = await userClient.auth.getUser(token);
    if (authError || !authData.user) return new Response(JSON.stringify({ error: "Invalid session" }), { status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" } });
    const senderId = authData.user.id;

    const { message_id, kind } = await req.json();
    if (!message_id || !["dm", "group"].includes(kind)) throw new Error("Payload tidak valid.");

    const admin = createClient(url, serviceKey, { auth: { persistSession: false } });
    let message: any;
    let recipientIds: string[] = [];
    let targetUrl = "./?chat=1&room=group";

    if (kind === "dm") {
      const { data, error } = await admin.from("ghoustory_dm_messages").select("id,conversation_id,sender_id,body").eq("id", message_id).single();
      if (error || !data || data.sender_id !== senderId) throw new Error("Pesan tidak ditemukan atau bukan milik pengirim.");
      message = data;
      const { data: participants, error: participantError } = await admin.from("ghoustory_dm_participants").select("user_id").eq("conversation_id", data.conversation_id);
      if (participantError) throw participantError;
      recipientIds = (participants || []).map((p: any) => p.user_id).filter((id: string) => id !== senderId);
      targetUrl = "./?chat=1&room=dm&conversation_id=" + encodeURIComponent(data.conversation_id);
    } else {
      const { data, error } = await admin.from("ghoustory_chat_messages").select("id,sender_id,sender_name,body").eq("id", message_id).single();
      if (error || !data || data.sender_id !== senderId) throw new Error("Pesan tidak ditemukan atau bukan milik pengirim.");
      message = data;
      const { data: senderMembership, error: membershipError } = await admin.from("ghoustory_ritual_crew_profiles").select("user_id").eq("user_id", senderId).maybeSingle();
      if (membershipError) throw membershipError;
      if (!senderMembership) throw new Error("Pengirim bukan anggota aktif RITUAL CREW.");

      const { data: profiles, error: profileError } = await admin.from("ghoustory_ritual_crew_profiles").select("user_id").neq("user_id", senderId);
      if (profileError) throw profileError;
      recipientIds = (profiles || []).map((p: any) => p.user_id);
    }

    if (!recipientIds.length) return new Response(JSON.stringify({ sent: 0, reason: "no_recipients" }), { headers: { ...corsHeaders, "Content-Type": "application/json" } });
    const { data: subscriptions, error: subError } = await admin.from("ghoustory_push_subscriptions").select("id,user_id,endpoint,p256dh,auth").in("user_id", recipientIds);
    if (subError) throw subError;
    if (!subscriptions?.length) return new Response(JSON.stringify({ sent: 0, reason: "no_subscriptions" }), { headers: { ...corsHeaders, "Content-Type": "application/json" } });

    webpush.setVapidDetails(subject, publicKey, privateKey);
    const { data: senderProfile } = await admin.from("ghoustory_profiles").select("nickname").eq("user_id", senderId).maybeSingle();
    const senderName = senderProfile?.nickname || message.sender_name || "Anggota Ghoustory";
    const preview = String(message.body || "Mengirim lampiran").replace(/\s+/g, " ").slice(0, 110);
    const results = await Promise.allSettled(subscriptions.map(async (sub: any) => {
      const subscription = { endpoint: sub.endpoint, keys: { p256dh: sub.p256dh, auth: sub.auth } };
      try {
        await webpush.sendNotification(subscription, JSON.stringify({
          title: kind === "dm" ? senderName : "RITUAL CREW · " + senderName,
          body: preview,
          tag: "ghoustory-" + message_id,
          url: targetUrl
        }));
      } catch (error: any) {
        if (error?.statusCode === 404 || error?.statusCode === 410) {
          await admin.from("ghoustory_push_subscriptions").delete().eq("id", sub.id);
        }
        throw error;
      }
    }));
    const sent = results.filter((r) => r.status === "fulfilled").length;
    return new Response(JSON.stringify({ sent, failed: results.length - sent }), { headers: { ...corsHeaders, "Content-Type": "application/json" } });
  } catch (error) {
    console.error("ghoustory-push:", error);
    return new Response(JSON.stringify({ error: error?.message || "Push failed" }), { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } });
  }
});
