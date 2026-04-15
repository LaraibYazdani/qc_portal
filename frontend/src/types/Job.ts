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
