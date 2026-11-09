// Stored role values are kept from phase 1 so existing accounts keep working:
// sales = Uploader, operator = Quality checker, admin = Group admin.
export const ROLES = ['sales', 'operator', 'qc_supervisor', 'company_admin', 'admin'] as const;
export type Role = typeof ROLES[number];

export const ROLE_LABELS: Record<Role, string> = {
  sales: 'Uploader',
  operator: 'Quality checker',
  qc_supervisor: 'QC supervisor',
  company_admin: 'Company admin',
  admin: 'Group admin',
};

export type UserStatus = 'active' | 'pending' | 'disabled';

export interface User {
  id: number;
  name: string;
  email: string;
  password: string | null;
  role: Role;
  company_id: number | null;
  sf_employee_id: string | null;
  status: UserStatus;
  auth_source: 'local' | 'ias';
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
  status?: UserStatus;
  created_at: Date;
}

/** The signed-in user as loaded by the auth middleware on each request. */
export interface AuthUser extends UserResponse {
  company_id: number | null;
  status: UserStatus;
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
