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
}

export interface MatchStrength {
  skill: string;
  evidence: string;
}
export interface MatchGap {
  skill: string;
  tip: string;
}

export type RequirementImportance = 'required' | 'preferred';
export interface RequirementMatch {
  requirement: string;
  importance: RequirementImportance;
  status?: string;
  evidence: string;
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

export interface TailorDirectInput {
  cvId: ID;
  jobTitle: string;
  jobDescription: string;
  company?: string;
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
}

export interface TailorDraft {
  id: ID;
  matchId?: ID;
  sourceCvId: ID;
  jobTitle: string;
  company: string;
  suggestions: TailorSuggestion[];
  missingQualifications?: string[];
  questions?: string[];
  tokens?: { input: number; output: number };
  estimatedCostUsd?: number;
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
  jobUrl?: string;
  location?: string;
  workArrangement?: WorkArrangement;
  employmentType?: string;
  dateApplied?: string;
  notes?: string;
  cvId?: ID;
  followUpDate?: string;
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

// Job listings (open jobs in Poland from tracked companies)
export type JobLevel = 'internship' | 'entry' | 'other';
export type JobLevelFilter = 'entry' | 'internship' | 'all';

export interface JobListing {
  id: string;
  title: string;
  company: string;
  city: string;
  location: string;
  level: JobLevel;
  url: string | null;
  postedAt: string | null;
  source: string;
}

export interface JobDetail extends JobListing {
  description: string | null;
}

export interface JobFacet {
  name: string;
  count: number;
}

export interface JobsQuery {
  level: JobLevelFilter;
  city?: string;
  company?: string;
  q?: string;
  page: number;
  pageSize?: number;
}

export interface JobsPage {
  items: JobListing[];
  total: number;
  page: number;
  pageSize: number;
  levels: Partial<Record<JobLevel, number>>;
  cities: JobFacet[];
  companies: JobFacet[];
  refreshing: boolean;
  refreshedAt: string | null;
}
