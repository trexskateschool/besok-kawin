import { NextRequest, NextResponse } from 'next/server';
import { Gender, PlayerAnswer } from '@/types/game';
import { getQuestionsForProfile } from '@/data/questions';

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const { action } = body;
    const apiKey = process.env.GEMINI_API_KEY;

    // 1. GENERATE PROFIL & JAWABAN BOT SOLO BERDASARKAN 20 JAWABAN USER
    if (action === 'generate_bot') {
      const { userProfile, botAge } = body as {
        userProfile: { name: string; gender: Gender; age: number; answers: PlayerAnswer[] };
        botAge: number;
      };
      const botGender: Gender = userProfile.gender === 'Laki-laki' ? 'Perempuan' : 'Laki-laki';
      const botQuestions = getQuestionsForProfile(botGender, botAge);

      if (!apiKey) {
        const simulatedAnswers: PlayerAnswer[] = botQuestions.map((q, idx) => ({
          questionId: q.id,
          statement: q.statement,
          category: q.category,
          consequenceSeed: q.consequenceSeed,
          choice: idx % 3 === 0 ? 'iya_lagi' : idx % 4 === 0 ? 'kayanya_sih' : 'engga',
        }));
        return NextResponse.json({
          botName: botGender === 'Perempuan' ? `Nadia (${botAge})` : `Raka (${botAge})`,
          botGender,
          botAge,
          answers: simulatedAnswers,
        });
      }

      const userRedFlags = userProfile.answers
        .filter((a) => a.choice !== 'engga')
        .map((a) => `- [${a.choice}] ${a.statement}`)
        .join('\n');

      const prompt = `Kamu adalah simulator pasangan AI untuk game kartu hubungan dewasa (18+).
Profil User: ${userProfile.name}, ${userProfile.gender}, usia ${userProfile.age} tahun.
Sifat/masalah yang diakui user:
${userRedFlags}

Profil Bot AI: ${botGender}, usia ${botAge} tahun.
Dari daftar 20 pernyataan berikut, pilih 7-9 pernyataan yang paling memicu gesekan psikologis atau menguji konsistensi jawaban user di atas (tandai sebagai "iya_lagi" atau "kayanya_sih", sisanya "engga").
Daftar pernyataan:
${botQuestions.map((q) => `${q.id}: ${q.statement}`).join('\n')}

Kembalikan HANYA JSON valid tanpa markdown:
{
  "botName": "Nama panggilan Indonesia realistis",
  "selected": { "q1": "iya_lagi", "q2": "engga" }
}`;

      const res = await fetch(
        `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent?key=${apiKey}`,
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            contents: [{ parts: [{ text: prompt }] }],
            generationConfig: { responseMimeType: 'application/json' },
          }),
        }
      );

      const data = await res.json();
      const rawText = data?.candidates?.[0]?.content?.parts?.[0]?.text || '{}';
      const parsed = JSON.parse(rawText);

      const answers: PlayerAnswer[] = botQuestions.map((q) => ({
        questionId: q.id,
        statement: q.statement,
        category: q.category,
        consequenceSeed: q.consequenceSeed,
        choice: parsed.selected?.[q.id] || 'engga',
      }));

      return NextResponse.json({
        botName: `${parsed.botName || (botGender === 'Perempuan' ? 'Alya' : 'Dimas')} (${botAge})`,
        botGender,
        botAge,
        answers,
      });
    }

    // 2. GENERATE KONSEKUENSI SAAT PEMAIN KLIK "TERIMA"
    if (action === 'generate_consequence') {
      const { actorAnswers, card } = body as {
        actorAnswers: PlayerAnswer[];
        card: PlayerAnswer;
      };
      const actorFlaw = actorAnswers.find((a) => a.choice === 'iya_lagi');

      const fallbackText = actorFlaw
        ? `Yakin mau nerima "${card.statement}"? Padahal di awal kamu sendiri ngaku: "${actorFlaw.statement}". ${card.consequenceSeed} Masih sanggup nanggung tanpa nyesel?`
        : `Konsekuensi nyata: ${card.consequenceSeed} Kalau ini kejadian berulang kali setelah nikah, kamu yakin nggak bakal nyesel?`;

      if (!apiKey) {
        return NextResponse.json({ consequenceText: fallbackText });
      }

      const prompt = `Buat 2 kalimat pertanyaan konsekuensi yang tajam, realistis, dan menohok dalam bahasa Indonesia kasual (gua/lu atau aku/kamu) untuk game hubungan.
Masalah pasangan yang baru saja DITERIMA pemain: "${card.statement}" (${card.consequenceSeed}).
Kelemahan yang diakui pemain sendiri sebelumnya: "${actorFlaw ? actorFlaw.statement : 'Tidak ada yang spesifik'}".
Tabrakkan penerimaan pemain dengan kelemahannya sendiri agar dia ragu apakah keputusannya gegabah. Kembalikan JSON: {"consequenceText": "..."}`;

      const res = await fetch(
        `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent?key=${apiKey}`,
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            contents: [{ parts: [{ text: prompt }] }],
            generationConfig: { responseMimeType: 'application/json' },
          }),
        }
      );
      const data = await res.json();
      const parsed = JSON.parse(data?.candidates?.[0]?.content?.parts?.[0]?.text || '{}');
      return NextResponse.json({
        consequenceText: parsed.consequenceText || fallbackText,
      });
    }

    // 3. GENERATE 3 OPSI KOMPROMI SAAT PEMAIN KLIK "TOLAK"
    if (action === 'generate_compromise') {
      const { card, botAge } = body as { card: PlayerAnswer; botAge?: number };

      const fallbackOptions = [
        'Bikin batas waktu/kuota yang jelas tiap minggu, dilanggar = evaluasi bareng.',
        'Saling kasih kabar singkat sebelum kambuh, tanpa saling menghakimi.',
        'Bawa ke sesi ngobrol tenang seminggu sekali khusus bahas evaluasi ini.',
      ];

      if (!apiKey) {
        return NextResponse.json({
          options: fallbackOptions,
          botVoteIndex: botAge && botAge >= 28 ? 0 : 1,
        });
      }

      const prompt = `Masalah hubungan ini baru saja DITOLAK pasangan: "${card.statement}".
Buat 3 opsi kompromi ("Jalan Tengah") yang konkret, dewasa, dan singkat (maksimal 12 kata per opsi) dalam bahasa Indonesia kasual.
${botAge ? `Juga tentukan index pilihan (0, 1, atau 2) yang paling masuk akal dipilih oleh bot berusia ${botAge} tahun.` : ''}
Kembalikan JSON valid: {"options": ["opsi 1", "opsi 2", "opsi 3"], "botVoteIndex": 0}`;

      const res = await fetch(
        `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent?key=${apiKey}`,
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            contents: [{ parts: [{ text: prompt }] }],
            generationConfig: { responseMimeType: 'application/json' },
          }),
        }
      );
      const data = await res.json();
      const parsed = JSON.parse(data?.candidates?.[0]?.content?.parts?.[0]?.text || '{}');
      return NextResponse.json({
        options: Array.isArray(parsed.options) && parsed.options.length === 3 ? parsed.options : fallbackOptions,
        botVoteIndex: typeof parsed.botVoteIndex === 'number' ? parsed.botVoteIndex : 0,
      });
    }

    return NextResponse.json({ error: 'Invalid action' }, { status: 400 });
  } catch {
    return NextResponse.json({ error: 'AI engine error' }, { status: 500 });
  }
}
