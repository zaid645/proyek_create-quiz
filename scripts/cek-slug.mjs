// Skrip verifikasi cepat (dijalankan manual via node, bukan bagian dari build).
// Menguji slug(), normalisasiBaris(), dan esc() tanpa butuh browser.
import { slug } from '../src/services/exportImport.ts';

// Salinan logika dari src/services/gemini.ts agar bisa diuji tanpa TS toolchain.
function normalisasiBaris(v) {
  return v.replace(/\r\n?/g, '\n').replace(/\\n/g, '\n');
}

// Salinan logika dari src/services/exportDoc.ts (esc() tidak di-export).
function esc(v) {
  return String(v ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/\r\n?/g, '\n')
    .replace(/\n/g, '<br />');
}

let gagal = 0;
function cek(nama, dapat, harap) {
  const ok = dapat === harap;
  if (!ok) gagal += 1;
  console.log(`${ok ? 'OK  ' : 'FAIL'} ${nama} = ${JSON.stringify(dapat)}${ok ? '' : ` (harap: ${JSON.stringify(harap)})`}`);
}

console.log('--- slug ---');
cek('slug("Ujian Ganjil IPA")', slug('Ujian Ganjil IPA'), 'ujian_ganjil_ipa');
cek('slug("  ")', slug('  '), 'ujian');
cek('slug("")', slug(''), 'ujian');
cek('slug("مشروع العلوم")', slug('مشروع العلوم'), 'msyrwa_alalwm');
cek('slug("أحمد محمد")', slug('أحمد محمد'), 'ahmd_mhmd');
cek('slug("اختبار ١٢٣")', slug('اختبار ١٢٣'), 'akhtbar_123');
cek('slug("Ujian Árabe-Test")', slug('Ujian Árabe-Test'), 'ujian_rabe_test');

console.log('\n--- normalisasiBaris ---');
// JSON.parse mengubah "\\n" (literal) menjadi "\" + "n" -> harus jadi newline asli.
cek('literal \\n dari model', normalisasiBaris('Syarat:\\n1) xyz\\n2) abc'), 'Syarat:\n1) xyz\n2) abc');
cek('line ending Windows', normalisasiBaris('a\r\nb\rc'), 'a\nb\nc');
cek('tanpa perubahan', normalisasiBaris('satu baris'), 'satu baris');
cek('berbaris sudah benar', normalisasiBaris('a\nb'), 'a\nb');
cek('bahasa Arab utuh', normalisasiBaris('السؤال\nما هوmatter؟'), 'السؤال\nما هوmatter؟');

console.log('\n--- esc() untuk ekspor .doc ---');
cek('baris jadi <br />', esc('a\nb'), 'a<br />b');
cek('XSS di-escape', esc('<script>'), '&lt;script&gt;');
cek('ampersand lalu baris', esc('A & B\nC'), 'A &amp; B<br />C');
cek('tag <br /> tidak jadi &lt;br /&gt;', esc('a\nb').includes('&lt;br'), false);
cek('CRLF jadi satu <br />', esc('a\r\nb'), 'a<br />b');
cek('null/undefined aman', esc(undefined), '');
cek('angka Arab aman', esc('١٢٣'), '١٢٣');

console.log(gagal === 0 ? '\nSemua uji lulus.' : `\n${gagal} uji gagal.`);
process.exitCode = gagal === 0 ? 0 : 1;
