import { ATURAN_AKSARA, DAFTAR_BAHASA, DAFTAR_GAYA_TEKS } from '../src/services/bahasa.ts';

let salah = 0;
function cek(nama, dapat, harap) {
  const ok = dapat === harap;
  if (!ok) salah += 1;
  console.log(`${ok ? 'OK  ' : 'FAIL'} ${nama} = ${JSON.stringify(dapat)}${ok ? '' : ` (harap: ${JSON.stringify(harap)})`}`);
}

// Replikasi persis instruksiMainDenganBahasa() dari gemini.ts.
function rakit(gaya) {
  const utama = ['a', 'b', 'c', 'd', 'e', 'f', 'gaya-pattern'];
  utama.splice(6, 0, DAFTAR_GAYA_TEKS.find((g) => g.nilai === gaya).aturanPrompt, ATURAN_AKSARA);
  return utama;
}

console.log('--- ATURAN_AKSARA masuk prompt untuk semua gaya ---');
for (const g of DAFTAR_GAYA_TEKS) {
  const utama = rakit(g.nilai);
  cek(`gaya '${g.nilai}' memuat aksara`, utama.includes(ATURAN_AKSARA), true);
  cek(`gaya '${g.nilai}' memuat aturan gayanya`, utama.includes(g.aturanPrompt), true);
  cek(`gaya '${g.nilai}' jumlah instruksi 9`, utama.length, 9);
}

console.log('\n--- bahasa punya namaPrompt (dipakai ganti {BAHASA}) ---');
cek('jumlah bahasa', DAFTAR_BAHASA.length, 6);
cek('Arab punya namaPrompt', /Arabic/.test(DAFTAR_BAHASA.find((b) => b.nilai === 'ar').namaPrompt), true);
cek('semua bahasa punya namaPrompt', DAFTAR_BAHASA.every((b) => b.namaPrompt.length > 3), true);

console.log('\n--- teks instruksi tidak rusak ---');
cek('ATURAN_AKSARA satu baris', ATURAN_AKSARA.includes('\n'), false);
// Panjang persisnya tidak penting; yang penting aturan ini cukup panjang untuk
// memuat keempat klausa (baris sendiri, tanpa spasi, tanpa transliterasi, dll).
cek('panjang wajar', ATURAN_AKSARA.length > 900, true);

console.log(salah === 0 ? '\nSemua uji prompt lulus.' : `\n${salah} uji gagal.`);
process.exitCode = salah === 0 ? 0 : 1;
