// API contract with the FlowJob FastAPI backend.
// Keep this in sync with the backend's OpenAPI schema. Later it can be generated with
// `npx openapi-typescript <backend>/openapi.json -o src/shared/api/schema.ts`.

export type ID = string;

export interface User {
  id: ID;
  name: string;
  email: string;
  createdAt: string;
}

export interface AuthResponse {
  accessToken: string;
  user: User;
}

export interface Experience {
  id: ID;
  title: string;
  company: string;
  location?: string;
  start: string;
  end: string;
  bullets: string[];
}

export interface Education {
  id: ID;
  degree: string;
  school: string;
  start: string;
  end: string;
  note?: string;
}

export interface Project {
  id: ID;
  name: string;
  tech: string;
  description: string;
}

export interface Profile {
  fullName: string;
  email: string;
  phone: string;
  location: string;
  links: string[];
  summary: string;
  experience: Experience[];
  education: Education[];
  projects: Project[];
  skills: string[];
  languages: string;
}

export type CvContent = Omit<Profile, 'languages'> & { languages: string };

export interface Cv {
  id: ID;
  name: string;
  kind: 'original' | 'tailored';
  jobTitle?: string;
  company?: string;
  matchId?: ID;
  sourceCvId?: ID;
  createdAt: string;
  updatedAt: string;
  content: CvContent;
  contentRevision?: string;
}

/** A value Smart CV Import left out, and why. `field` uses the AI answer's numbering, e.g. "experience[1].start". */
export interface CvImportWarning {
  field: string;
  value: string;
  reason:
    | 'not_in_cv' | 'entry_not_in_cv' | 'date_not_near_entry' | 'date_ambiguous' | 'under_other_entry'
    | 'outside_entry' | 'unsafe_link' | 'invalid_email' | 'too_long' | 'over_limit';
  message: string;
}

/** POST /cvs/import: content found in the PDF for review. Nothing is saved until POST /cvs. */
export interface CvImportResult {
  content: CvContent;
  warnings: CvImportWarning[];
  /** Content fields left empty because the CV does not contain them. */
  missing: Array<'fullName' | 'email' | 'phone' | 'location' | 'summary' | 'experience' | 'education' | 'skills'>;
  source: { pages: number; method: string };
  model: string;
}

export type CvContentInput = Partial<Omit<CvContent, 'experience' | 'education' | 'projects'>> & {
  experience?: Partial<Experience>[];
  education?: Partial<Education>[];
  projects?: Partial<Project>[];
};

export type CvWriteInput = Partial<Pick<Cv, 'name' | 'kind' | 'jobTitle' | 'company' | 'sourceCvId'>> & {
  matchId?: ID | null;
  content?: CvContentInput;
};

export interface MatchStrength {
  skill: string;
  evidence: string;
}
export interface MatchGap {
  skill: string;
  tip: string;
}

export type RequirementImportance = 'required' | 'preferred';
export type RequirementCategory = 'required' | 'standard' | 'preferred';
export interface RequirementMatch {
  requirement: string;
  importance: RequirementImportance;
  /** AI-first reports: the scored category (Standard items carry no legacy importance). */
  category?: RequirementCategory;
  status?: string;
  evidence: string;
}

export interface QualificationCategoryCount {
  count: number;
  demonstrated: number;
  partial: number;
  not_shown: number; // as sent by the backend (snake_case)
}
export interface SuggestedWording {
  section: string;
  suggestion: string;
}

export interface MatchResult {
  id: ID;
  cvId: ID;
  cvName: string;
  jobTitle: string;
  company: string;
  jobText: string;
  score: number;
  verdict: string;
  summary: string;
  strengths: MatchStrength[];
  gaps: MatchGap[];
  createdAt: string;
  // Structured AI analysis. Optional because older stored matches predate it.
  scoreAvailable?: boolean;
  scoreExplanation?: string;
  overallAssessment?: string;
  matched?: RequirementMatch[];
  partiallyMatched?: RequirementMatch[];
  missing?: RequirementMatch[];
  areasToImprove?: string[];
  recommendations?: string[];
  suggestedWording?: SuggestedWording[];
  questions?: string[];
  /** AI-first reports only. */
  qualificationCounts?: Record<RequirementCategory, QualificationCategoryCount>;
  model?: string;
  analysisVersion?: string;
  jobUrl?: string;
  tokens?: { input: number; output: number };
  estimatedCostUsd?: number;
}

export interface RunMatchInput {
  cvId: ID;
  jobTitle: string;
  jobDescription: string;
  company?: string;
  jobUrl?: string;
}

export interface TailorMatchInput {
  matchId: ID;
  cvId?: ID;
  fresh?: boolean;
  /** The post this match analysed, when the browser still has it: the backend verifies it and never stores it. */
  jobDescription?: string;
}

export interface TailorDirectInput {
  cvId: ID;
  jobTitle: string;
  jobDescription: string;
  company?: string;
  jobUrl?: string;
  fresh?: boolean;
}

export interface TailorSuggestion {
  id: ID;
  section: 'summary' | 'experience' | 'skills' | 'project';
  experienceId?: ID;
  bulletIndex?: number;
  projectId?: ID;
  original: string;
  suggested: string;
  explanation?: string;
  jobRequirement?: string;
  reviewRequired?: boolean;
  /** Typed changes (absent on drafts created before the AI-first contract: treated as a rewrite). */
  op?: 'rewrite' | 'reorder' | 'delete' | 'add_skill';
  /** "auto": a verified reorder previewed without approval (Undo available). Everything else needs approval. */
  risk?: 'auto' | 'review';
  skill?: string;
  order?: number[];
  evidence?: { path: string; quote: string };
  /** Content words of a rewrite that appear nowhere in the source CV (computed by the backend, not the model). */
  newTerms?: string[];
}

export interface TailorDraft {
  id: ID;
  matchId?: ID;
  sourceCvId: ID;
  sourceCvRevision?: string | null;
  jobTitle: string;
  company: string;
  jobUrl?: string | null;
  suggestions: TailorSuggestion[];
  missingQualifications?: string[];
  questions?: string[];
  tokens?: { input: number; output: number };
  estimatedCostUsd?: number;
  /** Counts of proposals the backend made, kept and rejected (by reason). */
  proposalStats?: { proposed: number; kept: number; rejected: Record<string, number> } | null;
}

export const STATUSES = ['Saved', 'Applied', 'Interview', 'Offer', 'Rejected', 'Withdrawn'] as const;
export type ApplicationStatus = (typeof STATUSES)[number];

export const WORK_ARRANGEMENTS = ['Remote', 'Hybrid', 'On-site'] as const;
export type WorkArrangement = (typeof WORK_ARRANGEMENTS)[number];

export const EMPLOYMENT_TYPES = [
  'Full-time',
  'Part-time',
  'Contract',
  'Internship',
  'Temporary',
] as const;
export type EmploymentType = (typeof EMPLOYMENT_TYPES)[number];

export interface StatusEvent {
  id: ID;
  status: ApplicationStatus;
  at: string;
  /** gmail_confirmed = an approved Gmail suggestion. */
  source: 'manual' | 'gmail_confirmed';
  note?: string;
}

/** English categories for recruitment activity. Excerpts and job titles keep the email's language. */
export const ACTIVITY_TYPES = [
  'application_confirmation',
  'application_update',
  'assessment',
  'recruiter_follow_up',
  'interview_invitation',
  'interview_rescheduled',
  'deadline_extension',
  'offer',
  'rejection',
  'withdrawal_confirmation',
] as const;
export type ActivityType = (typeof ACTIVITY_TYPES)[number];

export interface ActivityEvent {
  id: ID;
  eventType: ActivityType;
  occurredAt: string;
  excerpt?: string | null;
  scheduledAt?: string | null;
  scheduledTz?: string | null;
  previousScheduledAt?: string | null;
  corrected: boolean;
  /** Built by the backend from a validated Gmail id; absent once disconnected. */
  gmailUrl?: string | null;
}

/** The single pending Gmail status suggestion of an application (its id is the review id). */
export interface GmailSuggestion {
  id: ID;
  proposedStatus: ApplicationStatus;
  currentStatus?: ApplicationStatus;
  eventType?: ActivityType | null;
  excerpt?: string | null;
  receivedAt: string;
  gmailUrl?: string | null;
}

export interface Application {
  id: ID;
  company: string;
  jobTitle: string;
  status: ApplicationStatus;
  jobUrl?: string | null;
  location?: string | null;
  workArrangement?: WorkArrangement | null;
  employmentType?: string | null;
  dateApplied?: string | null;
  notes?: string | null;
  cvId?: ID | null;
  followUpDate?: string | null;
  createdAt?: string;
  updatedAt: string;
  source?: 'manual' | 'gmail';
  importedAt?: string | null;
  /** The date came from a Gmail message that implied (but did not confirm) the application. */
  dateAppliedProvisional?: boolean;
  history: StatusEvent[];
  activity?: ActivityEvent[];
  suggestion: GmailSuggestion | null;
}

export type ApplicationInput = Pick<Application, 'company' | 'jobTitle' | 'status'> &
  Partial<
    Pick<
      Application,
      | 'jobUrl'
      | 'location'
      | 'workArrangement'
      | 'employmentType'
      | 'dateApplied'
      | 'notes'
      | 'cvId'
      | 'followUpDate'
    >
  >;

export type ApplicationPatch = Partial<ApplicationInput>;

/** disconnecting = Gmail data is being erased (or an interrupted disconnect awaits a retry). */
export type GmailConnectionState = 'not_connected' | 'active' | 'reauth_required' | 'disconnecting';

export interface GmailRunSummary {
  trigger: string;
  processed: number;
  imported: number;
  linked: number;
  activities: number;
  reviews: number;
  failed: number;
  stoppedReason?: string | null;
  finishedAt?: string | null;
}

export interface GmailSync {
  running: boolean;
  phase: 'backfill' | 'incremental';
  caughtUp: boolean;
  lastSyncAt?: string | null;
  lastSuccessAt?: string | null;
  remaining: number;
  failed: number;
  processed: number;
  needsAttention?: string | null;
  error?: { code: string; message: string } | null;
  lastRun?: GmailRunSummary | null;
  /** Next automatic retry after a temporary Gmail failure (scheduler enabled only). */
  retryAt?: string | null;
}

export interface GmailStatus {
  /** False when the server has no Google OAuth configuration. */
  available: boolean;
  pendingReviewCount: number;
  connection: { state: GmailConnectionState; email?: string; connectedAt?: string; timezone?: string };
  sync: GmailSync | null;
}

export type GmailReviewKind = 'new_application' | 'ambiguous_link' | 'status_change' | 'schedule_change';

export interface ApplicationBrief {
  id: ID;
  company: string;
  jobTitle: string;
  status: ApplicationStatus;
  dateApplied?: string | null;
}

export interface GmailReview {
  id: ID;
  kind: GmailReviewKind;
  state: string;
  proposal: {
    company?: string | null;
    jobTitle?: string | null;
    status?: ApplicationStatus;
    dateApplied?: string | null;
    dateProvisional?: boolean;
    eventType?: ActivityType | 'other' | null;
    references?: string[];
    reason?: string;
    /** Diagnostic decision signals (enums and booleans only), for newer reviews. */
    signals?: Record<string, string | boolean>;
    scheduledAt?: string | null;
    previousScheduledAt?: string | null;
    /** The email's date-time could not be converted safely; the user sets it. */
    timeIssue?: 'unsupported_timezone' | 'conflicting_timezone' | 'nonexistent_time' | 'ambiguous_time' | null;
    /** The date-time as the email states it (short; plain text). */
    statedTime?: string | null;
    from?: ApplicationStatus;
    to?: ApplicationStatus;
  };
  excerpt?: string | null;
  receivedAt: string;
  gmailUrl?: string | null;
  application: ApplicationBrief | null;
  candidates: ApplicationBrief[];
}

export interface ReviewEdits {
  company?: string;
  jobTitle?: string;
  status?: ApplicationStatus;
  dateApplied?: string;
  applicationId?: string;
  /** Schedule suggestion: the user's date-time, ISO 8601 with offset. */
  scheduledAt?: string;
}

export interface ApiErrorBody {
  message: string;
  fieldErrors?: Record<string, string>;
}
