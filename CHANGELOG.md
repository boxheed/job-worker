# Changelog

All notable changes to this project will be documented in this file. See [standard-version](https://github.com/conventional-changelog/standard-version) for commit guidelines.

### [0.3.1](https://github.com/boxheed/job-worker/compare/v0.3.0...v0.3.1) (2026-02-27)


### Bug Fixes

* rename subject parameter to input-subject and update tests/docs ([94a57b6](https://github.com/boxheed/job-worker/commit/94a57b63d6a0485787ed7c297dc430680a33211e))

## [0.3.0](https://github.com/boxheed/job-worker/compare/v0.2.2...v0.3.0) (2026-02-27)


### ⚠ BREAKING CHANGES

* changed the name of the input subject

### Features

* changed the name of the input subject ([c7487c0](https://github.com/boxheed/job-worker/commit/c7487c063113ec09d0df7f461f39e669fcedb65d))

### [0.2.2](https://github.com/boxheed/job-worker/compare/v0.2.1...v0.2.2) (2026-02-27)


### Features

* add job timeout and fix directory handling ([ea3f270](https://github.com/boxheed/job-worker/commit/ea3f2705044fcba360bff40c28d03be3e4780075))

### [0.2.1](https://github.com/boxheed/job-worker/compare/v0.2.0...v0.2.1) (2026-02-27)


### Bug Fixes

* use JetStreamManager for consumer creation ([aaf0375](https://github.com/boxheed/job-worker/commit/aaf03756533ef171ac60e387dfc3de25ed56d481))

## [0.2.0](https://github.com/boxheed/job-worker/compare/v0.1.13...v0.2.0) (2026-02-27)


### ⚠ BREAKING CHANGES

* migrate from MQTT to NATS JetStream

### Features

* migrate from MQTT to NATS JetStream ([a667692](https://github.com/boxheed/job-worker/commit/a667692f9fd10ca12823e8501aad93c453f8e2c7))

### [0.1.13](https://github.com/boxheed/job-worker/compare/v0.1.12...v0.1.13) (2026-02-23)


### Bug Fixes

* removed ack code ([cbb8471](https://github.com/boxheed/job-worker/commit/cbb8471be4a016e19d955eff4d172191e8e80e6a))

### [0.1.12](https://github.com/boxheed/job-worker/compare/v0.1.11...v0.1.12) (2026-02-23)


### Bug Fixes

* enable MQTT persistent sessions and guaranteed delivery ([917a6de](https://github.com/boxheed/job-worker/commit/917a6decc949267f2a899d7797b15c37b2915aeb))

### [0.1.11](https://github.com/boxheed/job-worker/compare/v0.1.10...v0.1.11) (2026-02-23)


### Bug Fixes

* revert to MQTT 3.1.1 for stability and fix connection issues ([e5d0dae](https://github.com/boxheed/job-worker/commit/e5d0daef2c6c0f21d9ddac578357cafe9e3e9bf6))

### [0.1.10](https://github.com/boxheed/job-worker/compare/v0.1.9...v0.1.10) (2026-02-22)


### Features

* implement manual acknowledgments and MQTT v5 migration ([bc35e9f](https://github.com/boxheed/job-worker/commit/bc35e9f1dcf0d8538044cd06e6935d63e49436e6))

### [0.1.9](https://github.com/boxheed/job-worker/compare/v0.1.8...v0.1.9) (2026-02-22)


### Features

* change manifestFile to a relative path in result payload ([944a945](https://github.com/boxheed/job-worker/commit/944a9457f2bdd4d541c774e2e6327551cad65ee3))

### [0.1.8](https://github.com/boxheed/job-worker/compare/v0.1.7...v0.1.8) (2026-02-22)


### Features

* implement Managed Workspace architecture for job execution ([2d9000e](https://github.com/boxheed/job-worker/commit/2d9000ed6639174d4c5a674d7fd9f1b65b0c494c))

### [0.1.7](https://github.com/boxheed/job-worker/compare/v0.1.6...v0.1.7) (2026-02-22)


### Features

* add support for MQTT_TOPIC environment variable ([1752c16](https://github.com/boxheed/job-worker/commit/1752c1669a4bd05975dcda75f82e2fb094be5ae2))

### [0.1.6](https://github.com/boxheed/job-worker/compare/v0.1.5...v0.1.6) (2026-02-22)


### Bug Fixes

* removed some of the scripts ([af86028](https://github.com/boxheed/job-worker/commit/af86028abc76037cfa2afaec2fc0a9fdb54be98d))
* removed some of the scripts ([00da307](https://github.com/boxheed/job-worker/commit/00da3078ff76ac67e58c967423a83de6ea8b02fe))

### [0.1.5](https://github.com/boxheed/job-worker/compare/v0.1.4...v0.1.5) (2026-02-22)


### Bug Fixes

* remove files array from package.json to resolve installation issues ([13798dc](https://github.com/boxheed/job-worker/commit/13798dc2c24378903faa80769bf506f3f0f0443c))

### [0.1.4](https://github.com/boxheed/job-worker/compare/v0.1.3...v0.1.4) (2026-02-22)


### Bug Fixes

* update node engine version and ensure files section is defined ([e47a3d7](https://github.com/boxheed/job-worker/commit/e47a3d7dab9881b46bb7afbe575f6282a3102968))

### [0.1.3](https://github.com/boxheed/job-worker/compare/v0.1.2...v0.1.3) (2026-02-22)


### Bug Fixes

* removed repo ([f8fbf37](https://github.com/boxheed/job-worker/commit/f8fbf373cf08f83c6612fc3bddb86158e20e83e7))

### [0.1.2](https://github.com/boxheed/job-worker/compare/v0.1.1...v0.1.2) (2026-02-22)


### Bug Fixes

* restore package.json structure ([3eb14e4](https://github.com/boxheed/job-worker/commit/3eb14e458d88ddae912fc0ce6d385990f897f9fe))

### 0.1.1 (2026-02-21)


### Features

* add build script and GitHub Actions CI workflow ([eb4678a](https://github.com/boxheed/job-worker/commit/eb4678a623023e85976fc02afbd6e996e5c3c8b9))
* add build script and GitHub Actions CI workflow ([669d8ec](https://github.com/boxheed/job-worker/commit/669d8ec519a3490680ed5ecd5c813fb0e6ca42ed))
* add CLI argument parsing for worker configuration ([4cab26e](https://github.com/boxheed/job-worker/commit/4cab26e0cbf2093d6fc8751715db255a86e58437))
* add MQTT authentication and documentation ([b4c54b7](https://github.com/boxheed/job-worker/commit/b4c54b7166eea66313533f097ac4dc085ab25c07))
* add robust process signal handling for SIGINT and SIGTERM ([7b2b767](https://github.com/boxheed/job-worker/commit/7b2b767cba8123a70e2896f790e01c4b77f984f1))
* added devcontainer configuration ([2e0d8b1](https://github.com/boxheed/job-worker/commit/2e0d8b1014fe37d542f66dcb2a30f8f6fc3617d1))
* enabling dependabot ([cb9efb4](https://github.com/boxheed/job-worker/commit/cb9efb4715de931dea731c84dff1b37426fbbc04))
* implement core execution logic in lib/executor.js ([64465fa](https://github.com/boxheed/job-worker/commit/64465fa30c21dbe8421d4ad11e10ee4d786ac1f3))
* implement segmented manifest results and individual step logging ([d9afa59](https://github.com/boxheed/job-worker/commit/d9afa5935841904dec5f3ef088bcf506b087fbe8))
* make mqtt-fs-worker script executable and globally accessible ([1f5baca](https://github.com/boxheed/job-worker/commit/1f5baca6b059ddcb95654394da2e25f4559c9c38))
* update project metadata and improve executor logic ([7b0577f](https://github.com/boxheed/job-worker/commit/7b0577f064b4db8d24e4e80c70ab2e363d046675))
* updated documentation ([d86aaa2](https://github.com/boxheed/job-worker/commit/d86aaa2599cf17230fba6da4dcc984fd11b207ec))


### Bug Fixes

* correcting for npm install ([8f9380a](https://github.com/boxheed/job-worker/commit/8f9380ad84cf8744fe44ff06c2c0a89604dd967c))
* remove files array from package.json to fix installation issues ([d577da2](https://github.com/boxheed/job-worker/commit/d577da23be07664b17814d8d2508e48e39bd230d))
* updated lock file ([ab214f1](https://github.com/boxheed/job-worker/commit/ab214f1c915370af41c15d26c178d0fc3389c788))
