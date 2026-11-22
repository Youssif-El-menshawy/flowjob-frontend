// The job post a match was run on, kept for this browser tab only. The backend never stores the post, so
// this is what lets the report show it again and lets tailoring read the employer's own wording.
import { JOB_POSTS_KEY as KEY } from './sessionData';
const MAX_POSTS = 8;

type Store = Record<string, string>;

/** Drafts tailored straight from a pasted post (no match) are kept under their own key. */
const draftKey = (draftId: string) => `draft:${draftId}`;

function read(): Store {
  try {
    const parsed: unknown = JSON.parse(sessionStorage.getItem(KEY) ?? '{}');
    return parsed && typeof parsed === 'object' && !Array.isArray(parsed) ? (parsed as Store) : {};
  } catch {
    return {};
  }
}

export const jobPosts = {
  get(matchId: string | undefined): string | undefined {
    const text = matchId ? read()[matchId] : undefined;
    return typeof text === 'string' && text.trim() ? text : undefined;
  },
  remember(matchId: string, text: string) {
    if (!matchId || !text.trim()) return;
    try {
      const entries = Object.entries({ ...read(), [matchId]: text.trim() });
      sessionStorage.setItem(KEY, JSON.stringify(Object.fromEntries(entries.slice(-MAX_POSTS))));
    } catch {
      /* storage unavailable or full: tailoring then simply works without the post */
    }
  },
  /** The post a tailoring draft was made from, when this tab still has it: its match's post, or the post pasted
   * for a draft tailored without a match. Never anything else. */
  forDraft(draft: { id: string; matchId?: string | null }): string | undefined {
    return draft.matchId ? jobPosts.get(draft.matchId) : jobPosts.get(draftKey(draft.id));
  },
  rememberDraft(draftId: string, text: string) {
    jobPosts.remember(draftKey(draftId), text);
  },
  clear() {
    try {
      sessionStorage.removeItem(KEY);
    } catch {
      /* ignore */
    }
  },
};

/** The request for tailoring from a match, with the post when this tab still has it. */
export function tailorFromMatch<T extends { matchId: string }>(input: T): T & { jobDescription?: string } {
  const jobDescription = jobPosts.get(input.matchId);
  return jobDescription ? { ...input, jobDescription } : input;
}
