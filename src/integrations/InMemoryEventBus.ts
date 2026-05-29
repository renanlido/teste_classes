import type { EventBus } from "./EventBus.js";

export class InMemoryEventBus implements EventBus {
  private handlers = new Map<string, ((payload: unknown) => void)[]>();

  publish(topic: string, payload: unknown): void {
    for (const h of this.handlers.get(topic) ?? []) {
      h(payload);
    }
  }

  subscribe(topic: string, handler: (payload: unknown) => void): void {
    const list = this.handlers.get(topic) ?? [];
    list.push(handler);
    this.handlers.set(topic, list);
  }
}
