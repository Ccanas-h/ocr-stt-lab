import type { CapacitorConfig } from '@capacitor/cli';

const config: CapacitorConfig = {
  appId: 'cl.investigacion.ocrsttlab',
  appName: 'OCR/STT Lab',
  webDir: 'dist/ocr-stt-lab/browser',
  android: {
    // El benchmark necesita ver los errores nativos tal cual ocurren.
    webContentsDebuggingEnabled: true,
  },
  plugins: {
    Camera: {
      // Sin recompresión adicional del plugin: queremos el archivo original.
      androidxExifInterfaceVersion: '1.4.1',
    },
  },
};

export default config;
