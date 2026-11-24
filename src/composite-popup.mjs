// Offline reference model for the 1.2.0 reading contract.
export function compositePopup(edition, groupId) {
  const group = edition.display_groups.find(g => g.display_group_id === groupId);
  if (!group) throw new Error('未知显示组 ' + groupId);
  const notes = new Map(edition.annotations.map(note => [note.annotation_id, note]));
  const layers = new Map(edition.layers.map(layer => [layer.layer_id, layer]));
  const items = group.entries.toSorted((a, b) => a.display_order - b.display_order).map(entry => {
    const note = notes.get(entry.annotation_id);
    const layer = layers.get(note.layer_id);
    return {
      annotationId: note.annotation_id,
      author: note.author.name.trim() || '作者未详',
      layerId: layer.layer_id,
      layerName: layer.display_name,
      text: note.text,
      sourceId: note.source_id,
      locator: note.source_locator,
    };
  });
  return { title: edition.edition.source_title || edition.edition.display_name, items };
}
