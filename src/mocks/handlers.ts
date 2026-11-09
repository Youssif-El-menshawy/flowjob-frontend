import { delay, http, HttpResponse } from 'msw';
import type {
  Application,
  ApplicationInput,
  ApplicationStatus,
  Cv,
  Profile,
  StatusEvent,
} from '@/shared/api/types';
import { STATUSES, type MatchResult } from '@/shared/api/types';
import { clearCookie, db, issueTokens, publicUser, readCookie, save, type UserData } from './db';
import { analyseMatch, extractSkills, tailorSuggestions } from './matcher';
import { emptyProfile, toContent, uid } from './seed';

const B = '/api/v1';
const wait = (ms = 350) => delay(import.meta.env.MODE === 'test' ? 0 : ms);
const err = (status: number, message: string, fieldErrors?: Record<string, string>) =>
  HttpResponse.json({ message, fieldErrors }, { status });
const now = () => new Date().toISOString();
const emailOk = (e: string) => /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(e);

function auth(request: Request): { id: string; data: UserData } | null {
  const h = request.headers.get('Authorization') ?? '';
  const token = h.replace(/^Bearer\s+/, '');
  const id = db().access[token];
  if (!id || !db().data[id]) return null;
  return { id, data: db().data[id] };
}

type Ctx = { id: string; data: UserData };
// Wraps a handler so it requires a valid access token.
function authed<P = Record<string, string>>(
  fn: (args: { request: Request; params: P; u: Ctx }) => Promise<Response> | Response,
) {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  return async ({ request, params }: { request: Request; params: any }) => {
    await wait();
    const u = auth(request);
    if (!u) return err(401, 'Your session has ended. Please log in again.');
    const res = await fn({ request, params: params as P, u });
    save();
    return res;
  };
}

function nextStatus(s: ApplicationStatus): ApplicationStatus | null {
  return (
    (
      { Applied: 'Saved', 'Saved': 'Interview', Interview: 'Offer' } as Record<
        string,
        ApplicationStatus
      >
    )[s] ?? null
  );
}

export const handlers = [
  // ---------- Auth ----------
  http.post(`${B}/auth/register`, async ({ request }) => {
    await wait(600);
    const { name = '', email = '', password = '' } = (await request.json()) as Record<string, string>;
    const fe: Record<string, string> = {};
    if (name.trim().length < 2) fe.name = 'Please enter your name.';
    if (!emailOk(email)) fe.email = 'Please enter a valid email address.';
    if (password.length < 8) fe.password = 'Use at least 8 characters.';
    if (db().users.some((u) => u.email.toLowerCase() === email.toLowerCase()))
      fe.email = 'An account with this email already exists.';
    if (Object.keys(fe).length) return err(422, 'Please fix the highlighted fields.', fe);
    const user = {
      id: uid(),
      name: name.trim(),
      email: email.trim().toLowerCase(),
      password,
      createdAt: now(),
    };
    db().users.push(user);
    const profile = emptyProfile(user.name, user.email);
    db().data[user.id] = {
      profile,
      cvs: [],
      matches: [],
      drafts: [],
      applications: [],
      gmail: { connected: false, autoSync: true, updatesThisMonth: 0 },
    };
    save();
    return HttpResponse.json({ accessToken: issueTokens(user.id), user: publicUser(user) }, { status: 201 });
  }),

  http.post(`${B}/auth/login`, async ({ request }) => {
    await wait(500);
    const { email = '', password = '' } = (await request.json()) as Record<string, string>;
    const user = db().users.find((u) => u.email.toLowerCase() === email.trim().toLowerCase());
    if (!user || user.password !== password)
      return err(401, 'That email and password do not match. Please try again.');
    return HttpResponse.json({ accessToken: issueTokens(user.id), user: publicUser(user) });
  }),

  http.post(`${B}/auth/refresh`, async () => {
    await wait(150);
    const r = readCookie();
    const id = r ? db().refresh[r] : undefined;
    const user = db().users.find((u) => u.id === id);
    if (!user) return err(401, 'No active session.');
    return HttpResponse.json({ accessToken: issueTokens(user.id), user: publicUser(user) });
  }),

  http.post(`${B}/auth/logout`, async () => {
    await wait(150);
    clearCookie();
    return new HttpResponse(null, { status: 204 });
  }),

  http.post(`${B}/auth/forgot-password`, async ({ request }) => {
    await wait(700);
    const { email = '' } = (await request.json()) as Record<string, string>;
    if (!emailOk(email))
      return err(422, 'Please enter a valid email address.', {
        email: 'Please enter a valid email address.',
      });
    // Always 204 so the response never reveals whether an account exists.
    return new HttpResponse(null, { status: 204 });
  }),

  // ---------- Account ----------
  http.get(
    `${B}/me`,
    authed(({ u }) => HttpResponse.json(publicUser(db().users.find((x) => x.id === u.id)!))),
  ),
  http.patch(
    `${B}/me`,
    authed(async ({ request, u }) => {
      const body = (await request.json()) as { name?: string; email?: string };
      const user = db().users.find((x) => x.id === u.id)!;
      if (body.email && !emailOk(body.email))
        return err(422, 'Please enter a valid email address.', {
          email: 'Please enter a valid email address.',
        });
      if (body.email && db().users.some((x) => x.id !== u.id && x.email === body.email!.toLowerCase()))
        return err(422, 'That email is already used.', { email: 'That email is already used.' });
      if (body.name) user.name = body.name.trim();
      if (body.email) user.email = body.email.trim().toLowerCase();
      return HttpResponse.json(publicUser(user));
    }),
  ),
  http.post(
    `${B}/me/password`,
    authed(async ({ request, u }) => {
      const { current = '', next = '' } = (await request.json()) as Record<string, string>;
      const user = db().users.find((x) => x.id === u.id)!;
      if (user.password !== current)
        return err(422, 'Your current password is not correct.', {
          current: 'Your current password is not correct.',
        });
      if (next.length < 8)
        return err(422, 'Use at least 8 characters.', { next: 'Use at least 8 characters.' });
      user.password = next;
      return new HttpResponse(null, { status: 204 });
    }),
  ),
  http.get(
    `${B}/me/export`,
    authed(({ u }) =>
      HttpResponse.json({ user: publicUser(db().users.find((x) => x.id === u.id)!), ...u.data }),
    ),
  ),
  http.delete(
    `${B}/me`,
    authed(({ u }) => {
      const d = db();
      d.users = d.users.filter((x) => x.id !== u.id);
      delete d.data[u.id];
      clearCookie();
      return new HttpResponse(null, { status: 204 });
    }),
  ),

  // ---------- Profile ----------
  http.get(
    `${B}/profile`,
    authed(({ u }) => HttpResponse.json(u.data.profile)),
  ),
  http.put(
    `${B}/profile`,
    authed(async ({ request, u }) => {
      u.data.profile = (await request.json()) as Profile;
      return HttpResponse.json(u.data.profile);
    }),
  ),

  // ---------- CVs ----------
  http.get(
    `${B}/cvs`,
    authed(({ u }) => HttpResponse.json(u.data.cvs)),
  ),
  http.get<{ id: string }>(
    `${B}/cvs/:id`,
    authed<{ id: string }>(({ params, u }) => {
      const cv = u.data.cvs.find((c) => c.id === params.id);
      return cv ? HttpResponse.json({ ...cv, contentRevision: cv.updatedAt }) : err(404, 'CV not found.');
    }),
  ),
  http.post(
    `${B}/cvs`,
    authed(async ({ request, u }) => {
      const body = (await request.json()) as Partial<Cv> & { tailorDraftId?: string };
      if (body.tailorDraftId) {
        const draft = u.data.drafts.find((d) => d.id === body.tailorDraftId);
        if (!draft) return err(404, 'Draft not found.');
        const source = u.data.cvs.find((c) => c.id === draft.sourceCvId);
        if (!source || source.updatedAt !== draft.sourceCvRevision) return err(409, 'The source CV changed.');
        if (body.kind !== 'tailored' || body.sourceCvId !== source.id) return err(422, 'Choose the source CV of the draft.');
      }
      if (body.kind !== 'tailored' && u.data.cvs.some((c) => c.kind === 'original'))
        return err(409, 'You already have an original CV.');
      const cv: Cv = {
        id: uid(),
        name: body.name || (body.kind === 'tailored' ? 'Tailored CV' : 'Original CV'),
        kind: body.kind ?? 'original',
        jobTitle: body.jobTitle,
        company: body.company,
        matchId: body.matchId,
        sourceCvId: body.sourceCvId,
        createdAt: now(),
        updatedAt: now(),
        content: body.content ?? toContent(u.data.profile),
      };
      u.data.cvs.push(cv);
      return HttpResponse.json(cv, { status: 201 });
    }),
  ),
  http.put<{ id: string }>(
    `${B}/cvs/:id`,
    authed<{ id: string }>(async ({ request, params, u }) => {
      const cv = u.data.cvs.find((c) => c.id === params.id);
      if (!cv) return err(404, 'CV not found.');
      const body = (await request.json()) as Partial<Cv>;
      Object.assign(cv, {
        name: body.name ?? cv.name,
        content: body.content ?? cv.content,
        updatedAt: now(),
      });
      return HttpResponse.json(cv);
    }),
  ),
  http.delete<{ id: string }>(
    `${B}/cvs/:id`,
    authed<{ id: string }>(({ params, u }) => {
      const cv = u.data.cvs.find((c) => c.id === params.id);
      if (!cv) return err(404, 'CV not found.');
      if (cv.kind === 'original') return err(409, 'The original CV cannot be deleted.');
      u.data.cvs = u.data.cvs.filter((c) => c.id !== params.id);
      u.data.applications.forEach((a) => {
        if (a.cvId === params.id) a.cvId = undefined;
      });
      return new HttpResponse(null, { status: 204 });
    }),
  ),

  // ---------- Matching and tailoring (mock LLM) ----------
  http.get(
    `${B}/matches`,
    authed(({ u }) =>
      HttpResponse.json([...u.data.matches].sort((a, b) => b.createdAt.localeCompare(a.createdAt))),
    ),
  ),
  http.get<{ id: string }>(
    `${B}/matches/:id`,
    authed<{ id: string }>(({ params, u }) => {
      const m = u.data.matches.find((x) => x.id === params.id);
      return m ? HttpResponse.json(m) : err(404, 'Match not found.');
    }),
  ),
  http.delete<{ id: string }>(
    `${B}/matches/:id`,
    authed<{ id: string }>(({ params, u }) => {
      const index = u.data.matches.findIndex((match) => match.id === params.id);
      if (index === -1) return err(404, 'Match not found.');
      u.data.matches.splice(index, 1);
      return new HttpResponse(null, { status: 204 });
    }),
  ),
  http.post(
    `${B}/matches`,
    authed(async ({ request, u }) => {
      const { cvId, jobText = '' } = (await request.json()) as { cvId: string; jobText: string };
      const cv = u.data.cvs.find((c) => c.id === cvId);
      if (!cv) return err(422, 'Choose a CV to compare.', { cvId: 'Choose a CV to compare.' });
      if (jobText.trim().length < 40)
        return err(422, 'Paste a bit more of the job post so we can compare it.', {
          jobText: 'Paste at least a few sentences.',
        });
      if (!extractSkills(jobText).length)
        return err(422, 'We could not find any skills in this post.', {
          jobText:
            'We could not find any skills in this post. Paste the full description, including the requirements.',
        });
      await delay(import.meta.env.MODE === 'test' ? 0 : 1600);
      const r = {
        ...analyseMatch(cv.content, jobText),
        id: uid(),
        cvId: cv.id,
        cvName: cv.name,
        createdAt: now(),
      };
      u.data.matches.push(r);
      return HttpResponse.json(r, { status: 201 });
    }),
  ),
  http.post(
    `${B}/tailor`,
    authed(async ({ request, u }) => {
      const body = (await request.json()) as {
        matchId?: string;
        cvId?: string;
        jobTitle?: string;
        jobDescription?: string;
        company?: string;
      };
      let m: MatchResult | undefined = body.matchId ? u.data.matches.find((x) => x.id === body.matchId) : undefined;
      if (body.matchId && !m) return err(404, 'Match not found.');
      const cv = m
        ? u.data.cvs.find((c) => c.id === m!.cvId)
        : u.data.cvs.find((c) => c.id === body.cvId);
      if (!cv) return err(m ? 409 : 404, m ? 'Create your CV first.' : 'Original CV not found.');
      if (body.cvId && body.cvId !== cv.id) return err(422, 'This match belongs to a different CV.');
      if (!m) {
        // Direct tailoring: a transient analysis (never saved as a match record).
        const job = (body.jobDescription ?? '').trim();
        if (!body.jobTitle || job.length < 80) return err(422, 'Job description is too short or too long.');
        m = { ...analyseMatch(cv.content, job), id: '', cvId: cv.id, cvName: cv.name, createdAt: now() } as MatchResult;
      }
      const draft = {
        id: uid(),
        matchId: body.matchId,
        sourceCvId: cv.id,
        sourceCvRevision: cv.updatedAt,
        jobTitle: body.matchId ? m!.jobTitle : (body.jobTitle ?? ''),
        company: body.matchId ? m!.company : (body.company ?? ''),
        suggestions: tailorSuggestions(cv.content, m!)
          .filter((s) => s.original.trim())
          .map((s) => ({ ...s, id: uid(), reviewRequired: s.section !== 'skills' })),
      };
      await delay(import.meta.env.MODE === 'test' ? 0 : 1200);
      u.data.drafts.push(draft);
      return HttpResponse.json(draft, { status: 201 });
    }),
  ),

  http.get(`${B}/tailor/capabilities`, () => HttpResponse.json({ sourceVerification: 1 })),
  http.get<{ id: string }>(
    `${B}/tailor/:id`,
    authed<{ id: string }>(({ params, u }) => {
      const d = u.data.drafts.find((x) => x.id === params.id);
      return d ? HttpResponse.json({ ...d, sourceCvRevision: d.sourceCvRevision ?? null }) : err(404, 'Draft not found.');
    }),
  ),

  // ---------- Applications ----------
  http.get(
    `${B}/applications`,
    authed(({ u }) =>
      HttpResponse.json(
        [...u.data.applications].sort((a, b) => (b.dateApplied ?? '').localeCompare(a.dateApplied ?? '')),
      ),
    ),
  ),
  http.get<{ id: string }>(
    `${B}/applications/:id`,
    authed<{ id: string }>(({ params, u }) => {
      const a = u.data.applications.find((x) => x.id === params.id);
      return a ? HttpResponse.json(a) : err(404, 'Application not found.');
    }),
  ),
  http.post(
    `${B}/applications`,
    authed(async ({ request, u }) => {
      const b = (await request.json()) as ApplicationInput;
      const fe: Record<string, string> = {};
      if (!b.company?.trim()) fe.company = 'Company is required.';
      if (!b.jobTitle?.trim()) fe.jobTitle = 'Job title is required.';
      if (!b.dateApplied) fe.dateApplied = 'Date is required.';
      if (!STATUSES.includes(b.status)) fe.status = 'Pick a status.';
      if (Object.keys(fe).length) return err(422, 'Please fix the highlighted fields.', fe);
      const a: Application = {
        id: uid(),
        company: b.company.trim(),
        jobTitle: b.jobTitle.trim(),
        dateApplied: b.dateApplied,
        status: b.status,
        jobUrl: b.jobUrl || undefined,
        notes: b.notes || undefined,
        cvId: b.cvId || undefined,
        history: [{ id: uid(), status: b.status, at: now(), source: 'manual', note: 'Added by you.' }],
        suggestion: null,
        updatedAt: now(),
      };
      u.data.applications.push(a);
      return HttpResponse.json(a, { status: 201 });
    }),
  ),
  http.patch<{ id: string }>(
    `${B}/applications/:id`,
    authed<{ id: string }>(async ({ request, params, u }) => {
      const a = u.data.applications.find((x) => x.id === params.id);
      if (!a) return err(404, 'Application not found.');
      const b = (await request.json()) as Partial<ApplicationInput>;
      if (b.status && b.status !== a.status) {
        a.history.push({ id: uid(), status: b.status, at: now(), source: 'manual', note: 'Changed by you.' });
        a.status = b.status;
        if (a.suggestion && a.suggestion.proposedStatus === b.status) a.suggestion = null;
      }
      for (const k of ['company', 'jobTitle', 'dateApplied', 'jobUrl', 'notes', 'cvId'] as const) {
        if (k in b) (a as unknown as Record<string, unknown>)[k] = b[k] || undefined;
      }
      a.updatedAt = now();
      return HttpResponse.json(a);
    }),
  ),
  http.delete<{ id: string }>(
    `${B}/applications/:id`,
    authed<{ id: string }>(({ params, u }) => {
      u.data.applications = u.data.applications.filter((x) => x.id !== params.id);
      return new HttpResponse(null, { status: 204 });
    }),
  ),
  http.post<{ id: string; action: string }>(
    `${B}/applications/:id/suggestion/:action`,
    authed<{ id: string; action: string }>(({ params, u }) => {
      const a = u.data.applications.find((x) => x.id === params.id);
      if (!a || !a.suggestion) return err(404, 'Nothing to review.');
      if (params.action === 'confirm') {
        const ev: StatusEvent = {
          id: uid(),
          status: a.suggestion.proposedStatus,
          at: now(),
          source: 'gmail_confirmed',
          note: a.suggestion.snippet,
        };
        a.history.push(ev);
        a.status = a.suggestion.proposedStatus;
      }
      a.suggestion = null;
      a.updatedAt = now();
      return HttpResponse.json(a);
    }),
  ),
  http.post<{ id: string; eventId: string }>(
    `${B}/applications/:id/history/:eventId/undo`,
    authed<{ id: string; eventId: string }>(({ params, u }) => {
      const a = u.data.applications.find((x) => x.id === params.id);
      if (!a) return err(404, 'Application not found.');
      const last = a.history[a.history.length - 1];
      if (!last || last.id !== params.eventId || a.history.length < 2)
        return err(409, 'Only the latest change can be undone.');
      a.history.pop();
      a.status = a.history[a.history.length - 1].status;
      a.updatedAt = now();
      return HttpResponse.json(a);
    }),
  ),

  // ---------- Gmail (mock) ----------
  http.get(
    `${B}/gmail`,
    authed(({ u }) => HttpResponse.json(u.data.gmail)),
  ),
  http.post(
    `${B}/gmail/connect`,
    authed(async ({ u }) => {
      await delay(import.meta.env.MODE === 'test' ? 0 : 900);
      const email = u.data.profile.email || db().users.find((x) => x.id === u.id)!.email;
      u.data.gmail = {
        ...u.data.gmail,
        connected: true,
        email: email.replace(/@.*/, '@gmail.com'),
        lastSyncAt: now(),
      };
      return HttpResponse.json(u.data.gmail);
    }),
  ),
  http.post(
    `${B}/gmail/disconnect`,
    authed(({ u }) => {
      u.data.gmail = { connected: false, autoSync: u.data.gmail.autoSync, updatesThisMonth: 0 };
      return HttpResponse.json(u.data.gmail);
    }),
  ),
  http.patch(
    `${B}/gmail`,
    authed(async ({ request, u }) => {
      const b = (await request.json()) as { autoSync?: boolean };
      if (typeof b.autoSync === 'boolean') u.data.gmail.autoSync = b.autoSync;
      return HttpResponse.json(u.data.gmail);
    }),
  ),
  http.post(
    `${B}/gmail/sync`,
    authed(async ({ u }) => {
      if (!u.data.gmail.connected) return err(409, 'Connect Gmail first.');
      await delay(import.meta.env.MODE === 'test' ? 0 : 1400);
      let newSuggestions = 0;
      // Mock classifier: proposes the next status for one active application and asks the user to confirm.
      const target = u.data.applications.find((a) => !a.suggestion && nextStatus(a.status));
      if (target) {
        const to = nextStatus(target.status)!;
        target.suggestion = {
          id: uid(),
          proposedStatus: to,
          from: `careers@${target.company.toLowerCase().replace(/[^a-z]/g, '')}.com`,
          snippet:
            to === 'Interview'
              ? '“We would like to invite you to a short call…”'
              : to === 'Offer'
                ? '“We are happy to share the next steps of your offer…”'
                : '“Thanks for applying. We are reviewing your application.”',
          receivedAt: now(),
        };
        newSuggestions = 1;
        u.data.gmail.updatesThisMonth += 1;
      }
      u.data.gmail.lastSyncAt = now();
      return HttpResponse.json({ checked: 12, autoUpdated: 0, newSuggestions, connection: u.data.gmail });
    }),
  ),
];
