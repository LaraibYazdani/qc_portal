export interface Job {
  id: number;
  job_number: string;
  po_number?: string;
  design_name?: string;
  image_path: string;
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
  archived_at?: string | null;
  archive_reason?: string | null;
  reference_status?: string | null;   // print-check reference of the current version
}

export interface CreateJobRequest {
  job_number: string;
  po_number?: string;
  design_name?: string;
  design: File;
}

export interface UpdateJobRequest {
  po_number?: string;
  design_name?: string;
  design?: File;
}

export interface JobSearchRequest {
  job_number?: string;
  po_number?: string;
}
