import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import mqtt from 'mqtt';
import { executeJob } from '../src/lib/executor.js';
import { startWorker, setupSignalHandlers } from '../src/lib/worker.js';

vi.mock('mqtt');
vi.mock('../src/lib/executor.js');

describe('Worker', () => {
  let mockClient;

  beforeEach(() => {
    vi.stubEnv('MQTT_URL', 'mqtt://test-broker:1883');
    vi.stubEnv('WORKER_ID', 'test-worker');
    vi.stubEnv('MQTT_USERNAME', 'test-user');
    vi.stubEnv('MQTT_PASSWORD', 'test-pass');
    vi.stubEnv('MQTT_TOPIC', 'test/jobs');
    vi.stubEnv('MQTT_JOBS_DIR', './test-jobs');
    vi.stubEnv('MQTT_WORKSPACES_DIR', './test-workspaces');
    vi.stubEnv('MQTT_CLEAN', 'false');

    mockClient = {
      on: vi.fn(),
      subscribe: vi.fn((topic, opts, cb) => {
        if (cb) cb(null);
      }),
      unsubscribe: vi.fn((topic, cb) => {
        if (cb) cb(null);
      }),
      publish: vi.fn((topic, payload, opts, cb) => {
        if (cb) cb(null);
      }),
      end: vi.fn((force, cb) => {
        if (cb) cb();
      }),
      handleMessage: vi.fn((packet, cb) => {
        if (cb) cb();
      }),
    };
    mqtt.connect.mockClear();
    vi.clearAllMocks();
    vi.mocked(mqtt.connect).mockReturnValue(mockClient);
    vi.spyOn(process, 'exit').mockImplementation(() => {});
    vi.spyOn(console, 'log').mockImplementation(() => {});
    vi.spyOn(console, 'error').mockImplementation(() => {});
  });

  afterEach(() => {
    vi.unstubAllEnvs();
    vi.restoreAllMocks();
  });

  it('should use environment variables as defaults', async () => {
    await startWorker(['node', 'worker.js']);

    expect(mqtt.connect).toHaveBeenCalledWith('mqtt://test-broker:1883', {
      clientId: 'test-worker',
      clean: false,
      protocolVersion: 5,
      properties: {
        sessionExpiryInterval: 4294967295,
        receiveMaximum: 1,
      },
      username: 'test-user',
      password: 'test-pass',
    });

    const connectHandler = mockClient.on.mock.calls.find(
      (c) => c[0] === 'connect',
    )[1];
    connectHandler();
    expect(mockClient.subscribe).toHaveBeenCalledWith(
      'test/jobs',
      { qos: 1 },
      expect.any(Function),
    );
  });

  it('should override defaults with CLI arguments', async () => {
    await startWorker([
      'node',
      'worker.js',
      '-u',
      'mqtt://cli-broker:1883',
      '-i',
      'cli-worker',
      '-t',
      'cli/topic',
      '-j',
      './cli-jobs',
      '-w',
      './cli-workspaces',
      '-v',
      '4',
    ]);

    expect(mqtt.connect).toHaveBeenCalledWith('mqtt://cli-broker:1883', {
      clientId: 'cli-worker',
      clean: false,
      protocolVersion: 4,
      username: 'test-user',
      password: 'test-pass',
    });

    const connectHandler = mockClient.on.mock.calls.find(
      (c) => c[0] === 'connect',
    )[1];
    connectHandler();
    expect(mockClient.subscribe).toHaveBeenCalledWith(
      'cli/topic',
      { qos: 1 },
      expect.any(Function),
    );
  });

  it('should support clean session option', async () => {
    await startWorker(['node', 'worker.js', '--clean']);

    expect(mqtt.connect).toHaveBeenCalledWith(
      expect.any(String),
      expect.objectContaining({
        clean: true,
      }),
    );
  });

  it('should handle message, execute job, and exit', async () => {
    vi.mocked(executeJob).mockResolvedValue({ status: 'success', exitCode: 0 });
    await startWorker(['node', 'worker.js']);

    // Simulate connect
    const connectHandler = mockClient.on.mock.calls.find(
      (c) => c[0] === 'connect',
    )[1];
    connectHandler();

    // Simulate message
    const messageHandler = mockClient.on.mock.calls.find(
      (c) => c[0] === 'message',
    )[1];
    const payload = { id: 'job-123' };
    messageHandler('test/jobs', Buffer.from(JSON.stringify(payload)), {
      retain: false,
    });

    await vi.waitFor(() => expect(process.exit).toHaveBeenCalledWith(0));

    expect(executeJob).toHaveBeenCalledWith(
      './test-jobs',
      './test-workspaces',
      'job-123',
      null,
    );

    expect(mockClient.publish).toHaveBeenCalledWith(
      'jobs/results/job-123',
      expect.stringContaining('"manifestFile":"results/result.json"'),
      { qos: 1 },
      expect.any(Function),
    );

    expect(mockClient.end).toHaveBeenCalled();
  });

  it('should clear retained message if received', async () => {
    vi.mocked(executeJob).mockResolvedValue({ status: 'success', exitCode: 0 });
    await startWorker(['node', 'worker.js']);

    const messageHandler = mockClient.on.mock.calls.find(
      (c) => c[0] === 'message',
    )[1];
    const payload = { id: 'job-retained' };

    // Simulate retained message
    messageHandler('test/jobs', Buffer.from(JSON.stringify(payload)), {
      retain: true,
    });

    await vi.waitFor(() =>
      expect(mockClient.publish).toHaveBeenCalledWith(
        'test/jobs',
        '',
        expect.objectContaining({ retain: true, qos: 1 }),
        expect.any(Function),
      ),
    );
  });

  it('should handle message with steps and pass to executeJob', async () => {
    vi.mocked(executeJob).mockResolvedValue({ status: 'success', exitCode: 0 });
    await startWorker(['node', 'worker.js']);

    const messageHandler = mockClient.on.mock.calls.find(
      (c) => c[0] === 'message',
    )[1];
    const payload = { id: 'job-steps', steps: ['echo hello'] };
    messageHandler('test/jobs', Buffer.from(JSON.stringify(payload)), {
      retain: false,
    });

    await vi.waitFor(() => expect(process.exit).toHaveBeenCalledWith(0));

    expect(executeJob).toHaveBeenCalledWith(
      './test-jobs',
      './test-workspaces',
      'job-steps',
      { steps: ['echo hello'] },
    );
  });

  it('should exit if receiving payload with missing id', async () => {
    await startWorker(['node', 'worker.js']);

    const messageHandler = mockClient.on.mock.calls.find(
      (c) => c[0] === 'message',
    )[1];

    const invalidPayload = { some: 'other field' };
    messageHandler('test/jobs', Buffer.from(JSON.stringify(invalidPayload)), {
      retain: false,
    });

    await vi.waitFor(() => expect(process.exit).toHaveBeenCalledWith(1));
    expect(mockClient.unsubscribe).not.toHaveBeenCalled();
    expect(mockClient.end).toHaveBeenCalled();
  });

  it('should delay acknowledgement until job is finished', async () => {
    vi.mocked(executeJob).mockImplementation(
      () =>
        new Promise((resolve) => {
          setTimeout(() => resolve({ status: 'success', exitCode: 0 }), 50);
        }),
    );

    await startWorker(['node', 'worker.js']);

    const messageHandler = mockClient.on.mock.calls.find(
      (c) => c[0] === 'message',
    )[1];

    const packet = {
      cmd: 'publish',
      qos: 1,
      topic: 'test/jobs',
      messageId: 123,
    };
    const ackCallback = vi.fn();

    // Simulate handleMessage being called by mqtt.js
    mockClient.handleMessage(packet, ackCallback);

    // Simulate message event being called by mqtt.js
    const payload = { id: 'job-delayed' };
    messageHandler('test/jobs', Buffer.from(JSON.stringify(payload)), packet);

    // Ack should not be called yet
    expect(ackCallback).not.toHaveBeenCalled();

    // Wait for job to finish
    await vi.waitFor(() => expect(process.exit).toHaveBeenCalledWith(0), {
      timeout: 1000,
    });

    // Now ack should have been called
    expect(ackCallback).toHaveBeenCalled();
  });

  describe('Signal Handling', () => {
    it('should register SIGINT and SIGTERM handlers', () => {
      const processOnSpy = vi.spyOn(process, 'on').mockImplementation(() => {});
      setupSignalHandlers(mockClient);

      expect(processOnSpy).toHaveBeenCalledWith('SIGINT', expect.any(Function));
      expect(processOnSpy).toHaveBeenCalledWith(
        'SIGTERM',
        expect.any(Function),
      );
    });
  });
});
