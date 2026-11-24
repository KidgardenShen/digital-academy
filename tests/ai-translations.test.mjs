import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import 'fake-indexeddb/auto';
import { parseEdition, validateEdition, checkDeliveryTranslations } from '../src/validate.mjs';
import { chapters, chapterNotes } from '../src/reader.mjs';
import { openShelf, importEdition, listEditions } from '../src/storage.mjs';

const load = async name => readFile(new URL('../standards/fixtures/' + name, import.meta.url), 'utf8');
const sample = await load('ai-chapters.json');
const fresh = () => JSON.parse(sample);

test('1.0.0 沿用旧结构，1.1.0 明示 AI 数组，未知版本报错', async () => {
  const old = parseEdition(await load('edition.json'));
  old.ai_translations = [];
  assert.throws(() => validateEdition(old), /ai_translations/);
  const p = fresh();
  delete p.ai_translations;
  assert.throws(() => validateEdition(p), /ai_translations/);
  p.schema_version = '2.0.0';
  assert.throws(() => validateEdition(p), /schema_version/);
});

test('逐章读取今译、显示复核信息，文献正文和注文各自独立', () => {
  const p = parseEdition(sample);
  checkDeliveryTranslations(p);
  const [a, b] = chapters(p);
  assert.deepEqual(a.original.map(u => u.text), ['有疑则问。', '既问，复思其义。']);
  assert.deepEqual(a.translations, []);
  assert.deepEqual(chapterNotes(a).map(n => n.text), ['复，再也。']);
  assert.equal(a.aiTranslation, p.ai_translations[0]);
  assert.equal(b.aiTranslation, p.ai_translations[1]);
  assert.equal(b.aiTranslation.human_review.status, 'pending');
});

const badReferences = [
  ['错章', t => { t.source_units[0].text_id = 'unit-3'; }, /text_id/],
  ['逆序', t => t.source_units.reverse(), /text_id/],
  ['重复', t => { t.source_units[1] = t.source_units[0]; }, /text_id/],
  ['缺段', t => t.source_units.pop(), /source_units/],
  ['来源文字变动', t => { t.source_units[1].source_text += '。'; }, /source_text/],
  ['引用不存在', t => { t.source_units[0].text_id = 'absent'; }, /text_id/],
  ['缺生成来源', t => { delete t.generator.provider; }, /provider/],
  ['译文空白', t => { t.text = ' \n '; }, /text/],
  ['无复核人', t => { t.human_review.status = 'reviewed'; }, /reviewer/],
  ['待核却填复核人', t => { t.human_review.reviewer = '甲'; }, /reviewer/],
];
for (const [label, mutate, error] of badReferences) {
  test('拒绝' + label, () => {
    const p = fresh();
    mutate(p.ai_translations[0]);
    assert.throws(() => validateEdition(p), error);
  });
}

test('每章至多一条，材料已有的译文不能替代新格式的 AI 今译', () => {
  const p = fresh();
  p.ai_translations.push(p.ai_translations[0]);
  assert.throws(() => validateEdition(p), /同章/);
  p.ai_translations = [];
  p.layers.push({ ...p.layers[0], layer_type: 'translation', layer_id: 'tr' });
  p.text_units.push({ ...p.text_units[0], role: 'translation', layer_id: 'tr', text_id: 'tr1' });
  validateEdition(p);
  assert.throws(() => checkDeliveryTranslations(p), /缺少同章今译/);
});

test('篇首经文、无经文小节、AI 来源型号未知', () => {
  const p = fresh();
  p.text_units[2].section_id = null;
  const translation = p.ai_translations[1];
  translation.section_id = null;
  translation.generator.model = null;
  const chapter = chapters(validateEdition(p))[0];
  assert.equal(chapter.id, null);
  assert.equal(chapter.aiTranslation, translation);
  checkDeliveryTranslations(p);
});

test('草稿和退修可保存，展示与交付受状态约束', () => {
  for (const status of ['draft', 'needs_revision', 'reviewed']) {
    const p = fresh();
    const t = p.ai_translations[0];
    if (status === 'draft') t.generation_status = 'draft';
    else t.human_review = { status, reviewer: '合成测试人' };
    validateEdition(p);
    if (status === 'reviewed') {
      assert.equal(chapters(p)[0].aiTranslation, t);
      checkDeliveryTranslations(p);
    } else {
      assert.equal(chapters(p)[0].aiTranslation, undefined);
      assert.throws(() => checkDeliveryTranslations(p), /ai_translations/);
    }
  }
});

test('AI 记录不能占用注文或经文结构，引用不能落到 AI 记录', () => {
  for (const field of ['annotations', 'text_units']) {
    const p = fresh();
    p[field].push(p.ai_translations[0]);
    assert.throws(() => validateEdition(p), new RegExp(field));
  }
  const p = fresh();
  p.display_groups[0].entries[0].annotation_id = 'ai_translations/0';
  assert.throws(() => validateEdition(p), /annotation_id/);
});

test('1.1.0 导入保存完整记录，改译同键冲突，新修订并存', async () => {
  const db = await openShelf('ai-translations');
  try {
    const p = fresh();
    assert.equal(await importEdition(db, p), 'added');
    assert.deepEqual(await listEditions(db), [p]);
    p.ai_translations[0].text += '修。';
    await assert.rejects(importEdition(db, p), /修订号/);
    p.data_version = '1.0.1';
    assert.equal(await importEdition(db, p), 'added');
    assert.equal((await listEditions(db)).length, 2);
  } finally { db.close(); }
});
