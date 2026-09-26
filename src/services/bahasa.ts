// src/services/bahasa.ts
// Daftar bahasa + gaya teks untuk pembuatan soal AI.
//
// Bahasa di sini diteruskan ke prompt sebagai placeholder {BAHASA}, bukan
// diasumsikan model. Driven by user request, dan default ke Bahasa Indonesia
// agar perilaku proyek yang sudah ada tidak berubah.

export interface OpsiBahasa {
  nilai: string;
  label: string;
  // Nama bahasa yang dipakai di dalam kalimat prompt (dalam bahasa Inggris),
  // karena model jauh lebih konsisten mengikuti instruksi berbahasa Inggris.
  namaPrompt: string;
}

export const DAFTAR_BAHASA: OpsiBahasa[] = [
  { nilai: 'id', label: 'Bahasa Indonesia', namaPrompt: 'Bahasa Indonesia' },
  { nilai: 'ar', label: 'Bahasa Arab', namaPrompt: 'Modern Standard Arabic (فصحى)' },
  { nilai: 'en', label: 'Bahasa Inggris', namaPrompt: 'English' },
  { nilai: 'zh', label: 'Mandarin', namaPrompt: 'Mandarin Chinese (简体中文)' },
  { nilai: 'jp', label: 'Jepang', namaPrompt: 'Japanese (日本語)' },
  { nilai: 'id-ar', label: 'Indonesia + Arab (campur)', namaPrompt: 'Bahasa Indonesia for instructions and Modern Standard Arabic (فصحى) for all question content' },
];

export const BAHASA_DEFAULT = 'id';

export function cariBahasa(nilai: string | null | undefined): OpsiBahasa {
  return DAFTAR_BAHASA.find((b) => b.nilai === nilai) ?? DAFTAR_BAHASA[0];
}

export interface OpsiGayaTeks {
  nilai: string;
  label: string;
  // Aturan tambahan yang disisipkan ke prompt. Sengaja terpisah dari label supaya
  // teks prompt bisa diubah tanpa menyentuh kode.
  aturanPrompt: string;
}

export const DAFTAR_GAYA_TEKS: OpsiGayaTeks[] = [
  {
    nilai: 'ringkas',
    label: 'Ringkas (default)',
    aturanPrompt:
      'Write each question stem as a SINGLE line. Answers must be short and concise. Do not use line breaks, bullet points, or numbered sub-steps inside the question text or the options.',
  },
  {
    nilai: 'struktur',
    label: 'Struktur (multibaris)',
    aturanPrompt:
      'You MAY and SHOULD use line breaks to improve readability. Structure longer content with line breaks: put each condition, given, or data row of a problem on its OWN line. Never use literal "\\\\n" characters — insert a real newline character. Keep multiple-choice option texts short and on one line each, but do use line breaks for the question stem of essay, reasoning, and project types.',
  },
];

// Aturan aksara — berlaku di SEMUA gaya teks, bukan hanya gaya 'struktur'.
// Alasannya: ini soal ketepatan tipografi (apa yang terjadi saat dua sistem
// tulisan bercampur), bukan soal panjang atau pendek. Aturan gaya 'ringkas'
// tetap governs keseluruhan soal; aturan ini hanya memisahkan kutipan aksara
// asing ke barisnya sendiri.
export const ATURAN_AKSARA =
  'SCRIPT AND TYPESETTING RULE: If the question content contains a passage written in a script that DIFFERS from the main language of the question — for example an Arabic quotation of the Qur\'an inside an Indonesian question, or a Chinese or Latin phrase quoted inside an Arabic question — you MUST place that entire passage on its OWN line, separated from the surrounding sentence. Never splice a foreign-script passage into the middle of a sentence written in the main language, and never mix two scripts inside a single line unless the foreign fragment is a single word or a number. CRITICAL FORMAT DETAIL: the foreign-script line must NOT begin with any leading spaces, tabs, bullet characters, or padding whitespace. Start that line directly with the first character of the quoted passage. The display layer applies indentation automatically, so any manual padding you add will result in a visibly broken double-indent. When quoting, preserve the original script, harakat (diacritics), and Arabic-Indic digits exactly as they appear in the source material — do not transliterate, romanize, or translate them.';

export const GAYA_TEKS_DEFAULT = 'ringkas';

export function cariGayaTeks(nilai: string | null | undefined): OpsiGayaTeks {
  return DAFTAR_GAYA_TEKS.find((g) => g.nilai === nilai) ?? DAFTAR_GAYA_TEKS[0];
}
