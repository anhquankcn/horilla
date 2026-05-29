import { createContext, useContext, useEffect, useState, type ReactNode } from 'react';

export interface Employee {
  id: number;
  badge_id: string;
  employee_first_name: string;
  employee_last_name: string;
  full_name: string;
  email: string;
  phone: string;
  employee_profile: string | null;
  dob: string | null;
  gender: string;
  address: string;
  country: string;
  state: string;
  city: string;
  zip: string;
  qualification: string;
  experience: number;
  marital_status: string;
  children: number;
  emergency_contact: string;
  emergency_contact_name: string;
  emergency_contact_relation: string;
  is_active: boolean;
  department_name: string | null;
  job_position_name: string | null;
  shift_name: string | null;
  company_name: string | null;
  reporting_manager_name: string | null;
  work_level_name: string | null;
}

interface AuthState {
  loading: boolean;
  authenticated: boolean;
  employee: Employee | null;
  refresh: () => Promise<void>;
}

const AuthContext = createContext<AuthState>({
  loading: true,
  authenticated: false,
  employee: null,
  refresh: async () => {},
});

export function AuthProvider({ children }: { children: ReactNode }) {
  const [loading, setLoading] = useState(true);
  const [employee, setEmployee] = useState<Employee | null>(null);

  const refresh = async () => {
    try {
      const res = await fetch('/bff/auth/me', { credentials: 'include' });
      if (res.ok) {
        const data = await res.json();
        if (data.authenticated) {
          setEmployee(data.employee);
          return;
        }
      }
      setEmployee(null);
    } catch {
      setEmployee(null);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { refresh(); }, []);

  return (
    <AuthContext.Provider value={{ loading, authenticated: !!employee, employee, refresh }}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  return useContext(AuthContext);
}
