export interface AlprPort {
  startCapture(cameraId: string): void;
  stop(): void;
}
