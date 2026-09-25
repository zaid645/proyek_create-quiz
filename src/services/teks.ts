// src/services/teks.ts
// Satu sumber untuk properties teks multibaris + arah tulisan otomatis.
//
// Dua masalah yang solved di sini:
// 1. Multibaris — React meratakan "\n" jadi spasi secara default, jadi teks apa
//    pun yang disimpan dengan baris baru akan tampil sebagai satu baris. Pakai
//    "whitespace-pre-wrap" supaya baris baru benar-benar dirender (leading space
//    di tiap baris tetap dipertahankan, indentasi dari model AI tidak hilang).
// 2. Aksara non-Latin (Arab, Ibrani, dst.) — browser menebak arah baca dari
//    karakter pertama yang "kuat" lewat dir="auto". Dipakai per elemen, bukan
//    di level <html>, supaya teks Indonesia dan Arab bisa hidup berdampingan
//    dalam satu bank soal tanpa perlu mengganti arah dokumen.
//
// Sengaja TIDAK memakai dangerouslySetInnerHTML: teks tetap dirender sebagai teks
// React, sehingga aman dari XSS.
//
export const TEKS_MULTIBARIS = 'whitespace-pre-wrap break-words';

// Properti siap pakai untuk elemen yang hanya berisi teks soal.
export const PROPS_TEKS = {
  className: TEKS_MULTIBARIS,
  dir: 'auto',
} as const;
