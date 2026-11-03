// Supabase Edge Function: ghoustory-ai
// Required secret: GEMINI_API_KEY
// Deploy with: supabase functions deploy ghoustory-ai
const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  if (req.method !== "POST") return json({ error: "Method not allowed." }, 405);

  try {
    const apiKey = Deno.env.get("GEMINI_API_KEY");
    if (!apiKey) return json({ error: "Secret GEMINI_API_KEY belum dipasang di Supabase." }, 500);

    const body = await req.json();
    const task = String(body.task || "");
    let prompt = "";

    if (task === "script") {
      const guest = String(body.guest || "Narasumber").slice(0, 160);
      const location = String(body.location || "lokasi misterius").slice(0, 240);
      const premise = String(body.premise || "pengalaman mistis").slice(0, 1200);
      const format = body.format === "Podcast" ? "Podcast / Cerita Studio" : "Penelusuran Lokasi";
      prompt = `Kamu penulis naskah profesional untuk kanal YouTube horor Indonesia Ghoustory. Buat naskah lengkap berbahasa Indonesia yang natural, enak dibawakan host, punya hook kuat, build-up ketegangan, pertanyaan narasumber, transisi, dan penutup. Format: ${format}. Narasumber: ${guest}. Lokasi: ${location}. Premis: ${premise}. Jangan mengarang fakta tentang kejadian nyata; tandai bagian yang perlu dikonfirmasi. Sertakan arahan visual/audio seperlunya. Output langsung naskah dengan heading yang rapi.`;
    } else if (task === "research") {
      const topic = String(body.topic || "").slice(0, 1200);
      prompt = `Bertindak sebagai asisten riset konten horor Ghoustory. Buat ringkasan riset awal tentang topik/lokasi berikut: ${topic}. Pisahkan: (1) informasi yang cukup dikenal/terverifikasi, (2) cerita rakyat/rumor yang belum terbukti, (3) hal yang perlu dikonfirmasi sebelum ditayangkan, (4) 8 pertanyaan wawancara/observasi, (5) ide angle cerita. Jangan mengarang sumber, tanggal, atau fakta. Jika tidak yakin, tulis bahwa perlu verifikasi. Bahasa Indonesia.`;
    } else if (task === "minutes") {
      const topic = String(body.topic || "Rapat").slice(0, 200);
      const transcript = String(body.transcript || "").slice(0, 24000);
      prompt = `Ubah transkrip rapat berikut menjadi notulen yang jelas dan rapi dalam bahasa Indonesia. Topik: ${topic}. Susun: Ringkasan, Keputusan, Daftar Tugas (PIC dan tenggat hanya jika disebut), Hal yang belum diputuskan, dan tindak lanjut. Jangan menambahkan keputusan atau nama yang tidak ada dalam transkrip. Jika informasi tidak disebut, tulis "Belum disebut". Transkrip:\n${transcript}`;
    } else if (task === "metadata") {
      const url = String(body.url || "");
      let videoTitle = "";
      let authorName = "";
      try {
        const parsed = new URL(url);
        if (!["youtube.com", "www.youtube.com", "youtu.be", "m.youtube.com"].includes(parsed.hostname)) {
          return json({ error: "URL harus berasal dari YouTube." }, 400);
        }
        const oembed = await fetch("https://www.youtube.com/oembed?format=json&url=" + encodeURIComponent(url));
        if (oembed.ok) {
          const info = await oembed.json();
          videoTitle = String(info.title || "");
          authorName = String(info.author_name || "");
        }
      } catch (_) {
        return json({ error: "Link YouTube tidak valid atau metadata publik tidak dapat dibaca." }, 400);
      }
      prompt = `Bantu siapkan metadata optimasi video YouTube untuk kanal horor Ghoustory. Informasi video dari YouTube oEmbed: Judul: ${videoTitle || "Tidak tersedia"}; Kanal: ${authorName || "Tidak tersedia"}; URL: ${url}. Buat 5 opsi judul yang menarik tetapi tidak menyesatkan, deskripsi video, 3 pilihan caption pendek, 15 tag relevan, hashtag, dan saran timestamp. Karena durasi/transkrip video tidak tersedia, jangan mengarang timestamp atau isi cerita. Beri placeholder timestamp yang perlu diisi manual. Bahasa Indonesia.`;
    } else {
      return json({ error: "Jenis tugas AI tidak dikenal." }, 400);
    }

    const response = await fetch(
      "https://generativelanguage.googleapis.com/v1beta/models/gemini-3.8-flash:generateContent",
      {
        method: "POST",
        headers: { "Content-Type": "application/json", "x-goog-api-key": apiKey },
        body: JSON.stringify({
          contents: [{ role: "user", parts: [{ text: prompt }] }],
          tools: task === "research" ? [{ google_search: {} }] : undefined,
          generationConfig: { temperature: 0.75, maxOutputTokens: 5000 },
        }),
      },
    );

    const result = await response.json();
    if (!response.ok) {
      const message = result?.error?.message || "Gemini API gagal memproses permintaan.";
      return json({ error: message }, response.status);
    }
    const text = (result?.candidates?.[0]?.content?.parts || [])
      .map((part: { text?: string }) => part.text || "")
      .join("\n")
      .trim();
    if (!text) return json({ error: "Gemini tidak menghasilkan teks. Coba lagi." }, 502);
    const sources = (result?.candidates?.[0]?.groundingMetadata?.groundingChunks || [])
      .map((chunk: { web?: { uri?: string; title?: string } }) => chunk.web)
      .filter((web: { uri?: string } | undefined) => !!web?.uri)
      .map((web: { uri?: string; title?: string }) => ({ title: web.title || web.uri, url: web.uri }));
    const sourceText = sources.length ? "\\n\\nSUMBER WEB UNTUK DIVERIFIKASI:\\n" + sources.map((source: {title:string;url:string}, index:number) => (index+1)+". "+source.title+" — "+source.url).join("\\n") : "";
    const usage = result?.usageMetadata ? { promptTokens: result.usageMetadata.promptTokenCount || 0, outputTokens: result.usageMetadata.candidatesTokenCount || 0, totalTokens: result.usageMetadata.totalTokenCount || 0 } : null;
    return json({ text: text + sourceText, sources, usage });
  } catch (error) {
    console.error("ghoustory-ai error:", error);
    return json({ error: error instanceof Error ? error.message : "Terjadi kesalahan pada layanan AI." }, 500);
  }
});
