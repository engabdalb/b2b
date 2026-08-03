import { HttpClient, HttpParams, HttpResponse } from '@angular/common/http';
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

  get<T>(serviceName: string, query?: Record<string, string | number | boolean>): Observable<T> {
    let params = new HttpParams();
    if (query) {
      for (const [k, v] of Object.entries(query)) {
        if (v !== undefined && v !== null && String(v) !== '') {
          params = params.set(k, String(v));
        }
      }
    }
    return this.http.get<T>(this.serviceUrl(serviceName), { params });
  }

  post<T>(serviceName: string, body: unknown): Observable<T> {
    return this.http.post<T>(this.serviceUrl(serviceName), body);
  }

  /** Dosya indirmeleri için: gövde Blob, başlıklar (Content-Disposition) okunabilir. */
  getBlob(
    serviceName: string,
    query?: Record<string, string | number | boolean>,
  ): Observable<HttpResponse<Blob>> {
    let params = new HttpParams();
    if (query) {
      for (const [k, v] of Object.entries(query)) {
        if (v !== undefined && v !== null && String(v) !== '') {
          params = params.set(k, String(v));
        }
      }
    }
    return this.http.get(this.serviceUrl(serviceName), {
      params,
      responseType: 'blob',
      observe: 'response',
    });
  }
}
