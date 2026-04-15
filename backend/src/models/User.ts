export interface User {
  id: number;
  name: string;
  email: string;
  password: string;
  role: 'operator' | 'sales' | 'admin';
  created_at: Date;
}

export interface UserResponse {
  id: number;
  name: string;
  email: string;
  role: 'operator' | 'sales' | 'admin';
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
