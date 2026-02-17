import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import mqtt from 'mqtt';
import { executeJob } from '../src/lib/executor.js';
import path from 'node:path';

vi.mock('mqtt');
vi.mock('../src/lib/executor.js');

describe('Worker', () => {
  let mockClient;

  beforeEach(() => {
    vi.stubEnv('MQTT_URL', 'mqtt://test-broker:1883');
    vi.stubEnv('WORKER_ID', 'test-worker');

    mockClient = {
      on: vi.fn(),
      subscribe: vi.fn((topic, opts, cb) => {
        if (cb) cb(null);
      }),
      publish: vi.fn((topic, payload, opts, cb) => {
        if (cb) cb(null);
      }),
      end: vi.fn((force, cb) => {
        if (cb) cb();
      }),
    };
    vi.mocked(mqtt.connect).mockReturnValue(mockClient);
    vi.spyOn(process, 'exit').mockImplementation(() => {});
  });

  afterEach(() => {
    vi.unstubAllEnvs();
    vi.restoreAllMocks();
    vi.resetModules();
  });

  it('should connect, subscribe, handle message, and exit', async () => {
    vi.mocked(executeJob).mockReturnValue({ status: 'success', exitCode: 0 });

    // Import worker
    await import('../bin/worker.js');

    expect(mqtt.connect).toHaveBeenCalledWith('mqtt://test-broker:1883', {
      clientId: 'test-worker',
      clean: false,
    });

    // Simulate connect
    const connectHandler = mockClient.on.mock.calls.find((c) => c[0] === 'connect')[1];
    connectHandler();
    expect(mockClient.subscribe).toHaveBeenCalledWith('jobs/pending', { qos: 1 }, expect.any(Function));

    // Simulate message
    const messageHandler = mockClient.on.mock.calls.find((c) => c[0] === 'message')[1];
    const payload = { id: 'job-123', workDir: '/jobs/job-123' };
    messageHandler('jobs/pending', Buffer.from(JSON.stringify(payload)));

    expect(executeJob).toHaveBeenCalledWith('/jobs/job-123', 'job-123');
    expect(mockClient.publish).toHaveBeenCalledWith(
      'jobs/results/job-123',
      expect.stringContaining('"status":"success"'),
      { qos: 1 },
      expect.any(Function)
    );

    expect(mockClient.end).toHaveBeenCalled();
    expect(process.exit).toHaveBeenCalledWith(0);
  });

  it('should handle a failed job', async () => {
    vi.mocked(executeJob).mockReturnValue({ status: 'failed', exitCode: 1 });

    // Import worker
    await import('../bin/worker.js');

    // Simulate message
    const messageHandler = mockClient.on.mock.calls.find((c) => c[0] === 'message')[1];
    const payload = { id: 'job-failed', workDir: '/jobs/job-failed' };
    messageHandler('jobs/pending', Buffer.from(JSON.stringify(payload)));

    expect(executeJob).toHaveBeenCalledWith('/jobs/job-failed', 'job-failed');
    expect(mockClient.publish).toHaveBeenCalledWith(
      'jobs/results/job-failed',
      expect.stringContaining('"status":"failed"'),
      { qos: 1 },
      expect.any(Function)
    );

    expect(mockClient.end).toHaveBeenCalled();
    expect(process.exit).toHaveBeenCalledWith(0);
  });
});
