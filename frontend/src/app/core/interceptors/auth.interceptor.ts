import { HttpInterceptorFn } from '@angular/common/http';
import { environment } from '../../../environments/environment';

export const authInterceptor: HttpInterceptorFn = (req, next) => {
  if (req.url.includes('b2b_login')) {
    return next(req);
  }
  const token = localStorage.getItem('b2b_token');
  if (!token) {
    return next(req);
  }
  return next(
    req.clone({
      setHeaders: {
        Authorization: `Bearer ${token}`,
        'X-App-Version': environment.appVersion,
        'X-Platform': environment.platform,
      },
    }),
  );
};
