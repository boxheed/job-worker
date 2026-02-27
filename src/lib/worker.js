import { connect, JSONCodec, AckPolicy } from 'nats';
import fs from 'node:fs';
import path from 'node:path';
import { Command } from 'commander';
import { executeJob } from './executor.js';

const pkg = JSON.parse(
  fs.readFileSync(new URL('../../package.json', import.meta.url), 'utf8'),
);

const jc = JSONCodec();

/**
 * Creates a standard result payload.
 * @param {string} id - The job ID.
 * @param {string} status - Job status.
 * @param {number} exitCode - Exit code.
 * @returns {object}
 */
function createResultPayload(id, status, exitCode) {
  return {
    id,
    status,
    exitCode,
    manifestFile: 'results/result.json',
  };
}

/**
 * Starts the worker with the given arguments.
 * @param {string[]} argv - Command line arguments.
 * @returns {Promise<import('nats').NatsConnection|null>} The NATS connection instance or null if dry run.
 */
export async function startWorker(argv = process.argv) {
  const program = new Command();

  program
    .version(pkg.version)
    .option(
      '-u, --url <url>',
      'NATS Server URL',
      process.env.NATS_URL || 'nats://localhost:4222',
    )
    .option(
      '-n, --username <username>',
      'NATS Username',
      process.env.NATS_USERNAME,
    )
    .option(
      '-p, --password <password>',
      'NATS Password',
      process.env.NATS_PASSWORD,
    )
    .option('-t, --token <token>', 'NATS Auth Token', process.env.NATS_TOKEN)
    .option(
      '-i, --id <id>',
      'Unique Worker ID (Durable Name)',
      process.env.WORKER_ID || 'worker-01',
    )
    .option(
      '-j, --jobs-dir <path>',
      'Root directory for job sources (Shared Folder)',
      process.env.NATS_JOBS_DIR || './jobs',
    )
    .option(
      '-w, --workspaces-dir <path>',
      'Root directory for local execution workspaces',
      process.env.NATS_WORKSPACES_DIR || './workspaces',
    )
    .option(
      '-s, --stream <stream>',
      'NATS JetStream Stream Name',
      process.env.NATS_STREAM || 'JOBS',
    )
    .option(
      '-k, --input-subject <subject>',
      'NATS Subject to consume from',
      process.env.NATS_INPUT_SUBJECT || 'jobs.pending',
    )
    .option(
      '-r, --output-subject <subject>',
      'NATS Subject to publish results to',
      process.env.NATS_OUTPUT_SUBJECT || 'jobs.results',
    )
    .option(
      '-o, --timeout <minutes>',
      'Job execution timeout in minutes',
      process.env.JOB_TIMEOUT || '30',
    )
    .option('--dry-run', 'Run in dry-run mode using test-payload.json')
    .parse(argv);

  const options = program.opts();

  if (options.dryRun) {
    try {
      await handleDryRun(options.jobsDir, options.workspacesDir);
    } catch (err) {
      console.error('Dry run failed:', err);
      process.exit(1);
    }
    return null;
  }

  const NATS_URL = options.url;
  const WORKER_ID = options.id;
  const STREAM = options.stream;
  const SUBJECT = options.inputSubject;
  const OUTPUT_SUBJECT = options.outputSubject;
  const JOBS_DIR = options.jobsDir;
  const WORKSPACES_DIR = options.workspacesDir;
  const TIMEOUT_MINUTES = parseInt(options.timeout, 10);

  console.log(`Starting worker ${WORKER_ID} connecting to ${NATS_URL}...`);
  console.log(`Jobs directory: ${path.resolve(JOBS_DIR)}`);
  console.log(`Workspaces directory: ${path.resolve(WORKSPACES_DIR)}`);
  console.log(`JetStream Stream: ${STREAM}, Subject: ${SUBJECT}`);

  const connectOptions = {
    servers: NATS_URL,
    name: WORKER_ID,
  };

  if (options.username) {
    connectOptions.user = options.username;
    connectOptions.pass = options.password;
  } else if (options.token) {
    connectOptions.token = options.token;
  }

  let nc;
  try {
    nc = await connect(connectOptions);
    console.log('Connected to NATS');
  } catch (err) {
    console.error(`Error connecting to NATS: ${err.message}`);
    process.exit(1);
  }

  const js = nc.jetstream();

  try {
    const jsm = await nc.jetstreamManager();

    // Ensure the stream exists
    try {
      await jsm.streams.info(STREAM);
    } catch (err) {
      if (err.message.includes('stream not found')) {
        console.log(`Stream ${STREAM} not found, attempting to create...`);
        await jsm.streams.add({
          name: STREAM,
          subjects: [SUBJECT],
        });
      } else {
        throw err;
      }
    }

    // Get the consumer
    const consumer = await js.consumers.get(STREAM, WORKER_ID).catch(async () => {
        // If consumer doesn't exist, try to create it if it's not there.
        // In a real production environment, you might want this pre-configured.
        console.log(`Consumer ${WORKER_ID} not found, attempting to create...`);
        return await jsm.consumers.add(STREAM, {
            durable_name: WORKER_ID,
            ack_policy: AckPolicy.Explicit,
            filter_subject: SUBJECT,
            ack_wait: TIMEOUT_MINUTES * 60 * 1_000_000_000,
        });
    });

    console.log(`Waiting for next job on ${SUBJECT}...`);
    const messages = await consumer.fetch({ max_messages: 1, expires: 60000 });
    
    let received = false;
    for await (const m of messages) {
      received = true;
      let payload;
      try {
        payload = jc.decode(m.data);
      } catch (err) {
        console.error('Failed to parse job payload:', err);
        m.term();
        await nc.close();
        process.exit(1);
      }

      const { id } = payload;
      if (!id) {
        console.error('Invalid payload: missing id', payload);
        m.term();
        await nc.close();
        process.exit(1);
      }

      console.log(`Received job ${id}`);

      const controller = new AbortController();
      const timeoutId = setTimeout(() => {
        console.error(`Job ${id} timed out after ${TIMEOUT_MINUTES} minutes. Aborting...`);
        controller.abort();
      }, TIMEOUT_MINUTES * 60 * 1000);

      try {
        const result = await executeJob(
          JOBS_DIR,
          WORKSPACES_DIR,
          id,
          payload.steps ? { steps: payload.steps } : null,
          controller.signal,
        );
        clearTimeout(timeoutId);
        console.log(`Job ${id} finished with status ${result.status}`);

        const resultPayload = createResultPayload(
          id,
          result.status,
          result.exitCode,
        );

        await nc.publish(
          OUTPUT_SUBJECT,
          jc.encode(resultPayload)
        );
        console.log(`Result for job ${id} published to ${OUTPUT_SUBJECT}`);

        await m.ack();
        console.log('Message acknowledged. Disconnecting and exiting...');
        await nc.close();
        process.exit(0);
      } catch (err) {
        clearTimeout(timeoutId);
        if (err.name === 'AbortError') {
            console.error(`Job ${id} was aborted due to timeout.`);
        } else {
            console.error(`Error executing job ${id}:`, err);
        }
        const errorPayload = createResultPayload(id, 'failed', 1);
        errorPayload.error = err.name === 'AbortError' ? 'Job timed out' : err.message;

        await nc.publish(
          OUTPUT_SUBJECT,
          jc.encode(errorPayload)
        );
        
        await m.nak(); // Negative ack so it can be retried if configured
        await nc.close();
        process.exit(1);
      }
    }

    if (!received) {
      console.log('No messages received within timeout. Exiting...');
      await nc.close();
      process.exit(0);
    }
  } catch (err) {
    console.error(`JetStream error: ${err.message}`);
    await nc.close();
    process.exit(1);
  }

  return nc;
}

/**
 * Handles dry-run mode.
 */
async function handleDryRun(jobsDir, workspacesDir) {
  console.log('Dry run mode enabled. Reading test-payload.json...');
  const payloadPath = path.resolve('test-payload.json');
  if (!fs.existsSync(payloadPath)) {
    throw new Error(`${payloadPath} not found.`);
  }

  let payload;
  try {
    payload = JSON.parse(fs.readFileSync(payloadPath, 'utf8'));
  } catch (err) {
    throw new Error(`Failed to parse test-payload.json: ${err.message}`);
  }

  const { id = 'dry-run', steps } = payload;
  console.log(`Executing dry run for job ${id}`);

  const result = await executeJob(
    jobsDir,
    workspacesDir,
    id,
    steps ? { steps } : null,
  );

  const resultPayload = createResultPayload(id, result.status, result.exitCode);

  console.log('Dry run results:');
  console.log(JSON.stringify(resultPayload, null, 2));
  process.exit(0);
}

/**
 * Sets up signal handlers for graceful shutdown.
 * @param {import('nats').NatsConnection} nc - The NATS connection instance.
 */
export function setupSignalHandlers(nc) {
  const handleSignal = async (signal) => {
    console.log(`Received ${signal}. Shutting down...`);
    await nc.close();
    console.log('NATS connection closed. Exiting.');
    process.exit(0);
  };

  process.on('SIGINT', () => handleSignal('SIGINT'));
  process.on('SIGTERM', () => handleSignal('SIGTERM'));
}
