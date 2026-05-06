import http from "node:http";
import https from "node:https";
import net from "node:net";
import os from "node:os";
import tls from "node:tls";
import { execFile } from "node:child_process";
import { mkdirSync } from "node:fs";
import { promises as fs } from "node:fs";
import path from "node:path";
import { DatabaseSync } from "node:sqlite";

const HOST = process.env.HOST || "127.0.0.1";
const PORT = Number(process.env.PORT || 8790);
const DOMAIN = process.env.MONITORING_DOMAIN || "cbj-kontruksi.com";
const HISTORY_DB_PATH = process.env.MONITORING_HISTORY_DB || "/var/lib/cbj-monitoring/history.sqlite";
const HISTORY_RETENTION_DAYS = 90;
const SNAPSHOT_MIN_INTERVAL_MS = 15 * 60 * 1000;
let lastSnapshotAt = 0;
let snapshotInProgress = false;

const TABLE_CONTEXT = {
  "cbj-note": {
    notes: {
      label: "Catatan / Dokumentasi",
      purpose: "Menyimpan konten note, judul, status, dan metadata perubahan untuk kebutuhan dokumentasi kerja.",
      traceFields: ["id", "title", "slug", "content", "created_at", "updated_at", "deleted_at"],
    },
    sessions: {
      label: "Login Session",
      purpose: "Mencatat sesi login user yang aktif atau pernah dibuat, berguna untuk trace akses aplikasi.",
      traceFields: ["id", "user_id", "token", "expires_at", "created_at"],
    },
    users: {
      label: "User Aplikasi",
      purpose: "Data akun yang bisa masuk ke CBJ Notes, dipakai untuk menghubungkan aktivitas dengan pemilik akses.",
      traceFields: ["id", "name", "email", "role", "created_at", "updated_at"],
    },
  },
  "cbj-portal": {
    projects: {
      label: "Project / Lead",
      purpose: "Data permintaan proyek, progress, atau item pekerjaan yang masuk dari portal CBJ.",
      traceFields: ["id", "name", "status", "created_at", "updated_at"],
    },
    sessions: {
      label: "Login Session",
      purpose: "Sesi login portal untuk pengecekan akses user.",
      traceFields: ["id", "user_id", "expires_at", "created_at"],
    },
    users: {
      label: "User Portal",
      purpose: "Akun pengguna portal internal.",
      traceFields: ["id", "name", "email", "role"],
    },
  },
  amandapay: {
    kv: {
      label: "Key Value Store",
      purpose: "Storage konfigurasi atau state ringan aplikasi Amandapay.",
      traceFields: ["key", "value", "updated_at"],
    },
  },
};

const APP_TRACE_FLOWS = {
  "cbj-note": [
    { step: "Login", detail: "User masuk melalui akun Notes, lalu sistem membuat session." },
    { step: "Session", detail: "Table sessions menjadi titik trace akses: user_id, token/session id, dan masa berlaku." },
    { step: "Create / Edit Note", detail: "Perubahan dokumen masuk ke table notes dengan metadata waktu dan pemilik bila kolom tersedia." },
    { step: "Review Trace", detail: "Cek row count, kolom audit, dan timestamp untuk tahu apakah data aktif bergerak normal." },
  ],
};

const SERVER_INVENTORY = [
  {
    name: "svr-public",
    role: "VPS public production",
    location: "Public VPS",
    expected: "standby",
    access: "local",
    check: { type: "local" },
  },
  {
    name: "svr-01",
    role: "Server fisik tunnel sekolah",
    location: "Sekolah",
    expected: "standby",
    access: "Cloudflare Access SSH",
    check: { type: "ssh", target: "svr-01" },
  },
  {
    name: "svr-02",
    role: "Server tunnel VirtualBox rumah",
    location: "Rumah",
    expected: "on-demand",
    access: "Cloudflare Access SSH",
    check: { type: "manual" },
  },
  {
    name: "svr-dev",
    role: "Control/dev Codex",
    location: "On-demand",
    expected: "on-demand",
    access: "manual / local session",
    check: { type: "manual" },
  },
];

const DOCKER_APP_INVENTORY = [
  {
    name: "Nextcloud",
    server: "svr-01",
    container: "nextcloud-app",
    image: "nextcloud:latest",
    route: "https://sharefile.cbj-kontruksi.com/",
    expected: "standby",
  },
  {
    name: "Nextcloud DB",
    server: "svr-01",
    container: "nextcloud-db",
    image: "mariadb:10.6",
    route: "internal",
    expected: "standby",
  },
  {
    name: "n8n",
    server: "svr-01",
    container: "n8n",
    image: "n8nio/n8n",
    route: "https://n8n.cbj-kontruksi.com/",
    expected: "standby",
  },
  {
    name: "Trading API",
    server: "svr-01",
    container: "trading-api",
    image: "trading-ai-trading-api",
    route: "https://trading.cbj-kontruksi.com/",
    expected: "standby",
  },
];

function exec(command, args = []) {
  return new Promise((resolve) => {
    execFile(command, args, { timeout: 5000 }, (error, stdout, stderr) => {
      resolve({
        ok: !error,
        stdout: String(stdout || "").trim(),
        stderr: String(stderr || "").trim(),
        code: error?.code ?? 0,
      });
    });
  });
}

function execWithTimeout(command, args = [], timeout = 5000) {
  return new Promise((resolve) => {
    execFile(command, args, { timeout }, (error, stdout, stderr) => {
      resolve({
        ok: !error,
        stdout: String(stdout || "").trim(),
        stderr: String(stderr || "").trim(),
        code: error?.code ?? 0,
      });
    });
  });
}

function bytesToHuman(bytes) {
  const units = ["B", "KB", "MB", "GB", "TB"];
  let value = Number(bytes || 0);
  let unit = 0;
  while (value >= 1024 && unit < units.length - 1) {
    value /= 1024;
    unit += 1;
  }
  return `${value.toFixed(unit ? 1 : 0)} ${units[unit]}`;
}

function pctFromDiskValue(value) {
  return Number(String(value || "0").replace("%", ""));
}

function apiEndpointsOnly(endpoints) {
  return endpoints.filter((endpoint) => endpoint.name.toLowerCase().includes("api"));
}

function openHistoryDb() {
  const dir = path.dirname(HISTORY_DB_PATH);
  mkdirSync(dir, { recursive: true });
  const db = new DatabaseSync(HISTORY_DB_PATH);
  db.exec(`
    CREATE TABLE IF NOT EXISTS monitoring_snapshots (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      captured_at TEXT NOT NULL,
      ok INTEGER NOT NULL,
      issue_count INTEGER NOT NULL,
      memory_used_pct REAL NOT NULL,
      memory_used_mb REAL NOT NULL,
      memory_available_mb REAL NOT NULL,
      disk_root_used_pct REAL,
      disk_root_used_bytes INTEGER,
      disk_root_available_bytes INTEGER,
      app_data_total_bytes INTEGER NOT NULL,
      api_ok_count INTEGER NOT NULL,
      api_fail_count INTEGER NOT NULL,
      api_avg_ms REAL
    );
    CREATE TABLE IF NOT EXISTS endpoint_snapshots (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      snapshot_id INTEGER NOT NULL,
      captured_at TEXT NOT NULL,
      name TEXT NOT NULL,
      route TEXT NOT NULL,
      ok INTEGER NOT NULL,
      status_code INTEGER,
      ms INTEGER,
      error TEXT,
      FOREIGN KEY(snapshot_id) REFERENCES monitoring_snapshots(id) ON DELETE CASCADE
    );
    CREATE INDEX IF NOT EXISTS idx_monitoring_snapshots_captured_at ON monitoring_snapshots(captured_at);
    CREATE INDEX IF NOT EXISTS idx_endpoint_snapshots_captured_at ON endpoint_snapshots(captured_at);
  `);
  return db;
}

function latestHistoryCapture(db) {
  return db.prepare("SELECT captured_at FROM monitoring_snapshots ORDER BY captured_at DESC LIMIT 1").get()?.captured_at || null;
}

function pruneHistory(db) {
  const cutoff = new Date(Date.now() - HISTORY_RETENTION_DAYS * 86_400_000).toISOString();
  const oldIds = db.prepare("SELECT id FROM monitoring_snapshots WHERE captured_at < ?").all(cutoff).map((row) => row.id);
  if (!oldIds.length) return;
  const deleteEndpoints = db.prepare("DELETE FROM endpoint_snapshots WHERE snapshot_id = ?");
  const deleteSnapshot = db.prepare("DELETE FROM monitoring_snapshots WHERE id = ?");
  db.exec("BEGIN");
  try {
    for (const id of oldIds) {
      deleteEndpoints.run(id);
      deleteSnapshot.run(id);
    }
    db.exec("COMMIT");
  } catch (error) {
    db.exec("ROLLBACK");
    throw error;
  }
}

function recordHistorySnapshot(status, force = false) {
  const now = Date.now();
  if (!force && now - lastSnapshotAt < SNAPSHOT_MIN_INTERVAL_MS) return;

  let db;
  try {
    db = openHistoryDb();
    const latest = latestHistoryCapture(db);
    if (!force && latest && now - new Date(latest).getTime() < SNAPSHOT_MIN_INTERVAL_MS) {
      lastSnapshotAt = new Date(latest).getTime();
      return;
    }

    const capturedAt = status.generatedAt || new Date().toISOString();
    const memoryUsedPct = status.memory.totalMB ? Math.round((status.memory.usedMB / status.memory.totalMB) * 1000) / 10 : 0;
    const rootDisk = status.disks.find((disk) => disk.mountedOn === "/") || status.disks[0] || {};
    const appDataTotal = status.appData.reduce((sum, app) => sum + Number(app.totalSize || 0), 0);
    const apiEndpoints = apiEndpointsOnly(status.endpoints);
    const okApis = apiEndpoints.filter((endpoint) => endpoint.ok);
    const apiAvgMs = okApis.length ? Math.round(okApis.reduce((sum, endpoint) => sum + Number(endpoint.ms || 0), 0) / okApis.length) : null;

    const insertSnapshot = db.prepare(`
      INSERT INTO monitoring_snapshots (
        captured_at, ok, issue_count, memory_used_pct, memory_used_mb, memory_available_mb,
        disk_root_used_pct, disk_root_used_bytes, disk_root_available_bytes, app_data_total_bytes,
        api_ok_count, api_fail_count, api_avg_ms
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `);
    const insertEndpoint = db.prepare(`
      INSERT INTO endpoint_snapshots (
        snapshot_id, captured_at, name, route, ok, status_code, ms, error
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?)
    `);

    db.exec("BEGIN");
    try {
      const result = insertSnapshot.run(
        capturedAt,
        status.ok ? 1 : 0,
        status.summary?.issues?.length || 0,
        memoryUsedPct,
        Number(status.memory.usedMB || 0),
        Number(status.memory.availableMB || status.memory.freeMB || 0),
        Number.isFinite(pctFromDiskValue(rootDisk.usePercent)) ? pctFromDiskValue(rootDisk.usePercent) : null,
        Number(rootDisk.usedBytes || 0),
        Number(rootDisk.availableBytes || 0),
        appDataTotal,
        okApis.length,
        apiEndpoints.length - okApis.length,
        apiAvgMs
      );
      for (const endpoint of apiEndpoints) {
        insertEndpoint.run(
          result.lastInsertRowid,
          capturedAt,
          endpoint.name,
          endpoint.route,
          endpoint.ok ? 1 : 0,
          endpoint.statusCode || null,
          endpoint.ms || null,
          endpoint.error || null
        );
      }
      pruneHistory(db);
      db.exec("COMMIT");
      lastSnapshotAt = now;
    } catch (error) {
      db.exec("ROLLBACK");
      throw error;
    }
  } catch (error) {
    console.error("monitoring history write failed", error.message || error);
  } finally {
    try {
      db?.close();
    } catch {
      // ignore close errors in monitoring history path
    }
  }
}

function readHistory(days = HISTORY_RETENTION_DAYS) {
  let db;
  try {
    db = openHistoryDb();
    const safeDays = Math.max(1, Math.min(HISTORY_RETENTION_DAYS, Number(days) || HISTORY_RETENTION_DAYS));
    const since = new Date(Date.now() - safeDays * 86_400_000).toISOString();
    const snapshots = db
      .prepare(`
        SELECT *
        FROM monitoring_snapshots
        WHERE captured_at >= ?
        ORDER BY captured_at ASC
      `)
      .all(since);
    const endpoints = db
      .prepare(`
        SELECT name, route,
          COUNT(*) AS samples,
          SUM(CASE WHEN ok = 1 THEN 1 ELSE 0 END) AS ok_count,
          SUM(CASE WHEN ok = 0 THEN 1 ELSE 0 END) AS fail_count,
          ROUND(AVG(ms), 0) AS avg_ms,
          MAX(ms) AS max_ms,
          MAX(captured_at) AS last_seen
        FROM endpoint_snapshots
        WHERE captured_at >= ?
        GROUP BY name, route
        ORDER BY name ASC
      `)
      .all(since);
    return {
      ok: true,
      days: safeDays,
      retentionDays: HISTORY_RETENTION_DAYS,
      database: HISTORY_DB_PATH,
      samples: snapshots.length,
      snapshots: snapshots.map((row) => ({
        capturedAt: row.captured_at,
        ok: Boolean(row.ok),
        issueCount: row.issue_count,
        memoryUsedPct: row.memory_used_pct,
        memoryUsedMB: row.memory_used_mb,
        memoryAvailableMB: row.memory_available_mb,
        diskRootUsedPct: row.disk_root_used_pct,
        diskRootUsedBytes: row.disk_root_used_bytes,
        diskRootAvailableBytes: row.disk_root_available_bytes,
        appDataTotalBytes: row.app_data_total_bytes,
        apiOkCount: row.api_ok_count,
        apiFailCount: row.api_fail_count,
        apiAvgMs: row.api_avg_ms,
      })),
      endpoints: endpoints.map((row) => ({
        name: row.name,
        route: row.route,
        samples: row.samples,
        okCount: row.ok_count,
        failCount: row.fail_count,
        avgMs: row.avg_ms,
        maxMs: row.max_ms,
        lastSeen: row.last_seen,
      })),
    };
  } catch (error) {
    return { ok: false, error: error.message || "history read failed", snapshots: [], endpoints: [] };
  } finally {
    try {
      db?.close();
    } catch {
      // ignore close errors in monitoring history path
    }
  }
}

function hoursSince(isoDate) {
  if (!isoDate) return null;
  const time = new Date(isoDate).getTime();
  if (!Number.isFinite(time)) return null;
  return Math.max(0, Math.round(((Date.now() - time) / 3_600_000) * 10) / 10);
}

async function fileInfo(filePath) {
  try {
    const stat = await fs.stat(filePath);
    return {
      path: filePath,
      exists: true,
      size: stat.size,
      sizeHuman: bytesToHuman(stat.size),
      modifiedAt: stat.mtime.toISOString(),
    };
  } catch {
    return { path: filePath, exists: false };
  }
}

async function pathSize(targetPath) {
  try {
    const stat = await fs.stat(targetPath);
    if (stat.isFile()) {
      return {
        path: targetPath,
        exists: true,
        type: "file",
        size: stat.size,
        sizeHuman: bytesToHuman(stat.size),
        modifiedAt: stat.mtime.toISOString(),
      };
    }

    const result = await exec("du", ["-sb", targetPath]);
    const size = result.ok ? Number(result.stdout.split(/\s+/)[0] || 0) : 0;
    return {
      path: targetPath,
      exists: true,
      type: "dir",
      size,
      sizeHuman: bytesToHuman(size),
      modifiedAt: stat.mtime.toISOString(),
    };
  } catch {
    return { path: targetPath, exists: false, type: "missing", size: 0, sizeHuman: "0 B" };
  }
}

async function sqliteTableInfo(dbPath, appSlug = null) {
  const info = await fileInfo(dbPath);
  if (!info.exists) {
    return {
      path: dbPath,
      exists: false,
      size: 0,
      sizeHuman: "0 B",
      tables: [],
      tableCount: 0,
    };
  }

  let db;
  try {
    db = new DatabaseSync(dbPath, { readOnly: true });
    const objects = db
      .prepare(`
        SELECT name, type
        FROM sqlite_schema
        WHERE type IN ('table', 'view')
          AND name NOT LIKE 'sqlite_%'
        ORDER BY type ASC, name ASC
      `)
      .all();

    const tables = objects.map((item) => {
      let rowCount = null;
      let error = null;
      let columns = [];
      try {
        const quoted = `"${String(item.name).replaceAll('"', '""')}"`;
        rowCount = db.prepare(`SELECT COUNT(*) AS count FROM ${quoted}`).get().count;
        columns = db.prepare(`PRAGMA table_info(${quoted})`).all().map((column) => ({
          name: column.name,
          type: column.type || "ANY",
          notNull: Boolean(column.notnull),
          primaryKey: Number(column.pk || 0) > 0,
        }));
      } catch (countError) {
        error = countError.message || "table inspect failed";
      }
      const context = TABLE_CONTEXT[appSlug]?.[item.name] || null;
      const columnNames = new Set(columns.map((column) => column.name));
      return {
        name: item.name,
        type: item.type,
        rowCount,
        label: context?.label || item.name,
        purpose: context?.purpose || null,
        traceFields: (context?.traceFields || []).map((field) => ({
          name: field,
          exists: columnNames.has(field),
        })),
        columns,
        error,
      };
    });

    return {
      ...info,
      tables,
      tableCount: tables.length,
    };
  } catch (error) {
    return {
      ...info,
      tables: [],
      tableCount: 0,
      error: error.message || "sqlite read failed",
    };
  } finally {
    try {
      db?.close();
    } catch {
      // ignore close errors in monitoring path
    }
  }
}

async function appDataInfo() {
  const apps = [
    {
      name: "Website / Portal CBJ",
      slug: "cbj-portal",
      dataPaths: ["/var/lib/cbj-portal", "/var/www/prod/current/server"],
      databasePath: "/var/lib/cbj-portal/cbj.sqlite",
    },
    {
      name: "CBJ Notes",
      slug: "cbj-note",
      dataPaths: ["/var/lib/cbj-note"],
      databasePath: "/var/lib/cbj-note/cbj-note.sqlite",
    },
    {
      name: "Amandapay",
      slug: "amandapay",
      dataPaths: ["/var/lib/amandapay"],
      databasePath: "/var/lib/amandapay/amandapay.sqlite",
    },
    {
      name: "SAP Tools",
      slug: "sap",
      dataPaths: ["/var/www/html/sap/sample-data-logs"],
      databasePath: null,
    },
    {
      name: "Webmail",
      slug: "webmail",
      dataPaths: ["/var/www/snappymail/data"],
      databasePath: null,
    },
    {
      name: "Monitoring",
      slug: "monitoring",
      dataPaths: ["/var/lib/cbj-monitoring", "/var/log/cbj-monitoring.log", "/var/www/html/monitoring"],
      databasePath: null,
    },
  ];

  return Promise.all(
    apps.map(async (app) => {
      const [paths, database] = await Promise.all([
        Promise.all(app.dataPaths.map(pathSize)),
        app.databasePath ? sqliteTableInfo(app.databasePath, app.slug) : Promise.resolve(null),
      ]);
      const totalSize = paths.reduce((sum, item) => sum + Number(item.size || 0), 0);
      return {
        ...app,
        paths,
        database,
        traceFlow: APP_TRACE_FLOWS[app.slug] || [],
        totalSize,
        totalSizeHuman: bytesToHuman(totalSize),
        tableCount: database?.tableCount || 0,
      };
    })
  );
}

async function latestBackup(dir) {
  try {
    const entries = await fs.readdir(dir);
    const backups = [];
    for (const entry of entries.filter((item) => item.endsWith(".tar.gz"))) {
      const fullPath = path.join(dir, entry);
      const stat = await fs.stat(fullPath);
      backups.push({
        name: entry,
        path: fullPath,
        size: stat.size,
        sizeHuman: bytesToHuman(stat.size),
        modifiedAt: stat.mtime.toISOString(),
      });
    }
    backups.sort((a, b) => new Date(b.modifiedAt) - new Date(a.modifiedAt));
    const latest = backups[0] || null;
    return {
      dir,
      count: backups.length,
      latest,
      ageHours: latest ? hoursSince(latest.modifiedAt) : null,
      warning: !latest || hoursSince(latest.modifiedAt) > 48,
    };
  } catch {
    return { dir, count: 0, latest: null, ageHours: null, warning: true };
  }
}

async function serviceStatus(name) {
  const result = await exec("systemctl", ["is-active", name]);
  return {
    name,
    active: result.stdout === "active",
    status: result.stdout || result.stderr || "unknown",
  };
}

function requestLocalHttps(route) {
  const started = Date.now();
  return new Promise((resolve) => {
    const req = https.request(
      {
        host: "127.0.0.1",
        port: 443,
        path: route,
        method: "GET",
        servername: DOMAIN,
        rejectUnauthorized: false,
        headers: { Host: DOMAIN, "User-Agent": "cbj-monitoring/1.0" },
        timeout: 7000,
      },
      (res) => {
        res.resume();
        res.on("end", () => {
          resolve({
            route,
            ok: res.statusCode >= 200 && res.statusCode < 400,
            statusCode: res.statusCode,
            ms: Date.now() - started,
          });
        });
      }
    );
    req.on("timeout", () => {
      req.destroy(new Error("timeout"));
    });
    req.on("error", (error) => {
      resolve({ route, ok: false, statusCode: 0, ms: Date.now() - started, error: error.message });
    });
    req.end();
  });
}

function requestPublicHttps(url) {
  const started = Date.now();
  const target = new URL(url);
  return new Promise((resolve) => {
    const req = https.request(
      {
        hostname: target.hostname,
        port: target.port || 443,
        path: `${target.pathname}${target.search}`,
        method: "GET",
        headers: { "User-Agent": "cbj-monitoring/1.0" },
        timeout: 7000,
      },
      (res) => {
        res.resume();
        res.on("end", () => {
          resolve({
            route: url,
            ok: res.statusCode >= 200 && res.statusCode < 400,
            statusCode: res.statusCode,
            ms: Date.now() - started,
          });
        });
      }
    );
    req.on("timeout", () => {
      req.destroy(new Error("timeout"));
    });
    req.on("error", (error) => {
      resolve({ route: url, ok: false, statusCode: 0, ms: Date.now() - started, error: error.message });
    });
    req.end();
  });
}

function requestEndpoint(endpoint) {
  if (endpoint.url) return requestPublicHttps(endpoint.url);
  return requestLocalHttps(endpoint.route);
}

async function dockerAppStatus() {
  const containers = DOCKER_APP_INVENTORY.map((app) => app.container);
  const remoteCommand = `docker inspect --format '{{.Name}}|{{.State.Status}}|{{.State.Running}}|{{if .State.Health}}{{.State.Health.Status}}{{end}}|{{.Config.Image}}' ${containers.join(" ")}`;
  const result = await execWithTimeout("ssh", [
    "-o",
    "BatchMode=yes",
    "-o",
    "ConnectTimeout=8",
    "svr-01",
    remoteCommand,
  ], 15000);

  const inspected = new Map();
  if (result.ok) {
    for (const line of result.stdout.split("\n").filter(Boolean)) {
      const [rawName, state, running, health, image] = line.split("|");
      inspected.set(rawName.replace(/^\//, ""), { state, running, health, image });
    }
  }

  return DOCKER_APP_INVENTORY.map((app) => {
    const base = {
      ...app,
      required: app.expected === "standby",
      checkedAt: new Date().toISOString(),
    };
    const info = inspected.get(app.container);
    if (!result.ok || !info) {
      const detail = result.stderr || result.stdout || "docker inspect failed";
      return { ...base, ok: false, running: false, state: "unknown", health: "", detail };
    }

    const ok = info.state === "running" && info.running === "true" && (!info.health || info.health === "healthy");
    return {
      ...base,
      ok,
      running: info.running === "true",
      state: info.state || "unknown",
      health: info.health || "none",
      image: info.image || app.image,
      detail: ok ? "Container running" : `state ${info.state || "unknown"} health ${info.health || "none"}`,
    };
  });
}

function tcpCheck(host, port, timeout = 5000) {
  const started = Date.now();
  return new Promise((resolve) => {
    const socket = net.createConnection({ host, port });
    let settled = false;
    const finish = (ok, error = "") => {
      if (settled) return;
      settled = true;
      socket.destroy();
      resolve({ ok, ms: Date.now() - started, error });
    };
    socket.setTimeout(timeout);
    socket.on("connect", () => finish(true));
    socket.on("timeout", () => finish(false, "timeout"));
    socket.on("error", (error) => finish(false, error.message));
  });
}

async function serverInventoryStatus() {
  return Promise.all(
    SERVER_INVENTORY.map(async (server) => {
      const base = {
        ...server,
        required: server.expected === "standby",
        checkedAt: new Date().toISOString(),
      };

      if (server.check.type === "local") {
        return {
          ...base,
          state: "online",
          ok: true,
          live: true,
          host: os.hostname(),
          detail: "Monitoring berjalan di server ini.",
        };
      }

      if (server.check.type === "manual") {
        return {
          ...base,
          state: "on-demand",
          ok: true,
          live: false,
          detail: "Tidak selalu standby; tidak dihitung sebagai issue saat offline.",
        };
      }

      if (server.check.type === "tcp") {
        const result = await tcpCheck(server.check.host, server.check.port);
        return {
          ...base,
          state: result.ok ? "online" : "down",
          ok: result.ok,
          live: true,
          ms: result.ms,
          detail: result.ok ? `${server.check.host}:${server.check.port} reachable` : result.error,
        };
      }

      if (server.check.type === "ssh") {
        const result = await execWithTimeout("ssh", [
          "-o",
          "BatchMode=yes",
          "-o",
          "ConnectTimeout=8",
          server.check.target,
          "printf '%s\\n' \"$(hostname)\"",
        ], 12000);
        const notConfigured = /Could not resolve hostname|No such file|not found|Permission denied/.test(`${result.stderr}\n${result.stdout}`);
        return {
          ...base,
          state: result.ok ? "online" : (notConfigured ? "check-unavailable" : "down"),
          ok: result.ok || (!base.required && notConfigured),
          live: result.ok,
          host: result.ok ? result.stdout.split("\n")[0] : "",
          detail: result.ok
            ? `SSH OK ke ${server.check.target}`
            : (notConfigured ? "Live check SSH belum dikonfigurasi di monitoring host." : result.stderr || result.stdout || "SSH check failed"),
        };
      }

      return {
        ...base,
        state: "unknown",
        ok: !base.required,
        live: false,
        detail: "Check belum didefinisikan.",
      };
    })
  );
}

async function diskInfo() {
  const [humanResult, byteResult] = await Promise.all([
    exec("df", ["-h", "/", "/boot"]),
    exec("df", ["-B1", "/", "/boot"]),
  ]);
  const result = humanResult;
  if (!result.ok) return [];
  const lines = result.stdout.split("\n").slice(1);
  const byteLines = byteResult.ok ? byteResult.stdout.split("\n").slice(1) : [];
  return lines.map((line, index) => {
    const parts = line.trim().split(/\s+/);
    const byteParts = (byteLines[index] || "").trim().split(/\s+/);
    return {
      filesystem: parts[0],
      size: parts[1],
      used: parts[2],
      available: parts[3],
      usePercent: parts[4],
      mountedOn: parts[5],
      sizeBytes: Number(byteParts[1] || 0),
      usedBytes: Number(byteParts[2] || 0),
      availableBytes: Number(byteParts[3] || 0),
      warning: Number(String(parts[4]).replace("%", "")) >= 85,
    };
  });
}

async function memoryInfo() {
  const result = await exec("free", ["-m"]);
  if (!result.ok) {
    return {
      totalMB: Math.round(os.totalmem() / 1024 / 1024),
      freeMB: Math.round(os.freemem() / 1024 / 1024),
    };
  }
  const memLine = result.stdout.split("\n").find((line) => line.startsWith("Mem:"));
  const swapLine = result.stdout.split("\n").find((line) => line.startsWith("Swap:"));
  const mem = memLine?.trim().split(/\s+/) || [];
  const swap = swapLine?.trim().split(/\s+/) || [];
  return {
    totalMB: Number(mem[1] || 0),
    usedMB: Number(mem[2] || 0),
    freeMB: Number(mem[3] || 0),
    availableMB: Number(mem[6] || 0),
    swapTotalMB: Number(swap[1] || 0),
    swapUsedMB: Number(swap[2] || 0),
  };
}

function tlsCertificateInfo() {
  const started = Date.now();
  return new Promise((resolve) => {
    const socket = tls.connect(
      {
        host: "127.0.0.1",
        port: 443,
        servername: DOMAIN,
        rejectUnauthorized: false,
        timeout: 7000,
      },
      () => {
        const cert = socket.getPeerCertificate();
        const validTo = cert?.valid_to ? new Date(cert.valid_to) : null;
        const daysRemaining = validTo ? Math.ceil((validTo.getTime() - Date.now()) / 86_400_000) : null;
        socket.end();
        resolve({
          domain: DOMAIN,
          ok: typeof daysRemaining === "number" && daysRemaining > 14,
          warning: typeof daysRemaining === "number" && daysRemaining <= 30,
          subject: cert?.subject?.CN || DOMAIN,
          issuer: cert?.issuer?.O || cert?.issuer?.CN || "unknown",
          validTo: validTo ? validTo.toISOString() : null,
          daysRemaining,
          ms: Date.now() - started,
        });
      }
    );
    socket.on("timeout", () => socket.destroy(new Error("timeout")));
    socket.on("error", (error) => {
      resolve({ domain: DOMAIN, ok: false, warning: false, error: error.message, ms: Date.now() - started });
    });
  });
}

function buildIssues({ disks, services, endpoints, backups, tlsCertificate, servers, dockerApps }) {
  const issues = [];
  for (const disk of disks.filter((item) => item.warning)) {
    issues.push({ severity: "warn", area: "disk", message: `${disk.mountedOn} usage ${disk.usePercent}` });
  }
  for (const service of services.filter((item) => !item.active)) {
    issues.push({ severity: "bad", area: "service", message: `${service.name} ${service.status}` });
  }
  for (const endpoint of endpoints.filter((item) => !item.ok)) {
    issues.push({ severity: "bad", area: "route", message: `${endpoint.name} ${endpoint.statusCode || endpoint.error || "failed"}` });
  }
  for (const backup of backups.filter((item) => item.warning)) {
    issues.push({
      severity: "warn",
      area: "backup",
      message: backup.latest ? `${backup.dir} latest ${backup.ageHours}h ago` : `${backup.dir} missing`,
    });
  }
  for (const server of (servers || []).filter((item) => item.required && !item.ok)) {
    issues.push({
      severity: server.state === "check-unavailable" ? "warn" : "bad",
      area: "server",
      message: `${server.name} ${server.state}: ${server.detail}`,
    });
  }
  for (const app of (dockerApps || []).filter((item) => item.required && !item.ok)) {
    issues.push({
      severity: "bad",
      area: "docker",
      message: `${app.server}/${app.container} ${app.state}: ${app.detail}`,
    });
  }
  if (!tlsCertificate.ok) {
    issues.push({
      severity: "bad",
      area: "tls",
      message: tlsCertificate.error || `${tlsCertificate.domain} certificate expires in ${tlsCertificate.daysRemaining} days`,
    });
  } else if (tlsCertificate.warning) {
    issues.push({
      severity: "warn",
      area: "tls",
      message: `${tlsCertificate.domain} certificate expires in ${tlsCertificate.daysRemaining} days`,
    });
  }
  return {
    ok: issues.every((issue) => issue.severity !== "bad"),
    warning: issues.some((issue) => issue.severity === "warn"),
    issues,
  };
}

async function collectStatus({ record = true } = {}) {
  const services = [
    "nginx",
    "cbj-portal-api",
    "cbj-note-api",
    "amandapay-api",
    "crond",
    "postfix",
    "dovecot",
  ];

  const endpoints = [
    { name: "Website", route: "/" },
    { name: "Portal", route: "/portal" },
    { name: "Portal API", route: "/api/health" },
    { name: "Notes", route: "/note/" },
    { name: "Notes API", route: "/api/note/health" },
    { name: "SAP", route: "/sap/" },
    { name: "Amandapay", route: "/amandapay/" },
    { name: "Amandapay API", route: "/amandapay/api/health" },
    { name: "Webmail", route: "/webmail/" },
    { name: "SVR-01 Dev Portal", route: "https://dev.cbj-kontruksi.com/", url: "https://dev.cbj-kontruksi.com/" },
    { name: "SVR-01 SAP Dev", route: "https://sapdev.cbj-kontruksi.com/", url: "https://sapdev.cbj-kontruksi.com/" },
    { name: "SVR-01 Note Dev", route: "https://note-dev.cbj-kontruksi.com/", url: "https://note-dev.cbj-kontruksi.com/" },
    { name: "SVR-01 Postman Dev", route: "https://postman-dev.cbj-kontruksi.com/", url: "https://postman-dev.cbj-kontruksi.com/" },
    { name: "SVR-01 Amandapay Dev", route: "https://amandapay-dev.cbj-kontruksi.com/", url: "https://amandapay-dev.cbj-kontruksi.com/" },
  ];

  const [memory, disks, serviceResults, endpointResults, databases, appData, backups, tlsCertificate, servers, dockerApps] = await Promise.all([
    memoryInfo(),
    diskInfo(),
    Promise.all(services.map(serviceStatus)),
    Promise.all(endpoints.map((endpoint) => requestEndpoint(endpoint).then((result) => ({ ...endpoint, ...result })))),
    Promise.all([
      sqliteTableInfo("/var/lib/cbj-portal/cbj.sqlite"),
      sqliteTableInfo("/var/lib/cbj-note/cbj-note.sqlite"),
      sqliteTableInfo("/var/lib/amandapay/amandapay.sqlite"),
    ]),
    appDataInfo(),
    Promise.all([
      latestBackup("/home/sadmin/backups/cbj-portal"),
      latestBackup("/home/sadmin/backups/amandapay-public"),
    ]),
    tlsCertificateInfo(),
    serverInventoryStatus(),
    dockerAppStatus(),
  ]);

  const summary = buildIssues({ disks, services: serviceResults, endpoints: endpointResults, backups, tlsCertificate, servers, dockerApps });

  const status = {
    ok: summary.ok,
    warning: summary.warning,
    summary,
    generatedAt: new Date().toISOString(),
    host: os.hostname(),
    uptimeSeconds: Math.round(os.uptime()),
    loadAverage: os.loadavg(),
    cpuCount: os.cpus().length,
    memory,
    disks,
    services: serviceResults,
    endpoints: endpointResults,
    databases,
    appData,
    backups,
    tlsCertificate,
    servers,
    dockerApps,
  };
  if (record) recordHistorySnapshot(status);
  return status;
}

function sendJson(res, statusCode, payload) {
  res.writeHead(statusCode, {
    "Content-Type": "application/json; charset=utf-8",
    "Cache-Control": "no-store",
  });
  res.end(JSON.stringify(payload));
}

const server = http.createServer(async (req, res) => {
  try {
    const requestUrl = new URL(req.url || "/", `http://${req.headers.host || HOST}`);
    if (req.method === "GET" && (requestUrl.pathname === "/api/status" || requestUrl.pathname === "/api/monitoring/status")) {
      sendJson(res, 200, await collectStatus());
      return;
    }
    if (req.method === "GET" && (requestUrl.pathname === "/api/history" || requestUrl.pathname === "/api/monitoring/history")) {
      sendJson(res, 200, readHistory(requestUrl.searchParams.get("days")));
      return;
    }
    if (req.method === "GET" && (requestUrl.pathname === "/api/health" || requestUrl.pathname === "/health")) {
      sendJson(res, 200, { ok: true, service: "cbj-monitoring", generatedAt: new Date().toISOString() });
      return;
    }
    sendJson(res, 404, { ok: false, error: "not found" });
  } catch (error) {
    sendJson(res, 500, { ok: false, error: error.message || "internal error" });
  }
});

server.listen(PORT, HOST, () => {
  console.log(`CBJ monitoring running on http://${HOST}:${PORT}`);
});

setInterval(async () => {
  if (snapshotInProgress) return;
  snapshotInProgress = true;
  try {
    const status = await collectStatus({ record: false });
    recordHistorySnapshot(status, true);
  } catch (error) {
    console.error("monitoring scheduled snapshot failed", error.message || error);
  } finally {
    snapshotInProgress = false;
  }
}, SNAPSHOT_MIN_INTERVAL_MS).unref();
