import { Component, OnInit, inject } from '@angular/core';
import { Router } from '@angular/router';
import { AuthService } from '../../core/services/auth.service';
import {
  MunicipioAssignedForm,
  MunicipioAvailableForm,
  MunicipioService
} from '../../core/services/municipio.service';

@Component({
  selector: 'app-municipio-home',
  templateUrl: './municipio-home.html',
  styleUrl: './municipio-home.scss'
})
export class MunicipioHomeComponent implements OnInit {
  private authService = inject(AuthService);
  private municipioService = inject(MunicipioService);
  private router = inject(Router);

  user = this.authService.getUser();

  municipalityName = '';

  loadingAssigned = true;
  loadingAvailable = true;

  assignedErrorMessage = '';
  availableErrorMessage = '';

  assignedForms: MunicipioAssignedForm[] = [];
  availableForms: MunicipioAvailableForm[] = [];
  usingFormId: number | null = null;

  showCreateForm = false;
  creatingForm = false;
  createFormErrorMessage = '';
  createFormSuccessMessage = '';

  ngOnInit(): void {
    this.loadMyForms();
    this.loadAvailableForms();
  }

  loadMyForms(): void {
    this.loadingAssigned = true;
    this.assignedErrorMessage = '';

    this.municipioService.getMyForms().subscribe({
      next: (response) => {
        this.municipalityName = response.municipality_name;
        this.assignedForms = response.forms;
        this.loadingAssigned = false;
      },
      error: (error) => {
        this.assignedErrorMessage = error?.error?.message || 'No se pudieron cargar tus relevamientos.';
        this.loadingAssigned = false;
      }
    });
  }

  loadAvailableForms(): void {
    this.loadingAvailable = true;
    this.availableErrorMessage = '';

    this.municipioService.getAvailableForms().subscribe({
      next: (response) => {
        this.municipalityName = this.municipalityName || response.municipality_name;
        this.availableForms = response.forms;
        this.loadingAvailable = false;
      },
      error: (error) => {
        this.availableErrorMessage = error?.error?.message || 'No se pudieron cargar las plantillas disponibles.';
        this.loadingAvailable = false;
      }
    });
  }

  toggleCreateForm(): void {
    this.showCreateForm = !this.showCreateForm;
    this.createFormErrorMessage = '';
    this.createFormSuccessMessage = '';
  }

  createLocalForm(
    title: string,
    description: string,
    titleInput?: HTMLInputElement,
    descriptionInput?: HTMLTextAreaElement
  ): void {
    const cleanTitle = String(title || '').trim();
    const cleanDescription = String(description || '').trim();

    this.createFormErrorMessage = '';
    this.createFormSuccessMessage = '';

    if (!cleanTitle) {
      this.createFormErrorMessage = 'El título del relevamiento es obligatorio.';
      return;
    }

    this.creatingForm = true;

    this.municipioService.createLocalForm({
      title: cleanTitle,
      description: cleanDescription || null
    }).subscribe({
      next: (response) => {
        this.creatingForm = false;
        this.createFormSuccessMessage = 'Relevamiento local creado correctamente. Ahora aparece en tus relevamientos asignados.';

        if (titleInput) {
          titleInput.value = '';
        }

        if (descriptionInput) {
          descriptionInput.value = '';
        }

        this.loadMyForms();
        this.loadAvailableForms();

        if (response.form?.id) {
          this.router.navigate(['/municipio/forms', response.form.id]);
        }
      },
      error: (error) => {
        this.creatingForm = false;
        this.createFormErrorMessage = error?.error?.message || 'No se pudo crear el relevamiento local.';
      }
    });
  }

  useTemplate(form: MunicipioAvailableForm): void {
    if (form.already_assigned) {
      this.viewForm(form.id);
      return;
    }

    this.usingFormId = form.id;
    this.availableErrorMessage = '';

    this.municipioService.useAvailableForm(form.id).subscribe({
      next: () => {
        this.usingFormId = null;
        this.loadMyForms();
        this.loadAvailableForms();
      },
      error: (error) => {
        this.availableErrorMessage = error?.error?.message || 'No se pudo usar esta plantilla.';
        this.usingFormId = null;
      }
    });
  }

  getAvailableTypeLabel(form: MunicipioAvailableForm): string {
    return form.scope === 'local' ? 'Municipal' : 'Oficial';
  }

  getAvailableCreatorLabel(form: MunicipioAvailableForm): string {
    if (form.scope === 'official') {
      return form.created_by_name || 'Ministerio';
    }

    return form.created_by_municipality || form.created_by_name || 'Otra oficina municipal';
  }

  viewForm(formId: number): void {
    this.router.navigate(['/municipio/forms', formId]);
  }

  getStatusLabel(status: MunicipioAvailableForm['status']): string {
    const labels: Record<MunicipioAvailableForm['status'], string> = {
      draft: 'Borrador',
      active: 'Activo',
      archived: 'Archivado'
    };

    return labels[status] || status;
  }

  getAssignedLabel(form: MunicipioAvailableForm): string {
    return form.already_assigned ? 'Ya asignado' : 'Disponible para usar';
  }

  logout(): void {
    this.authService.logout();
    this.router.navigateByUrl('/login');
  }
}
