import { Component, inject } from '@angular/core';
import { FormBuilder, ReactiveFormsModule, Validators } from '@angular/forms';
import { Router } from '@angular/router';
import { AuthService } from '../../core/services/auth.service';

@Component({
  selector: 'app-login',
  imports: [ReactiveFormsModule],
  templateUrl: './login.html',
  styleUrl: './login.scss'
})
export class LoginComponent {
  private fb = inject(FormBuilder);
  private authService = inject(AuthService);
  private router = inject(Router);

  loading = false;
  errorMessage = '';

  loginForm = this.fb.nonNullable.group({
    username: ['admin', Validators.required],
    password: ['Admin1234!', Validators.required]
  });

  submit(): void {
    if (this.loginForm.invalid || this.loading) {
      this.loginForm.markAllAsTouched();
      return;
    }

    this.loading = true;
    this.errorMessage = '';

    this.authService.login(this.loginForm.getRawValue()).subscribe({
      next: (response) => {
        if (response.user.role === 'admin') {
          this.router.navigateByUrl('/admin');
          return;
        }

        if (response.user.role === 'municipio') {
          this.router.navigateByUrl('/municipio');
          return;
        }

        this.errorMessage = 'Rol de usuario no reconocido.';
        this.loading = false;
      },
      error: (error) => {
        this.errorMessage = error?.error?.message || 'No se pudo iniciar sesión.';
        this.loading = false;
      }
    });
  }
}
