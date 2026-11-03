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
- Akhiri dengan satu kalimat bridging yang natural untuk mempersilakan narasumber mulai bercerita.
- Tugasmu hanya menulis PEMBUKAAN host. Jangan membuat follow-up setelah cerita, pertanyaan lanjutan, dialog narasumber, atau bagian setelah narasumber mulai bercerita.
- Jangan mengarang detail pengalaman, kronologi, lokasi spesifik, kejadian, dialog, reaksi, atau bukti yang tidak diberikan pengguna.
- Jangan menulis dialog narasumber sama sekali.
- Jika premis masih umum, gunakan kalimat pengantar yang umum dan aman; jangan mengisi kekosongan dengan cerita rekaan.
- Jangan menganggap kisah gaib sebagai fakta yang terbukti. Gunakan framing bahwa narasumber akan membagikan pengalaman atau ceritanya.
- Jangan menambahkan catatan produksi, rundown, alternatif judul, atau pertanyaan wawancara.

OUTPUT:
Tulis hanya:
1. Judul/topik pembuka.
2. Satu naskah opening host dari hook, pengantar topik, perkenalan narasumber, sampai bridging untuk mempersilakan narasumber mulai bercerita.
Gunakan bahasa Indonesia lisan yang natural seperti ngobrol/cangkruk, singkat sekitar 45–90 detik, kalimat tidak terlalu panjang, dan siap dibaca host di depan kamera.`;
    } else if (task === "research") {
      const topic = String(body.topic || "").slice(0, 1200);
      prompt = `Bertindak sebagai asisten riset awal konten horor Ghoustory. Susun bahan riset berdasarkan pengetahuan yang tersedia tentang topik/lokasi berikut: ${topic}.

      PENTING: Jangan mengaku melakukan pencarian Google atau pencarian web langsung. Jangan mengarang sumber, tautan, kutipan, tanggal, angka, atau fakta. Jika tidak yakin atau tidak memiliki informasi yang cukup, nyatakan dengan jelas bahwa informasi tersebut perlu diverifikasi. Jangan menyajikan cerita gaib atau rumor sebagai fakta.

      Tujuan hasil ini adalah menjadi bahan SCRIPT MONOLOG VIDEO yang dibacakan satu host, bukan wawancara atau dialog podcast.

      Susun jawaban dengan format:
      1. RINGKASAN RISET: latar belakang topik/lokasi dan poin penting yang diketahui.
      2. FAKTA YANG PERLU DIVERIFIKASI: informasi sejarah, nama, tanggal, tempat, atau peristiwa yang relevan. Tandai bahwa ini belum diverifikasi melalui pencarian web.
      3. LEGENDA ATAU CERITA MASYARAKAT: pisahkan dari fakta dan jelaskan sebagai cerita/kepercayaan yang beredar.
      4. HAL YANG BELUM PASTI: informasi yang belum cukup kuat atau berpotensi keliru.
      5. NASKAH MONOLOG: buat naskah narasi siap dibacakan host sekitar 3–5 menit, dengan hook pembuka, pengantar konteks, isi yang mengalir, pemisahan jelas antara fakta dan legenda, lalu penutup yang mengajak penonton berpikir. Jangan menambahkan detail yang tidak didukung informasi yang tersedia.
      6. REFERENSI UNTUK CEK MANUAL: sarankan jenis sumber tepercaya yang sebaiknya dicari (misalnya situs pemerintah, arsip, jurnal akademik, museum, atau media kredibel). Jangan menciptakan URL atau mengklaim sumber telah dibaca.

      Gunakan bahasa Indonesia lisan yang natural, atmosfer misteri khas Ghoustory, tetapi tetap akurat dan tidak clickbait menyesatkan. Jangan membuat daftar pertanyaan wawancara. Tegaskan bahwa hasil ini adalah riset awal berbasis pengetahuan model, bukan hasil pencarian web langsung, sehingga fakta perlu dicek sebelum tayang.`;
    } else if (task === "monologue") {
      const topic = String(body.topic || "Topik misteri").slice(0, 1200);
      const research = String(body.research || "").slice(0, 18000);
      prompt = `Kamu adalah penulis naskah monolog dokumenter misteri dan horor untuk kanal YouTube Ghoustory. Ubah bahan riset berikut menjadi naskah monolog video yang siap dibacakan satu host.

TOPIK: ${topic}
BAHAN RISET:
${research}

ATURAN WAJIB:
- Pahami seluruh bahan riset lalu susun ulang menjadi narasi yang runtut, menarik, dan enak didengar. Jangan sekadar menyalin ringkasan.
- Jangan menambahkan fakta, nama, tanggal, lokasi, kutipan, kronologi, atau detail yang tidak ada dalam bahan riset.
- Bedakan fakta dari legenda, mitos, rumor, dan klaim yang belum terbukti. Gunakan penanda seperti "menurut cerita yang beredar" atau "belum dapat dipastikan".
- Jangan menyebut rumor sebagai fakta atau klaim supranatural seolah terbukti.
- Jika bahan minim, buat naskah lebih singkat. Jangan mengarang demi memenuhi durasi.
- Jangan membuat dialog narasumber, pertanyaan wawancara, rundown, atau catatan produksi.
- Gunakan bahasa Indonesia lisan yang natural, atmosfer misteri khas Ghoustory, tetapi tetap bertanggung jawab.

STRUKTUR:
1. Judul naskah.
2. Hook pembuka.
3. Pengantar topik dan konteks.
4. Isi monolog yang mengalir berdasarkan bahan riset.
5. Penutup yang mengajak penonton berpikir atau berdiskusi.

Target sekitar 3–5 menit jika bahan cukup. Keluarkan hanya naskah final siap dibaca host, tanpa analisis tambahan.`;
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
    } else if (task === "shorts-moment-finder") {
      const audioBase64 = String(body.audioBase64 || "");
      audioMimeType = String(body.mimeType || "").split(";")[0].trim().toLowerCase();
      if (audioMimeType !== "audio/mpeg") return json({ error: "Shorts Moment Finder hanya menerima audio MP3." }, 400);
      if (!audioBase64 || !/^[A-Za-z0-9+/]+={0,2}$/.test(audioBase64)) return json({ error: "Data MP3 kosong atau tidak valid." }, 400);
      if (audioBase64.length > 23_000_000) return json({ error: "MP3 terlalu besar. Batas unggahan sekitar 17 MB." }, 413);
      const requestedCount = Math.max(5, Math.min(10, Number(body.count) || 7));
      const preferredStyle = String(body.style || "Seimbang").slice(0, 80);
      const fileName = String(body.fileName || "audio.mp3").slice(0, 120);
      prompt = `Kamu adalah editor video pendek berpengalaman untuk kanal horor Indonesia Ghoustory. Dengarkan SELURUH audio, pahami konteks dan alur cerita sebelum memilih momen. File: ${fileName}. Jumlah target: ${requestedCount}. Prioritas: ${preferredStyle}.
Audio dapat berbahasa Indonesia, Jawa, atau campuran. Pahami ungkapan sesuai konteks.
PILIH MOMEN:
- Pilih maksimal ${requestedCount} momen paling kuat; jangan memaksakan jumlah jika audio tidak cukup.
- Utamakan hook kuat, ketegangan, pengakuan, detail ganjil, reaksi emosional, twist, atau humor spontan.
- Tiap potongan harus punya konteks mandiri, awal/akhir alami, payoff, dan tidak terpotong di tengah kalimat.
- Durasi ideal 20–60 detik. Hindari jeda, basa-basi, pengulangan, dan potongan yang saling tumpang tindih.
- Sebar pilihan di berbagai bagian audio jika memang ada momen kuat. Urutkan berdasarkan potensi menarik, bukan kronologi.
AKURASI:
- Timestamp dihitung dari awal audio, format HH:MM:SS. Jika perkiraan, tulis jelas "perkiraan" di reason.
- Quote harus ucapan yang benar-benar terdengar, jangan mengarang.
- Hook adalah teks usulan editor, bukan klaim ucapan pembicara.
- Caption singkat, natural, tidak membocorkan twist dan tidak menyesatkan.
Kembalikan HANYA JSON valid tanpa markdown:
{"moments":[{"start":"00:01:20","end":"00:02:02","title":"Judul singkat","hook":"Hook pembuka","caption":"Caption siap pakai","reason":"Alasan editorial","quote":"Ucapan asli"}]}
Jangan menambahkan teks di luar JSON.`;
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
    const modelCandidates = ["gemini-3.1-flash-lite", "gemini-3.5-flash-lite"];
    const retryableStatuses = [429, 500, 502, 503, 504];
    const maxOutputTokens = task === "shorts-moment-finder" ? 5000 : task === "script" ? 1800 : task === "minutes-audio" ? 3500 : 2500;
    let response: Response | null = null;
    let activeModel = "";

    // Try the primary model first. If it is temporarily unavailable, switch to the
    // documented stable Flash-Lite fallback using the same Gemini API key.
    for (const model of modelCandidates) {
      activeModel = model;
      const attemptsForModel = model === modelCandidates[0] ? 3 : 2;
      for (let attempt = 0; attempt < attemptsForModel; attempt++) {
        const geminiUrl = "https://generativelanguage.googleapis.com/v1beta/models/" + model + ":generateContent";
        response = await fetch(geminiUrl, {
          method: "POST",
          headers: { "Content-Type": "application/json", "x-goog-api-key": apiKey },
          body: JSON.stringify({
            contents: [{ role: "user", parts: requestParts.length ? requestParts : [{ text: prompt }] }],
            generationConfig: { temperature: 0.75, maxOutputTokens },
          }),
          signal: AbortSignal.timeout(110_000),
        });
        console.log("[ghoustory-ai] stage=gemini_attempt model=" + model + " attempt=" + (attempt + 1) + " status=" + response.status);
        if (response.ok || !retryableStatuses.includes(response.status)) break;
        if (attempt < attemptsForModel - 1) {
          const retryAfter = Number(response.headers.get("retry-after") || 0);
          const waitMs = retryAfter > 0 ? Math.min(retryAfter * 1000, 8000) : (attempt === 0 ? 2000 : 4000);
          await response.body?.cancel();
          await new Promise((resolve) => setTimeout(resolve, waitMs));
        }
      }
      if (response?.ok || (response && !retryableStatuses.includes(response.status))) break;
      if (model !== modelCandidates[modelCandidates.length - 1]) {
        console.warn("[ghoustory-ai] stage=model_fallback primary=" + model + " fallback=" + modelCandidates[modelCandidates.indexOf(model) + 1] + " status=" + response?.status);
        await response?.body?.cancel();
      }
    }
    if (!response) return json({ error: "Tidak berhasil menghubungi Gemini." }, 502);
    console.log("[ghoustory-ai] stage=gemini_response model=" + activeModel + " status=" + response.status);

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
      const message = String(result?.error?.message || "Gemini API gagal memproses permintaan.");
      const status = Number(result?.error?.code || response.status);
      const reason = String(result?.error?.status || "UNKNOWN");
      // Log Gemini's diagnostic message (never log the API key or request headers).
      console.error("[ghoustory-ai] stage=gemini_error status=" + status + " reason=" + reason + " message=" + message.slice(0, 1000));
      return json({
        error: message,
        provider: "Gemini",
        providerStatus: status,
        providerReason: reason,
      }, response.status);
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
