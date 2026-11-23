import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import 'fake-indexeddb/auto';
import { parseEdition, validateEdition, checkDeliveryTranslations } from '../src/validate.mjs';
import { openShelf, importEdition, listEditions } from '../src/storage.mjs';
import { chapters, chapterNotes, aligned, segments, authorSections, references } from '../src/reader.mjs';

const sample = await readFile(new URL('../standards/fixtures/edition.json', import.meta.url), 'utf8');
const fixture = () => JSON.parse(sample);

test('交付要求各经文章节有非空今译，旧包可照常导入', () => {
  const p = parseEdition(sample);
  checkDeliveryTranslations(p);
  const t = p.text_units.find(u => u.text_id === 'tr2');
  t.section_id = 'c1';
  assert.throws(() => checkDeliveryTranslations(p), /c2 的经文缺少同章今译/);
  t.section_id = 'c2';
  t.text = ' ';
  assert.throws(() => checkDeliveryTranslations(p), /今译正文为空/);
  t.text = '戊与己。';
  t.layer_id = 'base';
  assert.throws(() => checkDeliveryTranslations(p), /今译应关联今译层/);
  p.text_units = p.text_units.filter(u => u.role !== 'translation');
  assert.doesNotThrow(() => validateEdition(p));
});

test('全章按注家分节、缺署名沿用注本作者，跨句长注仅出现一次', () => {
  const p = fixture();
  p.annotations[0].author.name = '';
  p.annotations[1].author = { name: '乙', period: '宋' };
  const sections = authorSections(p, chapters(p)[0]);
  assert.deepEqual([...sections.keys()], ['测试者', '宋 · 乙']);
  assert.deepEqual([...sections.values()].map(notes => notes.map(n => n.annotation_id)), [['a'], ['b']]);
});

test('出处取所关联文献，文字出处可独立显示', () => {
  const p = fixture();
  p.sources = [{source_id: 'other', source_title: '其他书', url: 'https://example.org/other', locator: {}},
    {source_id: 'base', source_title: '底本', url: 'https://example.org/base', locator: {}}];
  p.text_units[0].source_id = 'base';
  p.text_units[0].source_locator = { page: '第七页' };
  assert.deepEqual(references(p, [p.text_units[0]]), [{ title: '底本', url: 'https://example.org/base', detail: '第七页' }]);
  assert.deepEqual(references(p, [], p.edition.source_title), [{ title: '合成样例', url: '', detail: '' }]);
});

test('带 BOM 文件、结构错误路径与无正文处理', () => {
  assert.equal(parseEdition('\uFEFF' + sample).edition.edition_id, 'sample-a');
  assert.throws(() => parseEdition('{'), /解析失败/);
  const p = fixture();
  delete p.edition.author;
  assert.throws(() => validateEdition(p), /\/edition\/author/);
  p.edition = fixture().edition;
  p.text_units = [];
  assert.throws(() => validateEdition(p), /缺少可阅读原文/);
});

test('精确 UTF-16 定位及出现次数', () => {
  const p = fixture();
  const a = p.display_groups[0].anchors[0];
  a.occurrence = 1;
  assert.throws(() => validateEdition(p), /occurrence/);
  a.occurrence = 2;
  a.start_offset = 4;
  assert.throws(() => validateEdition(p), /UTF-16/);
});

test('引用、层级和组内次序校验', () => {
  const p = fixture();
  p.display_groups[0].entries[0].target_ref_id = 'absent';
  assert.throws(() => validateEdition(p), /target_ref_id/);
  p.display_groups[0].entries[0].target_ref_id = 'r';
  p.display_groups[0].entries[0].display_order = 1;
  assert.throws(() => validateEdition(p), /次序重复/);
  p.structure.sections[0].parent_section_id = 'c1';
  assert.throws(() => validateEdition(p), /层级循环/);
});

test('跨句、同文复现及重叠锚点，组序与条目次序独立', () => {
  const p = fixture();
  p.display_groups[0].anchors.push({ ...p.display_groups[0].anchors[0] });
  const [c1, c2] = chapters(validateEdition(p));
  const pieces = segments(c1.original[0], [c1]);
  assert.deepEqual(pieces.map(s => s.text), ['甲乙。𠀀', '甲乙。', '丙丁。']);
  assert.deepEqual(pieces.map(s => s.hits.map(h => h.group.display_group_id)), [[], ['ordered', 'across'], ['across']]);
  assert.deepEqual(pieces[1].hits[0].entries.map(e => e.note.annotation_id), ['a', 'b']);
  assert.deepEqual(chapterNotes(c1).map(n => n.annotation_id), ['a', 'b']);
  assert.deepEqual(chapterNotes(c2), []);
});

test('章级长注只列一次并可在无正文小节查看', () => {
  const p = fixture();
  const g = p.display_groups[1];
  Object.assign(g, { anchor_mode: 'section', anchors: [], section_id: 'c2' });
  p.text_units = p.text_units.filter(u => u.section_id !== 'c2');
  const c = chapters(validateEdition(p))[1];
  assert.deepEqual(c.original, []);
  assert.deepEqual(chapterNotes(c).map(n => n.annotation_id), ['a']);
});

test('同章原文相同才可叠加对读，版本次序保留', () => {
  const a = fixture(), b = fixture();
  b.edition.edition_id = 'sample-b';
  const ca = chapters(a)[0], cb = chapters(b)[0];
  assert.ok(aligned(ca, cb));
  assert.deepEqual(segments(ca.original[0], [cb, ca])[1].hits.map(h => h.pkg.edition.edition_id),
    ['sample-b', 'sample-b', 'sample-a', 'sample-a']);
  const mismatch = fixture();
  mismatch.text_units[0].text += '异';
  assert.equal(aligned(ca, chapters(mismatch)[0]), false);
});

test('空架、并发去重、失败回滚、修订并存及重新打开', async () => {
  const db = await openShelf('regression');
  try {
    assert.deepEqual(await listEditions(db), []);
    const p = fixture();
    assert.deepEqual((await Promise.all([importEdition(db, p), importEdition(db, p)])).sort(), ['added', 'existing']);
    const reordered = Object.fromEntries(Object.entries(p).reverse());
    assert.equal(await importEdition(db, reordered), 'existing');
    p.annotations[0].text += '修';
    await assert.rejects(importEdition(db, p), /修订号/);
    p.data_version = '1.0.1';
    await importEdition(db, p);
    p.data_version = '1.0.2';
    p.work.title = '同标识异书名';
    await assert.rejects(importEdition(db, p), /书名/);
    p.display_groups[0].entries[0].annotation_id = 'bad';
    await assert.rejects(importEdition(db, p), /找不到引用/);
    const saved = await listEditions(db);
    assert.deepEqual(saved.map(s => s.data_version), ['1.0.0', '1.0.1']);
    assert.notEqual(saved[0].annotations[0].text, saved[1].annotations[0].text);
  } finally { db.close(); }
  const again = await openShelf('regression');
  assert.equal((await listEditions(again)).length, 2);
  again.close();
});
