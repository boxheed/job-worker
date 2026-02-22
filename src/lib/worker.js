import mqtt from 'mqtt';
import fs from 'node:fs';
import path from 'node:path';
import { Command } from 'commander';
import { executeJob } from './executor.js';

const pkg = JSON.parse(
  fs.readFileSync(new URL('../../package.json', import.meta.url), 'utf8'),
);

/**
 * Creates a standard result payload.
 * @param {string} id - The job ID.
 * @param {string} status - Job status.
 * @param {number} exitCode - Exit code.
 * @param {string} workDir - Working directory.
 * @returns {object}
 */
function createResultPayload(id, status, exitCode, workDir) {
  const payload = {
    id,
    status,
    exitCode,
  };
  if (workDir) {
    payload.manifestFile = path.join(path.resolve(workDir), 'result.json');
  }
  return payload;
}

/**
 * Starts the worker with the given arguments.
 * @param {string[]} argv - Command line arguments.
 * @returns {Promise<import('mqtt').MqttClient|null>} The MQTT client instance or null if dry run.
 */
export async function startWorker(argv = process.argv) {
  const program = new Command();

  program
    .version(pkg.version)
    .option(
      '-u, --url <url>',
      'MQTT Broker URL',
      process.env.MQTT_URL || 'mqtt://localhost:1883',
    )
    .option(
      '-n, --username <username>',
      'MQTT Username',
      process.env.MQTT_USERNAME,
    )
    .option(
      '-p, --password <password>',
      'MQTT Password',
      process.env.MQTT_PASSWORD,
    )
    .option(
      '-i, --id <id>',
      'Unique Worker ID',
      process.env.WORKER_ID || 'worker-01',
    )
    .option(
      '-t, --topic <topic>',
      'Subscription topic',
      process.env.MQTT_TOPIC || 'jobs/pending',
    )
    .option('--dry-run', 'Run in dry-run mode using test-payload.json')
    .parse(argv);

  const options = program.opts();

  if (options.dryRun) {
    try {
      await handleDryRun();
    } catch (err) {
      console.error('Dry run failed:', err);
      process.exit(1);
    }
    return null;
  }

  const MQTT_URL = options.url;
  const WORKER_ID = options.id;
  const TOPIC = options.topic;

  console.log(`Starting worker ${WORKER_ID} connecting to ${MQTT_URL}...`);

  const connectOptions = {
    clientId: WORKER_ID,
    clean: false,
  };

  if (options.username) connectOptions.username = options.username;
  if (options.password) connectOptions.password = options.password;

  const client = mqtt.connect(MQTT_URL, connectOptions);
  let isProcessing = false;

  client.on('connect', () => {
    console.log('Connected to MQTT broker');
    client.subscribe(TOPIC, { qos: 1 }, (err) => {
      if (err) {
        console.error(`Failed to subscribe to ${TOPIC}:`, err);
        process.exit(1);
      }
      console.log(`Subscribed to ${TOPIC}`);
    });
  });

  client.on('error', (err) => {
    console.error('MQTT error:', err);
  });

  client.on('message', async (topic, message) => {
    if (topic === TOPIC) {
      if (isProcessing) return;
      isProcessing = true;

      // Immediately unsubscribe to stop receiving more messages
      client.unsubscribe(TOPIC, (err) => {
        if (err) console.error('Failed to unsubscribe:', err);
      });

      let payload;
      try {
        payload = JSON.parse(message.toString());
      } catch (err) {
        console.error('Failed to parse job payload:', err);
        client.end(false, () => process.exit(1));
        return;
      }

      const { id, workDir } = payload;
      if (!id || !workDir) {
        console.error('Invalid payload: missing id or workDir', payload);
        client.end(false, () => process.exit(1));
        return;
      }

      console.log(`Received job ${id} in ${workDir}`);

      try {
        const result = await executeJob(workDir, id);
        console.log(`Job ${id} finished with status ${result.status}`);

        const resultPayload = createResultPayload(
          id,
          result.status,
          result.exitCode,
          workDir,
        );

        client.publish(
          `jobs/results/${id}`,
          JSON.stringify(resultPayload),
          { qos: 1 },
          (err) => {
            if (err) {
              console.error('Failed to publish result:', err);
            } else {
              console.log(`Result for job ${id} published`);
            }

            console.log('Disconnecting and exiting...');
            client.end(false, () => {
              process.exit(0);
            });
          },
        );
      } catch (err) {
        console.error(`Error executing job ${id}:`, err);
        const errorPayload = createResultPayload(id, 'failed', 1, workDir);
        errorPayload.error = err.message;

        client.publish(
          `jobs/results/${id}`,
          JSON.stringify(errorPayload),
          { qos: 1 },
          () => {
            client.end(false, () => process.exit(1));
          },
        );
      }
    }
  });

  return client;
}

/**
 * Handles dry-run mode.
 */
async function handleDryRun() {
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

  const { id = 'dry-run', workDir = '.', steps } = payload;
  console.log(`Executing dry run for job ${id} in ${workDir}`);

  const result = await executeJob(workDir, id, steps ? { steps } : null);

  const resultPayload = createResultPayload(
    id,
    result.status,
    result.exitCode,
    workDir,
  );

  console.log('Dry run results:');
  console.log(JSON.stringify(resultPayload, null, 2));
  process.exit(0);
}

/**
 * Sets up signal handlers for graceful shutdown.
 * @param {import('mqtt').MqttClient} client - The MQTT client instance.
 */
export function setupSignalHandlers(client) {
  const handleSignal = (signal) => {
    console.log(`Received ${signal}. Shutting down...`);
    client.end(false, () => {
      console.log('MQTT client disconnected. Exiting.');
      process.exit(0);
    });
  };

  process.on('SIGINT', () => handleSignal('SIGINT'));
  process.on('SIGTERM', () => handleSignal('SIGTERM'));
}
