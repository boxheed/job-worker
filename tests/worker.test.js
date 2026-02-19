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
      username: 'test-user',
      password: 'test-pass',
    });

    const connectHandler = mockClient.on.mock.calls.find(
      (c) => c[0] === 'connect',
    )[1];
    connectHandler();
    expect(mockClient.subscribe).toHaveBeenCalledWith(
      'jobs/pending',
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
    ]);

    expect(mqtt.connect).toHaveBeenCalledWith('mqtt://cli-broker:1883', {
      clientId: 'cli-worker',
      clean: false,
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

  it('should override credentials with CLI arguments', async () => {
    await startWorker([
      'node',
      'worker.js',
      '--username',
      'cli-user',
      '--password',
      'cli-pass',
    ]);

    expect(mqtt.connect).toHaveBeenCalledWith(expect.any(String), {
      clientId: expect.any(String),
      clean: false,
      username: 'cli-user',
      password: 'cli-pass',
    });
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
    const payload = { id: 'job-123', workDir: '/jobs/job-123' };
    messageHandler('jobs/pending', Buffer.from(JSON.stringify(payload)));

    await vi.waitFor(() => expect(process.exit).toHaveBeenCalledWith(0));

    expect(executeJob).toHaveBeenCalledWith('/jobs/job-123', 'job-123');
    expect(mockClient.publish).toHaveBeenCalledWith(
      'jobs/results/job-123',
      expect.stringContaining('"manifestFile"'),
      { qos: 1 },
      expect.any(Function),
    );

    expect(mockClient.end).toHaveBeenCalled();
  });

  it('should handle failed job execution', async () => {
    vi.mocked(executeJob).mockResolvedValue({ status: 'failed', exitCode: 1 });
    await startWorker(['node', 'worker.js']);

    // Simulate message
    const messageHandler = mockClient.on.mock.calls.find(
      (c) => c[0] === 'message',
    )[1];
    const payload = { id: 'job-failed', workDir: '/jobs/job-failed' };
    messageHandler('jobs/pending', Buffer.from(JSON.stringify(payload)));

    await vi.waitFor(() => expect(process.exit).toHaveBeenCalled());

    expect(executeJob).toHaveBeenCalledWith('/jobs/job-failed', 'job-failed');
    expect(mockClient.publish).toHaveBeenCalledWith(
      'jobs/results/job-failed',
      expect.stringContaining('"manifestFile"'),
      { qos: 1 },
      expect.any(Function),
    );

    expect(mockClient.end).toHaveBeenCalled();
  });

  it('should only process the first message and ignore subsequent ones', async () => {
    vi.mocked(executeJob).mockResolvedValue({ status: 'success', exitCode: 0 });
    await startWorker(['node', 'worker.js']);

    const messageHandler = mockClient.on.mock.calls.find(
      (c) => c[0] === 'message',
    )[1];

    const payload1 = { id: 'job-1', workDir: '/jobs/1' };
    const payload2 = { id: 'job-2', workDir: '/jobs/2' };

    // Send two messages
    messageHandler('jobs/pending', Buffer.from(JSON.stringify(payload1)));
    messageHandler('jobs/pending', Buffer.from(JSON.stringify(payload2)));

    await vi.waitFor(() => expect(process.exit).toHaveBeenCalled());

    expect(executeJob).toHaveBeenCalledTimes(1);
    expect(executeJob).toHaveBeenCalledWith('/jobs/1', 'job-1');
    expect(mockClient.unsubscribe).toHaveBeenCalledWith(
      'jobs/pending',
      expect.any(Function),
    );
  });

  it('should exit if receiving malformed JSON', async () => {
    await startWorker(['node', 'worker.js']);

    const messageHandler = mockClient.on.mock.calls.find(
      (c) => c[0] === 'message',
    )[1];

    messageHandler('jobs/pending', Buffer.from('invalid json'));

    await vi.waitFor(() => expect(process.exit).toHaveBeenCalledWith(1));
    expect(mockClient.unsubscribe).toHaveBeenCalled();
    expect(mockClient.end).toHaveBeenCalled();
  });

  it('should exit if receiving payload with missing fields', async () => {
    await startWorker(['node', 'worker.js']);

    const messageHandler = mockClient.on.mock.calls.find(
      (c) => c[0] === 'message',
    )[1];

    const invalidPayload = { some: 'other field' };
    messageHandler('jobs/pending', Buffer.from(JSON.stringify(invalidPayload)));

    await vi.waitFor(() => expect(process.exit).toHaveBeenCalledWith(1));
    expect(mockClient.unsubscribe).toHaveBeenCalled();
    expect(mockClient.end).toHaveBeenCalled();
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

    it('should disconnect and exit on SIGINT', () => {
      const handlers = {};
      vi.spyOn(process, 'on').mockImplementation((signal, handler) => {
        handlers[signal] = handler;
      });

      setupSignalHandlers(mockClient);

      // Simulate SIGINT
      handlers['SIGINT']();

      expect(console.log).toHaveBeenCalledWith(
        expect.stringContaining('Received SIGINT'),
      );
      expect(mockClient.end).toHaveBeenCalledWith(false, expect.any(Function));
      expect(process.exit).toHaveBeenCalledWith(0);
    });

    it('should disconnect and exit on SIGTERM', () => {
      const handlers = {};
      vi.spyOn(process, 'on').mockImplementation((signal, handler) => {
        handlers[signal] = handler;
      });

      setupSignalHandlers(mockClient);

      // Simulate SIGTERM
      handlers['SIGTERM']();

      expect(console.log).toHaveBeenCalledWith(
        expect.stringContaining('Received SIGTERM'),
      );
      expect(mockClient.end).toHaveBeenCalledWith(false, expect.any(Function));
      expect(process.exit).toHaveBeenCalledWith(0);
    });
  });
});
