#!/usr/bin/env node
import mqtt from 'mqtt';
import path from 'node:path';
import { executeJob } from '../src/lib/executor.js';

const MQTT_URL = process.env.MQTT_URL || 'mqtt://localhost:1883';
const WORKER_ID = process.env.WORKER_ID || 'node-worker-01';

console.log(`Starting worker ${WORKER_ID} connecting to ${MQTT_URL}...`);

const client = mqtt.connect(MQTT_URL, {
  clientId: WORKER_ID,
  clean: false,
});

client.on('connect', () => {
  console.log('Connected to MQTT broker');
  client.subscribe('jobs/pending', { qos: 1 }, (err) => {
    if (err) {
      console.error('Failed to subscribe to jobs/pending:', err);
      process.exit(1);
    }
    console.log('Subscribed to jobs/pending');
  });
});

client.on('error', (err) => {
  console.error('MQTT error:', err);
});

client.on('message', (topic, message) => {
  if (topic === 'jobs/pending') {
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

    client.publish(`jobs/results/${id}`, JSON.stringify(resultPayload), { qos: 1 }, (err) => {
      if (err) {
        console.error('Failed to publish result:', err);
      } else {
        console.log(`Result for job ${id} published`);
      }

      console.log('Disconnecting and exiting...');
      client.end(false, () => {
        process.exit(0);
      });
    });
  }
});
