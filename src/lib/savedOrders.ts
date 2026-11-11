// Tracking links for orders placed on THIS device, kept in localStorage for convenience.
export interface SavedOrder { reference: string; url: string; project: string; created_at: string }
const KEY = 'devmart-orders';

export function loadSavedOrders(): SavedOrder[] {
  try {
    const list = JSON.parse(localStorage.getItem(KEY) ?? '[]');
    return Array.isArray(list) ? list.filter((o) => typeof o?.reference === 'string' && typeof o?.url === 'string').slice(0, 20) : [];
  } catch {
    return [];
  }
}
export function saveOrder(order: SavedOrder): void {
  try {
    localStorage.setItem(KEY, JSON.stringify([order, ...loadSavedOrders().filter((o) => o.reference !== order.reference)].slice(0, 20)));
  } catch { /* storage unavailable */ }
}
export function forgetOrder(reference: string): void {
  try {
    localStorage.setItem(KEY, JSON.stringify(loadSavedOrders().filter((o) => o.reference !== reference)));
  } catch { /* ignore */ }
}
export function tokenFromUrl(url: string): string | null {
  try {
    return new URL(url, window.location.origin).searchParams.get('t');
  } catch {
    return null;
  }
}
