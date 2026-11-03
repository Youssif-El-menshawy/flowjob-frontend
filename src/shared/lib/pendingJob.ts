// A job a visitor pasted on the landing page before having an account.
// It survives the sign-up step and is picked up again by Job Match.
const KEY = 'flowjob.pendingJob';

export const pendingJob = {
  get(): string {
    try {
      return sessionStorage.getItem(KEY) ?? '';
    } catch {
      return '';
    }
  },
  set(text: string) {
    try {
      if (text.trim()) sessionStorage.setItem(KEY, text.trim());
    } catch {
      /* ignore */
    }
  },
  clear() {
    try {
      sessionStorage.removeItem(KEY);
    } catch {
      /* ignore */
    }
  },
  /** First line, shortened, for headings like "See how you match Junior Frontend Developer". */
  label(text?: string): string {
    text = text ?? this.get();
    // First line or first sentence, then cut at a word so it reads as a title.
    const first = (text.split(/\n|\. /).find((l: string) => l.trim()) ?? '').trim().replace(/[.,;:]+$/, '');
    if (first.length <= 48) return first;
    return first.slice(0, 48).replace(/[\s,;:]+\S*$/, '');
  },
};
