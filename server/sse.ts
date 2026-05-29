import type { ServerResponse } from "node:http";

export class SseHub {
  private clients = new Set<ServerResponse>();

  add(res: ServerResponse): void {
    res.writeHead(200, {
      "Content-Type": "text/event-stream",
      "Cache-Control": "no-cache",
      Connection: "keep-alive",
    });
    this.clients.add(res);
    res.on("close", () => {
      this.clients.delete(res);
    });
  }

  broadcast(topic: string, payload: unknown, ts: number): void {
    const line = `data: ${JSON.stringify({ topic, payload, ts })}\n\n`;
    for (const res of this.clients) {
      res.write(line);
    }
  }

  count(): number {
    return this.clients.size;
  }
}
