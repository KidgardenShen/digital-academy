function append(map, key, item) {
  if (!map.has(key)) map.set(key, []);
  map.get(key).push(item);
}

const cached = new WeakMap();

export function chapters(pkg) {
  if (cached.has(pkg)) return cached.get(pkg);
  const children = new Map();
  const units = new Map();
  const groups = new Map();
  const unitSections = new Map();
  const notes = new Map(pkg.annotations.map(n => [n.annotation_id, n]));
  const aiTranslations = new Map((pkg.ai_translations ?? [])
    .filter(t => t.generation_status === 'generated' && t.human_review.status !== 'needs_revision')
    .map(t => [t.section_id, t]));
  for (const s of [...pkg.structure.sections].sort((a, b) => a.order - b.order)) append(children, s.parent_section_id, s);
  for (const u of [...pkg.text_units].sort((a, b) => a.sequence - b.sequence)) {
    append(units, u.section_id, u);
    unitSections.set(u.text_id, u.section_id);
  }
  for (const g of pkg.display_groups) {
    const entries = [...g.entries].sort((a, b) => a.display_order - b.display_order)
      .map(e => ({ note: notes.get(e.annotation_id), ref: e.target_ref_id }));
    const chapterIds = g.anchor_mode === 'section' ? [g.section_id] : new Set(g.anchors.map(a => unitSections.get(a.text_id)));
    for (const id of chapterIds) append(groups, id, { group: g, entries, pkg });
  }
  const result = [];
  function collect(id, title) {
    const texts = units.get(id) ?? [];
    const visibleGroups = groups.get(id) ?? [];
    if (texts.length || visibleGroups.length) {
      result.push({ id, title, original: texts.filter(u => u.role !== 'translation'),
        translations: texts.filter(u => u.role === 'translation'), aiTranslation: aiTranslations.get(id),
        groups: visibleGroups });
    }
  }
  collect(null, '篇首');
  const pending = [...(children.get(null) ?? [])].reverse();
  while (pending.length) {
    const s = pending.pop();
    collect(s.section_id, s.title || s.label || s.section_id);
    for (const child of [...(children.get(s.section_id) ?? [])].reverse()) pending.push(child);
  }
  cached.set(pkg, result);
  return result;
}

export function aligned(a, b) {
  return Boolean(b && a.id === b.id && a.original.length === b.original.length &&
    a.original.every((u, i) => u.text_id === b.original[i].text_id && u.text === b.original[i].text));
}

export function chapterNotes(chapter) {
  const seen = new Set();
  const result = [];
  for (const { entries } of chapter.groups) {
    for (const { note } of entries) {
      if (!seen.has(note.annotation_id)) result.push(note);
      seen.add(note.annotation_id);
    }
  }
  return result;
}

export function personLabel(person) {
  return [person?.period?.trim(), person?.name?.trim()].filter(Boolean).join(' · ');
}

export function authorSections(pkg, chapter) {
  return Map.groupBy(chapterNotes(chapter), note => {
    const author = note.author?.name.trim() ? note.author : pkg.edition.author;
    return personLabel(author);
  });
}

export function references(pkg, items, editionTitle = '') {
  const records = new Map(pkg.sources.map(s => [s.source_id, s]));
  const refs = new Map();
  function add(title, url, detail) {
    if (!title && !url && !detail) return;
    const item = { title, url, detail };
    refs.set(JSON.stringify(item), item);
  }
  for (const item of items) {
    const record = records.get(item.source_id);
    const locator = item.source_locator;
    const url = [locator.url, record?.url, record?.locator.url].find(value => /^https?:\/\//i.test(value ?? '')) ?? '';
    const location = { ...record?.locator, ...locator };
    const places = Object.entries(location).filter(([key, value]) => key !== 'url' && value).map(([, value]) => value);
    add(record?.source_title || '', url, [record?.edition_statement, ...places].filter(Boolean).join(' · '));
  }
  if (editionTitle && ![...refs.values()].some(ref => ref.title === editionTitle)) {
    const matches = pkg.sources.filter(s => s.source_title === editionTitle);
    const record = matches.length === 1 ? matches[0] : undefined;
    const url = [record?.url, record?.locator.url].find(value => /^https?:\/\//i.test(value ?? '')) ?? '';
    add(editionTitle, url, record?.edition_statement || '');
  }
  return [...refs.values()];
}

export function segments(unit, selectedChapters) {
  const groups = selectedChapters.flatMap(ch => ch.groups);
  const events = new Map([[0, []], [unit.text.length, []]]);
  groups.forEach(({ group }, idx) => {
    for (const a of group.anchors) {
      if (a.text_id !== unit.text_id) continue;
      append(events, a.start_offset, [idx, 1]);
      append(events, a.end_offset, [idx, -1]);
    }
  });
  const offsets = [...events.keys()].sort((a, b) => a - b);
  const active = new Map();
  const result = [];
  for (let i = 0; i < offsets.length - 1; i++) {
    const at = offsets[i];
    for (const [key, delta] of events.get(at)) {
      const count = (active.get(key) ?? 0) + delta;
      if (count) active.set(key, count);
      else active.delete(key);
    }
    result.push({ text: unit.text.slice(at, offsets[i + 1]),
      hits: [...active.keys()].sort((a, b) => a - b).map(key => groups[key]) });
  }
  return result;
}
