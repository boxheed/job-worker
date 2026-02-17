import mqtt from 'mqtt';
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
      '-i, --id <id>',
      'Unique Worker ID',
      process.env.WORKER_ID || 'worker-01',
    )
    .option('-t, --topic <topic>', 'Subscription topic', 'jobs/pending')
    .parse(argv);

  const options = program.opts();

  const MQTT_URL = options.url;
  const WORKER_ID = options.id;
  const TOPIC = options.topic;

  console.log(`Starting worker ${WORKER_ID} connecting to ${MQTT_URL}...`);

  const client = mqtt.connect(MQTT_URL, {
    clientId: WORKER_ID,
    clean: false,
  });

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
