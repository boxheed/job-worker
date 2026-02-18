# Job Worker

A lightweight, "one-shot" job execution engine designed for a Hybrid Orchestration pattern. It uses MQTT for signaling and a shared host filesystem for data persistence and logging.

When paired with a Docker restart policy, this creates a clean, serial, and resilient job queue that clears its own memory and environment state after every task.

## The Architecture

This worker is designed to be "Dumb & Durable":
1. Controller (e.g., Node-RED) prepares a unique directory on the shared drive, writes the necessary inputs, and creates a `job.json` file defining the execution steps.
2. Controller sends a "pointer" message via MQTT (containing the job ID and `workDir`).
3. Worker connects, receives the pointer, reads `job.json` from the shared drive, and executes the steps.
4. Worker exits, triggering a Docker restart to ensure a fresh environment for the next task.
5. Controller reads the logs from the shared drive and deletes the directory.

## Installation

```bash
# Install as a global executable from your private/public repo
npm install -g https://<TOKEN>@github.com/boxheed/mqtt-fs-worker.git
```

## Shared Drive Configuration
The worker expects a shared volume to be mounted at a consistent path. In your docker-compose.yml, both the Controller and Worker must map to the same host path.

```yaml
services:
  mqtt-fs-worker:
    image: node:20-slim
    restart: always
    volumes:
      - /opt/orchestrator/shared_data:/data # Shared drive mount
    environment:
      - MQTT_URL=mqtt://broker:1883
```

## Job Contract

1. Request Payload (`jobs/pending`)
The MQTT message acts as a trigger. It specifies the unique ID and the directory where the worker should look for the `job.json` definition.
```JSON
{
  "id": "job_2026_01",
  "workDir": "/data/active_jobs/job_2026_01"
}
```

2. Execution Behavior
* Working Directory: The worker automatically cds into the workDir before executing steps.
* Job Definition: The worker **strictly** expects a `job.json` file in the `workDir`. This file must contain a `steps` array.
* Steps Example (`job.json`):
```json
{
  "steps": [
    "npm install",
    "npm run build",
    "cp ./dist/output.zip /data/results/"
  ]
}
```
* Logging: The worker creates individual log files for each step (e.g., `step_0.log`, `step_1.log`).
* Manifest: A `result.json` file is created in the `workDir` summarizing the execution results and timing.
* Cleanup: The worker does not delete files. It is the responsibility of the Controller to purge the workDir after processing the results.

3. Response Payload (`jobs/results/{id}`)
```json
{
  "id": "job_2026_01",
  "status": "success",
  "manifestFile": "/data/active_jobs/job_2026_01/result.json",
  "exitCode": 0
}
```

## Configuration

The worker can be configured via environment variables or command-line arguments.

| Argument | Environment Variable | Default | Description |
| --- | --- | --- | --- |
| `-u, --url` | `MQTT_URL` | `mqtt://localhost:1883` | MQTT Broker URL |
| `-n, --username` | `MQTT_USERNAME` | - | MQTT Username |
| `-p, --password` | `MQTT_PASSWORD` | - | MQTT Password |
| `-i, --id` | `WORKER_ID` | `worker-01` | Unique Worker ID (Client ID) |
| `-t, --topic` | - | `jobs/pending` | Subscription topic |
| `--dry-run` | - | - | Run in dry-run mode using local `test-payload.json` |

### Dry Run Mode

The Dry Run mode allows you to test the shell environment and file system permissions without an MQTT broker.
When the `--dry-run` flag is used, the worker looks for a `test-payload.json` file in the current directory.

`test-payload.json` example:
```json
{
  "id": "dry-run-test",
  "workDir": "./test-workdir",
  "steps": [
    "echo 'Testing environment'",
    "ls -la"
  ]
}
```

Running dry run:
```bash
mqtt-fs-worker --dry-run
```

### Example usage:
```bash
mqtt-fs-worker --url mqtt://broker:1883 --id worker-01 --topic custom/jobs
```

## License

Apache-2.0
