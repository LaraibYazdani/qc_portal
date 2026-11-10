/** Shapes returned by the PackVision API (kept in step with frontend/src/types). */

export type Role = 'sales' | 'operator' | 'qc_supervisor' | 'company_admin' | 'admin';

export const ROLE_LABELS: Record<Role, string> = {
  sales: 'Uploader',
  operator: 'Quality checker',
  qc_supervisor: 'QC supervisor',
  company_admin: 'Company admin',
  admin: 'Group admin',
};

export const CHECKER_ROLES: Role[] = ['operator', 'qc_supervisor', 'company_admin', 'admin'];

export interface User {
  id: number;
  name: string;
  email: string;
  role: Role;
  company_id?: number | null;
  company_code?: string | null;
  company_name?: string | null;
  status?: 'active' | 'pending' | 'disabled';
}

export type ReferenceStatus = 'not_started' | 'queued' | 'processing' | 'needs_review' | 'approved' | 'rejected' | 'failed';
export type Verdict = 'PASS' | 'FAIL' | 'RETAKE';
export type Sensitivity = 'low' | 'normal' | 'high';

export interface Job {
  id: number;
  job_number: string;
  po_number: string | null;
  design_name: string | null;
  image_path: string;
  uploaded_by_name: string;
  created_at: string;
  company_name: string | null;
  current_version: number | null;
  reference_status: ReferenceStatus | null;
}

export interface Reference {
  version_id: number;
  version_no: number;
  status: ReferenceStatus;
  status_label: string;
  design_path: string;
  preview: string | null;
  clean: string | null;
  panels: number | null;
  error: string | null;
  review_note: string | null;
  job_id: number;
  job_number: string;
  design_name: string | null;
  company_name: string | null;
}

export interface Defect {
  id: number;
  type: string;
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

export const SENSITIVITY_OPTIONS: { value: Sensitivity; label: string }[] = [
  { value: 'low', label: 'Tolerant' },
  { value: 'normal', label: 'Normal' },
  { value: 'high', label: 'Strict' },
];
