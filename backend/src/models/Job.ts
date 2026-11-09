export interface Job {
  id: number;
  job_number: string;
  po_number?: string;
  design_name?: string;
  image_path: string;          // current design's display copy
  uploaded_by: number;
  created_at: Date;
}

export interface JobResponse extends Job {
  uploaded_by_name?: string;
  company_id?: number | null;
  company_code?: string | null;
  company_name?: string | null;
  status?: 'active' | 'archived';
  current_version?: number | null;
  archived_at?: Date | null;
  archive_reason?: string | null;
}

export interface DesignVersionResponse {
  id: number;
  version_no: number;
  file_path: string;
  original_path: string | null;
  original_filename: string | null;
  mime_type: string | null;
  file_size: number | null;
  change_note: string | null;
  reference_status: string;
  uploaded_by: number;
  uploaded_by_name?: string;
  created_at: Date;
  is_current: boolean;
}

export interface CreateJobRequest {
  job_number: string;
  po_number?: string;
  design_name?: string;
  company_id?: number;
  design: any;
}

export interface UpdateJobRequest {
  po_number?: string;
  design_name?: string;
  design?: any;
}

export interface JobSearchRequest {
  job_number?: string;
  po_number?: string;
}
