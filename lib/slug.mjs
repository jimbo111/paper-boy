export function slugify(s) {
  return String(s).toLowerCase().trim()
    .replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '');
}

export function normalizeTitle(s) {
  return String(s).toLowerCase().replace(/[^a-z0-9]+/g, '');
}
