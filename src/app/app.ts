import { Component } from '@angular/core';
import { IonApp, IonRouterOutlet } from '@ionic/angular/standalone';
import { addIcons } from 'ionicons';
import {
  camera,
  images,
  scan,
  colorWand,
  play,
  trash,
  copyOutline,
  shareOutline,
  documentTextOutline,
  micOutline,
  informationCircleOutline,
  checkmarkCircle,
  closeCircle,
  alertCircle,
  timeOutline,
  speedometerOutline,
  refreshOutline,
  stopCircle,
  radioButtonOn,
  chevronDownOutline,
  hardwareChipOutline,
  globeOutline,
} from 'ionicons/icons';

@Component({
  selector: 'app-root',
  imports: [IonApp, IonRouterOutlet],
  template: `
    <ion-app>
      <ion-router-outlet />
    </ion-app>
  `,
})
export class App {
  constructor() {
    addIcons({
      camera,
      images,
      scan,
      'color-wand': colorWand,
      play,
      trash,
      'copy-outline': copyOutline,
      'share-outline': shareOutline,
      'document-text-outline': documentTextOutline,
      'mic-outline': micOutline,
      'information-circle-outline': informationCircleOutline,
      'checkmark-circle': checkmarkCircle,
      'close-circle': closeCircle,
      'alert-circle': alertCircle,
      'time-outline': timeOutline,
      'speedometer-outline': speedometerOutline,
      'refresh-outline': refreshOutline,
      'stop-circle': stopCircle,
      'radio-button-on': radioButtonOn,
      'chevron-down-outline': chevronDownOutline,
      'hardware-chip-outline': hardwareChipOutline,
      'globe-outline': globeOutline,
    });
  }
}
