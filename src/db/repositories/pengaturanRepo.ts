// src/db/repositories/pengaturanRepo.ts
// API key + model TETAP di localStorage (keputusan user), repo ini hanya helper.
import { DAFTAR_MODEL, MODEL_DEFAULT_ID } from '../../config/models';

const KUNCI_API = 'gemini_api_key';
const KUNCI_MODEL = 'gemini_model_choice';
const KUNCI_PROYEK_TERAKHIR = 'crate_quiz_proyek_terakhir';

export function bacaApiKey(): string {
  return localStorage.getItem(KUNCI_API) ?? '';
}

export function simpanApiKey(apiKey: string, modelId: string): void {
  localStorage.setItem(KUNCI_API, apiKey.trim());
  localStorage.setItem(KUNCI_MODEL, modelId);
}

export function bacaModelId(): string {
  const tersimpan = localStorage.getItem(KUNCI_MODEL);
  if (tersimpan && DAFTAR_MODEL.some((m) => m.id === tersimpan)) return tersimpan;
  return MODEL_DEFAULT_ID;
}

export function bacaProyekTerakhir(): string | null {
  return localStorage.getItem(KUNCI_PROYEK_TERAKHIR);
}

export function simpanProyekTerakhir(id: string | null): void {
  if (id) localStorage.setItem(KUNCI_PROYEK_TERAKHIR, id);
  else localStorage.removeItem(KUNCI_PROYEK_TERAKHIR);
}
