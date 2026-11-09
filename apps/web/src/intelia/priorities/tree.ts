type Node = { id: string; parentId: string | null; position: number };

export type TreeNode<T extends Node> = { item: T; children: TreeNode<T>[] };

/** Nests a flat list of priorities; siblings by position. */
export function buildTree<T extends Node>(items: readonly T[]): TreeNode<T>[] {
  const ids = new Set(items.map((item) => item.id));
  const byParent = new Map<string | null, T[]>();
  for (const item of items) {
    const key = item.parentId && ids.has(item.parentId) ? item.parentId : null;
    byParent.set(key, [...(byParent.get(key) ?? []), item]);
  }
  const nest = (parentId: string | null): TreeNode<T>[] =>
    (byParent.get(parentId) ?? [])
      .sort((a, b) => a.position - b.position)
      .map((item) => ({ item, children: nest(item.id) }));
  return nest(null);
}

/**
 * The priorities that can be the parent of `id`: every one except itself and
 * those under it, which the API would reject as a cycle.
 */
export function parentOptions<T extends Node>(
  items: readonly T[],
  id: string | null,
): T[] {
  if (!id) return [...items];
  const excluded = new Set([id]);
  let grew = true;
  while (grew) {
    grew = false;
    for (const item of items) {
      if (
        item.parentId &&
        excluded.has(item.parentId) &&
        !excluded.has(item.id)
      ) {
        excluded.add(item.id);
        grew = true;
      }
    }
  }
  return items.filter((item) => !excluded.has(item.id));
}
