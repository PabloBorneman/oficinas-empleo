import { HttpClient } from '@angular/common/http';
import { Injectable, inject } from '@angular/core';
import { Observable } from 'rxjs';

export interface MunicipioAssignedForm {
  id: number;
  title: string;
  description: string | null;
  active: number;
  created_at: string;
  assigned_at: string;
}

export interface MunicipioFormsResponse {
  ok: boolean;
  municipality_name: string;
  forms: MunicipioAssignedForm[];
}

export interface MunicipioAvailableForm {
  id: number;
  title: string;
  description: string | null;
  scope: 'official';
  status: 'draft' | 'active' | 'archived';
  active: number;
  allow_self_assignment: number;
  created_at: string;
  fields_count: number;
  already_assigned: boolean;
  my_submissions_count: number;
}

export interface MunicipioAvailableFormsResponse {
  ok: boolean;
  municipality_name: string;
  forms: MunicipioAvailableForm[];
}

export interface MunicipioFormDetail {
  id: number;
  title: string;
  description: string | null;
  active: number;
  created_at: string;
  assigned_at: string;
}

export interface MunicipioFormField {
  id: number;
  form_id: number;
  label: string;
  type: 'text' | 'number' | 'select' | 'multiselect' | 'boolean' | 'date' | 'textarea';
  options: string[] | null;
  required: boolean;
  field_order: number;
  created_at: string;
}

export interface MunicipioFormDetailResponse {
  ok: boolean;
  municipality_name: string;
  form: MunicipioFormDetail;
  fields: MunicipioFormField[];
}

export interface MunicipioSubmissionValue {
  id: number;
  submission_id: number;
  field_id: number;
  label: string;
  type: string;
  value: string | string[];
}

export interface MunicipioSubmission {
  id: number;
  form_id: number;
  user_id: number;
  municipality_name: string;
  created_at: string;
  updated_at: string;
  values: MunicipioSubmissionValue[];
}

export interface MunicipioSubmissionsDetailResponse {
  ok: boolean;
  municipality_name: string;
  form: {
    id: number;
    title: string;
    description: string | null;
    scope: 'official' | 'local';
    status: 'draft' | 'active' | 'archived';
    active: number;
  };
  submissions: MunicipioSubmission[];
}

export interface CreateSubmissionRequest {
  values: {
    field_id: number;
    value: string | string[];
  }[];
}

export interface CreateSubmissionResponse {
  ok: boolean;
  message: string;
  submission: {
    id: number;
    form_id: number;
    user_id: number;
    municipality_name: string;
    created_at: string;
    updated_at: string;
  };
}

@Injectable({
  providedIn: 'root'
})
export class MunicipioService {
  private http = inject(HttpClient);

  getMyForms(): Observable<MunicipioFormsResponse> {
    return this.http.get<MunicipioFormsResponse>('/api/municipio/forms');
  }

  getAvailableForms(): Observable<MunicipioAvailableFormsResponse> {
    return this.http.get<MunicipioAvailableFormsResponse>('/api/municipio/available-forms');
  }

  getFormDetail(formId: number): Observable<MunicipioFormDetailResponse> {
    return this.http.get<MunicipioFormDetailResponse>(`/api/municipio/forms/${formId}`);
  }

  getFormSubmissionsDetail(formId: number): Observable<MunicipioSubmissionsDetailResponse> {
    return this.http.get<MunicipioSubmissionsDetailResponse>(`/api/municipio/forms/${formId}/submissions/detail`);
  }

  createSubmission(formId: number, payload: CreateSubmissionRequest): Observable<CreateSubmissionResponse> {
    return this.http.post<CreateSubmissionResponse>(`/api/municipio/forms/${formId}/submissions`, payload);
  }
}
