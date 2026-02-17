#!/usr/bin/env node
import { startWorker, setupSignalHandlers } from '../src/lib/worker.js';

const client = startWorker();
setupSignalHandlers(client);
