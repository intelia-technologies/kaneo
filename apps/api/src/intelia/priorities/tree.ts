// Pure helpers over a workspace's priorities, loaded whole: a workspace has a
// handful of them, so every read and write works on the full set.

export type PriorityNode = {
  id: string;
  parentId: string | null;
  position: number;
};

/** The ancestors of a priority, root first, without the priority itself. */
export function ancestorsOf<T extends PriorityNode>(
  id: string,
  byId: ReadonlyMap<string, T>,
): T[] {
  const chain: T[] = [];
  const seen = new Set([id]);
  let parentId = byId.get(id)?.parentId ?? null;
  while (parentId && !seen.has(parentId)) {
    const parent = byId.get(parentId);
    if (!parent) break;
    seen.add(parentId);
    chain.unshift(parent);
    parentId = parent.parentId;
  }
  return chain;
}

/** Whether hanging `id` under `parentId` would make it its own ancestor. */
export function createsCycle(
  id: string,
  parentId: string | null,
  byId: ReadonlyMap<string, PriorityNode>,
): boolean {
  const seen = new Set<string>();
  for (let at = parentId; at; at = byId.get(at)?.parentId ?? null) {
    if (at === id) return true;
    if (seen.has(at)) return true;
    seen.add(at);
  }
  return false;
}

/** The priority and every priority under it. */
export function subtreeIds(
  id: string,
  nodes: readonly PriorityNode[],
): Set<string> {
  const children = new Map<string, string[]>();
  for (const node of nodes) {
    if (!node.parentId) continue;
    const list = children.get(node.parentId) ?? [];
    list.push(node.id);
    children.set(node.parentId, list);
  }
  const ids = new Set<string>();
  const stack = [id];
  while (stack.length > 0) {
    const at = stack.pop() as string;
    if (ids.has(at)) continue;
    ids.add(at);
    stack.push(...(children.get(at) ?? []));
  }
  return ids;
}

/**
 * Depth-first order: each priority after its parent, siblings by position
 * (then id, for a stable order), so a flat list reads as the tree.
 */
export function inTreeOrder<T extends PriorityNode>(nodes: readonly T[]): T[] {
  const byParent = new Map<string | null, T[]>();
  const ids = new Set(nodes.map((node) => node.id));
  for (const node of nodes) {
    // A parent outside the set (it should not happen) makes it a root.
    const key = node.parentId && ids.has(node.parentId) ? node.parentId : null;
    const list = byParent.get(key) ?? [];
    list.push(node);
    byParent.set(key, list);
  }
  for (const list of byParent.values()) {
    list.sort((a, b) => a.position - b.position || a.id.localeCompare(b.id));
  }
  const ordered: T[] = [];
  const visit = (parentId: string | null) => {
    for (const node of byParent.get(parentId) ?? []) {
      ordered.push(node);
      visit(node.id);
    }
  };
  visit(null);
  return ordered;
}

/**
 * The siblings' ids in their new order after placing `id` at `position`
 * (clamped to the list), `id` removed first if it was already among them.
 */
export function placeAt(
  siblingIds: readonly string[],
  id: string,
  position: number | undefined,
): string[] {
  const rest = siblingIds.filter((sibling) => sibling !== id);
  const at =
    position === undefined
      ? rest.length
      : Math.max(0, Math.min(position, rest.length));
  rest.splice(at, 0, id);
  return rest;
}
