import { Component, OnInit, inject } from '@angular/core';
import { FormBuilder, ReactiveFormsModule, Validators } from '@angular/forms';
import { ActivatedRoute, Router } from '@angular/router';
import {
  AdminComparisonResponse,
  AdminFormAssignment,
  AdminFormDetailResponse,
  AdminFormField,
  AdminReportChartType,
  AdminService,
  AdminStatsItem,
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

  private sortChartItemsDesc<T extends { count: number; label?: string }>(items: T[]): T[] {
    return [...items].sort((a, b) => {
      if ((b.count ?? 0) !== (a.count ?? 0)) {
        return (b.count ?? 0) - (a.count ?? 0);
      }

      return String(a.label ?? '').localeCompare(String(b.label ?? ''), 'es');
    });
  }

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
  selectedComparisonMunicipality = '';

  submissionsLoading = false;
  submissionsErrorMessage = '';

  reportDownloading = false;
  historyDownloading = false;
  reportErrorMessage = '';

  reportConfigSavingFieldId = 0;
  reportConfigSuccessMessage = '';
  reportConfigErrorMessage = '';

  reportChartTypes: { value: AdminReportChartType; label: string }[] = [
    { value: 'auto', label: 'Automático' },
    { value: 'donut', label: 'Dona' },
    { value: 'columns', label: 'Columnas' },
    { value: 'horizontal', label: 'Barras horizontales' },
    { value: 'summary', label: 'Resumen numérico' },
    { value: 'table', label: 'Tabla / sin gráfico' }
  ];
  submissionsResponse: AdminFormSubmissionsResponse | null = null;

  archivingForm = false;
  archiveSuccessMessage = '';
  archiveErrorMessage = '';

  submissionSearchTerm = '';
  selectedSubmissionMunicipality = '';
  expandedSubmissionMunicipality = '';

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
          const defaultField = response.fields.find((field) => {
            const label = String(field.label || '')
              .toLowerCase()
              .normalize('NFD')
              .replace(/[\u0300-\u036f]/g, '');

            return !label.includes('municipio')
              && !label.includes('localidad')
              && !label.includes('apellido')
              && !label.includes('nombre')
              && !label.includes('dni')
              && !label.includes('telefono');
          });

          this.selectedFieldId = defaultField?.id || response.fields[0].id;
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

  private isDemoMunicipalityUser(user: AdminUser): boolean {
    const username = String(user.username || '').toLowerCase();
    const name = String(user.name || '').toLowerCase();
    const municipalityName = String(user.municipality_name || '').toLowerCase();

    return username.includes('demo')
      || name.includes('demo')
      || municipalityName.includes('demo');
  }

  refreshAssignableUsers(): void {
    if (!this.detail || this.users.length === 0) {
      return;
    }

    const assignedIds = new Set(this.detail.assignments.map((assignment) => assignment.user_id));

    this.assignableUsers = this.users.filter((user) => {
      return user.role === 'municipio'
        && user.active === 1
        && !assignedIds.has(user.id)
        && !this.isDemoMunicipalityUser(user);
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
    this.selectedComparisonMunicipality = '';
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
    const value = this.fixEncodingText(text || '');

    if (value === 'true') {
      return 'Sí';
    }

    if (value === 'false') {
      return 'No';
    }

    return value;
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
    this.expandedSubmissionMunicipality = '';
  }

  get groupedFilteredSubmissions() {
    const groups = new Map<string, {
      municipality_name: string;
      submissions: AdminFormSubmissionsResponse['submissions'];
      total: number;
      latest_created_at: string;
    }>();

    for (const submission of this.filteredSubmissions) {
      const municipalityName = this.formatAdminText(submission.municipality_name || 'Sin municipio');

      if (!groups.has(municipalityName)) {
        groups.set(municipalityName, {
          municipality_name: municipalityName,
          submissions: [],
          total: 0,
          latest_created_at: ''
        });
      }

      const group = groups.get(municipalityName)!;

      group.submissions.push(submission);
      group.total += 1;

      if (!group.latest_created_at || submission.created_at > group.latest_created_at) {
        group.latest_created_at = submission.created_at;
      }
    }

    return Array.from(groups.values())
      .sort((a, b) => {
        if (b.total !== a.total) {
          return b.total - a.total;
        }

        return a.municipality_name.localeCompare(b.municipality_name);
      });
  }

  toggleMunicipalityHistory(municipalityName: string): void {
    if (this.expandedSubmissionMunicipality === municipalityName) {
      this.expandedSubmissionMunicipality = '';
      return;
    }

    this.expandedSubmissionMunicipality = municipalityName;
  }

  isMunicipalityHistoryOpen(municipalityName: string): boolean {
    return this.expandedSubmissionMunicipality === municipalityName;
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

  archiveForm(): void {
    if (!this.detail || this.archivingForm) {
      return;
    }

    const confirmed = window.confirm(
      '¿Seguro que querés archivar este relevamiento? Se conservarán las respuestas y estadísticas, pero los municipios ya no podrán cargar nuevas respuestas.'
    );

    if (!confirmed) {
      return;
    }

    this.archivingForm = true;
    this.archiveSuccessMessage = '';
    this.archiveErrorMessage = '';

    this.adminService.archiveForm(this.formId).subscribe({
      next: (response) => {
        this.archivingForm = false;
        this.archiveSuccessMessage = response.message || 'Relevamiento archivado correctamente.';
        this.loadDetail(this.formId);
        this.loadSubmissions();
      },
      error: (error) => {
        this.archivingForm = false;
        this.archiveErrorMessage = error?.error?.message || 'No se pudo archivar el relevamiento.';
      }
    });
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

  getFieldTypeLabel(type: string): string {
    const labels: Record<string, string> = {
      text: 'Texto',
      textarea: 'Texto largo',
      number: 'Número',
      select: 'Selección',
      multiselect: 'Selección múltiple',
      boolean: 'Sí / No',
      date: 'Fecha'
    };

    return labels[type] || type;
  }

  getReportChartTypeLabel(chartType: string | null | undefined): string {
    const option = this.reportChartTypes.find((item) => item.value === chartType);
    return option?.label || 'Automático';
  }

  onFieldReportChartTypeChange(field: AdminFormField, event: Event): void {
    const select = event.target as HTMLSelectElement;
    const chartType = select.value as AdminReportChartType;

    this.saveFieldReportConfig(field, chartType, field.include_in_report);
  }

  onFieldIncludeInReportChange(field: AdminFormField, event: Event): void {
    const input = event.target as HTMLInputElement;

    this.saveFieldReportConfig(
      field,
      field.chart_type || 'auto',
      input.checked
    );
  }

  saveFieldReportConfig(
    field: AdminFormField,
    chartType: AdminReportChartType,
    includeInReport: boolean
  ): void {
    if (!this.detail || this.reportConfigSavingFieldId) {
      return;
    }

    this.reportConfigSavingFieldId = field.id;
    this.reportConfigSuccessMessage = '';
    this.reportConfigErrorMessage = '';

    this.adminService.updateFieldReportConfig(this.formId, field.id, {
      chart_type: chartType,
      include_in_report: includeInReport
    }).subscribe({
      next: (response) => {
        this.reportConfigSavingFieldId = 0;
        this.reportConfigSuccessMessage = response.message || 'Configuración actualizada.';

        if (this.detail) {
          this.detail = {
            ...this.detail,
            fields: this.detail.fields.map((currentField) =>
              currentField.id === response.field.id ? response.field : currentField
            )
          };
        }
      },
      error: (error) => {
        this.reportConfigSavingFieldId = 0;
        this.reportConfigErrorMessage = error?.error?.message || 'No se pudo actualizar la configuración del campo.';
      }
    });
  }

  downloadFullReportPdf(): void {
    if (!this.detail || this.reportDownloading) {
      return;
    }

    this.reportDownloading = true;
    this.reportErrorMessage = '';

    this.adminService.downloadFormReportPdf(this.formId).subscribe({
      next: (blob) => {
        this.reportDownloading = false;

        const url = URL.createObjectURL(blob);
        const link = document.createElement('a');
        const safeTitle = this.formatAdminText(this.detail?.form.title || 'relevamiento')
          .toLowerCase()
          .normalize('NFD')
          .replace(/[\u0300-\u036f]/g, '')
          .replace(/[^a-z0-9]+/g, '-')
          .replace(/(^-|-$)/g, '')
          .slice(0, 70);

        link.href = url;
        link.download = `informe-${safeTitle || 'relevamiento'}-${this.formId}.pdf`;
        link.click();

        URL.revokeObjectURL(url);
      },
      error: () => {
        this.reportDownloading = false;
        this.reportErrorMessage = 'No se pudo descargar el informe.';
      }
    });
  }

  downloadHistoryPdf(): void {
    if (!this.detail || this.historyDownloading) {
      return;
    }

    this.historyDownloading = true;
    this.reportErrorMessage = '';

    this.adminService.downloadFormHistoryPdf(this.formId).subscribe({
      next: (blob) => {
        this.historyDownloading = false;

        const url = URL.createObjectURL(blob);
        const link = document.createElement('a');
        const safeTitle = this.formatAdminText(this.detail?.form.title || 'relevamiento')
          .toLowerCase()
          .normalize('NFD')
          .replace(/[\u0300-\u036f]/g, '')
          .replace(/[^a-z0-9]+/g, '-')
          .replace(/(^-|-$)/g, '')
          .slice(0, 70);

        link.href = url;
        link.download = `historial-respuestas-${safeTitle || 'relevamiento'}-${this.formId}.pdf`;
        link.click();

        URL.revokeObjectURL(url);
      },
      error: () => {
        this.historyDownloading = false;
        this.reportErrorMessage = 'No se pudo descargar el historial de respuestas.';
      }
    });
  }

  exportSubmissionsCsv(): void {
    const submissions = this.submissionsResponse?.submissions || [];

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
    const value = this.fixAdminEncodingText(text || '');

    if (value === 'true') {
      return 'Sí';
    }

    if (value === 'false') {
      return 'No';
    }

    return value;
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

    const formattedValue = this.fixAdminEncodingText(String(value.value));

    if (formattedValue === 'true') {
      return 'Sí';
    }

    if (formattedValue === 'false') {
      return 'No';
    }

    return formattedValue;
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


  private normalizeUxText(value: string): string {
    return String(value || '')
      .toLowerCase()
      .normalize('NFD')
      .replace(/[\u0300-\u036f]/g, '');
  }

  private isTerritorialField(field: AdminFormField | null): boolean {
    const label = this.normalizeUxText(field?.label || '');

    return label.includes('municipio') || label.includes('localidad');
  }

  getDefaultStatsFieldId(fields: AdminFormField[]): number {
    const preferredField = fields.find((field) => {
      if (this.isTerritorialField(field)) {
        return false;
      }

      if (this.isIdentityLikeField(field)) {
        return false;
      }

      return true;
    });

    return preferredField?.id || fields[0]?.id || 0;
  }

  isTerritorialStatsField(): boolean {
    return this.isTerritorialField(this.selectedStatsField);
  }

  get availableComparisonMunicipalities(): string[] {
    const municipalities = this.comparison?.municipalities || [];

    return municipalities
      .map((municipality) => this.formatAdminText(municipality.municipality_name || 'Sin municipio'))
      .filter((municipality) => municipality.length > 0)
      .sort((a, b) => a.localeCompare(b, 'es'));
  }

  get filteredComparisonMunicipalities() {
    const municipalities = this.comparison?.municipalities || [];

    if (this.isTerritorialStatsField()) {
      return [];
    }

    const selected = this.selectedComparisonMunicipality.trim().toLowerCase();

    if (!selected) {
      return municipalities;
    }

    return municipalities.filter((municipality) => {
      const municipalityName = this.formatAdminText(municipality.municipality_name || 'Sin municipio').toLowerCase();

      return municipalityName === selected;
    });
  }

  onComparisonMunicipalityChange(event: Event): void {
    const select = event.target as HTMLSelectElement;
    this.selectedComparisonMunicipality = select.value;
  }


  get selectedStatsField(): AdminFormField | null {
    return this.detail?.fields.find((field) => field.id === this.selectedFieldId) || null;
  }

  getSortedStatsItems(): AdminStatsItem[] {
    return this.sortChartItemsDesc(this.stats?.items || []);
  }

  getSortedComparisonItems(items: AdminStatsItem[]): AdminStatsItem[] {
    return this.sortChartItemsDesc(items || []);
  }

  getComparisonChartMode(): 'columns' | 'horizontal' {
    const field = this.selectedStatsField;
    const itemsCount = this.getSortedStatsItems().length;

    if (!field) {
      return 'columns';
    }

    if (field.type === 'multiselect') {
      return 'horizontal';
    }

    if (field.type === 'select' && itemsCount > 5) {
      return 'horizontal';
    }

    return 'columns';
  }

  getVisualItemColorForLabel(label: string): string {
    const index = this.getSortedStatsItems().findIndex((item) => item.label === label);

    return this.getVisualItemColor(index >= 0 ? index : 0);
  }

  getHorizontalBarWidth(count: number, items: AdminStatsItem[]): string {
    const max = Math.max(...(items || []).map((item) => item.count), 0);

    if (max <= 0) {
      return '0%';
    }

    return Math.max(6, Math.round((count / max) * 100)) + '%';
  }

  getStatsChartMode(): 'donut' | 'columns' | 'horizontal' | 'summary' | 'table' {
    const field = this.selectedStatsField;

    if (!field) {
      return 'table';
    }

    if (this.isIdentityLikeField(field)) {
      return 'table';
    }

    if (field.type === 'boolean') {
      return 'donut';
    }

    const itemsCount = this.getSortedStatsItems().length;

    if (field.type === 'select') {
      return itemsCount <= 5 ? 'donut' : 'horizontal';
    }

    if (field.type === 'multiselect') {
      return 'horizontal';
    }

    if (field.type === 'date') {
      return 'columns';
    }

    if (field.type === 'number') {
      return 'summary';
    }

    return 'table';
  }

  shouldShowComparisonChart(): boolean {
    const field = this.selectedStatsField;

    if (!field || this.isIdentityLikeField(field)) {
      return false;
    }

    return ['boolean', 'select', 'multiselect'].includes(field.type);
  }

  isIdentityLikeField(field: AdminFormField): boolean {
    const label = this.normalizeText(field.label);

    const identityWords = [
      'nombre',
      'apellido',
      'dni',
      'documento',
      'cuil',
      'cuit',
      'telefono',
      'teléfono',
      'direccion',
      'dirección',
      'domicilio',
      'email',
      'mail',
      'correo'
    ];

    return ['text', 'textarea'].includes(field.type)
      && identityWords.some((word) => label.includes(this.normalizeText(word)));
  }

  normalizeText(text: string): string {
    return this.fixEncodingText(text || '')
      .toLowerCase()
      .normalize('NFD')
      .replace(/[\u0300-\u036f]/g, '');
  }

  getStatsChartTitle(): string {
    const field = this.selectedStatsField;

    if (!field) {
      return 'Vista de datos';
    }

    if (this.isIdentityLikeField(field)) {
      return 'Campo informativo';
    }

    if (field.type === 'boolean') {
      return 'Distribución Sí / No';
    }

    if (field.type === 'select') {
      return 'Distribución por opción';
    }

    if (field.type === 'multiselect') {
      return 'Selecciones acumuladas';
    }

    if (field.type === 'number') {
      return 'Resumen numérico';
    }

    if (field.type === 'date') {
      return 'Distribución por fecha';
    }

    return 'Detalle de respuestas';
  }

  getStatsChartDescription(): string {
    const field = this.selectedStatsField;

    if (!field) {
      return 'Seleccioná un campo para ver sus datos.';
    }

    if (this.isIdentityLikeField(field)) {
      return 'Este dato no se grafica porque identifica personas o domicilios. Se muestra en el detalle y formará parte del informe completo.';
    }

    if (field.type === 'text' || field.type === 'textarea') {
      return 'Este tipo de respuesta no genera un gráfico útil. Se muestra como listado de consulta.';
    }

    if (field.type === 'number') {
      return 'Se calculan métricas generales y se muestran las respuestas agrupadas.';
    }

    return 'El gráfico se genera automáticamente según el tipo de campo.';
  }

  getTopStatsItem(): AdminStatsItem | null {
    if (!this.stats || this.stats.items.length === 0) {
      return null;
    }

    return [...this.stats.items].sort((a, b) => b.count - a.count)[0];
  }

  getVisualItemColor(index: number): string {
    const colors = [
      '#005b96',
      '#008060',
      '#f59e0b',
      '#7c3aed',
      '#dc2626',
      '#0891b2',
      '#be123c',
      '#334155'
    ];

    return colors[index % colors.length];
  }

  getDonutGradient(items: AdminStatsItem[]): string {
    const total = items.reduce((acc, item) => acc + item.count, 0);

    if (total <= 0) {
      return 'conic-gradient(#e2e8f0 0deg 360deg)';
    }

    let currentDegree = 0;

    const segments = items.map((item, index) => {
      const startDegree = currentDegree;
      const endDegree = currentDegree + (item.count / total) * 360;
      currentDegree = endDegree;

      return this.getVisualItemColor(index) + ' ' + startDegree + 'deg ' + endDegree + 'deg';
    });

    return 'conic-gradient(' + segments.join(', ') + ')';
  }

  getColumnHeight(count: number, items: AdminStatsItem[]): string {
    const max = Math.max(...items.map((item) => item.count), 0);

    if (max <= 0) {
      return '8px';
    }

    const height = Math.max(10, Math.round((count / max) * 170));
    return height + 'px';
  }

  getComparisonColumnHeight(count: number): string {
    const items = this.comparison?.municipalities.flatMap((municipality) => municipality.items) || [];
    const max = Math.max(...items.map((item) => item.count), 0);

    if (max <= 0) {
      return '8px';
    }

    const height = Math.max(8, Math.round((count / max) * 90));
    return height + 'px';
  }

  getNumericSummary(): { total: number; average: number; min: number; max: number } {
    const numbers = this.getSelectedFieldRawValues()
      .map((value) => this.parseNumericValue(value))
      .filter((value): value is number => value !== null);

    if (numbers.length === 0) {
      return {
        total: 0,
        average: 0,
        min: 0,
        max: 0
      };
    }

    const total = numbers.length;
    const sum = numbers.reduce((acc, value) => acc + value, 0);
    const average = Number((sum / total).toFixed(2));

    return {
      total,
      average,
      min: Math.min(...numbers),
      max: Math.max(...numbers)
    };
  }

  parseNumericValue(value: unknown): number | null {
    const normalized = String(value ?? '')
      .trim()
      .replace(',', '.');

    if (!normalized) {
      return null;
    }

    const parsed = Number(normalized);

    return Number.isFinite(parsed) ? parsed : null;
  }

  getSelectedFieldRawValues(): unknown[] {
    const values: unknown[] = [];

    for (const submission of this.filteredSubmissions) {
      const selectedValue = submission.values.find((value) => value.field_id === this.selectedFieldId);

      if (!selectedValue) {
        continue;
      }

      if (Array.isArray(selectedValue.value)) {
        values.push(...selectedValue.value);
      } else {
        values.push(selectedValue.value);
      }
    }

    return values;
  }

  getSelectedFieldPreviewValues(limit = 8): { municipality_name: string; value: string }[] {
    const previews: { municipality_name: string; value: string }[] = [];

    for (const submission of this.filteredSubmissions) {
      const selectedValue = submission.values.find((value) => value.field_id === this.selectedFieldId);

      if (!selectedValue) {
        continue;
      }

      previews.push({
        municipality_name: this.formatAdminText(submission.municipality_name),
        value: this.formatAdminSubmissionValue(selectedValue)
      });

      if (previews.length >= limit) {
        break;
      }
    }

    return previews;
  }

  getPercentageWidth(percentage: number): string {
    return percentage + '%';
  }
}










