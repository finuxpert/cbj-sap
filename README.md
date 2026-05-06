# SAP Basis Tools

SAP operations workspace for log triage, ST03N analysis, comparison evidence, backup/deploy helpers, and internal Basis workflows.

## Handoff / Runbook

- Main ecosystem handoff: [docs/CBJ_ECOSYSTEM_HANDOFF.md](/home/sadmin/sap/docs/CBJ_ECOSYSTEM_HANDOFF.md:1)
- Deploy/backup/rollback commands: [docs/CBJ_DEPLOY_BACKUP_ROLLBACK_RUNBOOK.md](/home/sadmin/sap/docs/CBJ_DEPLOY_BACKUP_ROLLBACK_RUNBOOK.md:1)
- SAP documentation: [documentation.txt](/home/sadmin/sap/documentation.txt:1)

## Local Development

```bash
cd /home/sadmin/sap
npm install
npm run dev
```

## Build

```bash
npm run build
```

## Deploy SAP to Production

Use backup-before-deploy for normal changes:

```bash
cd /home/sadmin/sap
sudo DO_BACKUP=1 ./sap-deploy.sh
```

Live routes:

- `https://cbj-kontruksi.com/sap/`
- `server-public` / public VPS
- `http://192.168.10.1/sap/`
- `server-vm` / VirtualBox VM

## Deploy SAP to Staging

Use this for testing before publishing to production:

```bash
cd /home/sadmin/sap
sudo ./sap-deploy-staging.sh
```

Staging route:

- `http://192.168.10.1/sap-staging/`

This staging route is on `server-vm`.

Production `/sap/` is not changed by the staging script.

## Backup / Rollback

Backup source:

```bash
sudo ./sap-backup.sh
```

Rollback source backup, rebuild, deploy, and reload nginx:

```bash
sudo ./sap-rollback.sh
```
