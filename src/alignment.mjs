import Ajv from 'ajv/dist/2020.js';
import schema from '../standards/work.schema.json' with { type: 'json' };

const check = new Ajv({ strict: false, ownProperties: true }).compile(schema);

function register(map, id, parent) {
  if (map.has(id)) throw new Error('定位 ID 重复 ' + id);
  map.set(id, parent);
}

export function validateWork(work) {
  if (!check(work)) throw new Error('定位文件结构有误 ' + check.errors[0].instancePath);
  const parents = new Map(), units = new Map(), segments = new Map();
  for (const section of work.canonical_structure.sections) {
    register(parents, section.canonical_section_id, section.parent_id);
    for (const unit of section.units) {
      register(units, unit.canonical_unit_id, section.canonical_section_id);
      for (const segment of unit.segments ?? []) register(segments, segment.canonical_segment_id, unit.canonical_unit_id);
    }
  }
  for (let id of parents.keys()) {
    const seen = new Set();
    while (id !== null) {
      if (seen.has(id) || !parents.has(id)) throw new Error('定位层级错误 ' + id);
      seen.add(id);
      id = parents.get(id);
    }
  }
  return { units, segments };
}

export function checkAlignment(pkg, work, texts, checkSpan) {
  const { units, segments } = validateWork(work);
  const ref = pkg.canonical_ref;
  if (work.work_id !== pkg.work.work_id || ref.file !== work.work_id + '__canonical.json'
      || ref.locator_version !== work.locator_version) throw new Error('canonical_ref 与定位文件不符');
  const seen = new Set();
  for (const row of pkg.alignment_refs) {
    if (seen.has(row.alignment_id) || units.get(row.canonical_unit_id) !== row.canonical_section_id
        || (row.canonical_segment_id && segments.get(row.canonical_segment_id) !== row.canonical_unit_id)) {
      throw new Error('未知或重复定位 ' + row.alignment_id);
    }
    seen.add(row.alignment_id);
    for (const member of row.members) {
      const unit = texts.get(member.text_id);
      if (unit?.role !== 'classic_text') throw new Error('映射须引用本版经文 ' + member.text_id);
      const first = unit.text.indexOf(member.quoted_text);
      if (!member.occurrence && first >= 0 && unit.text.indexOf(member.quoted_text, first + 1) >= 0) {
        throw new Error('重复引文缺少 occurrence ' + row.alignment_id);
      }
      checkSpan(unit.text, member, member.quoted_text, row.alignment_id);
    }
  }
}
