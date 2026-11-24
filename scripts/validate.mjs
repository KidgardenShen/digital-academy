import { readFile } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import { validateWork } from '../src/alignment.mjs';
import { validateEdition, checkDeliveryTranslations } from '../src/validate.mjs';

const args = process.argv.slice(2);
const forDelivery = args[0] === '--for-delivery';
const files = forDelivery ? args.slice(1) : args;
if (!files.length) {
  console.error('用法：node scripts/validate.mjs [--for-delivery] <注本.json> [...]');
  process.exitCode = 2;
}
for (const file of files) {
  try {
    const data = JSON.parse((await readFile(file, 'utf8')).replace(/^\uFEFF/u, ''));
    if (data?.canonical_structure) {
      validateWork(data);
      console.log(file, '✓ 经典定位', data.work_id, data.locator_version);
      continue;
    }
    let work;
    if (data?.schema_version === '1.2.0') {
      const id = data.work?.work_id;
      if (typeof id !== 'string' || !/^[a-z0-9][a-z0-9-]*$/u.test(id)) throw new Error('work_id 格式有误');
      work = JSON.parse((await readFile(join(dirname(file), id + '__canonical.json'), 'utf8')).replace(/^\uFEFF/u, ''));
    }
    const pkg = validateEdition(data, work);
    if (forDelivery) checkDeliveryTranslations(pkg);
    console.log(file, '✓', pkg.work.title, pkg.edition.display_name,
      '· 结构', pkg.schema_version, '· 数据修订', pkg.data_version);
  } catch (error) {
    console.error(file, error.message);
    process.exitCode = 1;
  }
}
