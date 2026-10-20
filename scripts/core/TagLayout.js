/**
 * Repair invalid parent links without dropping tags. Existing object key order
 * is preserved so layouts saved before siblingOrder was introduced still work.
 */
export function normalizeHierarchy(hierarchy, tags) {
    const result = {};
    for (const [child, parent] of Object.entries(hierarchy || {})) {
        if (!tags[child] || !tags[parent]?.isFolder || child === parent) continue;
        const visited = new Set([child]);
        let ancestor = parent;
        while (ancestor && !visited.has(ancestor)) {
            visited.add(ancestor);
            ancestor = hierarchy[ancestor];
        }
        if (!ancestor) result[child] = parent;
    }
    return result;
}

export function sameHierarchy(a, b) {
    const keys = Object.keys(a);
    return keys.length === Object.keys(b).length && keys.every(key => a[key] === b[key]);
}

export function childrenOf(parent, hierarchy, tags) {
    return Object.entries(hierarchy)
        .filter(([, value]) => value === parent)
        .map(([uuid]) => tags[uuid])
        .filter(Boolean)
        .sort((a, b) => {
            // Legacy layouts use insertion order until explicitly saved.
            if (!Number.isFinite(a.siblingOrder) || !Number.isFinite(b.siblingOrder)) return 0;
            return a.siblingOrder - b.siblingOrder;
        });
}
