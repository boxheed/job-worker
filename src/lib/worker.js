import mqtt from 'mqtt';
import fs from 'node:fs';
import path from 'node:path';
import { Command } from 'commander';
import { executeJob } from './executor.js';

/**
 * Starts the worker with the given arguments.
 * @param {string[]} argv - Command line arguments.
 * @returns {import('mqtt').MqttClient} The MQTT client instance.
 */
export function startWorker(argv = process.argv) {
  const program = new Command();

  program
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
    .option('-t, --topic <topic>', 'Subscription topic', 'jobs/pending')
    .option('--dry-run', 'Run in dry-run mode using test-payload.json')
    .parse(argv);

  const options = program.opts();

  if (options.dryRun) {
    console.log('Dry run mode enabled. Reading test-payload.json...');
    const payloadPath = path.resolve('test-payload.json');
    if (!fs.existsSync(payloadPath)) {
      console.error(`Error: ${payloadPath} not found.`);
      process.exit(1);
      return;
    }

    let payload;
    try {
      payload = JSON.parse(fs.readFileSync(payloadPath, 'utf8'));
    } catch (err) {
      console.error('Failed to parse test-payload.json:', err);
      process.exit(1);
      return;
    }

    const { id = 'dry-run', workDir = '.', steps } = payload;
    console.log(`Executing dry run for job ${id} in ${workDir}`);

    const result = executeJob(workDir, id, steps ? { steps } : null);

    const resultPayload = {
      id,
      status: result.status,
      exitCode: result.exitCode,
      logFile: path.join(path.resolve(workDir), 'job.log'),
    };

    console.log(JSON.stringify(resultPayload, null, 2));
    process.exit(0);
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

  client.on('message', (topic, message) => {
    if (topic === TOPIC) {
      let payload;
      try {
        payload = JSON.parse(message.toString());
      } catch (err) {
        console.error('Failed to parse job payload:', err);
        return;
      }

      const { id, workDir } = payload;
      console.log(`Received job ${id} in ${workDir}`);

      const result = executeJob(workDir, id);
      console.log(`Job ${id} finished with status ${result.status}`);

      const resultPayload = {
        id,
        status: result.status,
        exitCode: result.exitCode,
        logFile: path.join(path.resolve(workDir), 'job.log'),
      };

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
    }
  });

  return client;
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
