// Tests run in Node, not workerd: the OAuth library only extends this class for its split-Worker
// mode, which this Worker doesn't use.
export class WorkerEntrypoint {
  constructor(public ctx?: unknown, public env?: unknown) {}
}
