import { inject } from '@angular/core';
import { CanActivateFn, Router } from '@angular/router';

type UserRole = 'admin' | 'municipio';

interface StoredUser {
  role: UserRole;
}

function getStoredUser(): StoredUser | null {
  const userJson = localStorage.getItem('oficinas_empleo_user');

  if (!userJson) {
    return null;
  }

  try {
    return JSON.parse(userJson) as StoredUser;
  } catch {
    return null;
  }
}

export const roleGuard: CanActivateFn = (route) => {
  const router = inject(Router);
  const token = localStorage.getItem('oficinas_empleo_token');
  const user = getStoredUser();
  const expectedRole = route.data['role'] as UserRole;

  if (!token || !user) {
    localStorage.removeItem('oficinas_empleo_token');
    localStorage.removeItem('oficinas_empleo_user');
    return router.parseUrl('/login');
  }

  if (user.role === expectedRole) {
    return true;
  }

  if (user.role === 'admin') {
    return router.parseUrl('/admin');
  }

  return router.parseUrl('/municipio');
};
