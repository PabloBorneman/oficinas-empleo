import { Component, OnInit, inject } from '@angular/core';
import { FormBuilder, ReactiveFormsModule, Validators } from '@angular/forms';
import { Router } from '@angular/router';
import {
  AdminService,
  AdminUser,
  CreateAdminUserRequest
} from '../../core/services/admin.service';

@Component({
  selector: 'app-admin-users',
  imports: [ReactiveFormsModule],
  templateUrl: './admin-users.html',
  styleUrl: './admin-users.scss'
})
export class AdminUsersComponent implements OnInit {
  private adminService = inject(AdminService);
  private router = inject(Router);
  private fb = inject(FormBuilder);

  loading = true;
  creating = false;
  saving = false;

  errorMessage = '';
  createErrorMessage = '';
  createSuccessMessage = '';

  users: AdminUser[] = [];

  createOfficeForm = this.fb.nonNullable.group({
    municipality_name: ['', Validators.required],
    username: ['', Validators.required],
    password: ['', Validators.required]
  });

  get adminUsersCount(): number {
    return this.users.filter((user) => user.role === 'admin').length;
  }

  get municipioUsersCount(): number {
    return this.users.filter((user) => user.role === 'municipio').length;
  }

  get activeUsersCount(): number {
    return this.users.filter((user) => user.active === 1).length;
  }

  ngOnInit(): void {
    this.loadUsers();
  }

  loadUsers(): void {
    this.loading = true;
    this.errorMessage = '';

    this.adminService.getUsers().subscribe({
      next: (response) => {
        this.users = response.users;
        this.loading = false;
      },
      error: (error) => {
        this.errorMessage = error?.error?.message || 'No se pudieron cargar los usuarios.';
        this.loading = false;
      }
    });
  }

  openCreateForm(): void {
    this.creating = true;
    this.createErrorMessage = '';
    this.createSuccessMessage = '';
    this.createOfficeForm.reset();
  }

  cancelCreateForm(): void {
    this.creating = false;
    this.createErrorMessage = '';
    this.createSuccessMessage = '';
    this.createOfficeForm.reset();
  }

  saveOffice(): void {
    if (this.createOfficeForm.invalid || this.saving) {
      this.createOfficeForm.markAllAsTouched();
      this.createErrorMessage = 'Completá los campos obligatorios antes de guardar.';
      return;
    }

    const formValue = this.createOfficeForm.getRawValue();
    const municipalityName = formValue.municipality_name.trim();

    const payload: CreateAdminUserRequest = {
      name: `Municipalidad de ${municipalityName}`,
      username: formValue.username.trim(),
      password: formValue.password,
      role: 'municipio',
      municipality_name: municipalityName
    };

    this.saving = true;
    this.createErrorMessage = '';
    this.createSuccessMessage = '';

    this.adminService.createUser(payload).subscribe({
      next: (response) => {
        this.saving = false;
        this.creating = false;
        this.createOfficeForm.reset();
        this.createSuccessMessage = response.message || 'Oficina creada correctamente.';
        this.loadUsers();
      },
      error: (error) => {
        this.saving = false;
        this.createErrorMessage = error?.error?.message || 'No se pudo crear la oficina.';
      }
    });
  }

  goBack(): void {
    this.router.navigateByUrl('/admin');
  }

  isInvalid(controlName: 'municipality_name' | 'username' | 'password'): boolean {
    const control = this.createOfficeForm.controls[controlName];
    return control.invalid && (control.touched || control.dirty);
  }

  getRoleLabel(role: AdminUser['role']): string {
    if (role === 'admin') {
      return 'Administrador';
    }

    return 'Municipio / Oficina';
  }

  getActiveLabel(active: number): string {
    return active === 1 ? 'Activo' : 'Inactivo';
  }
}
