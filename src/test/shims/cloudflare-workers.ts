export class DurableObject {
  protected readonly state: DurableObjectState;
  protected readonly env: unknown;

  constructor(state: DurableObjectState, env: unknown) {
    this.state = state;
    this.env = env;
  }
}
