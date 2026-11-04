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


function youtubeVideoId(input: string): string {
  const u = new URL(input);
  const host = u.hostname.toLowerCase().replace(/^www\./, "");
  if (!["youtube.com", "m.youtube.com", "music.youtube.com", "youtu.be", "youtube-nocookie.com"].includes(host)) throw new Error("Masukkan tautan YouTube yang valid.");
  let id = host === "youtu.be" ? u.pathname.split("/").filter(Boolean)[0] || "" : (u.searchParams.get("v") || "");
  if (!id) { const parts = u.pathname.split("/").filter(Boolean); if (["embed", "shorts", "live", "v"].includes(parts[0] || "")) id = parts[1] || ""; }
  if (!/^[A-Za-z0-9_-]{11}$/.test(id)) throw new Error("ID video YouTube tidak dikenali. Periksa kembali tautannya.");
  return id;
}
function decodeCaptionText(value: string): string {
  return value.replace(/<br\s*\/?\s*>/gi, " ").replace(/&amp;/g, "&").replace(/&quot;/g, '"').replace(/&#39;|&apos;/g, "'").replace(/&lt;/g, "<").replace(/&gt;/g, ">").replace(/&#(\d+);/g, (_, n) => String.fromCodePoint(Number(n))).replace(/&#x([0-9a-f]+);/gi, (_, n) => String.fromCodePoint(parseInt(n, 16))).replace(/\s+/g, " ").trim();
}
function secondsLabel(value: number): string { const s=Math.max(0,Math.floor(value)); return [Math.floor(s/3600),Math.floor((s%3600)/60),s%60].map(n=>String(n).padStart(2,"0")).join(":"); }
async function uploadAudioUrlToGemini(audioUrl: string, displayName: string, apiKey: string): Promise<{ uri: string; name: string }> {
  const parsed = new URL(audioUrl);
  const projectUrl = new URL(Deno.env.get("SUPABASE_URL") || "");
  if (parsed.origin !== projectUrl.origin || !parsed.pathname.includes("/storage/v1/object/sign/vo-recordings/")) {
    throw new Error("Tautan audio sementara tidak valid.");
  }
  const audioResponse = await fetch(audioUrl, { signal: AbortSignal.timeout(90000) });
  if (!audioResponse.ok) throw new Error("Gagal mengambil MP3 dari penyimpanan sementara (HTTP " + audioResponse.status + ").");
  const declaredLength = Number(audioResponse.headers.get("content-length") || 0);
  if (declaredLength > 50 * 1024 * 1024) throw new Error("Ukuran MP3 melebihi batas 50 MB.");
  const audioBytes = new Uint8Array(await audioResponse.arrayBuffer());
  if (!audioBytes.length) throw new Error("File MP3 kosong.");
  if (audioBytes.length > 50 * 1024 * 1024) throw new Error("Ukuran MP3 melebihi batas 50 MB.");

  const startResponse = await fetch("https://generativelanguage.googleapis.com/upload/v1beta/files?key=" + encodeURIComponent(apiKey), {
    method: "POST",
    headers: {
      "X-Goog-Upload-Protocol": "resumable",
      "X-Goog-Upload-Command": "start",
      "X-Goog-Upload-Header-Content-Length": String(audioBytes.length),
      "X-Goog-Upload-Header-Content-Type": "audio/mpeg",
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ file: { display_name: displayName.slice(0, 180) } }),
    signal: AbortSignal.timeout(30000),
  });
  if (!startResponse.ok) throw new Error("Gemini gagal menyiapkan upload file (HTTP " + startResponse.status + ").");
  const uploadUrl = startResponse.headers.get("x-goog-upload-url");
  if (!uploadUrl) throw new Error("Gemini tidak memberikan alamat upload file.");
  const finishResponse = await fetch(uploadUrl, {
    method: "POST",
    headers: {
      "X-Goog-Upload-Offset": "0",
      "X-Goog-Upload-Command": "upload, finalize",
      "Content-Length": String(audioBytes.length),
    },
    body: audioBytes,
    signal: AbortSignal.timeout(90000),
  });
  if (!finishResponse.ok) throw new Error("Upload MP3 ke Gemini gagal (HTTP " + finishResponse.status + ").");
  const uploaded = await finishResponse.json();
  const file = uploaded?.file;
  if (!file?.uri || !file?.name) throw new Error("Gemini tidak mengembalikan identitas file yang valid.");
  return { uri: String(file.uri), name: String(file.name) };
}
async function getYoutubeTranscript(videoId: string): Promise<{ transcript: string; language: string }> {
  const clients = [
    { name: "WEB", version: "2.20261101.00.00", clientName: "WEB" },
    { name: "ANDROID", version: "20.10.38", clientName: "ANDROID" },
    { name: "IOS", version: "20.10.4", clientName: "IOS" },
  ];
  let lastReason = "";
  let tracks: any[] = [];

  for (const client of clients) {
    try {
      const response = await fetch("https://www.youtube.com/youtubei/v1/player?prettyPrint=false", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "Origin": "https://www.youtube.com",
          "Referer": "https://www.youtube.com/",
          "User-Agent": client.name === "ANDROID"
            ? "com.google.android.youtube/20.10.38 (Linux; U; Android 14) gzip"
            : "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36",
        },
        body: JSON.stringify({
          videoId,
          context: {
            client: {
              clientName: client.clientName,
              clientVersion: client.version,
              hl: "id",
              gl: "ID",
              ...(client.name === "ANDROID" ? { androidSdkVersion: 34 } : {}),
            },
          },
          contentCheckOk: true,
          racyCheckOk: true,
        }),
        signal: AbortSignal.timeout(16000),
      });
      if (!response.ok) {
        lastReason = "YouTube player " + client.name + " merespons HTTP " + response.status;
        continue;
      }
      const player = await response.json();
      tracks = player?.captions?.playerCaptionsTracklistRenderer?.captionTracks || [];
      if (tracks.length) break;
      lastReason = String(player?.playabilityStatus?.reason || "Caption tidak dikembalikan oleh client " + client.name);
    } catch (error) {
      lastReason = error instanceof Error ? error.message : "Gagal menghubungi YouTube";
    }
  }

  if (!tracks.length) {
    throw new Error("Video publik ini belum berhasil dibaca melalui jalur caption YouTube. " +
      (lastReason ? "Detail: " + lastReason + ". " : "") +
      "Jika caption tersedia di YouTube tetapi tetap gagal, coba unggah MP3 sebagai alternatif.");
  }

  const chosen = tracks.find((t: any) => ["jv", "id"].includes(String(t.languageCode || "").toLowerCase()))
    || tracks.find((t: any) => String(t.kind || "") === "asr")
    || tracks[0];
  if (!chosen.baseUrl) throw new Error("YouTube menemukan track caption, tetapi URL caption tidak tersedia.");

  const captionResponse = await fetch(String(chosen.baseUrl), {
    headers: {
      "Referer": "https://www.youtube.com/",
      "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/131.0.0.0 Safari/537.36",
    },
    signal: AbortSignal.timeout(20000),
  });
  if (!captionResponse.ok) throw new Error("Caption ditemukan, tetapi gagal diunduh (HTTP " + captionResponse.status + ").");
  const xml = await captionResponse.text();
  const cues: Array<{ time: number; text: string }> = [];
  const pattern = /<text\b([^>]*)>([\s\S]*?)<\/text>/gi;
  let m: RegExpExecArray | null;
  while ((m = pattern.exec(xml)) !== null) {
    const start = Number((m[1].match(/\bstart="([^"]+)"/) || [])[1]);
    const text = decodeCaptionText(m[2].replace(/<[^>]+>/g, ""));
    if (Number.isFinite(start) && text) cues.push({ time: start, text });
  }
  if (!cues.length) {
    const p = /<p\b([^>]*)>([\s\S]*?)<\/p>/gi;
    while ((m = p.exec(xml)) !== null) {
      const ms = Number((m[1].match(/\bt="([^"]+)"/) || [])[1]);
      const text = decodeCaptionText(m[2].replace(/<[^>]+>/g, ""));
      if (Number.isFinite(ms) && text) cues.push({ time: ms / 1000, text });
    }
  }
  if (!cues.length) throw new Error("Caption berhasil diakses, tetapi format transkripnya tidak dikenali.");
  return {
    transcript: cues.map(c => "[" + secondsLabel(c.time) + "] " + c.text).join("\n"),
    language: String(chosen.languageCode || "tidak diketahui"),
  };
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  if (req.method !== "POST") return json({ error: "Method not allowed." }, 405);

  let uploadedGeminiFileName = "";
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

    if (task === "ritual-chat") {
      const message = String(body.message || "").slice(0, 2000);
      const chatContext = JSON.stringify(body.chat || []).slice(0, 7000);
      const appContext = JSON.stringify(body.context || {}).slice(0, 12000);
      if (!message.trim()) return json({ error: "Pertanyaan untuk GHOUSTORY AI masih kosong." }, 400);
      prompt = `Kamu adalah GHOUSTORY AI, asisten internal untuk tim produksi kanal horor Ghoustory. Jawab dalam bahasa Indonesia yang natural, ringkas, ramah, dan praktis. Kamu membantu diskusi, jadwal, produksi, naskah, VO, notulen, ide konten, dan operasional tim.
PENTING:
- Gunakan konteks aplikasi yang disediakan bila relevan. Jangan mengarang data yang tidak ada.
- Jika data tidak ditemukan, katakan tidak ditemukan dan minta detail yang diperlukan.
- Kamu tidak dapat menyimpan, mengedit, atau menghapus data secara langsung. Jika diminta melakukan tindakan, siapkan detailnya dan katakan bahwa pengguna perlu mengonfirmasi/menyimpannya melalui aplikasi.
- Jangan mengungkap rahasia, token, kredensial, atau data pribadi yang tidak relevan.
- Bedakan fakta, usulan, dan dugaan. Jangan mengklaim sudah mengubah jadwal atau data.
RIWAYAT CHAT TERAKHIR:
${chatContext}
KONTEKS DATA GHOUSTORY:
${appContext}
PERTANYAAN:
${message}
Berikan jawaban yang langsung membantu tim. `;
    } else if (task === "script") {
      const guest = String(body.guest || "Narasumber").slice(0, 160);
      const location = String(body.location || "lokasi misterius").slice(0, 240);
      const premise = String(body.premise || "pengalaman mistis").slice(0, 1200);
      const format = body.format === "Podcast" ? "Podcast / Cerita Studio" : "Penelusuran Lokasi";
      prompt = `Kamu adalah penulis opening dan bridging untuk kanal YouTube horor Indonesia Ghoustory. Tugasmu HANYA membuat naskah pembuka video yang dibawakan host sebelum narasumber mulai bercerita. Jangan membuat keseluruhan episode, rundown wawancara, daftar pertanyaan panjang, kronologi kejadian, klimaks, atau jawaban narasumber.

Format: ${format}. Nama narasumber: ${guest}. Lokasi: ${location}. Topik/premis dari pengguna: ${premise}.

ATURAN KONTEN:
- Buat opening host sekitar 45–90 detik.
- Tulis untuk DIUCAPKAN, bukan untuk dibaca seperti artikel atau berita.
- Gunakan bahasa Indonesia lisan yang luwes, akrab, spontan, dan terasa seperti host sedang ngobrol langsung dengan penonton. Boleh memakai penghubung percakapan seperti "Nah", "Jadi", atau "Coba bayangkan" secara wajar, jangan berlebihan.
- Utamakan kalimat pendek sampai sedang, satu gagasan per kalimat, mudah diucapkan dalam sekali napas.
- Hindari bahasa kaku/formal, kalimat berbunga-bunga, istilah rumit, pengulangan ide, dan frasa klise AI seperti "di balik...", "menyimpan misteri...", atau "kisah yang tak terlupakan" kecuali benar-benar cocok.
- Buat alur yang enak untuk take: hook yang langsung menarik perhatian → konteks singkat → perkenalan narasumber → satu kalimat pengantar agar narasumber mulai bercerita.
- Sisipkan jeda paragraf pada pergantian gagasan. Jangan menulis arahan kamera, ekspresi, atau catatan dalam tanda kurung.
- Baca ulang secara mental sebagai host. Jika terdengar seperti tulisan artikel, sederhanakan sampai terdengar seperti percakapan alami.
- Jangan membuat keseluruhan episode, rundown, pertanyaan wawancara, dialog narasumber, atau bagian setelah narasumber mulai bercerita.
- Jangan mengarang detail pengalaman, kronologi, lokasi spesifik, kejadian, reaksi, atau bukti yang tidak diberikan pengguna.
- Jika premis masih umum, gunakan pengantar yang aman tanpa mengisi kekosongan dengan cerita rekaan.
- Jangan menyatakan kisah gaib sebagai fakta terbukti. Jangan menambahkan catatan produksi atau alternatif judul.

OUTPUT:
Tulis hanya judul singkat dan naskah opening final yang siap dibaca host di depan kamera.`;
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
      prompt = `Kamu adalah asisten notulen tim produksi Ghoustory. Ubah transkrip berikut menjadi NOTULEN SUPER RINGKAS yang bisa dipindai dalam beberapa detik. Topik: ${topic}.

ATURAN WAJIB:
- Ambil hanya inti informasi, keputusan, dan tindakan. Jangan menceritakan ulang jalannya rapat.
- Gunakan kalimat pendek, bahasa Indonesia sederhana, langsung ke poin.
- Hindari paragraf panjang, basa-basi, pengulangan, dan penjelasan yang tidak mengubah keputusan.
- Gunakan ikon seperlunya agar cepat dibaca; jangan memenuhi notulen dengan emoji.
- Jangan mengarang nama, keputusan, PIC, atau tenggat. Jika tidak ada, tulis "Belum ditentukan".
- Jika suatu bagian memang tidak ada isinya, cukup tulis "—".

FORMAT:
📝 INTI RAPAT
Maksimal 1–3 bullet, tiap bullet satu kalimat pendek.

✅ KEPUTUSAN
Hanya keputusan yang benar-benar disepakati.

📌 TINDAKAN
Format: [ ] Tugas — PIC — Tenggat. Isi PIC/tenggat hanya jika disebut.

⏳ BELUM DIPUTUSKAN
Hanya hal yang masih menggantung. Jika tidak ada, tulis "—".

Jangan menambahkan pembukaan, kesimpulan panjang, atau tindak lanjut generik. Keluarkan notulen saja.

TRANSKRIP:
${transcript}`;
    } else if (task === "minutes-audio") {
      const topic = String(body.topic || "Rapat").slice(0, 200);
      const audioBase64 = String(body.audioBase64 || "");
      audioMimeType = String(body.mimeType || "audio/webm").split(";")[0].trim().toLowerCase();
      const allowedAudioTypes = ["audio/webm", "audio/mp4", "audio/mpeg", "audio/mp3", "audio/wav", "audio/x-wav", "audio/ogg", "audio/flac", "audio/aac", "audio/3gpp"];
      if (!allowedAudioTypes.includes(audioMimeType)) return json({ error: "Format audio tidak didukung: " + audioMimeType }, 400);
      if (!audioBase64 || !/^[A-Za-z0-9+/]+={0,2}$/.test(audioBase64)) return json({ error: "Data audio kosong atau tidak valid." }, 400);
      if (audioBase64.length > 23_000_000) return json({ error: "Audio terlalu besar. Batas unggahan sekitar 17 MB." }, 413);
      prompt = `Kamu adalah asisten notulen tim produksi Ghoustory. Dengarkan rapat berbahasa Indonesia yang mungkin bercampur bahasa Jawa dan Indonesia.

KELUARAN HARUS DUA BAGIAN:
1. TRANSKRIP: tulis ucapan setia pada rekaman. Pertahankan nama/istilah yang terdengar. Tandai bagian tidak jelas sebagai [tidak terdengar]. Jangan menebak atau merapikan sampai mengubah makna.
2. NOTULEN SUPER RINGKAS: jangan menceritakan ulang rapat. Gunakan format:
📝 INTI RAPAT — maksimal 1–3 bullet singkat.
✅ KEPUTUSAN — hanya yang benar-benar disepakati.
📌 TINDAKAN — [ ] tugas — PIC — tenggat; PIC/tenggat hanya jika disebut.
⏳ BELUM DIPUTUSKAN — hanya hal yang masih menggantung; jika tidak ada, tulis "—".

Gunakan bahasa sederhana, kalimat pendek, dan ikon seperlunya. Hindari paragraf panjang, pengulangan, dan basa-basi. Jangan mengarang nama, keputusan, tanggal, PIC, atau tenggat. Bedakan usulan dari keputusan. Jika pembicara tidak dapat dikenali dengan yakin, jangan menebak identitasnya. Topik rapat: ${topic}. Pisahkan dengan heading TRANSKRIP dan NOTULEN.`;
      if (requestParts.length) requestParts[0] = { text: prompt };
    } else if (task === "social-screenshot") {
      const imageBase64 = String(body.imageBase64 || "");
      const imageMimeType = String(body.mimeType || "").split(";")[0].trim().toLowerCase();
      const platform = String(body.platform || "");
      const reportDate = String(body.reportDate || "").slice(0, 10);
      if (!["youtube", "tiktok", "facebook"].includes(platform)) return json({ error: "Platform tidak dikenal." }, 400);
      if (!["image/jpeg", "image/png", "image/webp"].includes(imageMimeType)) return json({ error: "Format gambar harus JPG, PNG, atau WEBP." }, 400);
      if (!imageBase64 || !/^[A-Za-z0-9+/]+={0,2}$/.test(imageBase64)) return json({ error: "Data screenshot kosong atau tidak valid." }, 400);
      if (imageBase64.length > 11_000_000) return json({ error: "Screenshot terlalu besar. Maksimal 8 MB." }, 413);
      const platformName = platform === "youtube" ? "YouTube Studio" : platform === "tiktok" ? "TikTok Analytics" : "Meta Business Suite";
      prompt = `Baca screenshot Analytics ${platformName} untuk membantu pemilik kanal Ghoustory mencatat performa. Tanggal laporan yang dipilih pengguna (tanggal akhir/per tanggal screenshot): ${reportDate || "tidak ditentukan"}.
Ekstrak HANYA angka yang benar-benar terlihat. Jangan menebak angka metrik utama yang tertutup, terpotong, atau tidak ada. Perhatikan satuan K/M dan ubah menjadi angka penuh (misalnya 1,2 rb = 1200; 3,4 jt = 3400000). Jangan menjumlahkan metrik yang berbeda. Jika screenshot menampilkan periode, tulis periodenya sebagai title singkat. Untuk metrik total yang tidak terlihat, isi 0.
PENTING UNTUK GRAFIK 7 HARI:
- Jika screenshot juga menampilkan grafik harian, baca titik/kolom pada grafik beserta skala sumbu Y dan label tanggal pada sumbu X.
- Keluarkan data harian dalam dailyViews, satu objek per tanggal yang benar-benar bisa dipetakan. Format tanggal YYYY-MM-DD.
- Tanggal laporan pengguna adalah tanggal akhir hanya jika cocok dengan grafik. Gunakan label tanggal/hari yang terlihat untuk memetakan tanggal. Jika label hanya nama hari, petakan mundur dari tanggal laporan hanya bila urutannya jelas.
- Nilai grafik yang tidak menampilkan angka persis boleh diperkirakan dari posisi titik/kolom terhadap skala sumbu Y, tetapi tandai confidence "medium" atau "low". Jangan membuat titik yang tidak terlihat atau mengisi hari kosong dengan tebakan.
- Jika tanggal atau skala tidak terbaca, kembalikan dailyViews sebagai [] untuk bagian yang tidak dapat dipastikan. Jangan mengarang tanggal/nilai.
- Setiap item dailyViews berisi date, views, confidence ("high", "medium", atau "low").
Kembalikan HANYA JSON valid tanpa markdown:
{"title":"nama/periode laporan singkat","views":0,"likes":0,"comments":0,"shares":0,"followers":0,"reach":0,"dailyViews":[{"date":"YYYY-MM-DD","views":0,"confidence":"high"}]}
Pastikan semua nilai views berupa integer. Jika label metrik utama tidak jelas, jangan memaksakan pemetaan ke kolom lain.`;      requestParts = [
        { text: prompt },
        { inline_data: { mime_type: imageMimeType, data: imageBase64 } },
      ];
    } else if (task === "video-audio-analysis") {
      const audioUrl = String(body.audioUrl || "");
      audioMimeType = String(body.mimeType || "").split(";")[0].trim().toLowerCase();
      if (audioMimeType !== "audio/mpeg" && audioMimeType !== "audio/mp3") return json({ error: "Fitur Analisis Video menerima file MP3." }, 400);
      if (!audioUrl) return json({ error: "Tautan MP3 sementara tidak tersedia." }, 400);
      const title = String(body.title || "Analisis Video Ghoustory").slice(0, 180);
      const uploadedAudio = await uploadAudioUrlToGemini(audioUrl, title || "Ghoustory MP3", apiKey);
      requestParts = [{ text: "" }, { file_data: { mime_type: "audio/mpeg", file_uri: uploadedAudio.uri } }];
      uploadedGeminiFileName = uploadedAudio.name;
      prompt = `Kamu adalah editor transkrip dan produser konten untuk kanal horor Indonesia Ghoustory. Dengarkan seluruh file MP3 ini. Audio dapat menggunakan bahasa Jawa (termasuk dialek Jawa Timur/Sidoarjo), bahasa Indonesia, atau campuran. Judul/keterangan: ${title}.

TUGAS:
1. Kenali bahasa yang digunakan.
2. Buat transkrip asli sedekat mungkin dengan ucapan pembicara. Jangan mengarang bagian yang tidak terdengar; tandai [tidak terdengar].
3. Terjemahkan transkrip ke bahasa Indonesia yang natural dan mudah dipahami. Pertahankan nama, istilah lokal, slang, dan nuansa cerita; bila istilah Jawa tidak punya padanan tepat, pertahankan istilahnya dan jelaskan singkat.
4. Buat ringkasan cerita dalam 3–6 poin.
5. Temukan TEPAT 5 kandidat potongan YouTube Shorts terbaik. Pilih bagian dengan hook kuat, kejadian mengejutkan, ketegangan, pengakuan, detail ganjil, reaksi, humor spontan, atau twist. Setiap potongan WAJIB maksimal 60 detik (ideal 20–55 detik), jangan memotong di tengah kalimat, dan pastikan konteksnya cukup. Jangan pernah memilih bagian lebih dari 60 detik.
6. Untuk setiap kandidat Shorts berikan timestamp awal/akhir, judul singkat, hook pembuka, caption, alasan pemilihan, dan kutipan ucapan untuk membantu editor menemukan bagian.
7. Timestamp harus dihitung dari awal audio. Jika hanya dapat diperkirakan, tandai jelas sebagai perkiraan. Jangan mengarang kutipan atau detail cerita.

KELUARAN HANYA JSON VALID TANPA MARKDOWN dengan struktur:
{"title":"...","detectedLanguage":"...","fullTranscript":"transkrip asli lengkap","indonesianTranscript":"terjemahan Indonesia lengkap","summary":["..."],"moments":[{"start":"00:00:00","end":"00:00:35","title":"...","hook":"...","caption":"...","reason":"...","quote":"...","timestampConfidence":"high|medium|low"}]}
Jangan menghilangkan bagian penting transkrip. Jika audio terlalu panjang untuk ditranskrip seluruhnya, nyatakan bagian yang tidak tercakup secara jujur pada fullTranscript dan jangan berpura-pura lengkap.`;
      requestParts[0] = { text: prompt };
    } else if (task === "subtitle-srt") {
      const translatedTranscript = String(body.translatedTranscript || "").slice(0, 30000);
      const audioUrl = String(body.audioUrl || "");
      audioMimeType = String(body.mimeType || "audio/mpeg").split(";")[0].trim().toLowerCase();
      if (!translatedTranscript.trim()) return json({ error: "Teks terjemahan kosong." }, 400);
      if (audioUrl) {
        if (audioMimeType !== "audio/mpeg") return json({ error: "Format audio untuk subtitle harus MP3." }, 400);
        const uploadedAudio = await uploadAudioUrlToGemini(audioUrl, "Ghoustory subtitle audio", apiKey);
        requestParts = [{ text: "" }, { file_data: { mime_type: "audio/mpeg", file_uri: uploadedAudio.uri } }];
        (globalThis as any).__ghoustoryUploadedGeminiFile = uploadedAudio.name;
      }
      prompt = `Susun teks terjemahan Bahasa Indonesia berikut menjadi subtitle SRT yang siap dipakai editor. ${audioBase64 ? "Dengarkan audio MP3 yang disertakan dan selaraskan setiap kalimat dengan waktu ucapan yang benar-benar terdengar." : "Audio tidak tersedia. Buat perkiraan waktu berdasarkan alur kalimat dan beri catatan estimasi pada hasil."}
Aturan: pecah menjadi baris subtitle pendek, maksimal sekitar 42 karakter per baris dan 2 baris per cue; jangan mengubah, meringkas, atau menghilangkan makna; urutkan sesuai ucapan; jangan tumpang tindih; start dan end harus berformat HH:MM:SS.mmm; tiap cue minimal 0,8 detik. Jangan mengarang jeda panjang.
Kembalikan HANYA JSON valid: {"segments":[{"start":"00:00:00.000","end":"00:00:02.400","text":"Teks subtitle"}],"timing":"aligned|estimated"}
TERJEMAHAN:
${translatedTranscript}`;
      requestParts = [{ text: prompt }];
      if (audioBase64) requestParts.push({ inline_data: { mime_type: audioMimeType, data: audioBase64 } });
    } else if (task === "shorts-moment-finder") {
      const audioBase64 = String(body.audioBase64 || "");
      audioMimeType = String(body.mimeType || "").split(";")[0].trim().toLowerCase();
      if (audioMimeType !== "audio/mpeg") return json({ error: "Shorts Moment Finder hanya menerima audio MP3." }, 400);
      if (!audioBase64 || !/^[A-Za-z0-9+/]+={0,2}$/.test(audioBase64)) return json({ error: "Data MP3 kosong atau tidak valid." }, 400);
      if (audioBase64.length > 23_000_000) return json({ error: "MP3 terlalu besar. Batas unggahan sekitar 17 MB." }, 413);
      prompt = `Dengarkan audio cerita/video panjang untuk kanal YouTube horor Ghoustory. Percakapan dapat memakai bahasa Indonesia, bahasa Jawa, atau campuran keduanya. Temukan TEPAT 5 potongan terbaik untuk dijadikan YouTube Shorts. Prioritaskan bagian yang punya konteks cukup dan payoff: kejadian mengejutkan, ketegangan, pengakuan, detail ganjil, reaksi emosional, humor spontan, atau twist. Jangan memotong di tengah kalimat dan jangan memilih bagian yang membutuhkan konteks panjang yang tidak tersedia.
Kembalikan HANYA JSON valid dengan struktur:
{"moments":[{"start":"00:00","end":"00:45","title":"Judul pendek yang kuat","hook":"Kalimat hook pembuka untuk teks/video","caption":"Caption singkat siap pakai","reason":"Mengapa bagian ini menarik untuk Shorts","quote":"Cuplikan ucapan persis/semirip mungkin untuk membantu editor menemukan bagian"}]}
Timestamp harus mengacu pada posisi audio dari awal, format HH:MM:SS atau MM:SS. Setiap potongan WAJIB maksimal 60 detik (ideal 20–55 detik); jangan pernah mengembalikan bagian lebih dari 60 detik. Jangan mengarang isi cerita atau kutipan. Jika waktu tidak dapat dipastikan dari audio, berikan perkiraan dan tandai kata "perkiraan" pada reason. Urutkan berdasarkan potensi menarik penonton, bukan urutan waktu. Judul dan caption gunakan bahasa Indonesia natural. `;
      requestParts = [
        { text: prompt },
        { inline_data: { mime_type: audioMimeType, data: audioBase64 } },
      ];
    } else if (task === "youtube-video-analysis") {
      const url=String(body.url||"").trim();let videoId="";
      try{videoId=youtubeVideoId(url);}catch(error){return json({error:error instanceof Error?error.message:"Tautan YouTube tidak valid."},400);}
      let videoTitle=String(body.title||"").slice(0,180);
      try{const o=await fetch("https://www.youtube.com/oembed?format=json&url="+encodeURIComponent("https://www.youtube.com/watch?v="+videoId),{signal:AbortSignal.timeout(12000)});if(o.ok){const info=await o.json();if(!videoTitle)videoTitle=String(info.title||"");}}catch(_){}
      let transcriptData:{transcript:string;language:string};
      try{transcriptData=await getYoutubeTranscript(videoId);}catch(error){return json({error:error instanceof Error?error.message:"Transkrip YouTube tidak dapat diambil."},422);}
      prompt="Kamu adalah editor transkrip dan produser konten kanal horor Indonesia Ghoustory. Analisis transkrip caption YouTube berikut. Judul video: "+videoTitle+". Bahasa caption YouTube: "+transcriptData.language+".\n\nTRANSKRIP BERTIMESTAMP:\n"+transcriptData.transcript+"\n\nTUGAS:\n1. Kenali bahasa percakapan (bisa Jawa Timur/Sidoarjo, Indonesia, atau campuran). Caption otomatis bisa salah dengar; perbaiki hanya jika konteksnya kuat.\n2. Susun transkrip asli yang dirapikan tanpa mengubah makna. Jangan mengarang.\n3. Terjemahkan seluruh transkrip ke bahasa Indonesia natural. Pertahankan istilah lokal, nama, slang, dan nuansa cerita.\n4. Buat ringkasan cerita 3–6 poin.\n5. Temukan TEPAT 5 kandidat Shorts terbaik, masing-masing maksimal 60 detik (ideal 20–55 detik), pilih hook, ketegangan, kejutan, pengakuan, reaksi, humor, atau twist. Jangan pernah mengembalikan lebih dari 5 bagian.\n6. Timestamp wajib mengacu pada timestamp caption. Jangan mengarang waktu; tandai confidence medium/low bila batas perlu diperkirakan.\n7. Berikan judul, hook, caption, alasan, dan kutipan singkat untuk setiap kandidat.\nKELUARAN HANYA JSON VALID:\n{\"title\":\"...\",\"detectedLanguage\":\"...\",\"fullTranscript\":\"...\",\"indonesianTranscript\":\"...\",\"summary\":[\"...\"],\"moments\":[{\"start\":\"00:00:00\",\"end\":\"00:00:35\",\"title\":\"...\",\"hook\":\"...\",\"caption\":\"...\",\"reason\":\"...\",\"quote\":\"...\",\"timestampConfidence\":\"high|medium|low\"}]}\nJangan mengklaim transkrip lengkap bila ada bagian terpotong. Tandai bagian yang meragukan.";
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
    const structuredJsonTask = task === "video-audio-analysis" || task === "youtube-video-analysis";
    const maxOutputTokens = structuredJsonTask ? 32000 : task === "subtitle-srt" ? 7000 : task === "social-screenshot" ? 1800 : task === "shorts-moment-finder" ? 5000 : task === "script" ? 1800 : task === "minutes-audio" ? 3500 : 2500;
    const videoAnalysisSchema = {
      type: "OBJECT",
      properties: {
        title: { type: "STRING" },
        detectedLanguage: { type: "STRING" },
        fullTranscript: { type: "STRING" },
        indonesianTranscript: { type: "STRING" },
        summary: { type: "ARRAY", items: { type: "STRING" }, maxItems: 12 },
        moments: {
          type: "ARRAY",
          maxItems: 5,
          items: {
            type: "OBJECT",
            properties: {
              start: { type: "STRING" }, end: { type: "STRING" },
              title: { type: "STRING" }, hook: { type: "STRING" },
              caption: { type: "STRING" }, reason: { type: "STRING" },
              quote: { type: "STRING" }, timestampConfidence: { type: "STRING" }
            },
            required: ["start", "end", "title", "hook", "caption", "reason", "quote", "timestampConfidence"]
          }
        }
      },
      required: ["title", "detectedLanguage", "fullTranscript", "indonesianTranscript", "summary", "moments"]
    };
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
            generationConfig: { temperature: structuredJsonTask ? 0.3 : 0.75, maxOutputTokens, ...(structuredJsonTask ? { responseMimeType: "application/json", responseJsonSchema: videoAnalysisSchema } : {}) },
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
    const uploadedGeminiFile = uploadedGeminiFileName;
    if (uploadedGeminiFile) {
      try {
        await fetch("https://generativelanguage.googleapis.com/v1beta/" + uploadedGeminiFile, {
          method: "DELETE",
          headers: { "x-goog-api-key": apiKey },
          signal: AbortSignal.timeout(10000),
        });
      } catch (cleanupError) {
        console.warn("[ghoustory-ai] temporary Gemini file cleanup failed:", cleanupError);
      }
      uploadedGeminiFileName = "";
    }
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
    const candidate = result?.candidates?.[0];
    if (structuredJsonTask && candidate?.finishReason === "MAX_TOKENS") {
      return json({ error: "Hasil transkrip terlalu panjang untuk satu kali keluaran AI. Coba audio yang lebih pendek." }, 502);
    }
    let text = (candidate?.content?.parts || [])
      .map((part: { text?: string }) => part.text || "")
      .join("\n")
      .trim();
    if (!text) return json({ error: "Gemini tidak menghasilkan teks. Coba lagi." }, 502);
    if (structuredJsonTask) {
      try {
        text = JSON.stringify(JSON.parse(text));
      } catch (_) {
        console.error("[ghoustory-ai] stage=structured_output_invalid task=" + task + " finishReason=" + String(candidate?.finishReason || "unknown"));
        return json({ error: "Gemini belum menghasilkan JSON analisis yang utuh. Silakan coba sekali lagi." }, 502);
      }
    }
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
