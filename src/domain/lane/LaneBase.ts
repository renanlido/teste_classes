export abstract class LaneBase {
  abstract getState(): string;
  abstract start(): Promise<void>;
}
