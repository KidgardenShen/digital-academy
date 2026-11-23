import Ajv from 'ajv/dist/2020.js';
import addFormats from 'ajv-formats';
import schema from '../standards/edition.schema.json' with { type: 'json' };

const ajv = new Ajv({ ownProperties: true, strict: false });
addFormats(ajv);
const checkShape = ajv.compile(schema);

function fail(path, reason) {
  throw new Error(path + ' · ' + reason);
}

function index(items, field, path) {
  const result = new Map();
  items.forEach((item, i) => {
    const id = item[field];
    if (!id.trim() || result.has(id)) fail(path + '/' + i + '/' + field, '标识为空或重复');
    result.set(id, item);
  });
  return result;
}

function resolve(map, key, path) {
  if (!map.has(key)) fail(path, '找不到引用 ' + key);
  return map.get(key);
}

function checkHierarchy(map, field, path) {
  const done = new Set();
  for (const id of map.keys()) {
    const seen = new Set();
    let at = id;
    while (at !== null && !done.has(at)) {
      if (seen.has(at)) fail(path, '层级循环 ' + at);
      seen.add(at);
      at = resolve(map, at, path)[field];
    }
    for (const key of seen) done.add(key);
  }
}

function checkSpan(text, range, quote, path) {
  const { start_offset: start, end_offset: end } = range;
  const lowSurrogate = /[\uDC00-\uDFFF]/u;
  if (start >= end || end > text.length || lowSurrogate.test(text.charAt(start))
      || lowSurrogate.test(text.charAt(end)) || text.slice(start, end) !== quote) {
    fail(path, 'UTF-16 范围与引文不符');
  }
  if (range.occurrence === undefined) return;
  let occurrence = 1;
  for (let at = text.indexOf(quote); at >= 0 && at < start; at = text.indexOf(quote, at + 1)) occurrence++;
  if (occurrence !== range.occurrence) fail(path + '/occurrence', '引文出现次序不符');
  if (!text.slice(0, start).endsWith(range.context_before)) fail(path + '/context_before', '上文不符');
  if (!text.slice(end).startsWith(range.context_after)) fail(path + '/context_after', '下文不符');
}

function checkAiTranslations(pkg, units, sections) {
  const chapterUnits = new Map();
  for (const unit of pkg.text_units) {
    if (unit.role !== 'classic_text' || !unit.text.trim()) continue;
    if (!chapterUnits.has(unit.section_id)) chapterUnits.set(unit.section_id, []);
    chapterUnits.get(unit.section_id).push(unit);
  }
  const seen = new Set();
  for (const [i, translation] of pkg.ai_translations.entries()) {
    const path = '/ai_translations/' + i;
    const id = translation.section_id;
    if (id !== null) resolve(sections, id, path + '/section_id');
    if (seen.has(id)) fail(path + '/section_id', '同章 AI 今译重复');
    seen.add(id);
    const expected = (chapterUnits.get(id) ?? []).sort((a, b) => a.sequence - b.sequence);
    if (translation.source_units.length !== expected.length) fail(path + '/source_units', '须覆盖本章全部经文单元');
    for (const [j, ref] of translation.source_units.entries()) {
      const p = path + '/source_units/' + j;
      const unit = resolve(units, ref.text_id, p + '/text_id');
      if (unit !== expected[j]) fail(p + '/text_id', '须按底本次序引用本章经文');
      if (unit.text !== ref.source_text) fail(p + '/source_text', '所据原文已变动，请重新核对译文');
    }
  }
}

export function validateEdition(pkg) {
  if (!checkShape(pkg)) {
    const e = checkShape.errors[0];
    const field = e.params.missingProperty ?? e.params.additionalProperty;
    fail((e.instancePath || '') + (field ? '/' + field : '') || '/', 'JSON 结构有误 (' + e.message + ')');
  }
  const sections = index(pkg.structure.sections, 'section_id', '/structure/sections');
  const units = index(pkg.text_units, 'text_id', '/text_units');
  const notes = index(pkg.annotations, 'annotation_id', '/annotations');
  const layers = index(pkg.layers, 'layer_id', '/layers');
  const sources = index(pkg.sources, 'source_id', '/sources');
  index(pkg.display_groups, 'display_group_id', '/display_groups');
  checkHierarchy(sections, 'parent_section_id', '/structure/sections');
  checkHierarchy(layers, 'based_on_layer_id', '/layers');

  if (!pkg.work.title.trim()) fail('/work/title', '书名为空');
  if (!pkg.edition.display_name.trim()) fail('/edition/display_name', '注本名称为空');
  if (!pkg.text_units.some(u => u.role !== 'translation' && u.text.trim())) fail('/text_units', '缺少可阅读原文');

  function checkMetadata(item, path) {
    resolve(layers, item.layer_id, path + '/layer_id');
    if (item.source_id !== null) resolve(sources, item.source_id, path + '/source_id');
  }
  pkg.text_units.forEach((u, i) => {
    const path = '/text_units/' + i;
    checkMetadata(u, path);
    if (u.section_id !== null) resolve(sections, u.section_id, path + '/section_id');
  });
  if (pkg.schema_version === '1.1.0') checkAiTranslations(pkg, units, sections);
  pkg.annotations.forEach((n, i) => {
    const path = '/annotations/' + i;
    checkMetadata(n, path);
    if (!n.text.trim()) fail(path + '/text', '注文为空');
    index(n.target_refs, 'target_ref_id', path + '/target_refs');
    n.target_refs.forEach((target, j) => {
      const p = path + '/target_refs/' + j;
      if (target.target_kind === 'section') resolve(sections, target.section_id, p + '/section_id');
      else if (target.target_kind === 'text_span') {
        checkSpan(resolve(units, target.text_id, p + '/text_id').text, target, target.quoted_text, p);
      } else {
        const other = resolve(notes, target.annotation_id, p + '/annotation_id');
        if (target.target_kind === 'annotation_span') checkSpan(other.text, target, target.quoted_text, p);
      }
    });
  });
  pkg.display_groups.forEach((g, i) => {
    const path = '/display_groups/' + i;
    if (g.anchor_mode === 'section') resolve(sections, g.section_id, path + '/section_id');
    if ((g.anchor_mode === 'inline') !== Boolean(g.anchors.length)) fail(path + '/anchors', '入口与锚点模式不符');
    if (!g.entries.length) fail(path + '/entries', '显示组缺少条目');
    g.anchors.forEach((a, j) => {
      const p = path + '/anchors/' + j;
      const unit = resolve(units, a.text_id, p + '/text_id');
      if (unit.role === 'translation') fail(p + '/text_id', '入口应位于原文');
      checkSpan(unit.text, a, a.anchor_text, p);
    });
    const orders = new Set();
    g.entries.forEach((e, j) => {
      const p = path + '/entries/' + j;
      const note = resolve(notes, e.annotation_id, p + '/annotation_id');
      if (!note.target_refs.some(t => t.target_ref_id === e.target_ref_id)) fail(p + '/target_ref_id', '解释对象不存在');
      if (orders.has(e.display_order)) fail(p + '/display_order', '显示次序重复');
      orders.add(e.display_order);
    });
  });
  return pkg;
}

// Run after ordinary package validation when handing off a new conversion.
export function checkDeliveryTranslations(pkg) {
  const translated = new Set();
  const needed = new Map();
  const layers = new Map(pkg.layers.map(l => [l.layer_id, l.layer_type]));
  for (const [i, unit] of pkg.text_units.entries()) {
    if (unit.role === 'classic_text' && unit.text.trim()) needed.set(unit.section_id, i);
    if (unit.role !== 'translation') continue;
    if (!unit.text.trim()) fail('/text_units/' + i + '/text', '今译正文为空');
    if (layers.get(unit.layer_id) !== 'translation') fail('/text_units/' + i + '/layer_id', '今译应关联今译层');
    if (pkg.schema_version === '1.0.0') translated.add(unit.section_id);
  }
  for (const [i, t] of (pkg.ai_translations ?? []).entries()) {
    const path = '/ai_translations/' + i;
    if (t.generation_status !== 'generated') fail(path + '/generation_status', 'AI 今译尚在起草');
    if (t.human_review.status === 'needs_revision') fail(path + '/human_review/status', 'AI 今译待修订');
    translated.add(t.section_id);
  }
  for (const [id, i] of needed) {
    if (!translated.has(id)) fail('/text_units/' + i + '/section_id', (id ?? '篇首（无章号）') + ' 的经文缺少同章今译');
  }
}

export function parseEdition(text) {
  let data;
  try { data = JSON.parse(text.replace(/^\uFEFF/u, '')); }
  catch (error) { fail('/', 'JSON 解析失败 (' + error.message + ')'); }
  return validateEdition(data);
}
