export type ReferenceStatus = 'not_started' | 'queued' | 'processing' | 'needs_review' | 'approved' | 'rejected' | 'failed';
export type Verdict = 'PASS' | 'FAIL' | 'RETAKE';
export type Sensitivity = 'low' | 'normal' | 'high';

export interface Reference {
  version_id: number;
  version_no: number;
  status: ReferenceStatus;
  status_label: string;
  design_path: string;
  preview: string | null;   // design with removed marks in red, ignored areas grey, panels green
  clean: string | null;     // design as the engine compares it (marks removed)
  panels: number | null;
  compare_fraction: number | null;
  inks: { name: string; hex: string; is_board: boolean }[];
  error: string | null;
  prepared_at: string | null;
  reviewed_at: string | null;
  reviewed_by_name: string | null;
  review_note: string | null;
  job_id: number;
  job_number: string;
  design_name: string | null;
  company_name: string | null;
}

export interface Defect {
  id: number;
  type: string;
  bbox: [number, number, number, number];
  area_px: number;
  severity: number;
  closeup?: string;
}

export interface InkResult {
  name: string;
  hex: string;
  photo_hex: string | null;
  status: 'PASS' | 'FAIL' | 'NOT VISIBLE';
  delta_e: number | null;
  limit?: number;
  target: 'design' | 'master';
  note: string;
}

export interface InspectionResult {
  verdict: Verdict;
  reasons: string[];
  defects: Defect[];
  inks: InkResult[];
  coverage: number;
  ssim: number | null;
  inliers: number;
  lighting?: string;
  seconds: number;
  sensitivity: Sensitivity;
  match_failed?: boolean;
  images: { aligned?: string; overlay?: string; heatmap?: string };
}

export interface Inspection {
  id: number;
  job_id: number;
  job_number: string;
  design_name: string | null;
  version_no: number;
  company_name: string | null;
  status: 'queued' | 'processing' | 'done' | 'failed';
  verdict: Verdict | null;
  sensitivity: Sensitivity;
  source: 'web' | 'mobile' | 'camera';
  photo_path: string;
  defect_count: number | null;
  error: string | null;
  created_at: string;
  completed_at: string | null;
  inspected_by_name: string;
  reasons: string[];
  overlay: string | null;
  queue_position?: number;
  result?: InspectionResult;
}

export interface EngineStatus {
  enabled: boolean;
  running: boolean;
  checks_waiting: number;
  references_waiting: number;
}

export const CHECKER_ROLES = ['operator', 'qc_supervisor', 'company_admin', 'admin'];
export const REVIEWER_ROLES = ['qc_supervisor', 'company_admin', 'admin'];
