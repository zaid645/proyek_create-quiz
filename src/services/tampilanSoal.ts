// src/services/tampilanSoal.ts
// Logika murni untuk mode tampilan kartu soal: 'ringkas' vs 'detail'.
// Status hanya disimpan di RAM (tidak menyentuh skema DB).

export type ModeKartu = 'ringkas' | 'detail';

/**
 * Tentukan mode awal sebuah kartu berdasarkan waktu pembuatannya.
 * - Saat halaman dibuka, semua soal lama (dibuat_pada <= waktuBukaSesi)
 *   dimulai dalam status RINGKAS (agar daftar ramping dan mudah disortir).
 * - Soal yang BARU dibuat dalam sesi ini (dibuat_pada > waktuBukaSesi)
 *   dimulai dalam status DETAIL (supaya pembuat langsung melihat isinya).
 * - Jika `manual` terdefinisi (user pernah klik tombol nomor), pilihan manual
 *   selalu menang atas default apa pun.
 */
export function modeKartu(
  dibuatPada: string | null | undefined,
  waktuBukaSesi: string,
  manual?: ModeKartu,
): ModeKartu {
  if (manual) return manual;
  if (!dibuatPada) return 'ringkas';
  return dibuatPada > waktuBukaSesi ? 'detail' : 'ringkas';
}

/**
 * Membalik status ringkas <-> detail saat tombol nomor diklik.
 */
export function toggleMode(sekarang: ModeKartu): ModeKartu {
  return sekarang === 'ringkas' ? 'detail' : 'ringkas';
}

/**
 * Target mode untuk tombol massal "ringkas/buka semua".
 * - Jika SEMUA kartu sedang ringkas → target 'detail' (buka semua).
 * - Jika ADA SATU SAJA yang detail → target 'ringkas' (ringkas semua).
 */
export function targetModeMassal(modeAktif: ModeKartu[]): ModeKartu {
  return modeAktif.length > 0 && modeAktif.every((m) => m === 'ringkas') ? 'detail' : 'ringkas';
}

/**
 * Ambil HANYA baris pertama teks soal untuk mode ringkas.
 * CSS `truncate` saja tidak cukup: teks multibaris (`\n`) akan menciut jadi
 * spasi dan baris-baris lanjutan ikut tampil terpotong. Potong eksplisit di
 * `\n` pertama (plus trim) supaya kartu ringkas benar-benar satu baris.
 */
export function barisPertama(teks: string): string {
  return teks.split('\n')[0].trim();
}
