import { registerLocaleData } from '@angular/common';
import localeEn from '@angular/common/locales/en';
import localeTr from '@angular/common/locales/tr';
import { bootstrapApplication } from '@angular/platform-browser';
import { appConfig } from './app/app.config';
import { AppComponent } from './app/app.component';

registerLocaleData(localeTr, 'tr-TR');
registerLocaleData(localeEn, 'en-US');

bootstrapApplication(AppComponent, appConfig)
  .catch((err) => console.error(err));
