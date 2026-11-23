import { editionKey, importEdition, listEditions, openShelf } from './storage.mjs';
import { parseEdition } from './validate.mjs';
import { aligned, authorSections, chapters, personLabel, references } from './reader.mjs';
import { annotatedParagraph, laneColor, observeLines } from './annotations.mjs';

const app = document.querySelector('#app');
const fileInput = document.querySelector('#file');
const status = document.querySelector('#status');
let stopObserving = () => {};
const extras = new Set();
let db, books = [], reading = null, chapterIndex = 0;

function element(tag, text, cls) {
  const el = document.createElement(tag);
  if (text !== undefined) el.textContent = text;
  if (cls) el.className = cls;
  return el;
}
function button(label, fn, cls) {
  const el = element('button', label, cls);
  el.type = 'button';
  el.onclick = fn;
  return el;
}
function select(label, options, value, change) {
  const wrap = element('label', label, 'control');
  const input = element('select');
  for (const [key, text] of options) input.add(new Option(text, key));
  input.value = value;
  input.onchange = () => change(input.value);
  wrap.append(input);
  return wrap;
}
const titleOf = p => p.edition.display_name + ' · v' + p.data_version;
const editionLabel = p => [personLabel(p.edition.author), titleOf(p)].filter(Boolean).join('　');
const byKey = key => books.find(p => editionKey(p) === key);

function shelf() {
  stopObserving();
  reading = null;
  extras.clear();
  const head = element('div', undefined, 'page-head');
  head.append(element('h1', '经典书架'));
  if (books.length) head.append(button('导入注本 JSON', () => fileInput.click(), 'primary'));
  app.replaceChildren(head);
  if (!books.length) {
    const empty = element('section', undefined, 'empty');
    const spines = element('div', undefined, 'books-art');
    spines.setAttribute('aria-hidden', 'true');
    spines.append(element('i'), element('i'), element('i'));
    empty.append(spines, element('h2', '书架尚空'), element('p', '导入一份注本 JSON，即可逐章阅读原文与注疏。'),
      button('导入注本 JSON', () => fileInput.click(), 'primary'), element('small', '书架保存在当前浏览器中。'));
    app.append(empty);
    return;
  }
  const works = Map.groupBy(books, p => p.work.work_id);
  const catalog = element('div', undefined, 'catalog');
  for (const editions of works.values()) {
    const book = element('section', undefined, 'book');
    book.append(element('h2', editions[0].work.title));
    for (const p of editions) {
      const entry = button(titleOf(p), () => openBook(p), 'edition-link');
      const author = personLabel(p.edition.author);
      if (author) entry.append(element('small', author));
      book.append(entry);
    }
    catalog.append(book);
  }
  app.append(catalog);
}

function openBook(p, previous) {
  reading = p;
  if (previous) {
    const match = chapters(p).findIndex(c => c.id === previous.id);
    chapterIndex = match >= 0 ? match : 0;
  } else chapterIndex = 0;
  extras.clear();
  history.replaceState(null, '', '#reader');
  reader();
}

function appendReferences(parent, label, records) {
  if (!records.length) return;
  const details = element('details', undefined, 'references');
  details.append(element('summary', label));
  for (const { title, url, detail } of records) {
    const line = element('p');
    if (url) {
      const link = element('a', title || '查看来源');
      link.href = url;
      link.target = '_blank';
      link.rel = 'noopener noreferrer';
      line.append(link);
    } else {
      line.textContent = title;
    }
    if (detail) line.append(document.createTextNode((line.textContent ? ' · ' : '') + detail));
    details.append(line);
  }
  parent.append(details);
}

function reader() {
  stopObserving();
  const p = reading;
  const list = chapters(p);
  const current = list[chapterIndex];
  const related = books.filter(b => b.work.work_id === p.work.work_id);
  const toggle = (i) => { chapterIndex = i; reader(); };
  const back = button('返回书架', () => { location.hash = 'shelf'; }, 'back');
  const head = element('div', undefined, 'page-head');
  head.append(element('h1', p.work.title));
  const controls = element('div', undefined, 'controls');
  controls.append(select('主读注本', related.map(b => [editionKey(b), editionLabel(b)]), editionKey(p), k => openBook(byKey(k), current)),
    select('章节', list.map((c, i) => [String(i), c.title]), String(chapterIndex), i => toggle(Number(i))));
  const selected = [{ pkg: p, chapter: current }];
  const compare = element('fieldset');
  compare.append(element('legend', '同章对读'));
  for (const other of related.filter(other => other !== p)) {
    const ch = chapters(other).find(c => c.id === current.id);
    if (!aligned(current, ch)) continue;
    const key = editionKey(other);
    const label = element('label');
    const input = element('input');
    input.type = 'checkbox';
    input.checked = extras.has(key);
    input.onchange = () => {
      if (input.checked) extras.add(key); else extras.delete(key);
      reader();
      [...app.querySelectorAll('fieldset input')].find(el => el.value === key)?.focus();
    };
    input.value = key;
    label.append(input, document.createTextNode(editionLabel(other)));
    compare.append(label);
  }
  for (const key of extras) {
    const other = byKey(key);
    const ch = chapters(other).find(c => c.id === current.id);
    if (aligned(current, ch)) selected.push({ pkg: other, chapter: ch });
  }
  const layout = element('div', undefined, 'reading-grid');
  const source = element('article', undefined, 'source');
  source.append(element('h2', current.title));
  const lanes = selected.filter(s => s.chapter.groups.some(g => g.group.anchor_mode === 'inline'))
    .map(s => ({ ...s, label: editionLabel(s.pkg) }));
  const paragraphs = [];
  for (const unit of current.original) {
    const annotated = annotatedParagraph(unit, lanes);
    paragraphs.push(annotated);
    source.append(annotated.para);
  }
  if (lanes.length) {
    const legend = element('ul', undefined, 'line-legend');
    legend.setAttribute('aria-label', '原文彩线对应的注本');
    lanes.forEach(({ label }, i) => {
      const item = element('li', label);
      item.style.setProperty('--lane-color', laneColor(i));
      legend.append(item);
    });
    source.append(legend);
  }
  if (current.translations.length) {
    const details = element('details');
    details.open = true;
    details.append(element('summary', '今译'));
    for (const unit of current.translations) details.append(element('p', unit.text));
    source.append(details);
  }
  appendReferences(source, '原文底本出处', references(p, current.original));
  if (current.aiTranslation) {
    const t = current.aiTranslation;
    const details = element('details');
    details.open = true;
    details.append(element('summary', 'AI今译'));
    const generator = [t.generator.provider, t.generator.model].filter(Boolean).join(' · ');
    const review = t.human_review.status === 'reviewed' ? '人工复核：' + t.human_review.reviewer : '待人工复核';
    details.append(element('small', generator + ' · ' + review), element('p', t.text));
    source.append(details);
  }
  const nav = element('nav', undefined, 'pager');
  const prev = button('上一章', () => toggle(chapterIndex - 1));
  const next = button('下一章', () => toggle(chapterIndex + 1));
  prev.disabled = chapterIndex === 0;
  next.disabled = chapterIndex === list.length - 1;
  nav.append(prev, element('span', (chapterIndex + 1) + ' / ' + list.length), next);
  source.append(nav);
  const notes = element('aside', undefined, 'notes');
  notes.append(element('h2', '本章注疏'));
  for (const { pkg, chapter } of selected) {
    const authors = authorSections(pkg, chapter);
    if (!authors.size) authors.set(personLabel(pkg.edition.author), []);
    for (const [author, items] of authors) {
      const section = element('section');
      section.append(element('h3', [author, titleOf(pkg)].filter(Boolean).join('　')));
      for (const n of items) section.append(element('p', n.text));
      appendReferences(section, '注本出处', references(pkg, items, pkg.edition.source_title));
      notes.append(section);
    }
  }
  layout.append(source, notes);
  app.replaceChildren(back, head, controls);
  if (compare.children.length > 1) app.append(compare);
  app.append(layout);
  stopObserving = observeLines(paragraphs);
}

window.addEventListener('hashchange', () => { if (location.hash !== '#reader' || !reading) shelf(); });
fileInput.onchange = async () => {
  const file = fileInput.files[0];
  fileInput.value = '';
  if (!file) return;
  try {
    const pkg = parseEdition(await file.text());
    const result = await importEdition(db, pkg);
    books = await listEditions(db);
    shelf();
    status.textContent = result === 'added' ? '已上架 · ' + titleOf(pkg) : '此版本已在书架上。';
  } catch (error) { status.textContent = file.name + ' · ' + error.message; }
};
try {
  db = await openShelf();
  books = await listEditions(db);
  shelf();
} catch (error) {
  app.replaceChildren(element('p', '无法打开本地书架 · ' + error.message));
}
