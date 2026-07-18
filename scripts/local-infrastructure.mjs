import { spawnSync } from 'node:child_process';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const repositoryRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const composePrefix = ['compose', '--project-name', 'opsguard-ai', '--file', 'compose.yaml'];

function fail(message) {
  process.stderr.write(`Local infrastructure error: ${message}\n`);
  process.exit(1);
}

function probeDocker(arguments_) {
  return spawnSync('docker', arguments_, {
    cwd: repositoryRoot,
    encoding: 'utf8',
    env: process.env,
  });
}

function requireDockerCli() {
  const result = probeDocker(['--version']);

  if (result.error?.code === 'ENOENT') {
    fail(
      'Docker CLI was not found. Install Docker Desktop or Docker Engine and ensure `docker` is on PATH.',
    );
  }

  if (result.status !== 0) {
    fail(result.stderr.trim() || 'Docker CLI could not be executed.');
  }

  const composeResult = probeDocker(['compose', 'version']);
  if (composeResult.status !== 0) {
    fail('Docker Compose v2 is unavailable. Install the Docker Compose plugin (v2.20 or newer).');
  }
}

function requireDockerDaemon() {
  const result = probeDocker(['info', '--format', '{{.ServerVersion}}']);
  if (result.status !== 0) {
    fail(result.stderr.trim() || 'The Docker daemon is unavailable. Start Docker and try again.');
  }
}

function runCompose(arguments_) {
  const result = spawnSync('docker', [...composePrefix, ...arguments_], {
    cwd: repositoryRoot,
    stdio: 'inherit',
    env: process.env,
  });

  if (result.error) {
    fail(result.error.message);
  }

  if (result.status !== 0) {
    process.exit(result.status ?? 1);
  }
}

const [action, ...arguments_] = process.argv.slice(2);

if (action === 'reset' && !arguments_.includes('--confirm')) {
  fail(
    'Reset deletes all OpsGuard local infrastructure volumes. Re-run as `pnpm infra:reset --confirm`.',
  );
}

requireDockerCli();

switch (action) {
  case 'config':
    runCompose(['config']);
    break;
  case 'up':
    requireDockerDaemon();
    runCompose(['up', '--detach', '--wait', '--wait-timeout', '240']);
    break;
  case 'down':
    requireDockerDaemon();
    runCompose(['down', '--remove-orphans']);
    break;
  case 'ps':
    requireDockerDaemon();
    runCompose(['ps']);
    break;
  case 'logs':
    requireDockerDaemon();
    runCompose(['logs', '--follow', '--tail', '200', ...arguments_]);
    break;
  case 'reset':
    requireDockerDaemon();
    runCompose(['down', '--volumes', '--remove-orphans']);
    break;
  default:
    fail('Expected one of: config, up, down, ps, logs, reset.');
}
