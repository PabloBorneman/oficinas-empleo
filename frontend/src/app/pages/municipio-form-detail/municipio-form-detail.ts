import { Component, OnInit, inject } from '@angular/core';
import { FormControl, FormGroup, ReactiveFormsModule, Validators } from '@angular/forms';
import { ActivatedRoute, Router } from '@angular/router';
import {
  CreateSubmissionRequest,
  MunicipioFormDetail,
  MunicipioFormDetailResponse,
  MunicipioFormField,
  MunicipioService,
  MunicipioSubmissionValue,
  MunicipioSubmissionsDetailResponse
} from '../../core/services/municipio.service';

@Component({
  selector: 'app-municipio-form-detail',
  imports: [ReactiveFormsModule],
  templateUrl: './municipio-form-detail.html',
  styleUrl: './municipio-form-detail.scss'
})
export class MunicipioFormDetailComponent implements OnInit {
  private route = inject(ActivatedRoute);
  private router = inject(Router);
  private municipioService = inject(MunicipioService);

  formId = 0;

  loadingDetail = true;
  loadingSubmissions = true;
  savingSubmission = false;
  creatingField = false;
  activatingForm = false;

  detailErrorMessage = '';
  submissionsErrorMessage = '';
  submissionErrorMessage = '';
  submissionSuccessMessage = '';
  fieldErrorMessage = '';
  fieldSuccessMessage = '';

  detail: MunicipioFormDetailResponse | null = null;
  submissionsDetail: MunicipioSubmissionsDetailResponse | null = null;

  showSubmissionForm = false;
  submissionForm = new FormGroup<Record<string, FormControl<string>>>({});

  ngOnInit(): void {
    const formId = Number(this.route.snapshot.paramMap.get('id'));

    if (!formId) {
      this.detailErrorMessage = 'ID de relevamiento inválido.';
      this.loadingDetail = false;
      this.loadingSubmissions = false;
      return;
    }

    this.formId = formId;
    this.loadDetail();
    this.loadSubmissions();
  }

  loadDetail(): void {
    this.loadingDetail = true;
    this.detailErrorMessage = '';

    this.municipioService.getFormDetail(this.formId).subscribe({
      next: (response) => {
        this.detail = response;
        this.buildSubmissionForm();
        this.loadingDetail = false;
      },
      error: (error) => {
        this.detailErrorMessage = error?.error?.message || 'No se pudo cargar el relevamiento.';
        this.loadingDetail = false;
      }
    });
  }

  loadSubmissions(): void {
    this.loadingSubmissions = true;
    this.submissionsErrorMessage = '';

    this.municipioService.getFormSubmissionsDetail(this.formId).subscribe({
      next: (response) => {
        this.submissionsDetail = response;
        this.loadingSubmissions = false;
      },
      error: (error) => {
        this.submissionsErrorMessage = error?.error?.message || 'No se pudieron cargar tus respuestas.';
        this.loadingSubmissions = false;
      }
    });
  }

  activateForm(): void {
    if (!this.detail || this.activatingForm) {
      return;
    }

    if (this.detail.fields.length === 0) {
      this.fieldErrorMessage = 'Antes de activar el relevamiento tenés que agregar al menos un campo.';
      return;
    }

    this.activatingForm = true;
    this.fieldErrorMessage = '';
    this.fieldSuccessMessage = '';

    this.municipioService.activateLocalForm(this.formId).subscribe({
      next: () => {
        this.activatingForm = false;
        this.fieldSuccessMessage = 'Relevamiento activado correctamente. Ya puede recibir respuestas y compartirse como plantilla.';
        this.loadDetail();
      },
      error: (error) => {
        this.activatingForm = false;
        this.fieldErrorMessage = error?.error?.message || 'No se pudo activar el relevamiento.';
      }
    });
  }

  getFormStatusLabel(status: MunicipioFormDetail['status']): string {
    const labels: Record<MunicipioFormDetail['status'], string> = {
      draft: 'Borrador',
      active: 'Activo',
      archived: 'Archivado'
    };

    return labels[status] || status;
  }

  canCreateSubmission(): boolean {
    return !!this.detail && this.detail.form.status === 'active' && this.detail.fields.length > 0;
  }

  createLocalField(
    label: string,
    type: string,
    optionsText: string,
    required: boolean,
    labelInput?: HTMLInputElement,
    optionsInput?: HTMLTextAreaElement,
    requiredInput?: HTMLInputElement
  ): void {
    if (this.creatingField) {
      return;
    }

    const cleanLabel = String(label || '').trim();
    const cleanType = String(type || 'text') as MunicipioFormField['type'];

    this.fieldErrorMessage = '';
    this.fieldSuccessMessage = '';

    if (!cleanLabel) {
      this.fieldErrorMessage = 'El nombre del campo es obligatorio.';
      return;
    }

    const options = this.parseOptionsForField(cleanType, optionsText);

    if ((cleanType === 'select' || cleanType === 'multiselect') && (!options || options.length === 0)) {
      this.fieldErrorMessage = 'Para selección o selección múltiple tenés que cargar al menos una opción.';
      return;
    }

    const nextOrder = (this.detail?.fields?.length || 0) + 1;

    this.creatingField = true;

    this.municipioService.createLocalFormField(this.formId, {
      label: cleanLabel,
      type: cleanType,
      options,
      required,
      field_order: nextOrder
    }).subscribe({
      next: () => {
        this.creatingField = false;
        this.fieldSuccessMessage = 'Campo agregado correctamente.';
        this.fieldErrorMessage = '';

        if (labelInput) {
          labelInput.value = '';
        }

        if (optionsInput) {
          optionsInput.value = '';
        }

        if (requiredInput) {
          requiredInput.checked = true;
        }

        this.loadDetail();
      },
      error: (error) => {
        this.creatingField = false;
        this.fieldErrorMessage = error?.error?.message || 'No se pudo agregar el campo. Recordá que solo podés editar relevamientos locales propios.';
      }
    });
  }

  parseOptionsForField(type: MunicipioFormField['type'], optionsText: string): string[] | null {
    if (type !== 'select' && type !== 'multiselect') {
      return null;
    }

    return String(optionsText || '')
      .split(/\r?\n|,/)
      .map((option) => option.trim())
      .filter((option) => option.length > 0);
  }

  buildSubmissionForm(): void {
    const controls: Record<string, FormControl<string>> = {};
    const fields = this.detail?.fields || [];

    for (const field of fields) {
      controls[this.getFieldControlName(field)] = new FormControl('', {
        nonNullable: true,
        validators: field.required ? [Validators.required] : []
      });
    }

    this.submissionForm = new FormGroup(controls);
  }

  openSubmissionForm(): void {
    this.submissionErrorMessage = '';
    this.submissionSuccessMessage = '';
    this.showSubmissionForm = true;
    this.buildSubmissionForm();
  }

  cancelSubmissionForm(): void {
    this.showSubmissionForm = false;
    this.submissionErrorMessage = '';
    this.submissionSuccessMessage = '';
    this.buildSubmissionForm();
  }

  saveSubmission(): void {
    if (!this.detail || this.savingSubmission) {
      return;
    }

    if (this.submissionForm.invalid) {
      this.submissionForm.markAllAsTouched();
      this.submissionErrorMessage = 'Completá los campos obligatorios antes de guardar.';
      return;
    }

    const payload: CreateSubmissionRequest = {
      values: this.detail.fields.map((field) => ({
        field_id: field.id,
        value: this.getFieldValueForPayload(field)
      }))
    };

    this.savingSubmission = true;
    this.submissionErrorMessage = '';
    this.submissionSuccessMessage = '';

    this.municipioService.createSubmission(this.formId, payload).subscribe({
      next: () => {
        this.savingSubmission = false;
        this.showSubmissionForm = false;
        this.submissionSuccessMessage = 'Respuesta cargada correctamente.';
        this.buildSubmissionForm();
        this.loadSubmissions();
      },
      error: (error) => {
        this.savingSubmission = false;
        this.submissionErrorMessage = error?.error?.message || 'No se pudo guardar la respuesta.';
      }
    });
  }

  getFieldValueForPayload(field: MunicipioFormField): string | string[] {
    const rawValue = this.submissionForm.controls[this.getFieldControlName(field)]?.value || '';

    if (field.type === 'multiselect') {
      return rawValue
        .split(',')
        .map((value) => value.trim())
        .filter((value) => value.length > 0);
    }

    return rawValue;
  }

  isMultiselectOptionSelected(field: MunicipioFormField, option: string): boolean {
    const control = this.submissionForm.controls[this.getFieldControlName(field)];
    const currentValue = control?.value || '';
    const values = currentValue
      .split(',')
      .map((value) => value.trim())
      .filter((value) => value.length > 0);

    return values.includes(option);
  }

  toggleMultiselectOption(field: MunicipioFormField, option: string, event: Event): void {
    const checkbox = event.target as HTMLInputElement;
    const control = this.submissionForm.controls[this.getFieldControlName(field)];

    if (!control) {
      return;
    }

    const currentValues = control.value
      .split(',')
      .map((value) => value.trim())
      .filter((value) => value.length > 0);

    if (checkbox.checked && !currentValues.includes(option)) {
      currentValues.push(option);
    }

    if (!checkbox.checked) {
      const index = currentValues.indexOf(option);

      if (index >= 0) {
        currentValues.splice(index, 1);
      }
    }

    control.setValue(currentValues.join(', '));
    control.markAsDirty();
    control.markAsTouched();
  }

  fixEncodingText(text: string): string {
    return text
      .replaceAll('Ma�ana', 'Mañana')
      .replaceAll('D�as', 'Días')
      .replaceAll('Mi�rcoles', 'Miércoles')
      .replaceAll('S�bado', 'Sábado');
  }

  formatSubmissionValue(value: MunicipioSubmissionValue): string {
    if (Array.isArray(value.value)) {
      return this.fixEncodingText(value.value.join(', '));
    }

    if (typeof value.value === 'string' && value.value.trim().startsWith('[')) {
      try {
        const parsed = JSON.parse(value.value);

        if (Array.isArray(parsed)) {
          return this.fixEncodingText(parsed.join(', '));
        }
      } catch {
        return this.fixEncodingText(value.value);
      }
    }

    return this.fixEncodingText(String(value.value));
  }

  formatText(text: string | null): string {
    return this.fixEncodingText(text || '');
  }

  goBack(): void {
    this.router.navigateByUrl('/municipio');
  }

  getFieldControlName(field: MunicipioFormField): string {
    return String(field.id);
  }

  isFieldInvalid(field: MunicipioFormField): boolean {
    const control = this.submissionForm.controls[this.getFieldControlName(field)];
    return !!control && control.invalid && (control.touched || control.dirty);
  }

  getRequiredLabel(field: MunicipioFormField): string {
    return field.required ? 'Obligatorio' : 'Opcional';
  }

  getOptionsText(field: MunicipioFormField): string {
    if (!field.options || field.options.length === 0) {
      return 'Sin opciones';
    }

    return this.fixEncodingText(field.options.join(', '));
  }

  getFieldTypeLabel(type: string): string {
    const labels: Record<string, string> = {
      text: 'Texto',
      number: 'Número',
      select: 'Selección',
      multiselect: 'Selección múltiple',
      boolean: 'Sí / No',
      date: 'Fecha',
      textarea: 'Texto largo'
    };

    return labels[type] || type;
  }
}

