#!/usr/bin/env node
import { startWorker, setupSignalHandlers } from '../src/lib/worker.js';

const client = await startWorker();
if (client) {
  setupSignalHandlers(client);
}
