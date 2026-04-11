import { inject } from '@angular/core';
import { CanActivateFn, Router } from '@angular/router';
import { environment } from '../../../environments/environment';
import { AuthService } from '../services/auth.service';

/** API oturumu: mock veya apiUrl yoksa serbest; aksi halde token gerekir */
export const authGuard: CanActivateFn = () => {
  if (environment.useMockAuth || !environment.apiUrl?.trim()) {
    return true;
  }
  const auth = inject(AuthService);
  if (auth.token()) {
    return true;
  }
  return inject(Router).parseUrl('/login');
};
