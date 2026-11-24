// The caller owns the registry and persists its per-work assignments.
export function editionColor(registry, workId, editionId, allocate) {
  if (!registry.has(workId)) registry.set(workId, new Map());
  const editions = registry.get(workId);
  if (!editions.has(editionId)) editions.set(editionId, allocate(editions.size));
  return editions.get(editionId);
}
