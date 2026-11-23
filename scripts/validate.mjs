import { readFile } from 'node:fs/promises';
import { parseEdition, checkDeliveryTranslations } from '../src/validate.mjs';

const args = process.argv.slice(2);
const forDelivery = args[0] === '--for-delivery';
const files = forDelivery ? args.slice(1) : args;
if (!files.length) {
  console.error('用法：node scripts/validate.mjs [--for-delivery] <注本.json> [...]');
  process.exitCode = 2;
}
for (const file of files) {
  try {
    const pkg = parseEdition(await readFile(file, 'utf8'));
    if (forDelivery) checkDeliveryTranslations(pkg);
    console.log(file, '✓', pkg.work.title, pkg.edition.display_name,
      '· 结构', pkg.schema_version, '· 数据修订', pkg.data_version);
  } catch (error) {
    console.error(file, error.message);
    process.exitCode = 1;
  }
}
