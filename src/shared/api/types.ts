// API contract shared by the mock API (MSW) and the real FastAPI backend.
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
  notShown: number;
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
  // Structured AI analysis (real backend). Optional so demo/mock data stays valid.
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
  qualificationCounts?: { total: number } & Record<RequirementCategory, QualificationCategoryCount>;
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
  source: 'manual' | 'gmail_auto' | 'gmail_confirmed';
  note?: string;
}

export interface GmailSuggestion {
  id: ID;
  proposedStatus: ApplicationStatus;
  from: string;
  snippet: string;
  receivedAt: string;
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
  // Deferred Gmail/timeline features. The real API returns an empty history and null
  // suggestion (the feature is not implemented yet); the demo (MSW) data populates them.
  history: StatusEvent[];
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

export interface GmailConnection {
  connected: boolean;
  email?: string;
  lastSyncAt?: string;
  autoSync: boolean;
  updatesThisMonth: number;
}

export interface SyncResult {
  checked: number;
  autoUpdated: number;
  newSuggestions: number;
  connection: GmailConnection;
}

export interface ApiErrorBody {
  message: string;
  fieldErrors?: Record<string, string>;
}
