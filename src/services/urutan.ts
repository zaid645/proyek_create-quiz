// src/services/urutan.ts
// Logika murni untuk drag & drop sortir soal — sengaja dipisah dari komponen
// supaya bisa diuji tanpa DOM (lihat scripts/cek-urutan.mjs).
//
// Latar desain: `urutan` unik se-proyek (tab "Semua" menampilkan semua tipe
// bercampur, diurut kolom ini). Karena itu kita TIDAK menomori ulang 1..n per
// tipe — nomor itu akan bertabrakan dengan tipe lain. Sebagai gantinya sortir
// menukar "slot": tipe yang disortir menempati slot-slots miliknya sendiri,
// tipe lain tidak bergeser tampilan.

export type PosisiLepas = 'atas' | 'bawah';

export type BarisUrutan = {
  id: string;
  tipe: string;
  urutan: number | null;
};

function samaUrut(a: readonly string[], b: readonly string[]): boolean {
  return a.length === b.length && a.every((v, i) => v === b[i]);
}

/**
 * Geser `idDiseret` ke `posisi` relatif terhadap `idTarget`.
 * Mengembalikan daftar id baru, atau null bila tidak ada perubahan
 * (jatuh di tempat sendiri / id tidak dikenal).
 */
export function hitungUrutanBaru(
  idUrut: readonly string[],
  idDiseret: string,
  idTarget: string,
  posisi: PosisiLepas,
): string[] | null {
  if (idDiseret === idTarget) return null;
  if (idUrut.indexOf(idDiseret) < 0 || idUrut.indexOf(idTarget) < 0) return null;
  const tanpa = idUrut.filter((id) => id !== idDiseret);
  const idxTarget = tanpa.indexOf(idTarget);
  if (idxTarget < 0) return null;
  const sisip = posisi === 'atas' ? idxTarget : idxTarget + 1;
  const hasil = [...tanpa.slice(0, sisip), idDiseret, ...tanpa.slice(sisip)];
  return samaUrut(hasil, idUrut) ? null : hasil;
}

/**
 * Geser satu langkah (jalur keyboard Alt+↑ / Alt+↓).
 * Mengembalikan daftar id baru, atau null bila sudah mentok / id tak dikenal.
 */
export function geserSatuLangkah(
  idUrut: readonly string[],
  id: string,
  arah: 'naik' | 'turun',
): string[] | null {
  const i = idUrut.indexOf(id);
  if (i < 0) return null;
  const j = arah === 'naik' ? i - 1 : i + 1;
  if (j < 0 || j >= idUrut.length) return null;
  const hasil = [...idUrut];
  hasil[i] = hasil[j];
  hasil[j] = id;
  return samaUrut(hasil, idUrut) ? null : hasil;
}

/**
 * Inti penyimpanan urutan (murni, tanpa DB) — dipakai `simpanUrutanTipe`.
 *
 * `urutanGlobal`: SELURUH soal satu proyek dalam urutan tampil saat ini
 * (indeks 0 = nomor 1). `idUrutBaru`: id soal milik `tipe` dalam urutan
 * yang diinginkan user.
 *
 * Hasilnya peta id -> nomor `urutan` baru:
 * - seluruh daftar "dirapikan" jadi 1..N mengikuti urutan tampil saat ini
 *   (paritas `rapikanUrutan()` program lama), sehingga baris lama tanpa
 *   `urutan` (NULL) ikut dinormalisasi;
 * - id milik `tipe` ditempatkan ke SLOT milik tipe tersebut (posisi yang
 *   ditempati tipe itu di daftar global), jadi tipe lain tampil tetap sama.
 *
 * Melempar Error bila `idUrutBaru` tidak cocok dengan isi DB (id asing,
 * kurang, atau duplikat) — pemanggil sebaiknya membatalkannya.
 */
export function hitungUrutanTersimpan(
  urutanGlobal: readonly BarisUrutan[],
  tipe: string,
  idUrutBaru: readonly string[],
): Map<string, number> {
  const slotTipe: number[] = [];
  for (let i = 0; i < urutanGlobal.length; i++) {
    if (urutanGlobal[i].tipe === tipe) slotTipe.push(i);
  }
  const sah = new Set(slotTipe.map((i) => urutanGlobal[i].id));
  const bersih = idUrutBaru.filter((id) => sah.has(id));
  if (bersih.length !== slotTipe.length || new Set(bersih).size !== bersih.length) {
    throw new Error('Daftar urutan tidak cocok dengan soal di database.');
  }
  const peta = new Map<string, number>();
  for (let i = 0; i < urutanGlobal.length; i++) peta.set(urutanGlobal[i].id, i + 1);
  for (let k = 0; k < slotTipe.length; k++) peta.set(bersih[k], slotTipe[k] + 1);
  return peta;
}
