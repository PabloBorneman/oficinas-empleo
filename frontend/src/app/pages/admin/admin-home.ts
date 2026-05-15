import { Component, OnInit, inject } from '@angular/core';
import { FormBuilder, ReactiveFormsModule, Validators } from '@angular/forms';
import { Router } from '@angular/router';
import { AuthService } from '../../core/services/auth.service';
import {
  AdminDashboardForm,
  AdminService,
  CreateAdminFormRequest
} from '../../core/services/admin.service';

@Component({
  selector: 'app-admin-home',
  imports: [ReactiveFormsModule],
  templateUrl: './admin-home.html',
  styleUrl: './admin-home.scss'
})
export class AdminHomeComponent implements OnInit {
  private authService = inject(AuthService);
  private adminService = inject(AdminService);
  private router = inject(Router);
  private fb = inject(FormBuilder);

  user = this.authService.getUser();

  loading = true;
  errorMessage = '';

  creatingForm = false;
  savingForm = false;
  createFormErrorMessage = '';
  createFormSuccessMessage = '';

  forms: AdminDashboardForm[] = [];

  newForm = this.fb.nonNullable.group({
    title: ['', Validators.required],
    description: ['', Validators.required]
  });

  get officialFormsCount(): number {
    return this.forms.filter((form) => form.scope === 'official').length;
  }

  get localFormsCount(): number {
    return this.forms.filter((form) => form.scope === 'local').length;
  }

  ngOnInit(): void {
    this.loadDashboardForms();
  }

  loadDashboardForms(): void {
    this.loading = true;
    this.errorMessage = '';

    this.adminService.getDashboardForms().subscribe({
      next: (response) => {
        this.forms = response.forms;
        this.loading = false;
      },
      error: (error) => {
        this.errorMessage = error?.error?.message || 'No se pudieron cargar los relevamientos.';
        this.loading = false;
      }
    });
  }

  openCreateForm(): void {
    this.creatingForm = true;
    this.createFormErrorMessage = '';
    this.createFormSuccessMessage = '';
    this.newForm.reset();
  }

  cancelCreateForm(): void {
    this.creatingForm = false;
    this.createFormErrorMessage = '';
    this.createFormSuccessMessage = '';
    this.newForm.reset();
  }

  saveForm(): void {
    if (this.newForm.invalid || this.savingForm) {
      this.newForm.markAllAsTouched();
      this.createFormErrorMessage = 'Completá título y descripción antes de guardar.';
      return;
    }

    const formValue = this.newForm.getRawValue();

    const payload: CreateAdminFormRequest = {
      title: formValue.title.trim(),
      description: formValue.description.trim(),
      scope: 'official',
      status: 'active',
      allow_self_assignment: 1
    };

    this.savingForm = true;
    this.createFormErrorMessage = '';
    this.createFormSuccessMessage = '';

    this.adminService.createForm(payload).subscribe({
      next: (response) => {
        this.savingForm = false;
        this.creatingForm = false;
        this.newForm.reset();
        this.createFormSuccessMessage = response.message || 'Relevamiento creado correctamente.';
        this.loadDashboardForms();
      },
      error: (error) => {
        this.savingForm = false;
        this.createFormErrorMessage = error?.error?.message || 'No se pudo crear el relevamiento.';
      }
    });
  }

  isInvalid(controlName: 'title' | 'description'): boolean {
    const control = this.newForm.controls[controlName];
    return control.invalid && (control.touched || control.dirty);
  }

  viewUsers(): void {
    this.router.navigateByUrl('/admin/users');
  }

  viewDetail(formId: number): void {
    this.router.navigate(['/admin/forms', formId]);
  }

  getScopeLabel(scope: AdminDashboardForm['scope']): string {
    if (scope === 'official') {
      return 'Oficial / unificado';
    }

    return 'Local';
  }

  getStatusLabel(status: AdminDashboardForm['status']): string {
    const labels: Record<AdminDashboardForm['status'], string> = {
      draft: 'Borrador',
      active: 'Activo',
      archived: 'Archivado'
    };

    return labels[status] || status;
  }

  logout(): void {
    this.authService.logout();
    this.router.navigateByUrl('/login');
  }
}
