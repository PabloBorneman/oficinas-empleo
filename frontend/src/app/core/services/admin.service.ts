import { HttpClient } from '@angular/common/http';
import { Injectable, inject } from '@angular/core';
import { Observable } from 'rxjs';

export interface AdminDashboardForm {
  id: number;
  title: string;
  description: string | null;
  active: number;
  scope: 'official' | 'local';
  status: 'draft' | 'active' | 'archived';
  owner_user_id: number | null;
  allow_self_assignment: number;
  created_at: string;
  created_by_name: string | null;
  fields_count: number;
  assignments_count: number;
  submissions_count: number;
}

export interface AdminDashboardFormsResponse {
  ok: boolean;
  forms: AdminDashboardForm[];
}

export interface CreateAdminFormRequest {
  title: string;
  description: string;
  scope: 'official';
  status: 'active';
  allow_self_assignment: number;
}

export interface CreateAdminFormResponse {
  ok: boolean;
  message: string;
  form: {
    id: number;
    title: string;
    description: string;
    active: number;
    created_by: number;
    created_at: string;
  };
}

export interface AdminFormDetail {
  id: number;
  title: string;
  description: string | null;
  active: number;
  scope: 'official' | 'local';
  status: 'draft' | 'active' | 'archived';
  owner_user_id: number | null;
  allow_self_assignment: number;
  created_by: number;
  created_by_name: string | null;
  created_at: string;
}

export type AdminReportChartType = 'auto' | 'donut' | 'columns' | 'horizontal' | 'summary' | 'table';

export interface AdminFormField {
  id: number;
  form_id: number;
  label: string;
  type: string;
  options: string[] | null;
  required: boolean;
  field_order: number;
  chart_type: AdminReportChartType;
  include_in_report: boolean;
  created_at: string;
}

export interface CreateAdminFieldRequest {
  label: string;
  type: string;
  options: string[] | null;
  required: boolean;
  field_order: number;
}

export interface CreateAdminFieldResponse {
  ok: boolean;
  message: string;
  field: AdminFormField;
}

export interface AdminFormAssignment {
  id: number;
  form_id: number;
  user_id: number;
  user_name: string;
  username: string;
  municipality_name: string;
  assigned_at: string;
}

export interface SubmissionsByMunicipality {
  municipality_name: string;
  submissions_count: number;
}

export interface AdminFormSummary {
  fields_count: number;
  assignments_count: number;
  submissions_count: number;
  submissions_by_municipality: SubmissionsByMunicipality[];
}

export interface AdminFormDetailResponse {
  ok: boolean;
  form: AdminFormDetail;
  fields: AdminFormField[];
  assignments: AdminFormAssignment[];
  summary: AdminFormSummary;
}

export interface UpdateAdminFieldReportConfigRequest {
  chart_type: AdminReportChartType;
  include_in_report: boolean;
}

export interface UpdateAdminFieldReportConfigResponse {
  ok: boolean;
  message: string;
  field: AdminFormField;
}

export interface AdminStatsItem {
  label: string;
  count: number;
  percentage: number;
}

export interface AdminStatsResponse {
  ok: boolean;
  field: {
    id: number;
    label: string;
    type: string;
  };
  scope: string;
  municipality_name: string | null;
  total: number;
  items: AdminStatsItem[];
  chart: {
    labels: string[];
    data: number[];
  };
}

export interface AdminComparisonMunicipality {
  municipality_name: string;
  total: number;
  items: AdminStatsItem[];
}

export interface AdminComparisonResponse {
  ok: boolean;
  field: {
    id: number;
    label: string;
    type: string;
  };
  scope: string;
  municipalities: AdminComparisonMunicipality[];
  chart: {
    labels: string[];
    datasets: {
      label: string;
      data: number[];
    }[];
  };
}

export interface AdminSubmissionValue {
  id: number;
  submission_id: number;
  field_id: number;
  label: string;
  type: string;
  value: string | string[];
}

export interface AdminSubmission {
  id: number;
  form_id: number;
  user_id: number;
  user_name: string;
  username: string;
  municipality_name: string;
  created_at: string;
  updated_at: string;
  values: AdminSubmissionValue[];
}

export interface AdminFormSubmissionsResponse {
  ok: boolean;
  form: AdminFormDetail;
  submissions: AdminSubmission[];
}
export interface AdminUser {
  id: number;
  name: string;
  username: string;
  role: 'admin' | 'municipio';
  municipality_name: string | null;
  active: number;
  created_at: string;
}

export interface AdminUsersResponse {
  ok: boolean;
  users: AdminUser[];
}

export interface CreateAdminUserRequest {
  name: string;
  username: string;
  password: string;
  role: 'municipio';
  municipality_name: string;
}

export interface CreateAdminUserResponse {
  ok: boolean;
  message: string;
  user: AdminUser;
}

export interface ArchiveAdminFormResponse {
  ok: boolean;
  message: string;
  form: AdminFormDetail;
}

export interface AssignFormUsersRequest {
  user_ids: number[];
}

export interface AssignFormUsersResponse {
  ok: boolean;
  message: string;
  assignments: AdminFormAssignment[];
}

@Injectable({
  providedIn: 'root'
})
export class AdminService {
  private http = inject(HttpClient);

  getDashboardForms(): Observable<AdminDashboardFormsResponse> {
    return this.http.get<AdminDashboardFormsResponse>('/api/admin/dashboard/forms');
  }

  createForm(payload: CreateAdminFormRequest): Observable<CreateAdminFormResponse> {
    return this.http.post<CreateAdminFormResponse>('/api/admin/forms', payload);
  }

  getFormDetail(formId: number): Observable<AdminFormDetailResponse> {
    return this.http.get<AdminFormDetailResponse>(`/api/admin/forms/${formId}/detail`);
  }

  createFormField(formId: number, payload: CreateAdminFieldRequest): Observable<CreateAdminFieldResponse> {
    return this.http.post<CreateAdminFieldResponse>(`/api/admin/forms/${formId}/fields`, payload);
  }

  getFormStats(formId: number, fieldId: number): Observable<AdminStatsResponse> {
    return this.http.get<AdminStatsResponse>(`/api/admin/forms/${formId}/stats?field_id=${fieldId}`);
  }

  updateFieldReportConfig(
    formId: number,
    fieldId: number,
    payload: UpdateAdminFieldReportConfigRequest
  ): Observable<UpdateAdminFieldReportConfigResponse> {
    return this.http.patch<UpdateAdminFieldReportConfigResponse>(
      `/api/admin/forms/${formId}/fields/${fieldId}/report-config`,
      payload
    );
  }

  getFormComparison(formId: number, fieldId: number): Observable<AdminComparisonResponse> {
    return this.http.get<AdminComparisonResponse>(`/api/admin/forms/${formId}/comparison?field_id=${fieldId}`);
  }

  getFormSubmissions(formId: number): Observable<AdminFormSubmissionsResponse> {
    return this.http.get<AdminFormSubmissionsResponse>(`/api/admin/forms/${formId}/submissions`);
  }

  downloadFormReportPdf(formId: number): Observable<Blob> {
    return this.http.get(`/api/admin/forms/${formId}/report/pdf`, {
      responseType: 'blob'
    });
  }

  downloadFormHistoryPdf(formId: number): Observable<Blob> {
    return this.http.get(`/api/admin/forms/${formId}/history/pdf`, {
      responseType: 'blob'
    });
  }

  archiveForm(formId: number): Observable<ArchiveAdminFormResponse> {
    return this.http.patch<ArchiveAdminFormResponse>(`/api/admin/forms/${formId}/archive`, {});
  }

  getUsers(): Observable<AdminUsersResponse> {
    return this.http.get<AdminUsersResponse>('/api/admin/users');
  }

  createUser(payload: CreateAdminUserRequest): Observable<CreateAdminUserResponse> {
    return this.http.post<CreateAdminUserResponse>('/api/admin/users', payload);
  }

  assignFormUsers(formId: number, payload: AssignFormUsersRequest): Observable<AssignFormUsersResponse> {
    return this.http.post<AssignFormUsersResponse>(`/api/admin/forms/${formId}/assignments`, payload);
  }
}



