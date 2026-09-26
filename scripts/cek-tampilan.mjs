// Skrip verifikasi tampilan ringkas/detail (node --experimental-strip-types scripts/cek-tampilan.mjs).
// Menguji logika murni src/services/tampilanSoal.ts: default ringkas saat buka,
// detail untuk soal baru sesi ini, override manual menang, toggle bolak-balik,
// targetModeMassal (tombol ringkas/buka semua), dan barisPertama.
import { barisPertama, modeKartu, targetModeMassal, toggleMode } from '../src/services/tampilanSoal.ts';

const WAKTU_BUKA = '2026-09-26T10:00:00.000Z';
let gagal = 0;
function cek(nama, dapat, harap) {
  const teks = JSON.stringify(dapat);
  const ok = teks === JSON.stringify(harap);
  if (!ok) gagal += 1;
  console.log(`${ok ? 'OK  ' : 'FAIL'} ${nama} = ${teks}${ok ? '' : ` (harap: ${JSON.stringify(harap)})`}`);
}

console.log('--- modeKartu ---');
cek('soal lama = ringkas', modeKartu('2026-09-26T09:00:00.000Z', WAKTU_BUKA), 'ringkas');
cek('soal sama waktu buka = ringkas', modeKartu(WAKTU_BUKA, WAKTU_BUKA), 'ringkas');
cek('soal baru sesi = detail', modeKartu('2026-09-26T10:05:00.000Z', WAKTU_BUKA), 'detail');
cek('dibuat null = ringkas', modeKartu(null, WAKTU_BUKA), 'ringkas');
cek('dibuat undefined = ringkas', modeKartu(undefined, WAKTU_BUKA), 'ringkas');
cek('manual detail menang atas soal lama', modeKartu('2026-09-26T09:00:00.000Z', WAKTU_BUKA, 'detail'), 'detail');
cek('manual ringkas menang atas soal baru', modeKartu('2026-09-26T10:05:00.000Z', WAKTU_BUKA, 'ringkas'), 'ringkas');

console.log('\n--- toggleMode ---');
cek('ringkas -> detail', toggleMode('ringkas'), 'detail');
cek('detail -> ringkas', toggleMode('detail'), 'ringkas');

console.log('\n--- targetModeMassal ---');
cek('semua ringkas -> buka (detail)', targetModeMassal(['ringkas', 'ringkas', 'ringkas']), 'detail');
cek('satu detail -> ringkas semua', targetModeMassal(['ringkas', 'detail', 'ringkas']), 'ringkas');
cek('semua detail -> ringkas semua', targetModeMassal(['detail', 'detail']), 'ringkas');
cek('satu kartu ringkas -> buka', targetModeMassal(['ringkas']), 'detail');
cek('satu kartu detail -> ringkas', targetModeMassal(['detail']), 'ringkas');
cek('list kosong -> ringkas (aman)', targetModeMassal([]), 'ringkas');

console.log('\n--- barisPertama ---');
cek('satu baris tetap', barisPertama('Apa ibu kota Prancis?'), 'Apa ibu kota Prancis?');
cek('multibaris dipotong di \\n', barisPertama('Baris satu\nBaris dua\nBaris tiga'), 'Baris satu');
cek('spasi tepi dipangkas', barisPertama('  Judul soal  \nlanjutan'), 'Judul soal');
cek('teks kosong', barisPertama(''), '');
cek('baris pertama kosong', barisPertama('\nisi setelah newline'), '');

console.log(gagal === 0 ? '\nSemua uji tampilan lulus.' : `\n${gagal} uji gagal.`);
process.exitCode = gagal === 0 ? 0 : 1;
