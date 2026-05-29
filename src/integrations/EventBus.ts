export interface EventBus {
  publish(topic: string, payload: unknown): void;
  subscribe(topic: string, handler: (payload: unknown) => void): void;
}
