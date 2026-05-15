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
        this.availableErrorMessage = error?.error?.message || 'No se pudieron cargar las plantillas oficiales.';
        this.loadingAvailable = false;
      }
    });
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
