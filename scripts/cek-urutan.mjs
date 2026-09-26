// Skrip verifikasi sortir (node --experimental-strip-types scripts/cek-urutan.mjs).
// Menguji logika murni src/services/urutan.ts: pindah via drop, geser keyboard,
// tukar slot antar-tipe, validasi daftar, dan normalisasi NULL.
import { geserSatuLangkah, hitungUrutanBaru, hitungUrutanTersimpan } from '../src/services/urutan.ts';

let gagal = 0;
function cek(nama, dapat, harap) {
  const teks = JSON.stringify(dapat);
  const ok = teks === JSON.stringify(harap);
  if (!ok) gagal += 1;
  console.log(`${ok ? 'OK  ' : 'FAIL'} ${nama} = ${teks}${ok ? '' : ` (harap: ${JSON.stringify(harap)})`}`);
}
function cekLempar(nama, fn) {
  let lempar = false;
  try { fn(); } catch { lempar = true; }
  if (!lempar) gagal += 1;
  console.log(`${lempar ? 'OK  ' : 'FAIL'} ${nama} (melempar: ${lempar})`);
}

console.log('--- hitungUrutanBaru ---');
cek('pindah ke atas', hitungUrutanBaru(['a', 'b', 'c'], 'c', 'a', 'atas'), ['c', 'a', 'b']);
cek('pindah ke bawah', hitungUrutanBaru(['a', 'b', 'c'], 'a', 'c', 'bawah'), ['b', 'c', 'a']);
cek('jatuh di diri sendiri', hitungUrutanBaru(['a', 'b', 'c'], 'b', 'b', 'atas'), null);
cek('geser semu (bawah lalu atas)', hitungUrutanBaru(['a', 'b', 'c'], 'a', 'b', 'atas'), null);
cek('id diseret tak dikenal', hitungUrutanBaru(['a', 'b'], 'x', 'a', 'atas'), null);
cek('id target tak dikenal', hitungUrutanBaru(['a', 'b'], 'a', 'x', 'bawah'), null);
cek('daftar tidak dimutasi', (() => { const d = ['a', 'b']; hitungUrutanBaru(d, 'b', 'a', 'atas'); return d; })(), ['a', 'b']);

console.log('\n--- geserSatuLangkah ---');
cek('naik', geserSatuLangkah(['a', 'b', 'c'], 'b', 'naik'), ['b', 'a', 'c']);
cek('turun', geserSatuLangkah(['a', 'b', 'c'], 'b', 'turun'), ['a', 'c', 'b']);
cek('mentok atas', geserSatuLangkah(['a', 'b'], 'a', 'naik'), null);
cek('mentok bawah', geserSatuLangkah(['a', 'b'], 'b', 'turun'), null);
cek('id tak dikenal', geserSatuLangkah(['a'], 'x', 'naik'), null);

console.log('\n--- hitungUrutanTersimpan ---');
// Proyek campuran: pg × uraian selang-seling. User membalik urutan pg saja.
const campur = [
  { id: 'p1', tipe: 'pilihan_ganda', urutan: 1 },
  { id: 'u1', tipe: 'uraian', urutan: 2 },
  { id: 'p2', tipe: 'pilihan_ganda', urutan: 3 },
  { id: 'u2', tipe: 'uraian', urutan: 4 },
];
const m1 = hitungUrutanTersimpan(campur, 'pilihan_ganda', ['p2', 'p1']);
cek('pg bertukar slot', [m1.get('p1'), m1.get('p2')], [3, 1]);
cek('uraian tidak bergeser', [m1.get('u1'), m1.get('u2')], [2, 4]);

// Baris lama tanpa urutan (NULL) ikut dirapikan jadi 1..N.
const ada = [
  { id: 'p1', tipe: 'pilihan_ganda', urutan: null },
  { id: 'p2', tipe: 'pilihan_ganda', urutan: 7 },
  { id: 'u1', tipe: 'uraian', urutan: null },
];
const m2 = hitungUrutanTersimpan(ada, 'pilihan_ganda', ['p1', 'p2']);
cek('NULL dirapikan berdasar posisi tampil', [m2.get('p1'), m2.get('p2'), m2.get('u1')], [1, 2, 3]);

// Daftar tidak cocok -> lempar agar repo membatalkan transaksi.
cekLempar('id asing ditolak', () => hitungUrutanTersimpan(campur, 'pilihan_ganda', ['p2', 'asing']));
cekLempar('jumlah kurang ditolak', () => hitungUrutanTersimpan(campur, 'pilihan_ganda', ['p2']));
cekLempar('duplikat ditolak', () => hitungUrutanTersimpan(campur, 'pilihan_ganda', ['p2', 'p2']));

console.log(gagal === 0 ? '\nSemua uji urutan lulus.' : `\n${gagal} uji gagal.`);
process.exitCode = gagal === 0 ? 0 : 1;
