# SPHERE DEV Deploy Runbook

This document explains how the SPHERE is built and deployed to the DEV server.

## Current Deploy Model

The project uses GitHub Actions with a self-hosted runner on the DEV server.

1. **Build SPHERE**
   - File: `.github/workflows/build.yml`
   - Runs on GitHub-hosted runner.
   - Executes `npm install` and `npm run build`.
   - Validates that the React/Vite app can build successfully.
   - Runs for `main` and `dev` branches.

2. **Deploy SPHERE to DEV**
   - File: `.github/workflows/deploy-dev.yml`
   - Runs on the DEV server using a self-hosted runner.
   - Runner label: `sapdev`
   - Runner name: `sapdev-pc-runner`
   - Deploys the app to `/var/www/svr01-dev/sap`.
   - Auto deploys when branch `dev` receives a push.

The DEV server is behind Cloudflare Tunnel and does not expose SSH publicly. Because of this, the deploy workflow must run on a self-hosted GitHub runner installed directly on the DEV server.

## Repository and Server Paths

```text
Repository: finuxpert/cbj-sap
Active DEV branch: dev
Local project path: /home/sadmin/sap
Deploy root: /var/www/svr01-dev/sap
DEV URL: https://sapdev.cbj-kontruksi.com
Backend Evidence API: http://127.0.0.1:8090
Public API health: https://sapdev.cbj-kontruksi.com/sap-api/health
```

## DEV Deploy Workflow

The deploy workflow performs these steps locally on the DEV server:

```bash
cd /home/sadmin/sap

git fetch origin dev
git reset --hard origin/dev

sudo chown -R sadmin:sadmin /home/sadmin/sap
sudo rm -rf /home/sadmin/sap/dist

npm install
npm run build

sudo rm -rf /var/www/svr01-dev/sap/*
sudo cp -rv dist/* /var/www/svr01-dev/sap/

sudo chown -R www-data:www-data /var/www/svr01-dev/sap
sudo find /var/www/svr01-dev/sap -type d -exec chmod 755 {} \;
sudo find /var/www/svr01-dev/sap -type f -exec chmod 644 {} \;

sudo nginx -t
sudo systemctl reload nginx

curl -f http://127.0.0.1:8090/health
curl -f https://sapdev.cbj-kontruksi.com/sap-api/health
```

The `chown` and `rm -rf /home/sadmin/sap/dist` steps are intentional. Previous manual/root builds may leave files in `dist` owned by `root` or `www-data`, which causes Vite to fail with an `EACCES: permission denied, unlink ...` error.

## GitHub Actions Flow

Preferred automatic DEV flow:

```text
Commit/push to dev
→ Deploy SPHERE to DEV
→ Self-hosted runner executes deploy locally on server
→ npm install
→ npm run build
→ copy dist to /var/www/svr01-dev/sap
→ nginx reloads
→ health checks run
```

Manual deploy flow remains available:

```text
GitHub → Actions → Deploy SPHERE to DEV → Run workflow → branch dev
```

## Concurrency

Deploy workflow uses concurrency:

```yaml
concurrency:
  group: sapdev-deploy
  cancel-in-progress: true
```

This prevents multiple sapdev deploys from piling up. If several commits are pushed quickly, the older in-progress deploy can be cancelled and the latest deploy wins.

## Self-hosted Runner

Runner folder:

```bash
/home/sadmin/actions-runner
```

Runner name:

```text
sapdev-pc-runner
```

Runner label:

```text
sapdev
```

The deploy workflow targets this runner using:

```yaml
runs-on: [self-hosted, sapdev]
```

## Install Runner as a Service

Run these commands on the DEV server as `root` after the runner has been registered:

```bash
cd /home/sadmin/actions-runner

sudo chown -R sadmin:sadmin /home/sadmin/actions-runner
sudo ./svc.sh install sadmin
sudo ./svc.sh start
sudo ./svc.sh status
```

## Runner Service Logs

Find the service name:

```bash
systemctl list-units --type=service | grep actions.runner
```

Follow logs:

```bash
sudo journalctl -u actions.runner.finuxpert-cbj-sap.sapdev-pc-runner.service -f
```

If the service name differs, replace it with the name returned by `systemctl list-units`.

## Manual Runner Start

Use this only for temporary/debug sessions:

```bash
cd /home/sadmin/actions-runner
sudo -u sadmin ./run.sh
```

Expected healthy output:

```text
Connected to GitHub
Listening for Jobs
```

## Sudo Permissions Required for Deploy

The `sadmin` user must be able to run selected deploy commands without a password.

Check current sudo support:

```bash
sudo -u sadmin sudo -n rm --version >/dev/null && echo "sudo rm OK" || echo "sudo rm FAIL"
sudo -u sadmin sudo -n cp --version >/dev/null && echo "sudo cp OK" || echo "sudo cp FAIL"
sudo -u sadmin sudo -n chown --version >/dev/null && echo "sudo chown OK" || echo "sudo chown FAIL"
sudo -u sadmin sudo -n find --version >/dev/null && echo "sudo find OK" || echo "sudo find FAIL"
sudo -u sadmin sudo -n nginx -t && echo "sudo nginx OK" || echo "sudo nginx FAIL"
sudo -u sadmin sudo -n systemctl status nginx >/dev/null && echo "sudo systemctl OK" || echo "sudo systemctl FAIL"
```

All checks should return `OK`.

Sudoers file:

```bash
/etc/sudoers.d/cbj-sap-github-actions-deploy
```

Expected content pattern:

```text
sadmin ALL=(ALL) NOPASSWD: /usr/bin/rm, /usr/bin/cp, /usr/bin/chown, /usr/bin/find, /usr/sbin/nginx, /usr/bin/systemctl
```

Paths may differ. Verify using:

```bash
which rm cp chown find nginx systemctl
```

Validate sudoers syntax:

```bash
sudo visudo -cf /etc/sudoers.d/cbj-sap-github-actions-deploy
```

## Troubleshooting

### Build workflow fails at `npm ci`

Symptom:

```text
npm ci can only install packages when package.json and package-lock.json are in sync
Missing: jszip@3.10.1 from lock file
```

Resolution:

The build workflow uses `npm install` instead of `npm ci` because the lock file may not be fully synchronized with `package.json`.

### Deploy via SSH fails with `getaddrinfo ... Name or service not known`

Cause:

The DEV server is behind Cloudflare Tunnel and does not expose SSH publicly. A GitHub-hosted runner cannot SSH into the server.

Resolution:

Use the self-hosted runner installed on the DEV server. The current deploy workflow no longer uses SSH secrets.

### Runner config fails with `404 Not Found`

Cause:

The GitHub runner registration token expired or was copied incorrectly.

Resolution:

Go to:

```text
GitHub repo → Settings → Actions → Runners → New self-hosted runner
```

Generate a new Linux x64 runner token and rerun `./config.sh`.

### Runner group error

Symptom:

```text
Could not find any self-hosted runner group named "sapdev-pc-runner"
```

Cause:

The runner name was entered into the runner group prompt.

Correct behavior:

- Runner group: press Enter for Default.
- Runner name: `sapdev-pc-runner`.
- Additional label: `sapdev`.

Safer unattended config:

```bash
cd /home/sadmin/actions-runner

sudo -u sadmin ./config.sh \
  --url https://github.com/finuxpert/cbj-sap \
  --token TOKEN_FROM_GITHUB \
  --name sapdev-pc-runner \
  --labels sapdev \
  --work _work \
  --unattended \
  --replace
```

### Deploy fails with Vite `EACCES: permission denied, unlink ... dist/assets/...`

Cause:

Old build output under `/home/sadmin/sap/dist` is not owned by `sadmin`.

Resolution:

The deploy workflow fixes this before building:

```bash
sudo chown -R sadmin:sadmin /home/sadmin/sap
sudo rm -rf /home/sadmin/sap/dist
```

Manual fix:

```bash
sudo chown -R sadmin:sadmin /home/sadmin/sap
sudo rm -rf /home/sadmin/sap/dist
```

Then push to `dev` or rerun the deploy workflow.

### Deploy fails at `nginx -t`

Check Nginx configuration:

```bash
sudo nginx -t
```

Important: do not leave `.bak` files in `/etc/nginx/sites-enabled` because Nginx loads them and may trigger duplicate `server_name` conflicts.

### Health check fails

Check backend API locally:

```bash
curl http://127.0.0.1:8090/health
```

Check public API:

```bash
curl https://sapdev.cbj-kontruksi.com/sap-api/health
```

Check service:

```bash
sudo systemctl status sap-evidence-api.service --no-pager
```

## Manual DEV Deploy Fallback

If GitHub Actions is unavailable, deploy manually:

```bash
cd /home/sadmin/sap

git fetch origin dev
git reset --hard origin/dev

sudo chown -R sadmin:sadmin /home/sadmin/sap
sudo rm -rf /home/sadmin/sap/dist

npm install
npm run build

sudo rm -rf /var/www/svr01-dev/sap/*
sudo cp -rv dist/* /var/www/svr01-dev/sap/

sudo chown -R www-data:www-data /var/www/svr01-dev/sap
sudo find /var/www/svr01-dev/sap -type d -exec chmod 755 {} \;
sudo find /var/www/svr01-dev/sap -type f -exec chmod 644 {} \;

sudo nginx -t
sudo systemctl reload nginx

curl http://127.0.0.1:8090/health
curl https://sapdev.cbj-kontruksi.com/sap-api/health
```

## Operational Notes

- Production deploy is not automated.
- DEV deploy is safe to trigger from GitHub Actions because it targets only `/var/www/svr01-dev/sap`.
- Current default working branch for SPHERE UI iteration is `dev`.
- Keep the runner service running; otherwise deploy jobs will stay queued.
- If the server reboots, confirm the runner service is active before pushing or triggering deploy.
- Do not expose SSH publicly just for GitHub Actions. The self-hosted runner is the correct model for this server because the app is served through Cloudflare Tunnel.
