import { HttpClient } from '@angular/common/http';
import { Injectable, inject } from '@angular/core';
import { Observable } from 'rxjs';
import { environment } from '../../../environments/environment';

/**
 * Peakik tarzı: `${apiUrl}/routes/api.php/${serviceName}`
 */
@Injectable({ providedIn: 'root' })
export class ApiService {
  private readonly http = inject(HttpClient);

  private serviceUrl(serviceName: string): string {
    const base = environment.apiUrl.replace(/\/$/, '');
    return `${base}/routes/api.php/${serviceName}`;
  }

  get<T>(serviceName: string): Observable<T> {
    return this.http.get<T>(this.serviceUrl(serviceName));
  }

  post<T>(serviceName: string, body: unknown): Observable<T> {
    return this.http.post<T>(this.serviceUrl(serviceName), body);
  }
}
