import { Routes } from '@angular/router';

export const routes: Routes = [
  {
    path: '',
    loadComponent: () => import('./pages/tabs/tabs.page').then((m) => m.TabsPage),
    children: [
      {
        path: 'ocr',
        loadComponent: () => import('./pages/ocr/ocr.page').then((m) => m.OcrPage),
      },
      {
        path: 'voz',
        loadComponent: () => import('./pages/stt/stt.page').then((m) => m.SttPage),
      },
      {
        path: 'info',
        loadComponent: () => import('./pages/info/info.page').then((m) => m.InfoPage),
      },
      { path: '', redirectTo: 'ocr', pathMatch: 'full' },
    ],
  },
  { path: '**', redirectTo: '' },
];
