import { Component } from '@angular/core';
import {
  IonTabs,
  IonTabBar,
  IonTabButton,
  IonIcon,
  IonLabel,
} from '@ionic/angular/standalone';

@Component({
  selector: 'app-tabs',
  imports: [IonTabs, IonTabBar, IonTabButton, IonIcon, IonLabel],
  template: `
    <ion-tabs>
      <ion-tab-bar slot="bottom">
        <ion-tab-button tab="ocr" href="/ocr">
          <ion-icon name="document-text-outline" />
          <ion-label>Imagen → texto</ion-label>
        </ion-tab-button>
        <ion-tab-button tab="voz" href="/voz">
          <ion-icon name="mic-outline" />
          <ion-label>Voz → texto</ion-label>
        </ion-tab-button>
        <ion-tab-button tab="info" href="/info">
          <ion-icon name="information-circle-outline" />
          <ion-label>Entorno</ion-label>
        </ion-tab-button>
      </ion-tab-bar>
    </ion-tabs>
  `,
})
export class TabsPage {}
