import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { connect, JSONCodec, AckPolicy } from 'nats';
import { executeJob } from '../src/lib/executor.js';
import { startWorker, setupSignalHandlers } from '../src/lib/worker.js';

vi.mock('nats', () => {
  const mockCodec = {
    encode: vi.fn((d) => Buffer.from(JSON.stringify(d))),
    decode: vi.fn((d) => JSON.parse(d.toString())),
  };
  return {
    connect: vi.fn(),
    JSONCodec: vi.fn(() => mockCodec),
    AckPolicy: {
      Explicit: 'explicit',
      All: 'all',
      None: 'none',
    },
  };
});
vi.mock('../src/lib/executor.js');

describe('Worker', () => {
  let mockNC;
  let mockJS;
  let mockConsumer;

  beforeEach(() => {
    vi.stubEnv('NATS_URL', 'nats://test-broker:4222');
    vi.stubEnv('WORKER_ID', 'test-worker');
    vi.stubEnv('NATS_USERNAME', 'test-user');
    vi.stubEnv('NATS_PASSWORD', 'test-pass');
    vi.stubEnv('NATS_STREAM', 'TEST_STREAM');
    vi.stubEnv('NATS_INPUT_SUBJECT', 'test.jobs');
    vi.stubEnv('NATS_JOBS_DIR', './test-jobs');
    vi.stubEnv('NATS_WORKSPACES_DIR', './test-workspaces');

    mockConsumer = {
      fetch: vi.fn(),
    };

    mockJS = {
      consumers: {
        get: vi.fn().mockResolvedValue(mockConsumer),
      },
    };

    const mockJSM = {
      consumers: {
        add: vi.fn().mockResolvedValue(mockConsumer),
      },
      streams: {
        info: vi.fn().mockResolvedValue({}),
        add: vi.fn().mockResolvedValue({}),
      },
    };

    mockNC = {
      jetstream: vi.fn().mockReturnValue(mockJS),
      jetstreamManager: vi.fn().mockResolvedValue(mockJSM),
      publish: vi.fn().mockResolvedValue({}),
      close: vi.fn().mockResolvedValue(undefined),
    };

    vi.mocked(connect).mockResolvedValue(mockNC);

    vi.spyOn(process, 'exit').mockImplementation(() => {});
    vi.spyOn(console, 'log').mockImplementation(() => {});
    vi.spyOn(console, 'error').mockImplementation(() => {});
  });

  afterEach(() => {
    vi.unstubAllEnvs();
    vi.restoreAllMocks();
  });

  async function* emptyGenerator() {
    // yield nothing
  }

  it('should use environment variables as defaults', async () => {
    mockConsumer.fetch.mockResolvedValue(emptyGenerator());

    await startWorker(['node', 'worker.js']);

    expect(connect).toHaveBeenCalledWith(
      expect.objectContaining({
        servers: 'nats://test-broker:4222',
        name: 'test-worker',
        user: 'test-user',
        pass: 'test-pass',
      })
    );
  });

  it('should override defaults with CLI arguments', async () => {
    mockConsumer.fetch.mockResolvedValue(emptyGenerator());

    await startWorker([
      'node',
      'worker.js',
      '-u',
      'nats://cli-broker:4222',
      '-i',
      'cli-worker',
      '-s',
      'CLI_STREAM',
      '-k',
      'cli.jobs',
      '-j',
      './cli-jobs',
      '-w',
      './cli-workspaces',
    ]);

    expect(connect).toHaveBeenCalledWith(
      expect.objectContaining({
        servers: 'nats://cli-broker:4222',
        name: 'cli-worker',
      })
    );

    expect(mockJS.consumers.get).toHaveBeenCalledWith('CLI_STREAM', 'cli-worker');
  });

  it('should create consumer if it does not exist', async () => {
    mockConsumer.fetch.mockResolvedValue(emptyGenerator());
    mockJS.consumers.get.mockRejectedValue(new Error('consumer not found'));

    await startWorker(['node', 'worker.js']);

    expect(mockJS.consumers.get).toHaveBeenCalled();
    const jsm = await mockNC.jetstreamManager();
    expect(jsm.consumers.add).toHaveBeenCalledWith('TEST_STREAM', {
      durable_name: 'test-worker',
      ack_policy: AckPolicy.Explicit,
      filter_subject: 'test.jobs',
      ack_wait: 30 * 60 * 1_000_000_000,
    });
  });

  it('should create stream if it does not exist', async () => {
    mockConsumer.fetch.mockResolvedValue(emptyGenerator());
    const jsm = await mockNC.jetstreamManager();
    jsm.streams.info.mockRejectedValue(new Error('stream not found'));

    await startWorker(['node', 'worker.js']);

    expect(jsm.streams.info).toHaveBeenCalledWith('TEST_STREAM');
    expect(jsm.streams.add).toHaveBeenCalledWith({
      name: 'TEST_STREAM',
      subjects: ['test.jobs'],
    });
  });

  it('should exit with status 0 if no message is received within timeout', async () => {
    mockConsumer.fetch.mockResolvedValue(emptyGenerator());

    await startWorker(['node', 'worker.js']);

    expect(mockNC.close).toHaveBeenCalled();
    expect(process.exit).toHaveBeenCalledWith(0);
  });

  it('should handle message, execute job, and exit', async () => {
    vi.mocked(executeJob).mockResolvedValue({ status: 'success', exitCode: 0 });
    
    const mockMsg = {
      data: Buffer.from(JSON.stringify({ id: 'job-123' })),
      ack: vi.fn().mockResolvedValue(undefined),
      term: vi.fn().mockResolvedValue(undefined),
    };

    async function* singleMessageGenerator() {
      yield mockMsg;
    }
    mockConsumer.fetch.mockResolvedValue(singleMessageGenerator());

    await startWorker(['node', 'worker.js']);

    expect(executeJob).toHaveBeenCalledWith(
      './test-jobs',
      './test-workspaces',
      'job-123',
      null,
      expect.any(AbortSignal),
    );

    expect(mockNC.publish).toHaveBeenCalledWith(
      'jobs.results.job-123',
      expect.any(Uint8Array)
    );

    expect(mockMsg.ack).toHaveBeenCalled();
    expect(mockNC.close).toHaveBeenCalled();
    expect(process.exit).toHaveBeenCalledWith(0);
  });

  it('should handle message with steps and pass to executeJob', async () => {
    vi.mocked(executeJob).mockResolvedValue({ status: 'success', exitCode: 0 });
    
    const mockMsg = {
      data: Buffer.from(JSON.stringify({ id: 'job-steps', steps: ['echo hello'] })),
      ack: vi.fn().mockResolvedValue(undefined),
      term: vi.fn().mockResolvedValue(undefined),
    };

    async function* singleMessageGenerator() {
      yield mockMsg;
    }
    mockConsumer.fetch.mockResolvedValue(singleMessageGenerator());

    await startWorker(['node', 'worker.js']);

    expect(executeJob).toHaveBeenCalledWith(
      './test-jobs',
      './test-workspaces',
      'job-steps',
      { steps: ['echo hello'] },
      expect.any(AbortSignal),
    );
  });

  it('should exit if receiving payload with missing id', async () => {
    const mockMsg = {
      data: Buffer.from(JSON.stringify({ some: 'other field' })),
      ack: vi.fn().mockResolvedValue(undefined),
      term: vi.fn().mockResolvedValue(undefined),
    };

    async function* singleMessageGenerator() {
      yield mockMsg;
    }
    mockConsumer.fetch.mockResolvedValue(singleMessageGenerator());

    await startWorker(['node', 'worker.js']);

    expect(process.exit).toHaveBeenCalledWith(1);
    expect(mockMsg.term).toHaveBeenCalled();
    expect(mockNC.close).toHaveBeenCalled();
  });

  it('should handle execution error', async () => {
    vi.mocked(executeJob).mockRejectedValue(new Error('Test failure'));
    
    const mockMsg = {
      data: Buffer.from(JSON.stringify({ id: 'job-fail' })),
      ack: vi.fn().mockResolvedValue(undefined),
      nak: vi.fn().mockResolvedValue(undefined),
      term: vi.fn().mockResolvedValue(undefined),
    };

    async function* singleMessageGenerator() {
      yield mockMsg;
    }
    mockConsumer.fetch.mockResolvedValue(singleMessageGenerator());

    await startWorker(['node', 'worker.js']);

    expect(mockNC.publish).toHaveBeenCalledWith(
      'jobs.results.job-fail',
      expect.any(Uint8Array)
    );

    expect(mockMsg.nak).toHaveBeenCalled();
    expect(mockNC.close).toHaveBeenCalled();
    expect(process.exit).toHaveBeenCalledWith(1);
  });

  describe('Signal Handling', () => {
    it('should register SIGINT and SIGTERM handlers', () => {
      const processOnSpy = vi.spyOn(process, 'on').mockImplementation(() => {});
      setupSignalHandlers(mockNC);

      expect(processOnSpy).toHaveBeenCalledWith('SIGINT', expect.any(Function));
      expect(processOnSpy).toHaveBeenCalledWith(
        'SIGTERM',
        expect.any(Function),
      );
    });
  });
});
