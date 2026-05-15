import { Component, OnInit, inject } from '@angular/core';
import { FormBuilder, ReactiveFormsModule, Validators } from '@angular/forms';
import { ActivatedRoute, Router } from '@angular/router';
import {
  AdminComparisonResponse,
  AdminFormAssignment,
  AdminFormDetailResponse,
  AdminFormField,
  AdminService,
  AdminStatsResponse,
  AdminFormSubmissionsResponse,
  AdminSubmissionValue,
  AdminUser,
  CreateAdminFieldRequest
} from '../../core/services/admin.service';

@Component({
  selector: 'app-admin-form-detail',
  imports: [ReactiveFormsModule],
  templateUrl: './admin-form-detail.html',
  styleUrl: './admin-form-detail.scss'
})
export class AdminFormDetailComponent implements OnInit {
  private route = inject(ActivatedRoute);
  private router = inject(Router);
  private adminService = inject(AdminService);
  private fb = inject(FormBuilder);

  formId = 0;

  loading = true;
  errorMessage = '';
  detail: AdminFormDetailResponse | null = null;

  creatingField = false;
  savingField = false;
  fieldErrorMessage = '';
  fieldSuccessMessage = '';

  fieldForm = this.fb.nonNullable.group({
    label: ['', Validators.required],
    type: ['text', Validators.required],
    optionsText: [''],
    required: ['true', Validators.required]
  });

  usersLoading = false;
  usersErrorMessage = '';
  users: AdminUser[] = [];
  assignableUsers: AdminUser[] = [];

  selectedUserId = 0;
  assigning = false;
  assignmentErrorMessage = '';
  assignmentSuccessMessage = '';

  selectedFieldId = 0;

  statsLoading = false;
  statsErrorMessage = '';
  stats: AdminStatsResponse | null = null;

  comparisonLoading = false;
  comparisonErrorMessage = '';
  comparison: AdminComparisonResponse | null = null;

  submissionsLoading = false;
  submissionsErrorMessage = '';
  submissionsResponse: AdminFormSubmissionsResponse | null = null;

  submissionSearchTerm = '';
  selectedSubmissionMunicipality = '';

  ngOnInit(): void {
    const formId = Number(this.route.snapshot.paramMap.get('id'));

    if (!formId) {
      this.errorMessage = 'ID de relevamiento inválido.';
      this.loading = false;
      return;
    }

    this.formId = formId;
    this.loadDetail(formId);
    this.loadUsers();
    this.loadSubmissions();
  }

  loadDetail(formId: number): void {
    this.loading = true;
    this.errorMessage = '';

    this.adminService.getFormDetail(formId).subscribe({
      next: (response) => {
        this.detail = response;
        this.loading = false;
        this.refreshAssignableUsers();

        if (response.fields.length > 0) {
          this.selectedFieldId = response.fields[0].id;
          this.loadStats();
        } else {
          this.selectedFieldId = 0;
          this.stats = null;
          this.comparison = null;
        }
      },
      error: (error) => {
        this.errorMessage = error?.error?.message || 'No se pudo cargar el detalle del relevamiento.';
        this.loading = false;
      }
    });
  }

  openFieldForm(): void {
    this.creatingField = true;
    this.fieldErrorMessage = '';
    this.fieldSuccessMessage = '';
    this.fieldForm.reset({
      label: '',
      type: 'text',
      optionsText: '',
      required: 'true'
    });
  }

  cancelFieldForm(): void {
    this.creatingField = false;
    this.fieldErrorMessage = '';
    this.fieldSuccessMessage = '';
    this.fieldForm.reset({
      label: '',
      type: 'text',
      optionsText: '',
      required: 'true'
    });
  }

  saveField(): void {
    if (!this.detail || this.fieldForm.invalid || this.savingField) {
      this.fieldForm.markAllAsTouched();
      this.fieldErrorMessage = 'Completá los campos obligatorios antes de guardar.';
      return;
    }

    const formValue = this.fieldForm.getRawValue();
    const options = this.parseOptions(formValue.optionsText);
    const fieldOrder = this.detail.fields.length + 1;

    if ((formValue.type === 'select' || formValue.type === 'multiselect') && options.length === 0) {
      this.fieldErrorMessage = 'Los campos de selección necesitan opciones separadas por coma.';
      return;
    }

    const payload: CreateAdminFieldRequest = {
      label: formValue.label.trim(),
      type: formValue.type,
      options: options.length > 0 ? options : null,
      required: formValue.required === 'true',
      field_order: fieldOrder
    };

    this.savingField = true;
    this.fieldErrorMessage = '';
    this.fieldSuccessMessage = '';

    this.adminService.createFormField(this.formId, payload).subscribe({
      next: (response) => {
        this.savingField = false;
        this.creatingField = false;
        this.fieldSuccessMessage = response.message || 'Campo agregado correctamente.';
        this.cancelFieldForm();
        this.loadDetail(this.formId);
      },
      error: (error) => {
        this.savingField = false;
        this.fieldErrorMessage = error?.error?.message || 'No se pudo agregar el campo.';
      }
    });
  }

  parseOptions(optionsText: string): string[] {
    return optionsText
      .split(',')
      .map((option) => option.trim())
      .filter((option) => option.length > 0);
  }

  isFieldFormInvalid(controlName: 'label' | 'type' | 'required'): boolean {
    const control = this.fieldForm.controls[controlName];
    return control.invalid && (control.touched || control.dirty);
  }

  loadUsers(): void {
    this.usersLoading = true;
    this.usersErrorMessage = '';

    this.adminService.getUsers().subscribe({
      next: (response) => {
        this.users = response.users;
        this.usersLoading = false;
        this.refreshAssignableUsers();
      },
      error: (error) => {
        this.usersErrorMessage = error?.error?.message || 'No se pudieron cargar las oficinas.';
        this.usersLoading = false;
      }
    });
  }

  refreshAssignableUsers(): void {
    if (!this.detail || this.users.length === 0) {
      return;
    }

    const assignedIds = new Set(this.detail.assignments.map((assignment) => assignment.user_id));

    this.assignableUsers = this.users.filter((user) => {
      return user.role === 'municipio' && user.active === 1 && !assignedIds.has(user.id);
    });

    if (this.assignableUsers.length > 0) {
      this.selectedUserId = this.assignableUsers[0].id;
    } else {
      this.selectedUserId = 0;
    }
  }

  onAssignUserChange(event: Event): void {
    const select = event.target as HTMLSelectElement;
    this.selectedUserId = Number(select.value);
  }

  assignSelectedUser(): void {
    if (!this.selectedUserId || this.assigning) {
      return;
    }

    this.assignUsers([this.selectedUserId], 'Oficina asignada correctamente.');
  }

  assignAllUsers(): void {
    if (this.assignableUsers.length === 0 || this.assigning) {
      return;
    }

    const userIds = this.assignableUsers.map((user) => user.id);
    this.assignUsers(userIds, 'Relevamiento asignado a todas las oficinas pendientes.');
  }

  assignUsers(userIds: number[], successMessage: string): void {
    this.assigning = true;
    this.assignmentErrorMessage = '';
    this.assignmentSuccessMessage = '';

    this.adminService.assignFormUsers(this.formId, { user_ids: userIds }).subscribe({
      next: (response) => {
        this.assigning = false;
        this.assignmentSuccessMessage = response.message || successMessage;
        this.loadDetail(this.formId);
      },
      error: (error) => {
        this.assigning = false;
        this.assignmentErrorMessage = error?.error?.message || 'No se pudo asignar el relevamiento.';
      }
    });
  }

  onStatsFieldChange(event: Event): void {
    const select = event.target as HTMLSelectElement;
    this.selectedFieldId = Number(select.value);
    this.loadStats();
  }

  loadStats(): void {
    if (!this.formId || !this.selectedFieldId) {
      return;
    }

    this.loadUnifiedStats();
    this.loadComparisonStats();
  }

  loadUnifiedStats(): void {
    this.statsLoading = true;
    this.statsErrorMessage = '';
    this.stats = null;

    this.adminService.getFormStats(this.formId, this.selectedFieldId).subscribe({
      next: (response) => {
        this.stats = response;
        this.statsLoading = false;
      },
      error: (error) => {
        this.statsErrorMessage = error?.error?.message || 'No se pudo cargar la estadística unificada.';
        this.statsLoading = false;
      }
    });
  }

  loadComparisonStats(): void {
    this.comparisonLoading = true;
    this.comparisonErrorMessage = '';
    this.comparison = null;

    this.adminService.getFormComparison(this.formId, this.selectedFieldId).subscribe({
      next: (response) => {
        this.comparison = response;
        this.comparisonLoading = false;
      },
      error: (error) => {
        this.comparisonErrorMessage = error?.error?.message || 'No se pudo cargar la comparativa.';
        this.comparisonLoading = false;
      }
    });
  }

  fixEncodingText(text: string): string {
    return text
      .replaceAll('Ma�ana', 'Mañana')
      .replaceAll('D�as', 'Días')
      .replaceAll('Mi�rcoles', 'Miércoles')
      .replaceAll('S�bado', 'Sábado');
  }

  formatText(text: string | null): string {
    return this.fixEncodingText(text || '');
  }
  get allSubmissions() {
    return this.submissionsResponse?.submissions || [];
  }

  get availableSubmissionMunicipalities(): string[] {
    const municipalities = this.allSubmissions
      .map((submission) => this.formatAdminText(submission.municipality_name || ''))
      .filter((municipality) => municipality.length > 0);

    return Array.from(new Set(municipalities)).sort((a, b) => a.localeCompare(b));
  }

  get filteredSubmissions() {
    const search = this.submissionSearchTerm.trim().toLowerCase();
    const municipality = this.selectedSubmissionMunicipality.trim().toLowerCase();

    return this.allSubmissions.filter((submission) => {
      const submissionMunicipality = this.formatAdminText(submission.municipality_name || '').toLowerCase();

      const matchesMunicipality =
        !municipality ||
        submissionMunicipality === municipality;

      const matchesSearch =
        !search ||
        this.getSubmissionSearchText(submission).includes(search);

      return matchesMunicipality && matchesSearch;
    });
  }

  onSubmissionSearchInput(event: Event): void {
    const input = event.target as HTMLInputElement;
    this.submissionSearchTerm = input.value;
  }

  onSubmissionMunicipalityChange(event: Event): void {
    const select = event.target as HTMLSelectElement;
    this.selectedSubmissionMunicipality = select.value;
  }

  clearSubmissionFilters(): void {
    this.submissionSearchTerm = '';
    this.selectedSubmissionMunicipality = '';
  }

  getSubmissionSearchText(submission: AdminFormSubmissionsResponse['submissions'][number]): string {
    const valuesText = submission.values
      .map((value) => {
        return [
          this.formatAdminText(value.label),
          this.formatAdminSubmissionValue(value)
        ].join(' ');
      })
      .join(' ');

    return [
      submission.id,
      this.formatAdminText(submission.municipality_name || ''),
      submission.username || '',
      submission.created_at || '',
      valuesText
    ]
      .join(' ')
      .toLowerCase();
  }

  loadSubmissions(): void {
    this.submissionsLoading = true;
    this.submissionsErrorMessage = '';

    this.adminService.getFormSubmissions(this.formId).subscribe({
      next: (response) => {
        this.submissionsResponse = response;
        this.submissionsLoading = false;
      },
      error: (error) => {
        this.submissionsErrorMessage = error?.error?.message || 'No se pudieron cargar las respuestas.';
        this.submissionsLoading = false;
      }
    });
  }

  exportSubmissionsCsv(): void {
    const submissions = this.filteredSubmissions;

    if (submissions.length === 0) {
      return;
    }

    const fieldLabels = this.detail?.fields.map((field) => this.formatAdminText(field.label)) || [];

    const headers = [
      'ID respuesta',
      'Municipio',
      'Usuario',
      'Fecha',
      ...fieldLabels
    ];

    const rows = submissions.map((submission) => {
      const valuesByLabel = new Map<string, string>();

      for (const value of submission.values) {
        valuesByLabel.set(
          this.formatAdminText(value.label),
          this.formatAdminSubmissionValue(value)
        );
      }

      return [
        submission.id,
        this.formatAdminText(submission.municipality_name),
        submission.username,
        submission.created_at,
        ...fieldLabels.map((label) => valuesByLabel.get(label) || '')
      ];
    });

    const csvContent = [
      headers,
      ...rows
    ]
      .map((row) => row.map((cell) => this.escapeCsvValue(String(cell))).join(';'))
      .join('\n');

    const blob = new Blob(['\uFEFF' + csvContent], {
      type: 'text/csv;charset=utf-8;'
    });

    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');

    link.href = url;
    link.download = `respuestas-relevamiento-${this.formId}.csv`;
    link.click();

    URL.revokeObjectURL(url);
  }

  escapeCsvValue(value: string): string {
    const escaped = value.replaceAll('"', '""');
    return `"${escaped}"`;
  }
  fixAdminEncodingText(text: string): string {
    return text
      .replaceAll('Ma�ana', 'Mañana')
      .replaceAll('D�as', 'Días')
      .replaceAll('Mi�rcoles', 'Miércoles')
      .replaceAll('S�bado', 'Sábado');
  }

  formatAdminText(text: string | null): string {
    return this.fixAdminEncodingText(text || '');
  }

  formatAdminSubmissionValue(value: AdminSubmissionValue): string {
    if (Array.isArray(value.value)) {
      return this.fixAdminEncodingText(value.value.join(', '));
    }

    if (typeof value.value === 'string' && value.value.trim().startsWith('[')) {
      try {
        const parsed = JSON.parse(value.value);

        if (Array.isArray(parsed)) {
          return this.fixAdminEncodingText(parsed.join(', '));
        }
      } catch {
        return this.fixAdminEncodingText(value.value);
      }
    }

    return this.fixAdminEncodingText(String(value.value));
  }
  goBack(): void {
    this.router.navigateByUrl('/admin');
  }

  getScopeLabel(scope: string): string {
    if (scope === 'official') {
      return 'Oficial / unificado';
    }

    return 'Local';
  }

  getStatusLabel(status: string): string {
    if (status === 'active') {
      return 'Activo';
    }

    if (status === 'draft') {
      return 'Borrador';
    }

    if (status === 'archived') {
      return 'Archivado';
    }

    return status;
  }

  getRequiredLabel(field: AdminFormField): string {
    return field.required ? 'Obligatorio' : 'Opcional';
  }

  getOptionsText(field: AdminFormField): string {
    if (!field.options || field.options.length === 0) {
      return 'Sin opciones';
    }

    return this.fixEncodingText(field.options.join(', '));
  }

  getMunicipalityLabel(assignment: AdminFormAssignment): string {
    return assignment.municipality_name || assignment.user_name || assignment.username;
  }

  getUserOptionLabel(user: AdminUser): string {
    return `${user.municipality_name || user.name} (${user.username})`;
  }

  getPercentageWidth(percentage: number): string {
    return `${percentage}%`;
  }
}





