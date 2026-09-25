// Helper kecil agar GeneratorPanel tidak mengimpor repo pengaturan langsung.
import { bacaApiKey, bacaModelId } from '../../db/repositories/pengaturanRepo';
import { cariModel } from '../../config/models';

export { bacaApiKey, bacaModelId };
export function cariModelDariId(id: string): string {
  return cariModel(id).stringModel;
}
