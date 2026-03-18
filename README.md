# NATS JetStream Job Worker

A lightweight, "one-shot" job execution engine designed for a Hybrid Orchestration pattern. It uses NATS JetStream for reliable signaling and a shared host filesystem for data persistence and logging.

This worker implements a **Managed Workspace** architecture. It decouples the shared storage from the execution environment, providing isolation and clean state management.

## The Architecture

1.  **Staging:** When a job is received (via NATS JetStream message), the worker resolves the source directory on the shared drive and stages (copies) its contents to a local, isolated workspace.
2.  **Execution:** The worker executes the job steps inside the local workspace.
3.  **Real-Time Logging:** Logs are streamed in real-time directly back to a `results/` folder in the shared directory, allowing the controller to monitor progress.
4.  **Artifact Sync:** Upon completion, any new or modified files in the workspace are synchronized back to the shared `results/` folder.
5.  **Cleanup:** The local workspace is purged, and the worker exits (triggering a restart for a fresh environment).

## Installation

```bash
# Install as a global executable
sudo npm install -g https://github.com/boxheed/job-worker.git
```

## Shared Drive Configuration
The worker expects a shared volume to be mounted at a consistent path.

```yaml
services:
  nats-job-worker:
    image: node:22-slim
    restart: always
    volumes:
      - /opt/orchestrator/shared_data:/data # Shared drive mount
    environment:
      - NATS_URL=nats://nats:4222
      - NATS_JOBS_DIR=/data/jobs
      - NATS_WORKSPACES_DIR=/tmp/workspaces
```

## Job Contract

### 1. Request Payload (`jobs.pending`)
The NATS message specifies the unique Job ID. The worker resolves the source folder as `{NATS_JOBS_DIR}/{id}`.

```JSON
{
  "id": "job_2026_01"
}
```
*Note: You can optionally pass `steps` in the payload to override the `job.json` file.*

### 2. Job Definition (`job.json`)
The worker expects a `job.json` file in the source directory.

```json
{
  "steps": [
    "npm install",
    "npm run build"
  ]
}
```

### 3. Output Structure
After execution, the shared directory will contain a `results/` folder:
- `results/step_0.log`, `results/step_1.log`: Real-time execution logs.
- `results/result.json`: Final execution manifest.
- `results/*`: Any files created or modified during the job.

### 4. Response Payload (`jobs.results.{id}`)
```json
{
  "id": "job_2026_01",
  "status": "success",
  "exitCode": 0,
  "manifestFile": "results/result.json"
}
```

## Configuration

| Argument | Environment Variable | Default | Description |
| --- | --- | --- | --- |
| `-u, --url` | `NATS_URL` | `nats://localhost:4222` | NATS Server URL |
| `-n, --username` | `NATS_USERNAME` | - | NATS Username |
| `-p, --password` | `NATS_PASSWORD` | - | NATS Password |
| `-t, --token` | `NATS_TOKEN` | - | NATS Auth Token |
| `-i, --id` | `WORKER_ID` | `worker-01` | Unique Worker ID (Durable) |
| `-j, --jobs-dir` | `NATS_JOBS_DIR` | `./jobs` | Root for job sources (Shared) |
| `-w, --workspaces-dir` | `NATS_WORKSPACES_DIR` | `./workspaces` | Root for execution (Local) |
| `-s, --stream` | `NATS_STREAM` | `AGENT_JOBS` | JetStream Input Stream Name |
| `-S, --output-stream` | `NATS_OUTPUT_STREAM` | `AGENT_RESULTS` | JetStream Output Stream Name |
| `-k, --input-subject` | `NATS_INPUT_SUBJECT` | `jobs.pending` | NATS Subject to consume from |
| `-r, --output-subject` | `NATS_OUTPUT_SUBJECT` | `jobs.results` | NATS Subject to publish results to |
| `-v, --visibility-timeout` | `NATS_VISIBILITY_TIMEOUT` | `0` | Delay in seconds before publishing the result to NATS |
| `-H, --hooks-dir` | `NATS_HOOKS_DIR` | - | Directory containing lifecycle hook scripts |
| `--dry-run` | - | - | Run using local `test-payload.json` |

## Lifecycle Hooks

The worker can execute external scripts at specific lifecycle points. This is useful for custom synchronization, notifications, or environment setup.

To use hooks, create a directory and point to it using `--hooks-dir`. The worker looks for executable files with the following names:

| Hook Name | When it runs |
| --- | --- |
| `pre-stage` | Before workspace preparation. |
| `post-stage` | After source files are copied to local workspace. |
| `pre-sync` | After execution steps, before copying results back. |
| `post-sync` | After results and manifest are written to shared drive. |
| `on-error` | If the job fails at any point. |

### Hook Environment Variables
Each hook receives the following context via environment variables:
- `JOB_ID`: The unique ID of the job.
- `JOB_STATUS`: `success` or `failed`.
- `JOB_EXIT_CODE`: The numeric exit code.
- `JOB_WORKSPACE_DIR`: Path to the local execution workspace.
- `JOB_SOURCE_DIR`: Path to the shared source directory.
- `JOB_RESULTS_DIR`: Path to the shared results directory.

### Example `post-sync` Hook
```bash
#!/bin/bash
# Ensure visibility on remote NFS clients
echo "Ensuring visibility for $JOB_ID..."
ls -R $JOB_RESULTS_DIR > /dev/null
```

### Reliability & Scaling

#### JetStream Consumers
The worker uses a **Pull Consumer** with a **Durable Name** (set via `--id`). This ensures that messages are reliably delivered even if the worker is temporarily offline.

#### Scaling (Competing Consumers)
To scale workers, simply run multiple instances with the **same Durable Name** (`--id`). NATS JetStream will automatically distribute messages across all active workers using that durable consumer.

Example:
```bash
nats-fs-worker --id worker-pool --stream AGENT_JOBS --input-subject jobs.pending
```

### Dry Run Mode

Allows testing the environment and logic without a NATS server.
1. Create `test-payload.json`:
```json
{
  "id": "dry-run-test",
  "steps": ["echo 'Testing environment'"]
}
```
2. Run: `nats-fs-worker --dry-run`

## License

Apache-2.0
