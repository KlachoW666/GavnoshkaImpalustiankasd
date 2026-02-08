const PAGE_KEY = 'cryptosignal-page';

export function getSavedPage(): string | null {
  try {
    return localStorage.getItem(PAGE_KEY);
  } catch {
    return null;
  }
}

export function savePage(page: string) {
  try {
    localStorage.setItem(PAGE_KEY, page);
  } catch {}
}
