export function normalizeUsername(username: string) {
  return username.trim().toLowerCase();
}

export function normalizeEmail(email: string) {
  return email.trim().toLowerCase();
}

export function normalizeSlug(value: string) {
  return value
    .trim()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .replace(/-{2,}/g, "-");
}
