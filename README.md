# Job Worker

A lightweight, "one-shot" job execution engine designed for a Hybrid Orchestration pattern. It uses MQTT for signaling and a shared host filesystem for data persistence and logging.

When paired with a Docker restart policy, this creates a clean, serial, and resilient job queue that clears its own memory and environment state after every task.

## The Architecture

This worker is designed to be "Dumb & Durable":
1. Controller (e.g., Node-RED) prepares a unique directory on the shared drive and writes necessary inputs.
2. Controller sends a "pointer" message via MQTT.
3. Worker executes the steps, streaming all logs directly to that shared directory.
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
  job-worker:
    image: node:20-slim
    restart: always
    volumes:
      - /opt/orchestrator/shared_data:/data # Shared drive mount
    environment:
      - MQTT_URL=mqtt://broker:1883
```

## Job Contract

1. Request Payload (`jobs/pending`)
The workDir must be a path relative to the container's mount point or an absolute path reachable within the container.
```JSON
{
  "id": "job_2026_01",
  "workDir": "/data/active_jobs/job_2026_01",
  "steps": [
    "npm install",
    "npm run build",
    "cp ./dist/output.zip /data/results/"
  ]
}
```

2. Execution Behavior
* Working Directory: The worker automatically cds into the workDir before executing steps.
* Job Definition: The worker expects a `job.json` file in the `workDir` containing the steps to execute.
* Logging: A file named job.log is automatically created inside the workDir. All stdout and stderr are redirected here in real-time.
* Cleanup: The worker does not delete files. It is the responsibility of the Controller to purge the workDir after processing the results.

3. Response Payload (`jobs/results/{id}`)
```json
{
  "id": "job_2026_01",
  "status": "success",
  "logFile": "/data/active_jobs/job_2026_01/job.log",
  "exitCode": 0
}
```

### Test

  * `MQTT_URL`: The broker address (default: mqtt://localhost:1883)
  * `WORKER_ID`: A unique identifier for this worker (default: node-worker-01).

## License

Apache-2.0
