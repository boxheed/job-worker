# MQTT Job Worker

A lightweight, "one-shot" job execution engine designed for a Hybrid Orchestration pattern. It uses MQTT for signaling and a shared host filesystem for data persistence and logging.

This worker implements a **Managed Workspace** architecture. It decouples the shared storage from the execution environment, providing isolation and clean state management.

## The Architecture

1.  **Staging:** When a job is received (via MQTT ID), the worker resolves the source directory on the shared drive and stages (copies) its contents to a local, isolated workspace.
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
  mqtt-job-worker:
    image: node:20-slim
    restart: always
    volumes:
      - /opt/orchestrator/shared_data:/data # Shared drive mount
    environment:
      - MQTT_URL=mqtt://broker:1883
      - MQTT_JOBS_DIR=/data/jobs
      - MQTT_WORKSPACES_DIR=/tmp/workspaces
```

## Job Contract

### 1. Request Payload (`jobs/pending`)
The MQTT message specifies the unique Job ID. The worker resolves the source folder as `{MQTT_JOBS_DIR}/{id}`.

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

### 4. Response Payload (`jobs/results/{id}`)
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
| `-u, --url` | `MQTT_URL` | `mqtt://localhost:1883` | MQTT Broker URL |
| `-n, --username` | `MQTT_USERNAME` | - | MQTT Username |
| `-p, --password` | `MQTT_PASSWORD` | - | MQTT Password |
| `-i, --id` | `WORKER_ID` | `worker-01` | Unique Worker ID |
| `-j, --jobs-dir` | `MQTT_JOBS_DIR` | `./jobs` | Root for job sources (Shared) |
| `-w, --workspaces-dir` | `MQTT_WORKSPACES_DIR` | `./workspaces` | Root for execution (Local) |
| `-t, --topic` | `MQTT_TOPIC` | `jobs/pending` | Subscription topic |
| `--clean` | `MQTT_CLEAN` | `false` | Use a clean MQTT session |
| `--dry-run` | - | - | Run using local `test-payload.json` |

### Reliability & Scaling

#### Clean vs. Persistent Sessions
- **Persistent (Default):** The broker queues messages while the worker is offline. **Warning:** Since this is a one-shot worker, a persistent session may cause the worker to receive multiple queued messages at once, but only process the first one.
- **Clean (`--clean`):** The worker only receives messages that arrive while it is connected. This is recommended for one-shot workers unless you specifically need offline queuing for a single worker.

#### Shared Subscriptions (Recommended for Scaling)
To scale one-shot workers without losing messages, use **MQTT 5.0 Shared Subscriptions**. This ensures the broker only sends **one message to one worker instance**.

Example topic: `$share/worker-group/jobs/pending`

```bash
mqtt-fs-worker --topic "$share/worker-group/jobs/pending" --clean
```

### Dry Run Mode

Allows testing the environment and logic without an MQTT broker.
1. Create `test-payload.json`:
```json
{
  "id": "dry-run-test",
  "steps": ["echo 'Testing environment'"]
}
```
2. Run: `mqtt-fs-worker --dry-run`

## License

Apache-2.0
