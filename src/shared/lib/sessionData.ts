// Temporary job and tailoring data kept in this browser tab (sessionStorage) while someone is signed in.
// It is removed when their session ends, so the next person using the tab never sees it.
export const PENDING_JOB_KEY = 'flowjob.pendingJob';
export const JOB_POSTS_KEY = 'flowjob.jobPosts';
export const TAILOR_REVIEW_PREFIX = 'flowjob.tailorReview.';

/** Removes pasted job descriptions, remembered job posts and every tailoring review in progress. */
export function clearTemporaryJobData() {
  try {
    const keys = Array.from({ length: sessionStorage.length }, (_, i) => sessionStorage.key(i));
    for (const key of keys) {
      if (key === PENDING_JOB_KEY || key === JOB_POSTS_KEY || key?.startsWith(TAILOR_REVIEW_PREFIX)) {
        sessionStorage.removeItem(key);
      }
    }
  } catch {
    /* storage unavailable: nothing was stored */
  }
}
