/**
 * Generates a unique 21-character alphanumeric ID.
 * This matches standard nanoid structure and avoids any module loading/exporting issues.
 */
export function generateId(): string {
  const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789_-';
  let result = '';
  for (let i = 0; i < 21; i++) {
    result += chars.charAt(Math.floor(Math.random() * chars.length));
  }
  return result;
}
