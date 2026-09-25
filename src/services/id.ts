// src/services/id.ts — ID unik berprefix (port logika lama: pg-/ur-/nl-/pr-).
let counter = 0;

export function buatId(prefix: string): string {
  counter += 1;
  const pendek = { pilihan_ganda: 'pg', uraian: 'ur', penalaran: 'nl', proyek: 'pr' }[prefix] ?? prefix;
  return `${pendek}-${Date.now().toString(36)}${counter.toString(36)}${Math.floor(Math.random() * 1000)}`;
}
