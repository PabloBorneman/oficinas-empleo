import { Routes } from '@angular/router';
import { roleGuard } from './core/guards/role.guard';

export const routes: Routes = [
  {
    path: 'login',
    loadComponent: () => import('./pages/login/login').then(m => m.LoginComponent)
  },
  {
    path: 'admin/users',
    canActivate: [roleGuard],
    data: { role: 'admin' },
    loadComponent: () => import('./pages/admin-users/admin-users').then(m => m.AdminUsersComponent)
  },
  {
    path: 'admin/forms/:id',
    canActivate: [roleGuard],
    data: { role: 'admin' },
    loadComponent: () => import('./pages/admin-form-detail/admin-form-detail').then(m => m.AdminFormDetailComponent)
  },
  {
    path: 'admin',
    canActivate: [roleGuard],
    data: { role: 'admin' },
    loadComponent: () => import('./pages/admin/admin-home').then(m => m.AdminHomeComponent)
  },
  {
    path: 'municipio/forms/:id',
    canActivate: [roleGuard],
    data: { role: 'municipio' },
    loadComponent: () => import('./pages/municipio-form-detail/municipio-form-detail').then(m => m.MunicipioFormDetailComponent)
  },
  {
    path: 'municipio',
    canActivate: [roleGuard],
    data: { role: 'municipio' },
    loadComponent: () => import('./pages/municipio/municipio-home').then(m => m.MunicipioHomeComponent)
  },
  {
    path: '',
    pathMatch: 'full',
    redirectTo: 'login'
  },
  {
    path: '**',
    redirectTo: 'login'
  }
];
