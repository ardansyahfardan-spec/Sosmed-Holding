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
    console.log("[ghoustory-ai] stage=reading_request");
    const body = await req.json();
    const task = String(body.task || "");
    console.log("[ghoustory-ai] stage=request_parsed task=" + task);

    // Lightweight diagnostic: verifies the Edge Function runtime without calling Gemini.
    if (task === "health") {
      return json({
        ok: true,
        function: "ghoustory-ai",
        message: "Edge Function runtime berjalan.",
        geminiConfigured: Boolean(Deno.env.get("GEMINI_API_KEY")),
      });
    }

    const apiKey = Deno.env.get("GEMINI_API_KEY");
    if (!apiKey) return json({ error: "Secret GEMINI_API_KEY belum dipasang di Supabase." }, 500);
    let prompt = "";
    let requestParts: Array<Record<string, unknown>> = [];
    let audioMimeType = "";

    if (task === "script") {
      const guest = String(body.guest || "Narasumber").slice(0, 160);
      const location = String(body.location || "lokasi misterius").slice(0, 240);
      const premise = String(body.premise || "pengalaman mistis").slice(0, 1200);
      const format = body.format === "Podcast" ? "Podcast / Cerita Studio" : "Penelusuran Lokasi";
      prompt = `Kamu adalah penulis opening dan bridging untuk kanal YouTube horor Indonesia Ghoustory. Tugasmu HANYA membuat naskah pembuka video yang dibawakan host sebelum narasumber mulai bercerita. Jangan membuat keseluruhan episode, rundown wawancara, daftar pertanyaan panjang, kronologi kejadian, klimaks, atau jawaban narasumber.

Format: ${format}. Nama narasumber: ${guest}. Lokasi: ${location}. Topik/premis dari pengguna: ${premise}.

ATURAN KONTEN:
- Buat opening singkat untuk sekitar 45–90 detik, bukan naskah 15 menit.
- Mulai dengan hook yang memancing rasa penasaran berdasarkan topik yang diberikan.
- Bangun suasana misteri secukupnya, lalu perkenalkan topik dan narasumber.
- Akhiri opening dengan kalimat bridging yang natural untuk mempersilakan narasumber mulai bercerita.
- Selain opening, siapkan beberapa kalimat FOLLOW-UP singkat yang bisa dipakai host SETELAH satu cerita narasumber selesai, untuk menanggapi lalu mengajak narasumber membagikan cerita/pengalaman lain.
- Follow-up harus terasa seperti obrolan cangkruk, bukan interogasi atau daftar pertanyaan wawancara formal. Variasikan nada: santai, penasaran, dan sedikit misterius.
- Contoh nuansa kalimat: "Wah, ternyata ada pengalaman seperti itu juga. Masih ada cerita lain yang pernah kamu alami?" atau "Itu tadi satu pengalaman yang cukup bikin merinding. Pernah mengalami kejadian lain?"
- Buat kalimat follow-up yang fleksibel dan tidak mengasumsikan ada kejadian lanjutan. Jangan menyatakan narasumber pasti punya cerita lain.
- Jangan mengarang detail pengalaman, kronologi, lokasi spesifik, kejadian, dialog, reaksi, atau bukti yang tidak diberikan pengguna. Follow-up cukup merespons secara umum tanpa menambahkan detail cerita.
- Jangan menulis dialog narasumber sama sekali.
- Jika premis masih umum, gunakan kalimat pengantar yang umum dan aman; jangan mengisi kekosongan dengan cerita rekaan.
- Jangan menganggap kisah gaib sebagai fakta yang terbukti. Gunakan framing bahwa narasumber akan membagikan pengalaman atau ceritanya.
- Jangan menambahkan catatan produksi, rundown, alternatif judul, atau daftar pertanyaan wawancara panjang.

OUTPUT:
Tulis hanya:
1. Judul/topik pembuka.
2. Naskah opening host dari hook sampai bridging ke narasumber.
3. Bagian "Follow-up setelah cerita" berisi 4–6 pilihan kalimat pendek untuk mengajak narasumber melanjutkan dengan cerita lain secara natural.
Gunakan bahasa Indonesia lisan yang enak diucapkan, kalimat tidak terlalu panjang, dan siap dibaca host di depan kamera.`;
    } else if (task === "research") {
      const topic = String(body.topic || "").slice(0, 1200);
      prompt = `Bertindak sebagai asisten riset awal konten horor Ghoustory. Buat ringkasan berdasarkan pengetahuan yang tersedia tentang topik/lokasi berikut: ${topic}. Pisahkan: (1) informasi umum yang perlu diverifikasi, (2) cerita rakyat/rumor yang belum terbukti, (3) hal yang wajib dikonfirmasi sebelum ditayangkan, (4) 8 pertanyaan wawancara/observasi, (5) ide angle cerita. Jangan mengarang sumber, tautan, tanggal, atau fakta. Tegaskan bahwa hasil ini bukan pencarian web langsung dan semua fakta perlu diverifikasi. Bahasa Indonesia.`;
    } else if (task === "minutes") {
      const topic = String(body.topic || "Rapat").slice(0, 200);
      const transcript = String(body.transcript || "").slice(0, 24000);
      prompt = `Ubah transkrip rapat berikut menjadi notulen yang jelas dan rapi dalam bahasa Indonesia. Topik: ${topic}. Susun: Ringkasan, Keputusan, Daftar Tugas (PIC dan tenggat hanya jika disebut), Hal yang belum diputuskan, dan tindak lanjut. Jangan menambahkan keputusan atau nama yang tidak ada dalam transkrip. Jika informasi tidak disebut, tulis "Belum disebut". Transkrip:\n${transcript}`;
    } else if (task === "minutes-audio") {
      const topic = String(body.topic || "Rapat").slice(0, 200);
      const audioBase64 = String(body.audioBase64 || "");
      audioMimeType = String(body.mimeType || "audio/webm").split(";")[0].trim().toLowerCase();
      const allowedAudioTypes = ["audio/webm", "audio/mp4", "audio/mpeg", "audio/mp3", "audio/wav", "audio/x-wav", "audio/ogg", "audio/flac", "audio/aac", "audio/3gpp"];
      if (!allowedAudioTypes.includes(audioMimeType)) return json({ error: "Format audio tidak didukung: " + audioMimeType }, 400);
      if (!audioBase64 || !/^[A-Za-z0-9+/]+={0,2}$/.test(audioBase64)) return json({ error: "Data audio kosong atau tidak valid." }, 400);
      if (audioBase64.length > 23_000_000) return json({ error: "Audio terlalu besar. Batas unggahan sekitar 17 MB." }, 413);
      prompt = `Kamu adalah asisten notulen rapat untuk tim produksi Ghoustory. Dengarkan rekaman audio rapat berbahasa Indonesia; percakapan bisa bercampur bahasa Jawa dan Indonesia. Tugasmu: (1) tulis TRANSKRIP yang setia pada ucapan, pertahankan istilah/nama yang terdengar dan tandai bagian yang tidak jelas sebagai [tidak terdengar], jangan menebak; (2) susun NOTULEN dengan bagian Ringkasan, Poin Pembahasan, Keputusan, Daftar Tugas (PIC dan tenggat hanya jika benar-benar disebut), Hal yang Belum Diputuskan, dan Tindak Lanjut. Topik rapat: ${topic}. Bedakan keputusan pasti dari usulan. Jangan mengarang nama, keputusan, tanggal, atau penanggung jawab. Jika pembicara tidak dapat dikenali dengan yakin, jangan menebak identitasnya. Gunakan bahasa Indonesia yang rapi. Format keluaran dengan heading TRANSKRIP dan NOTULEN.`;
      requestParts = [
        { text: prompt },
        { inline_data: { mime_type: audioMimeType, data: audioBase64 } },
      ];
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

    console.log("[ghoustory-ai] stage=before_gemini task=" + task);
    const geminiUrl = "https://generativelanguage.googleapis.com/v1beta/models/gemini-3.1-flash-lite:generateContent";
    const geminiPayload = {
      contents: [{ role: "user", parts: requestParts.length ? requestParts : [{ text: prompt }] }],
      generationConfig: { temperature: 0.75, maxOutputTokens: task === "script" ? 1800 : task === "minutes-audio" ? 3500 : 2500 },
    };

    let response: Response | null = null;
    // Retry only temporary capacity/rate-limit errors. Never retry other 4xx errors.
    for (let attempt = 0; attempt < 3; attempt++) {
      response = await fetch(geminiUrl, {
        method: "POST",
        headers: { "Content-Type": "application/json", "x-goog-api-key": apiKey },
        body: JSON.stringify(geminiPayload),
        signal: AbortSignal.timeout(110_000),
      });
      console.log("[ghoustory-ai] stage=gemini_attempt attempt=" + (attempt + 1) + " status=" + response.status);
      if (![429, 500, 502, 503, 504].includes(response.status) || attempt === 2) break;
      const retryAfter = Number(response.headers.get("retry-after") || 0);
      const waitMs = retryAfter > 0 ? Math.min(retryAfter * 1000, 8000) : (attempt === 0 ? 2000 : 4000);
      await response.body?.cancel();
      await new Promise((resolve) => setTimeout(resolve, waitMs));
    }
    if (!response) return json({ error: "Tidak berhasil menghubungi Gemini." }, 502);

    console.log("[ghoustory-ai] stage=gemini_response status=" + response.status);
    const responseText = await response.text();
    console.log("[ghoustory-ai] stage=response_body_received chars=" + responseText.length);
    let result: Record<string, any>;
    try {
      result = JSON.parse(responseText);
    } catch (_) {
      console.error("[ghoustory-ai] stage=json_parse_failed");
      return json({ error: "Respons Gemini bukan JSON yang valid." }, 502);
    }
    console.log("[ghoustory-ai] stage=json_parsed");
    if (!response.ok) {
      const message = result?.error?.message || "Gemini API gagal memproses permintaan.";
      return json({ error: message }, response.status);
    }
    console.log("[ghoustory-ai] stage=extracting_text");
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
