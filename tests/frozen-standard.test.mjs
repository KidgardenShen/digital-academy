import test from 'node:test';
import assert from 'node:assert/strict';
import edition from '../standards/fixtures/composite.json' with { type: 'json' };
import locator from '../standards/fixtures/xi-xue__canonical.json' with { type: 'json' };
import { validateEdition } from '../src/validate.mjs';
import { editionColor } from '../src/colors.mjs';
import { compositePopup } from '../src/composite-popup.mjs';

test('color assignment belongs to the work and survives reselection', () => {
  const registry = new Map();
  const assign = (work, id) => editionColor(registry, work, id, index => ['red', 'blue'][index]);
  assert.equal(assign('甲', '注'), 'red');
  assert.equal(assign('甲', '疏'), 'blue');
  assert.equal(assign('乙', '疏'), 'red');
  assert.equal(assign('甲', '疏'), 'blue');
  assert.equal(assign('甲', '注'), 'red');
});

test('composite popup keeps the title once and identifies individual authors and layers', () => {
  const pkg = validateEdition(structuredClone(edition), locator);
  pkg.annotations[0].author.name = '';
  const popup = compositePopup(pkg, pkg.display_groups[0].display_group_id);
  assert.equal(popup.title, pkg.edition.source_title);
  assert.deepEqual(popup.items.map(n => [n.annotationId, n.author, n.layerName]),
    [['sub1', '样例乙', '疏'], ['note1', '作者未详', '注']]);
  for (const item of popup.items) {
    assert.ok(!Object.hasOwn(item, 'title'));
    assert.ok(!Object.hasOwn(item, 'quoted_text'));
  }
});

test('a locator-aware validation is independent of browser import', () => {
  assert.equal(validateEdition(edition, locator), edition);
  assert.throws(() => validateEdition(edition), /schema_version/);
});
