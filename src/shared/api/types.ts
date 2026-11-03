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

export interface MatchResult {
  id: ID;
  cvId: ID;
  cvName: string;
  jobTitle: string;
  company: string;
  jobText: string;
  score: number;
  verdict: 'Strong fit' | 'Good fit' | 'Partial fit' | 'Low fit';
  summary: string;
  strengths: MatchStrength[];
  gaps: MatchGap[];
  createdAt: string;
}

export interface TailorSuggestion {
  id: ID;
  section: 'summary' | 'experience' | 'skills';
  experienceId?: ID;
  bulletIndex?: number;
  original: string;
  suggested: string;
}

export interface TailorDraft {
  id: ID;
  matchId: ID;
  sourceCvId: ID;
  jobTitle: string;
  company: string;
  suggestions: TailorSuggestion[];
}

export const STATUSES = ['Applied', 'Under review', 'Interview', 'Offer', 'Rejected', 'Withdrawn'] as const;
export type ApplicationStatus = (typeof STATUSES)[number];

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
  dateApplied: string;
  status: ApplicationStatus;
  jobUrl?: string;
  notes?: string;
  cvId?: ID;
  history: StatusEvent[];
  suggestion: GmailSuggestion | null;
  updatedAt: string;
}

export type ApplicationInput = Pick<Application, 'company' | 'jobTitle' | 'dateApplied' | 'status'> &
  Partial<Pick<Application, 'jobUrl' | 'notes' | 'cvId'>>;

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
