// Stored role values are phase 1's, so existing accounts keep working:
// sales = Uploader, operator = Quality checker, admin = Group admin.
export type Role = 'sales' | 'operator' | 'qc_supervisor' | 'company_admin' | 'admin';

export const ROLE_LABELS: Record<Role, string> = {
  sales: 'Uploader',
  operator: 'Quality checker',
  qc_supervisor: 'QC supervisor',
  company_admin: 'Company admin',
  admin: 'Group admin',
};

export interface User {
  id: number;
  name: string;
  email: string;
  password: string;
  role: Role;
  created_at: Date;
}

export interface UserResponse {
  id: number;
  name: string;
  email: string;
  role: Role;
  company_id?: number | null;
  company_code?: string | null;
  company_name?: string | null;
  status?: 'active' | 'pending' | 'disabled';
  created_at: Date;
}

export interface LoginRequest {
  email: string;
  password: string;
}

export interface LoginResponse {
  success: boolean;
  user?: UserResponse;
  token?: string;
  message?: string;
}
