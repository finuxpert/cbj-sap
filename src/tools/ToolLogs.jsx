import React, { useEffect, useMemo, useRef, useState } from "react";
import "./ToolLogs.css";
import "./ToolLogsRCA.css";

const SECTION_CPU = "CPU Tertinggi";
const SECTION_RSS = "Memory Tertinggi (RSS)";
const SECTION_AGE = "Running Terlama";
const SECTION_RABAX = "RABAX Terbanyak";

function toNumber(value, fallback = 0) {
  const n = Number(value);
  return Number.isFinite(n) ? n : fallback;
}

function mean(values = []) {
  if (!values.length) return 0;
  return values.reduce((a, b) => a + b, 0) / values.length;
}

function stddev(values = []) {
  if (values.length < 2) return 0;
  const avg = mean(values);
  const variance = mean(values.map((v) => (v - avg) ** 2));
  return Math.sqrt(variance);
}

function clamp(value, min, max) {
  return Math.min(max, Math.max(min, value));
}

function parseMemoryToGb(raw = "") {
  const s = String(raw).trim().toUpperCase();
  const m = s.match(/^([\d.]+)\s*([GMK])?$/);
  if (!m) return 0;
  const val = Number(m[1]) || 0;
  const unit = m[2] || "G";
  if (unit === "G") return val;
  if (unit === "M") return val / 1024;
  if (unit === "K") return val / (1024 * 1024);
  return val;
}

function parseAgeToMinutes(raw = "") {
  const s = String(raw).trim().toLowerCase();
  if (!s || s === "-") return 0;
  let total = 0;
  const d = s.match(/(\d+)\s*d/);
  const h = s.match(/(\d+)\s*h/);
  const m = s.match(/(\d+)\s*m/);
  if (d) total += Number(d[1]) * 1440;
  if (h) total += Number(h[1]) * 60;
  if (m) total += Number(m[1]);
  if (!d && !h && !m && /^\d+$/.test(s)) total = Number(s);
  return total;
}

function fmtAge(mins = 0) {
  const d = Math.floor(mins / 1440);
  const h = Math.floor((mins % 1440) / 60);
  const m = mins % 60;
  const parts = [];
  if (d) parts.push(`${d}d`);
  if (h) parts.push(`${h}h`);
  if (m || !parts.length) parts.push(`${m}m`);
  return parts.join(" ");
}



function truncateEnd(value = "", max = 44) {
  const text = String(value || "");
  if (text.length <= max) return text;
  return `${text.slice(0, Math.max(0, max - 1)).trimEnd()}…`;
}

function truncateMiddle(value = "", head = 18, tail = 14) {
  const text = String(value || "");
  if (text.length <= head + tail + 1) return text;
  return `${text.slice(0, head)}…${text.slice(-tail)}`;
}

function confidenceBreakdown(row) {
  if (!row) return [];
  const items = [
    { label: "Severity", value: row.class === "CRIT" ? 92 : row.class === "WARN" ? 68 : 38 },
    { label: "Recurrence", value: clamp((Math.max(0, (row.sourceFileCount || 1) - 1) * 26) + ((row.errorCount || 0) * 8), 8, 96) },
    { label: "Resource", value: clamp((row.cpu * 3.2) + (row.rssGb * 8.5) + Math.log1p(row.ageMin) * 8, 10, 97) },
    { label: "Correlation", value: clamp(((row.correlationCount || 1) * 18) + ((row.programCount || 0) * 2), 10, 96) },
  ];
  return items;
}


function recommendationBadges(row) {
  if (!row) return [];
  const tags = [];
  if ((row.sourceFileCount || 1) > 1) tags.push('Recurring');
  if ((row.errorCount || 0) >= 3) tags.push('Repeat Error');
  if (row.rssGb >= 6) tags.push('Heavy Memory');
  if (row.cpu >= 10) tags.push('High CPU');
  if (row.ageMin >= 240) tags.push('Long Running');
  if ((row.anomalyScore || 0) >= 75) tags.push('High Outlier');
  return tags.slice(0, 4);
}

function classifyRow(row) {
  if (!row) return [];
  const flags = [];
  if (row.class === 'CRIT' || row.impactScore >= 160) flags.push('critical-path');
  if (row.rssGb >= 6) flags.push('memory-heavy');
  if ((row.sourceFileCount || 1) > 1 || (row.errorCount || 0) >= 3) flags.push('recurring');
  if (row.ageMin >= 240) flags.push('long-running');
  if ((row.anomalyLevel === 'HIGH') || (row.anomalyScore || 0) >= 70) flags.push('suspicious');
  return flags;
}

function rowActionPlan(row) {
  const tags = classifyRow(row);
  const plans = [];
  if (tags.includes('critical-path')) plans.push('Prioritaskan row ini di triage pertama dan sinkronkan ke ST22 / SM21 sebelum pindah ke host lain.');
  if (tags.includes('memory-heavy')) plans.push('Bandingkan growth RSS lintas snapshot dan validasi process yang retain memory terlalu lama.');
  if (tags.includes('recurring')) plans.push('Telusuri retry loop, queue replay, atau job periodic yang memunculkan pattern berulang.');
  if (tags.includes('long-running')) plans.push('Validasi blocking session, expensive SQL, lock, atau wait event untuk WP yang terlalu lama hidup.');
  if (tags.includes('suspicious')) plans.push('Gunakan filter suspicious-only lalu cek offender serupa pada host/program yang sama untuk memastikan blast radius.');
  return plans.slice(0, 3);
}

function emptyStateMessage(rawTexts, filtered, rows) {
  if (!rawTexts.length) return 'Upload satu atau beberapa file log untuk mulai analisa.';
  if (!rows.length) return 'Parser belum menemukan row WP yang valid di file yang diupload.';
  if (!filtered.length) return 'Tidak ada row yang lolos filter saat ini. Longgarkan filter atau reset preset.';
  return '';
}

function rawRowCountOf(dataset) {
  return (dataset.snapshots || []).reduce((total, snap) => total + (snap.rows || []).length, 0);
}

function rowKeyOf(row) {
  if (!row) return "";
  return [row.host, row.pid, row.inst, row.wp, row.program, row.errorCode].map((v) => String(v ?? "")).join("|");
}

function scoreRow(row) {
  const severityBonus = row.class === "CRIT" ? 20 : row.class === "WARN" ? 8 : 0;
  const recurrenceBonus = Math.min((row.errorCount || 0) * 2, 12) + Math.min(row.programCount || 0, 8);
  const stateBonus = row.state === "R" ? 6 : 0;
  const multiFileBonus = Math.min((row.sourceFileCount || 1) - 1, 4) * 4;
  return row.rssGb * 3 + row.cpu * 2 + Math.log1p(row.ageMin) * 4 + severityBonus + recurrenceBonus + stateBonus + multiFileBonus;
}

function hostPressureScore(host) {
  return host.crit * 5 + host.warn * 2 + host.rss + host.cpu / 2 + Math.log1p(host.maxAge || 0) + (host.recurring || 0) * 2;
}

function wpImpactScore(row) {
  return (row.score || 0) + (row.rabax || 0) * 0.6 + (row.rxmsg || 0) * 0.8 + (row.anomalyScore || 0) * 0.7;
}

function buildRca(row) {
  const e = String(row.errorCode || "").toUpperCase();
  const p = String(row.program || "").toUpperCase();
  const reasons = [];
  const nextChecks = [];
  let category = "General WP investigation";
  let confidence = 42;

  if (e.includes("TIME_OUT") && row.ageMin >= 60) {
    category = "Long running / wait bottleneck";
    confidence = 82;
    reasons.push("Error TIME_OUT muncul bersamaan dengan AGE tinggi.");
    nextChecks.push("Cek lock / wait di SM50, SM66, ST12, atau DB monitor.");
  }
  if (e.includes("CALL_FUNCTION_SEND_ERR") || p.includes("RFC")) {
    category = "RFC / connectivity issue";
    confidence = Math.max(confidence, 78);
    reasons.push("Pola error mengarah ke remote call atau komunikasi antar system.");
    nextChecks.push("Validasi RFC destination, gateway, network path, dan timeout setting.");
  }
  if (e.includes("MESSAGE_TYPE_X")) {
    category = "ABAP short dump / fatal termination";
    confidence = Math.max(confidence, 86);
    reasons.push("MESSAGE_TYPE_X biasanya terkait short dump fatal di ABAP layer.");
    nextChecks.push("Prioritaskan ST22 dan lihat caller stack program terkait.");
  }
  if (e.includes("DDIC") || e.includes("TYPE_INCONSIST")) {
    category = "DDIC inconsistency";
    confidence = Math.max(confidence, 76);
    reasons.push("Pattern error menunjukkan mismatch dictionary / object definition.");
    nextChecks.push("Bandingkan transport terakhir, aktivasi object, dan consistency check DDIC.");
  }
  if (e.includes("DEADLOCK")) {
    category = "DB deadlock / contention";
    confidence = Math.max(confidence, 84);
    reasons.push("Terlihat indikasi deadlock atau contention antar session.");
    nextChecks.push("Cek lock monitor, expensive SQL, dan blocking session pada DB.");
  }
  if (e.includes("DUPLICATE_KEY")) {
    category = "Application duplicate / retry loop";
    confidence = Math.max(confidence, 74);
    reasons.push("Duplicate key sering terjadi pada retry loop atau idempotency yang buruk.");
    nextChecks.push("Review uniqueness rule, retry behaviour, dan payload upstream.");
  }
  if (row.rssGb >= 6) {
    confidence = Math.max(confidence, 68);
    reasons.push(`RSS tinggi (${row.rssGb.toFixed(2)}GB) menunjukkan memory pressure.`);
    nextChecks.push("Bandingkan memory growth per snapshot dan cek process yang retain memory.");
  }
  if (row.cpu >= 10 && row.state === "R") {
    confidence = Math.max(confidence, 66);
    reasons.push(`CPU ${row.cpu.toFixed(1)}% pada state Running menunjukkan active pressure.`);
    nextChecks.push("Telusuri expensive statement, loop, atau parallel process yang aktif.");
  }
  if (row.ageMin >= 240) {
    confidence = Math.max(confidence, 70);
    reasons.push(`AGE ${fmtAge(row.ageMin)} sudah melewati ambang normal untuk WP problematik.`);
  }
  if ((row.errorCount || 0) >= 3) {
    confidence = Math.max(confidence, 72);
    reasons.push(`Error ${row.errorCode || "Unknown"} muncul berulang (${row.errorCount}x).`);
  }
  if ((row.sourceFileCount || 1) > 1) {
    confidence = Math.max(confidence, 77);
    reasons.push(`Pattern yang sama muncul di ${row.sourceFileCount} file, indikasi recurring issue.`);
  }
  if ((row.anomalyScore || 0) >= 70) {
    confidence = Math.max(confidence, 79);
    reasons.push(`Anomaly score ${row.anomalyScore.toFixed(1)} menempatkan row ini sebagai outlier.`);
  }

  if (!reasons.length) {
    reasons.push("Belum ada signature dominan; perlu korelasi dengan dump, syslog, trace, dan job log.");
  }
  if (!nextChecks.length) {
    nextChecks.push("Cek ST22, SM21, SM50/SM66, SM37, dan trace dev_w* untuk validasi RCA.");
  }

  return {
    category,
    confidence: clamp(confidence, 35, 98),
    reasons,
    nextChecks,
    summary: reasons[0],
  };
}

function detectTimelinePattern(points = []) {
  if (!points.length) return "No trend";
  const first = points[0];
  const last = points[points.length - 1];
  const cpuDelta = (last.cpu || 0) - (first.cpu || 0);
  const rssDelta = (last.rssGb || 0) - (first.rssGb || 0);
  const ageDelta = (last.ageMin || 0) - (first.ageMin || 0);
  if (rssDelta >= 1.5 && ageDelta >= 60) return "RSS rising across snapshots";
  if (cpuDelta >= 5) return "CPU escalation across snapshots";
  if (Math.abs(cpuDelta) < 1 && Math.abs(rssDelta) < 0.3 && ageDelta >= 120) return "Stable but stuck / persistent";
  return "No strong trend";
}

function parseSingleLog(text, fileName = "") {
  const lines = String(text || "").replace(/\r/g, "").split("\n");
  const snapshots = [];
  let currentSnapshot = null;
  let currentHost = "";
  let currentSection = "";
  let currentSid = "";
  let inWpScout = false;

  const rowPattern =
    /^(\d+)\s+(\d+)\s+(\d+)\s+(\S+)\s+([\d.]+)\s+(\S+)\s+([\d.]+)\s+([RS])\s+(\S+)\s+(\d+)\s+(\d+)\s+(\d+)\s+(\d+)\s+(\S+)\s+(\S+)\s+(\S+)\s+(.*)$/;
  const rabaxRowPattern =
    /^(\d+)\s+(\d+)\s+(\d+)\s+(\S+)\s+(\d+)\s+(\d+)\s+(\d+)\s+(\d+)\s+(\S+)\s+(.*)$/;

  for (let i = 0; i < lines.length; i += 1) {
    const raw = lines[i];
    const line = raw.trim();
    if (!line) continue;

    const snapMatch = line.match(/^snapshot @ (.+)$/i);
    if (snapMatch) {
      if (currentSnapshot) snapshots.push(currentSnapshot);
      currentSnapshot = { timestamp: snapMatch[1], host: "", meta: {}, rows: [], sourceFile: fileName };
      currentHost = "";
      currentSection = "";
      currentSid = "";
      inWpScout = false;
      continue;
    }

    if (!currentSnapshot) continue;

    const hostMatch = line.match(/^Hostname\s*:\s*(.+)$/i);
    if (hostMatch) {
      currentHost = hostMatch[1].trim();
      currentSnapshot.host = currentHost;
      continue;
    }

    const cpuUsageMatch = line.match(/^-?\s*CPU usage\s*:\s*([\d.]+)% used,\s*([\d.]+)% idle/i);
    if (cpuUsageMatch) {
      currentSnapshot.meta.cpuUsed = toNumber(cpuUsageMatch[1]);
      currentSnapshot.meta.cpuIdle = toNumber(cpuUsageMatch[2]);
      continue;
    }

    const memMatch = line.match(/^-?\s*Memory\s*:\s*used\s+([\d.]+G)\s+\(([\d.]+)%\),\s+free\s+([\d.]+G)\s+\/\s+([\d.]+G)/i);
    if (memMatch) {
      currentSnapshot.meta.memUsedGb = parseMemoryToGb(memMatch[1]);
      currentSnapshot.meta.memPct = toNumber(memMatch[2]);
      currentSnapshot.meta.memFreeGb = parseMemoryToGb(memMatch[3]);
      currentSnapshot.meta.memTotalGb = parseMemoryToGb(memMatch[4]);
      continue;
    }

    if (line.startsWith("## WP-SCOUT @")) {
      inWpScout = true;
      currentSection = "";
      currentSid = line.match(/\bSID=(\S+)/)?.[1] || currentSid;
      continue;
    }

    if (!inWpScout) continue;

    if (line === SECTION_CPU || line === SECTION_RSS || line === SECTION_AGE) {
      currentSection = line;
      continue;
    }

    if (line.startsWith(SECTION_RABAX)) {
      currentSection = SECTION_RABAX;
      continue;
    }

    if (line.startsWith("Description") || line.startsWith("PID")) continue;

    if (currentSection === SECTION_RABAX) {
      const rm = raw.match(rabaxRowPattern);
      if (!rm) continue;

      const rest = rm[10] || "";
      let restNoLog = rest;
      let logPath = "";
      const lastSpace = rest.lastIndexOf(" /usr/");
      if (lastSpace >= 0) {
        restNoLog = rest.slice(0, lastSpace).trim();
        logPath = rest.slice(lastSpace + 1).trim();
      } else {
        const parts = rest.trim().split(/\s+/);
        if (parts[parts.length - 1]?.startsWith("/")) {
          logPath = parts.pop();
          restNoLog = parts.join(" ");
        }
      }

      const tailTokens = restNoLog.trim().split(/\s+/).filter(Boolean);
      const jobName = tailTokens.length >= 1 ? tailTokens[tailTokens.length - 1] : "?";
      const errorCode = tailTokens.length >= 2 ? tailTokens[tailTokens.length - 2] : "?";
      const program = tailTokens.length >= 3 ? tailTokens.slice(0, -2).join(" ") : restNoLog.trim() || "?";

      currentSnapshot.rows.push({
        sourceFile: fileName,
        snapshotTs: currentSnapshot.timestamp,
        host: currentHost || currentSnapshot.host || "UNKNOWN",
        section: currentSection,
        pid: rm[1],
        inst: rm[2],
        wp: rm[3],
        wpType: rm[4],
        cpu: 0,
        memGb: 0,
        rssGb: 0,
        state: "S",
        ageRaw: "-",
        ageMin: 0,
        rabax: toNumber(rm[5]),
        sxpg: toNumber(rm[6]),
        rxmsg: toNumber(rm[7]),
        jobCount: toNumber(rm[8]),
        class: rm[9],
        sid: currentSid || "?",
        sidType: rm[4],
        program,
        errorCode,
        jobName,
        logPath,
      });
      continue;
    }

    const m = raw.match(rowPattern);
    if (!m || !currentSection) continue;

    const rest = m[17] || "";
    let restNoLog = rest;
    let logPath = "";
    const lastSpace = rest.lastIndexOf(" /usr/");
    if (lastSpace >= 0) {
      restNoLog = rest.slice(0, lastSpace).trim();
      logPath = rest.slice(lastSpace + 1).trim();
    } else {
      const parts = rest.trim().split(/\s+/);
      if (parts[parts.length - 1]?.startsWith("/")) {
        logPath = parts.pop();
        restNoLog = parts.join(" ");
      }
    }

    const tailTokens = restNoLog.trim().split(/\s+/).filter(Boolean);
    const jobName = tailTokens.length >= 1 ? tailTokens[tailTokens.length - 1] : "?";
    const errorCode = tailTokens.length >= 2 ? tailTokens[tailTokens.length - 2] : "?";
    const program = tailTokens.length >= 3 ? tailTokens.slice(0, -2).join(" ") : restNoLog.trim() || "?";

    currentSnapshot.rows.push({
      sourceFile: fileName,
      snapshotTs: currentSnapshot.timestamp,
      host: currentHost || currentSnapshot.host || "UNKNOWN",
      section: currentSection,
      pid: m[1],
      inst: m[2],
      wp: m[3],
      wpType: m[4],
      cpu: toNumber(m[5]),
      memGb: parseMemoryToGb(m[6]),
      rssGb: toNumber(m[7]),
      state: m[8],
      ageRaw: m[9],
      ageMin: parseAgeToMinutes(m[9]),
      rabax: toNumber(m[10]),
      sxpg: toNumber(m[11]),
      jobCount: toNumber(m[12]),
      rxmsg: toNumber(m[13]),
      class: m[14],
      sid: m[15],
      sidType: m[16],
      program,
      errorCode,
      jobName,
      logPath,
    });
  }

  if (currentSnapshot) snapshots.push(currentSnapshot);
  return { fileName, snapshots };
}

function buildDataset(fileEntries = []) {
  const allSnapshots = [];
  const merged = new Map();

  fileEntries.forEach(({ fileName, text }) => {
    const parsed = parseSingleLog(text, fileName);
    parsed.snapshots.forEach((snap) => {
      allSnapshots.push(snap);
      snap.rows.forEach((row) => {
        const key = `${row.host}|${row.pid}|${row.inst}|${row.wp}|${row.program}|${row.errorCode}`;
        const existing = merged.get(key);
        if (!existing) {
          merged.set(key, {
            ...row,
            sections: [row.section],
            sourceFiles: [row.sourceFile],
            snapshotTs: snap.timestamp,
            firstSeen: snap.timestamp,
            lastSeen: snap.timestamp,
            hostMeta: snap.meta,
            timeline: [{ ts: snap.timestamp, cpu: row.cpu, rssGb: row.rssGb, ageMin: row.ageMin, state: row.state, sourceFile: row.sourceFile }],
          });
        } else {
          existing.cpu = Math.max(existing.cpu, row.cpu);
          existing.rssGb = Math.max(existing.rssGb, row.rssGb);
          existing.memGb = Math.max(existing.memGb, row.memGb);
          existing.rabax = Math.max(existing.rabax, row.rabax);
          existing.sxpg = Math.max(existing.sxpg, row.sxpg);
          existing.jobCount = Math.max(existing.jobCount, row.jobCount);
          existing.rxmsg = Math.max(existing.rxmsg, row.rxmsg);
          if (row.ageMin > existing.ageMin) {
            existing.ageMin = row.ageMin;
            existing.ageRaw = row.ageRaw;
          }
          if (!existing.sections.includes(row.section)) existing.sections.push(row.section);
          if (!existing.sourceFiles.includes(row.sourceFile)) existing.sourceFiles.push(row.sourceFile);
          if (existing.class !== "CRIT" && row.class === "CRIT") existing.class = row.class;
          if (existing.class === "OK" && row.class === "WARN") existing.class = row.class;
          existing.lastSeen = snap.timestamp;
          existing.timeline.push({ ts: snap.timestamp, cpu: row.cpu, rssGb: row.rssGb, ageMin: row.ageMin, state: row.state, sourceFile: row.sourceFile });
        }
      });
    });
  });

  const rows = [...merged.values()];
  const errorCounts = {};
  const programCounts = {};
  const correlationMap = {};

  rows.forEach((r) => {
    const e = r.errorCode && r.errorCode !== "?" ? r.errorCode : "Unknown";
    const p = r.program && r.program !== "?" ? r.program : "Unknown";
    const c = `${r.host}|${p}|${e}`;
    errorCounts[e] = (errorCounts[e] || 0) + 1;
    programCounts[p] = (programCounts[p] || 0) + 1;
    correlationMap[c] = (correlationMap[c] || 0) + 1;
  });

  const cpuValues = rows.map((r) => r.cpu);
  const rssValues = rows.map((r) => r.rssGb);
  const ageValues = rows.map((r) => r.ageMin);
  const cpuAvg = mean(cpuValues);
  const rssAvg = mean(rssValues);
  const ageAvg = mean(ageValues);
  const cpuStd = stddev(cpuValues) || 1;
  const rssStd = stddev(rssValues) || 1;
  const ageStd = stddev(ageValues) || 1;

  rows.forEach((r) => {
    r.errorCount = errorCounts[r.errorCode] || errorCounts.Unknown || 0;
    r.programCount = programCounts[r.program] || programCounts.Unknown || 0;
    r.correlationCount = correlationMap[`${r.host}|${r.program && r.program !== "?" ? r.program : "Unknown"}|${r.errorCode && r.errorCode !== "?" ? r.errorCode : "Unknown"}`] || 0;
    r.sourceFileCount = (r.sourceFiles || []).length;
    r.timeline = (r.timeline || []).sort((a, b) => String(a.ts).localeCompare(String(b.ts)) || String(a.sourceFile).localeCompare(String(b.sourceFile)));
    r.timelinePattern = detectTimelinePattern(r.timeline);
    const cpuZ = Math.max(0, (r.cpu - cpuAvg) / cpuStd);
    const rssZ = Math.max(0, (r.rssGb - rssAvg) / rssStd);
    const ageZ = Math.max(0, (r.ageMin - ageAvg) / ageStd);
    const severityBoost = r.class === "CRIT" ? 12 : r.class === "WARN" ? 5 : 0;
    const recurringBoost = Math.min(Math.max(r.sourceFileCount - 1, 0) * 8 + Math.max(r.correlationCount - 1, 0) * 4, 22);
    r.anomalyScore = clamp(cpuZ * 16 + rssZ * 18 + ageZ * 14 + severityBoost + recurringBoost, 0, 100);
    r.anomalyLevel = r.anomalyScore >= 75 ? "HIGH" : r.anomalyScore >= 45 ? "MED" : "LOW";
    r.score = scoreRow(r);
    r.rca = buildRca(r);
    r.rootCauseGuess = r.rca.summary;
    r.impactScore = wpImpactScore(r);
  });

  const files = fileEntries.map((f) => f.fileName);
  return { files, snapshots: allSnapshots, rows };
}

function buildCorrelation(rows = []) {
  const map = {};
  rows.forEach((row) => {
    const key = `${row.program || "Unknown"}|${row.errorCode || "Unknown"}|${row.host || "Unknown"}`;
    if (!map[key]) {
      map[key] = {
        label: `${row.program || "Unknown"} • ${row.errorCode || "Unknown"}`,
        host: row.host,
        program: row.program,
        errorCode: row.errorCode,
        count: 0,
        files: new Set(),
        maxImpact: 0,
        maxAnomaly: 0,
      };
    }
    map[key].count += 1;
    (row.sourceFiles || []).forEach((f) => map[key].files.add(f));
    map[key].maxImpact = Math.max(map[key].maxImpact, row.impactScore || 0);
    map[key].maxAnomaly = Math.max(map[key].maxAnomaly, row.anomalyScore || 0);
  });
  return Object.values(map)
    .map((item) => ({ ...item, fileCount: item.files.size }))
    .sort((a, b) => b.fileCount - a.fileCount || b.count - a.count || b.maxImpact - a.maxImpact)
    .slice(0, 10);
}

function downloadText(filename, content) {
  const blob = new Blob([content], { type: "text/plain;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(url);
}

function Chip({ children, tone = "neutral" }) {
  return <span className={`rcaChip rcaChip--${tone}`}>{children}</span>;
}

function SimpleBars({ items, valueKey = "value", labelKey = "label", formatter = (v) => v }) {
  const maxVal = Math.max(1, ...items.map((it) => Number(it[valueKey] || 0)));
  return (
    <div className="rcaBarList">
      {items.map((item) => {
        const value = Number(item[valueKey] || 0);
        const width = Math.max(2, Math.round((value / maxVal) * 100));
        return (
          <div className="rcaBarItem" key={`${item[labelKey]}-${value}`}>
            <div className="rcaBarTop">
              <span className="rcaBarLabel" title={item[labelKey]}>{item[labelKey]}</span>
              <span className="rcaBarValue">{formatter(value)}</span>
            </div>
            <div className="rcaBarTrack"><div className="rcaBarFill" style={{ width: `${width}%` }} /></div>
          </div>
        );
      })}
    </div>
  );
}

function TimelineStrip({ points = [] }) {
  if (!points.length) return <div className="rcaEmpty">Tidak ada timeline untuk row ini.</div>;
  const maxCpu = Math.max(1, ...points.map((p) => p.cpu || 0));
  return (
    <div className="rcaTimeline">
      {points.map((p, idx) => {
        const h = Math.max(10, Math.round(((p.cpu || 0) / maxCpu) * 46));
        return (
          <div className="rcaTimelineItem" key={`${p.ts}-${p.sourceFile || ""}-${idx}`}>
            <div className="rcaTimelineBarWrap"><div className="rcaTimelineBar" style={{ height: `${h}px` }} /></div>
            <div className="rcaTimelineTs" title={p.ts}>{String(p.ts).split(" ").pop()}</div>
            <div className="rcaTimelineMeta">{(p.cpu || 0).toFixed(1)}%</div>
          </div>
        );
      })}
    </div>
  );
}

function CpuTrend({ points = [] }) {
  if (!points.length) return <div className="rcaEmpty">Tidak ada trend.</div>;
  const maxCpu = Math.max(1, ...points.map((p) => p.cpu || 0));
  return (
    <div className="rcaCpuTrend">
      {points.map((p, idx) => (
        <div className="rcaCpuTrendItem" key={`${p.ts}-${p.sourceFile || ""}-${idx}`}>
          <div className="rcaCpuTrendLabel">{String(p.ts).split(" ").pop()}</div>
          <div className="rcaCpuTrendTrack"><div className="rcaCpuTrendFill" style={{ width: `${Math.max(2, ((p.cpu || 0) / maxCpu) * 100)}%` }} /></div>
          <div className="rcaCpuTrendValue">{(p.cpu || 0).toFixed(1)}%</div>
        </div>
      ))}
    </div>
  );
}

function EvidenceList({ row }) {
  if (!row) return null;
  const items = [
    `Category: ${row.rca?.category || "General"}`,
    `Confidence: ${(row.rca?.confidence || 0).toFixed(0)}%`,
    `Anomaly: ${row.anomalyLevel} (${row.anomalyScore.toFixed(1)})`,
    `Trend: ${row.timelinePattern}`,
  ];
  return (
    <div className="rcaEvidenceList">
      {items.slice(0, 3).map((item) => <div key={item} className="rcaEvidenceItem">{item}</div>)}
    </div>
  );
}

const RCA_ROW_HEIGHT = 38;

function useElementHeight(ref) {
  const [height, setHeight] = useState(0);

  useEffect(() => {
    const node = ref.current;
    if (!node) return undefined;

    const update = () => setHeight(node.clientHeight || 0);
    update();

    if (typeof ResizeObserver === "undefined") {
      window.addEventListener("resize", update);
      return () => window.removeEventListener("resize", update);
    }

    const ro = new ResizeObserver(update);
    ro.observe(node);
    return () => ro.disconnect();
  }, [ref]);

  return height;
}

function VirtualWpTable({ rows, selectedKey, pinnedKey, onSelect, onPin, emptyMessage, viewportRef }) {
  const localRef = useRef(null);
  const ref = viewportRef || localRef;
  const height = useElementHeight(ref);
  const [scrollTop, setScrollTop] = useState(0);
  const rafRef = useRef(0);
  const total = rows.length;
  const overscan = 12;
  const visibleCount = Math.max(1, Math.ceil((height || 1) / RCA_ROW_HEIGHT));
  const start = Math.max(0, Math.min(Math.floor(scrollTop / RCA_ROW_HEIGHT) - overscan, Math.max(0, total - 1)));
  const end = Math.min(total, start + visibleCount + overscan * 2);
  const slice = rows.slice(start, end);

  const onScroll = (event) => {
    const next = event.currentTarget.scrollTop;
    if (rafRef.current) cancelAnimationFrame(rafRef.current);
    rafRef.current = requestAnimationFrame(() => setScrollTop(next));
  };

  useEffect(() => () => {
    if (rafRef.current) cancelAnimationFrame(rafRef.current);
  }, []);

  return (
    <div className="rcaVirtualTable">
      <div className="rcaVirtualHead">
        <div>File(s)</div><div>Host</div><div>PID</div><div>WP</div><div>Type</div><div>State</div><div>Class</div><div>Anomaly</div><div>CPU</div><div>RSS</div><div>AGE</div><div>Impact</div><div>Program</div><div>Error</div><div>Job</div><div>Trend</div>
      </div>
      <div className="rcaVirtualViewport" ref={ref} onScroll={onScroll}>
        <div className="rcaVirtualSpacer" style={{ height: total * RCA_ROW_HEIGHT }} />
        <div className="rcaVirtualSlice" style={{ transform: `translateY(${start * RCA_ROW_HEIGHT}px)` }}>
          {slice.map((row) => {
            const rowKey = rowKeyOf(row);
            const active = selectedKey && rowKey === selectedKey;
            return (
              <button
                type="button"
                key={rowKey}
                className={`rcaVirtualRow ${active ? "is-active" : ""} ${pinnedKey === rowKey ? "is-pinned" : ""} ${classifyRow(row).join(" ")}`}
                style={{ height: RCA_ROW_HEIGHT }}
                onClick={() => onSelect(rowKey)}
                onDoubleClick={() => onPin(rowKey)}
              >
                <span title={(row.sourceFiles || []).join(", ")}>{(row.sourceFiles || []).join(", ")}</span>
                <span>{row.host}</span>
                <span>{row.pid}</span>
                <span>{row.wp}</span>
                <span>{row.wpType}</span>
                <span><Chip>{row.state}</Chip></span>
                <span><Chip tone={row.class === "CRIT" ? "crit" : row.class === "WARN" ? "warn" : "ok"}>{row.class}</Chip></span>
                <span><Chip tone={row.anomalyLevel === "HIGH" ? "crit" : row.anomalyLevel === "MED" ? "warn" : "ok"}>{row.anomalyLevel}</Chip></span>
                <span className={row.cpu >= 10 ? "metric-hot" : row.cpu >= 6 ? "metric-warm" : ""}>{row.cpu.toFixed(1)}%</span>
                <span className={row.rssGb >= 6 ? "metric-hot" : row.rssGb >= 4 ? "metric-warm" : ""}>{row.rssGb.toFixed(2)}GB</span>
                <span className={row.ageMin >= 240 ? "metric-hot" : row.ageMin >= 120 ? "metric-warm" : ""}>{fmtAge(row.ageMin)}</span>
                <span className={row.impactScore >= 160 ? "metric-hot" : row.impactScore >= 100 ? "metric-warm" : ""}>{row.impactScore.toFixed(1)}</span>
                <span title={row.program}>{row.program}</span>
                <span title={row.errorCode}>{row.errorCode}</span>
                <span title={row.jobName}>{row.jobName}</span>
                <span title={row.timelinePattern}>{row.timelinePattern}</span>
              </button>
            );
          })}
          {!total ? <div className="rcaVirtualEmpty">{emptyMessage || "Belum ada data atau filter terlalu ketat."}</div> : null}
        </div>
      </div>
    </div>
  );
}


function ToolLogsQuickDock({ hasData, onTop, onJump, onReset, onToggleHelp }) {
  const items = hasData
    ? [
        ['summary', 'Summary'],
        ['filters', 'Filters'],
        ['workspace', 'Table'],
        ['detail', 'RCA'],
        ['export', 'Export'],
      ]
    : [['intake', 'Intake']];

  return (
    <nav className="toolLogsQuickDock" aria-label="Quick navigation">
      {items.map(([id, label]) => (
        <button key={id} type="button" onClick={() => onJump(id)}>{label}</button>
      ))}
      {hasData ? <button type="button" onClick={onReset}>Reset</button> : null}
      <button type="button" onClick={onToggleHelp}>?</button>
      <button type="button" onClick={onTop}>Top</button>
    </nav>
  );
}

export default function ToolLogs() {
  const [fileNames, setFileNames] = useState([]);
  const [rawTexts, setRawTexts] = useState([]);
  const [data, setData] = useState({ files: [], snapshots: [], rows: [] });
  const [selectedHost, setSelectedHost] = useState("ALL");
  const [selectedClass, setSelectedClass] = useState("ALL");
  const [selectedState, setSelectedState] = useState("ALL");
  const [selectedFile, setSelectedFile] = useState("ALL");
  const [selectedAnomaly, setSelectedAnomaly] = useState("ALL");
  const [minRss, setMinRss] = useState("");
  const [minAge, setMinAge] = useState("");
  const [search, setSearch] = useState("");
  const [selectedKey, setSelectedKey] = useState("");
  const [centerTab, setCenterTab] = useState("table");
  const [rightTab, setRightTab] = useState("rca");
  const [showAdvancedFilters, setShowAdvancedFilters] = useState(false);
  const [programContains, setProgramContains] = useState("");
  const [errorContains, setErrorContains] = useState("");
  const [showMoreEvidence, setShowMoreEvidence] = useState(false);
  const [showMorePreview, setShowMorePreview] = useState(false);
  const [suspiciousOnly, setSuspiciousOnly] = useState(false);
  const [topOffendersOnly, setTopOffendersOnly] = useState(false);
  const [densityMode, setDensityMode] = useState("OPS");
  const [collapsedSections, setCollapsedSections] = useState({ identity: true, explain: false, evidence: true, actions: true, export: true });
  const [presetMode, setPresetMode] = useState('ALL');
  const [pinnedKey, setPinnedKey] = useState('');
  const [showShortcutHelp, setShowShortcutHelp] = useState(false);
  const [leftCollapsed, setLeftCollapsed] = useState(false);
  const [rightCollapsed, setRightCollapsed] = useState(false);
  const searchRef = useRef(null);
  const tableViewportRef = useRef(null);
  const deferredSearch = React.useDeferredValue(search);
  const deferredProgramContains = React.useDeferredValue(programContains);
  const deferredErrorContains = React.useDeferredValue(errorContains);
  const deferredViewRows = React.useDeferredValue(data.rows);
  const [uploadStatus, setUploadStatus] = useState("");

  function scrollToToolSection(id) {
    const node = document.getElementById(`toolLogs-${id}`);
    if (node) {
      node.scrollIntoView({ behavior: 'smooth', block: 'start' });
    }
  }

  function scrollToTop() {
    window.scrollTo({ top: 0, behavior: 'smooth' });
  }


  function applyEntries(entries) {
    setFileNames(entries.map((e) => e.fileName));
    setRawTexts(entries.map((e) => e.text));
    const parsed = buildDataset(entries);
    setData(parsed);
    setShowMoreEvidence(false);
    setShowMorePreview(false);
    setPresetMode('ALL');
    setPinnedKey('');
    setSuspiciousOnly(false);
    setTopOffendersOnly(false);
    setCollapsedSections({ identity: true, explain: false, evidence: true, actions: true, export: true });
    const first = [...parsed.rows].sort((a, b) => b.impactScore - a.impactScore)[0];
    setSelectedKey(first ? rowKeyOf(first) : "");
    setUploadStatus(`Loaded ${entries.length} file(s), ${parsed.rows.length} merged rows`);
  }

  function onUpload(event) {
    const files = [...(event.target.files || [])];
    if (!files.length) return;

    setUploadStatus(`Reading 0/${files.length}`);
    (async () => {
      const entries = [];
      for (let i = 0; i < files.length; i += 1) {
        const file = files[i];
        setUploadStatus(`Reading ${i + 1}/${files.length}: ${file.name}`);
        entries.push({ fileName: file.name, text: await file.text() });
        await new Promise((resolve) => setTimeout(resolve, 0));
      }
      setUploadStatus("Parsing logs...");
      applyEntries(entries);
    })();
  }

  async function loadSampleData() {
    const url = `${import.meta.env.BASE_URL}sample-data-logs/sample-wp-scout-critical.log`;
    const res = await fetch(url);
    if (!res.ok) throw new Error(`Sample load failed: ${res.status}`);
    const text = await res.text();
    applyEntries([{ fileName: "sample-wp-scout-critical.log", text }]);
  }

  function toggleSection(section) {
    setCollapsedSections((prev) => ({ ...prev, [section]: !prev[section] }));
  }

  function resetFilters() {
    setSelectedHost("ALL");
    setSelectedClass("ALL");
    setSelectedState("ALL");
    setSelectedFile("ALL");
    setSelectedAnomaly("ALL");
    setMinRss("");
    setMinAge("");
    setSearch("");
    setProgramContains("");
    setErrorContains("");
    setSuspiciousOnly(false);
    setTopOffendersOnly(false);
    setPresetMode("ALL");
    setPinnedKey("");
    setShowAdvancedFilters(false);
    setCenterTab("table");
    setRightTab("rca");
  }

  const view = useMemo(() => {
    const rows = deferredViewRows || [];
    let filtered = rows.filter((r) => {
      if (selectedHost !== "ALL" && r.host !== selectedHost) return false;
      if (selectedClass !== "ALL" && r.class !== selectedClass) return false;
      if (selectedState !== "ALL" && r.state !== selectedState) return false;
      if (selectedFile !== "ALL" && !(r.sourceFiles || []).includes(selectedFile)) return false;
      if (selectedAnomaly !== "ALL" && r.anomalyLevel !== selectedAnomaly) return false;
      if (minRss !== "" && r.rssGb < Number(minRss)) return false;
      if (minAge !== "" && r.ageMin < Number(minAge)) return false;
      if (deferredProgramContains.trim() && !String(r.program || "").toLowerCase().includes(deferredProgramContains.trim().toLowerCase())) return false;
      if (deferredErrorContains.trim() && !String(r.errorCode || "").toLowerCase().includes(deferredErrorContains.trim().toLowerCase())) return false;
      if (deferredSearch.trim()) {
        const q = deferredSearch.trim().toLowerCase();
        const bag = [r.host, r.wp, r.pid, r.wpType, r.program, r.errorCode, r.jobName, r.logPath, r.class, r.state, ...(r.sourceFiles || [])].join(" ").toLowerCase();
        if (!bag.includes(q)) return false;
      }
      if (suspiciousOnly && !((r.anomalyLevel === "HIGH") || r.class === "CRIT" || r.impactScore >= 120)) return false;
      if (presetMode === "CRITICAL" && !(r.class === "CRIT" || r.impactScore >= 160)) return false;
      if (presetMode === "MEMORY" && r.rssGb < 4) return false;
      if (presetMode === "RECURRING" && !((r.sourceFileCount || 1) > 1 || (r.errorCount || 0) >= 3)) return false;
      if (presetMode === "LONG" && r.ageMin < 120) return false;
      return true;
    });

    const hosts = [...new Set(rows.map((r) => r.host))].sort();
    const summary = {
      files: data.files.length,
      snapshots: data.snapshots.length,
      hosts: hosts.length,
      rows: filtered.length,
      totalRows: rows.length,
      topCpu: filtered.length ? Math.max(...filtered.map((r) => r.cpu)) : 0,
      topRss: filtered.length ? Math.max(...filtered.map((r) => r.rssGb)) : 0,
      topAge: filtered.length ? Math.max(...filtered.map((r) => r.ageMin)) : 0,
      crit: filtered.filter((r) => r.class === "CRIT").length,
      warn: filtered.filter((r) => r.class === "WARN").length,
      anomalyHigh: filtered.filter((r) => r.anomalyLevel === "HIGH").length,
    };

    const byHostMap = {};
    filtered.forEach((r) => {
      if (!byHostMap[r.host]) byHostMap[r.host] = { label: r.host, crit: 0, warn: 0, ok: 0, rss: 0, cpu: 0, count: 0, maxAge: 0, recurring: 0, anomalyHigh: 0, topError: "-", topProgram: "-", _errors: {}, _programs: {} };
      byHostMap[r.host].count += 1;
      byHostMap[r.host].rss = Math.max(byHostMap[r.host].rss, r.rssGb);
      byHostMap[r.host].cpu = Math.max(byHostMap[r.host].cpu, r.cpu);
      byHostMap[r.host].maxAge = Math.max(byHostMap[r.host].maxAge, r.ageMin);
      byHostMap[r.host].recurring += Math.max(0, (r.sourceFileCount || 1) - 1);
      if (r.anomalyLevel === "HIGH") byHostMap[r.host].anomalyHigh += 1;
      const errKey = r.errorCode && r.errorCode !== "?" ? r.errorCode : "Unknown";
      const progKey = r.program && r.program !== "?" ? r.program : "Unknown";
      byHostMap[r.host]._errors[errKey] = (byHostMap[r.host]._errors[errKey] || 0) + 1;
      byHostMap[r.host]._programs[progKey] = (byHostMap[r.host]._programs[progKey] || 0) + 1;
      if (r.class === "CRIT") byHostMap[r.host].crit += 1;
      else if (r.class === "WARN") byHostMap[r.host].warn += 1;
      else byHostMap[r.host].ok += 1;
    });

    const hostStats = Object.values(byHostMap).map((h) => {
      const topError = Object.entries(h._errors).sort((a, b) => b[1] - a[1])[0]?.[0] || "-";
      const topProgram = Object.entries(h._programs).sort((a, b) => b[1] - a[1])[0]?.[0] || "-";
      return { ...h, topError, topProgram, score: hostPressureScore(h) };
    }).sort((a, b) => b.score - a.score || b.rss - a.rss);

    const makeTop = (getter) => Object.entries(filtered.reduce((acc, r) => {
      const key = getter(r) || "Unknown";
      acc[key] = (acc[key] || 0) + 1;
      return acc;
    }, {})).map(([label, value]) => ({ label, value })).sort((a, b) => b.value - a.value).slice(0, 8);

    const topErrors = makeTop((r) => (r.errorCode && r.errorCode !== "?" ? r.errorCode : "Unknown"));
    const topPrograms = makeTop((r) => (r.program && r.program !== "?" ? r.program : "Unknown"));
    const stateDistribution = makeTop((r) => r.state || "Unknown");
    const anomalyDistribution = ["HIGH", "MED", "LOW"].map((level) => ({ label: level, value: filtered.filter((r) => r.anomalyLevel === level).length }));
    const memoryPressure = [
      { label: "> 4GB", value: filtered.filter((r) => r.rssGb >= 4).length },
      { label: "> 6GB", value: filtered.filter((r) => r.rssGb >= 6).length },
      { label: "> 8GB", value: filtered.filter((r) => r.rssGb >= 8).length },
    ];

    const programHeatmap = topPrograms.map((p) => ({ label: p.label, value: p.value, weight: Math.min(100, p.value * 12) }));
    const suspects = [...filtered].sort((a, b) => b.score - a.score).slice(0, 8);
    const topImpact = [...filtered].sort((a, b) => b.impactScore - a.impactScore).slice(0, 8);
    const topAnomaly = [...filtered].sort((a, b) => b.anomalyScore - a.anomalyScore).slice(0, 8);
    if (topOffendersOnly) {
      const keep = new Set([...topImpact, ...topAnomaly, ...suspects].map((r) => rowKeyOf(r)));
      filtered = filtered.filter((r) => keep.has(rowKeyOf(r)));
    }
    const filteredKeys = new Set(filtered.map((r) => rowKeyOf(r)));
    const pinned = filtered.find((r) => rowKeyOf(r) === pinnedKey) || null;
    const selected = pinned || filtered.find((r) => rowKeyOf(r) === selectedKey) || topImpact[0] || null;
    const correlations = buildCorrelation(filtered);
    const keyboardHint = ['/ focus search', '↑ ↓ select row', 'Enter RCA tab', 'E export tab', 'P pin row', '? shortcut help'];
    const emptyMessage = emptyStateMessage(rawTexts, filtered, rows);

    return { rows, filtered, filteredKeys, hosts, summary, hostStats, topErrors, topPrograms, stateDistribution, memoryPressure, suspects, selected, topImpact, programHeatmap, anomalyDistribution, topAnomaly, correlations, keyboardHint, emptyMessage };
  }, [data.files.length, data.snapshots.length, deferredViewRows, rawTexts, selectedHost, selectedClass, selectedState, selectedFile, selectedAnomaly, minRss, minAge, deferredSearch, deferredProgramContains, deferredErrorContains, selectedKey, pinnedKey, presetMode, suspiciousOnly, topOffendersOnly]);

  const snapshotRange = useMemo(() => {
    if (!data.snapshots.length) return "-";
    const sorted = [...data.snapshots].sort((a, b) => String(a.timestamp).localeCompare(String(b.timestamp)));
    const first = sorted[0]?.timestamp || "-";
    const last = sorted[sorted.length - 1]?.timestamp || "-";
    return first === last ? first : `${first} — ${last}`;
  }, [data.snapshots]);

  useEffect(() => {
    if (!view.selected) return;
    const key = rowKeyOf(view.selected);
    const idx = view.filtered.findIndex((row) => rowKeyOf(row) === key);
    const node = tableViewportRef.current;
    if (idx >= 0 && node) {
      const target = idx * RCA_ROW_HEIGHT;
      const pad = RCA_ROW_HEIGHT * 3;
      if (target < node.scrollTop + pad || target > node.scrollTop + node.clientHeight - pad) {
        node.scrollTop = Math.max(0, target - node.clientHeight * 0.32);
      }
    }
  }, [view.selected, view.filtered]);

  useEffect(() => {
    const handler = (event) => {
      const tag = event.target?.tagName;
      const typing = tag === 'INPUT' || tag === 'TEXTAREA' || event.target?.isContentEditable;
      if (event.altKey && !typing) {
        const map = { '1': 'summary', '2': 'filters', '3': 'workspace', '4': 'detail', '5': 'export', t: 'top', T: 'top' };
        const target = map[event.key];
        if (target) {
          event.preventDefault();
          target === 'top' ? scrollToTop() : scrollToToolSection(target);
          return;
        }
      }
      if (event.key === '/' && !typing) {
        event.preventDefault();
        searchRef.current?.focus();
        return;
      }
      if (!view.filtered.length) return;
      const currentIndex = Math.max(0, view.filtered.findIndex((r) => rowKeyOf(r) === selectedKey));
      if ((event.key === 'ArrowDown' || event.key === 'ArrowUp') && !typing) {
        event.preventDefault();
        const nextIndex = event.key === 'ArrowDown' ? Math.min(view.filtered.length - 1, currentIndex + 1) : Math.max(0, currentIndex - 1);
        const row = view.filtered[nextIndex];
        if (row) setSelectedKey(rowKeyOf(row));
      }
      if (event.key === 'Enter' && !typing) setRightTab('rca');
      if ((event.key === 'e' || event.key === 'E') && !typing) setRightTab('export');
      if ((event.key === 'p' || event.key === 'P') && !typing && view.selected) {
        const key = rowKeyOf(view.selected);
        setPinnedKey((curr) => curr === key ? '' : key);
      }
      if (event.key === '?' && !typing) setShowShortcutHelp(true);
      if (event.key === 'Escape' && !typing) {
        setShowShortcutHelp(false);
        setPinnedKey('');
      }
    };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, [view.filtered, view.selected, selectedKey]);



  const activeFilterCount = useMemo(() => {
    let count = 0;
    if (selectedHost !== "ALL") count += 1;
    if (selectedClass !== "ALL") count += 1;
    if (selectedState !== "ALL") count += 1;
    if (selectedFile !== "ALL") count += 1;
    if (selectedAnomaly !== "ALL") count += 1;
    if (minRss !== "") count += 1;
    if (minAge !== "") count += 1;
    if (search.trim()) count += 1;
    if (programContains.trim()) count += 1;
    if (errorContains.trim()) count += 1;
    if (suspiciousOnly) count += 1;
    if (topOffendersOnly) count += 1;
    if (presetMode !== "ALL") count += 1;
    return count;
  }, [selectedHost, selectedClass, selectedState, selectedFile, selectedAnomaly, minRss, minAge, search, programContains, errorContains, suspiciousOnly, topOffendersOnly, presetMode]);

  const rcaNote = useMemo(() => {
    const s = view.selected;
    if (!s) return "";
    return [
      "# Incident RCA Draft",
      "",
      `- Host: ${s.host}`,
      `- Program: ${s.program || "-"}`,
      `- Error: ${s.errorCode || "-"}`,
      `- WP/PID: ${s.wp} / ${s.pid}`,
      `- Severity: ${s.class}`,
      `- Impact score: ${s.impactScore.toFixed(1)}`,
      `- Anomaly score: ${s.anomalyScore.toFixed(1)} (${s.anomalyLevel})`,
      `- Correlated file count: ${s.sourceFileCount}`,
      `- Timeline pattern: ${s.timelinePattern}`,
      "",
      "## Likely RCA",
      `- Category: ${s.rca?.category || "General"}`,
      `- Confidence: ${(s.rca?.confidence || 0).toFixed(0)}%`,
      ...(s.rca?.reasons || []).map((r) => `- ${r}`),
      "",
      "## Evidence",
      `- CPU ${s.cpu.toFixed(1)}% | RSS ${s.rssGb.toFixed(2)}GB | AGE ${fmtAge(s.ageMin)} | STATE ${s.state}`,
      `- RABAX ${s.rabax} | RXMSG ${s.rxmsg} | Job ${s.jobName || "-"}`,
      `- Files: ${(s.sourceFiles || []).join(", ") || "-"}`,
      `- Log path: ${s.logPath || "-"}`,
      "",
      "## Suggested next checks",
      ...(s.rca?.nextChecks || []).map((r) => `- ${r}`),
    ].join("\n");
  }, [view.selected]);

  const postmortemMd = useMemo(() => {
    const top = view.topImpact.slice(0, 5);
    const corr = view.correlations.slice(0, 5);
    return [
      "# SAP WP RCA Postmortem Draft",
      "",
      `- Files analyzed: ${data.files.length}`,
      `- Snapshots: ${data.snapshots.length}`,
      `- Hosts: ${view.summary.hosts}`,
      `- CRIT/WARN: ${view.summary.crit} / ${view.summary.warn}`,
      `- High anomaly rows: ${view.summary.anomalyHigh}`,
      "",
      "## Top impact work processes",
      ...top.map((r, idx) => `${idx + 1}. ${r.host} | ${r.program || "-"} | ${r.errorCode || "-"} | impact ${r.impactScore.toFixed(1)} | anomaly ${r.anomalyScore.toFixed(1)}`),
      "",
      "## Cross-file recurring patterns",
      ...corr.map((r, idx) => `${idx + 1}. ${r.label} | host ${r.host} | files ${r.fileCount} | count ${r.count} | max anomaly ${r.maxAnomaly.toFixed(1)}`),
    ].join("\n");
  }, [data.files.length, data.snapshots.length, view]);

  const exportJson = useMemo(() => JSON.stringify({
    files: data.files,
    summary: view.summary,
    selected: view.selected,
    topImpact: view.topImpact,
    topAnomaly: view.topAnomaly,
    correlations: view.correlations,
    hostStats: view.hostStats,
    topErrors: view.topErrors,
    topPrograms: view.topPrograms,
  }, null, 2), [data.files, view]);

  const exportPreview = useMemo(() => {
    const blocks = [rcaNote, postmortemMd].filter(Boolean);
    if (!blocks.length) return "";
    return blocks.map((block) => String(block).split("\n").slice(0, 6).join("\n")).join("\n\n---\n\n");
  }, [rcaNote, postmortemMd]);

  if (!rawTexts.length) {
    return (
      <section className={`toolLogsPage toolLogsPage--rca toolLogsPage--empty toolLogsPage--${densityMode.toLowerCase()}`}>
        <div className="toolLogsTop">
          <div className="toolLogsTitleWrap">
            <h1 className="toolLogsTitle">SAP Log RCA Analyzer</h1>
            <label className="toolLogsUpload toolLogsUpload--primary">
              Upload Log Files
              <input type="file" accept=".log,.txt" multiple onChange={onUpload} />
            </label>
            <button className="toolLogsSampleBtn" type="button" onClick={loadSampleData}>
              Load Sample
            </button>
          </div>
          <div className="toolLogsMetaRow">
            <div className="toolLogsMetaItem">Input: WP-SCOUT .log / .txt</div>
            <div className="toolLogsMetaItem">Output: RCA, evidence, postmortem draft</div>
            <div className="toolLogsDensity" role="group" aria-label="Density mode">
              {["COMFY", "COMPACT", "OPS"].map((mode) => (
                <button
                  key={mode}
                  className={`toolLogsDensityBtn ${densityMode === mode ? "is-active" : ""}`}
                  type="button"
                  onClick={() => setDensityMode(mode)}
                >
                  {mode}
                </button>
              ))}
            </div>
          </div>
        </div>

        <ToolLogsQuickDock hasData={false} onTop={scrollToTop} onJump={scrollToToolSection} onReset={resetFilters} onToggleHelp={() => setShowShortcutHelp(true)} />

        <div id="toolLogs-intake" className="toolLogsIntake">
          <section className="toolLogsIntakeHero">
            <div>
              <div className="toolLogsEyebrow">Log Intake</div>
              <h2>Upload WP-SCOUT logs to build RCA evidence.</h2>
              <p>
                The analyzer will merge snapshots, rank host pressure, detect recurring patterns,
                and prepare incident/postmortem exports.
              </p>
            </div>
            <label className="toolLogsDrop">
              <input type="file" accept=".log,.txt" multiple onChange={onUpload} />
              <span>Choose .log / .txt files</span>
              <strong>Multi-file correlation is supported</strong>
            </label>
          </section>

          <div className="toolLogsIntakeGrid">
            <div className="toolLogsIntakeCard">
              <span>01</span>
              <strong>Parse snapshots</strong>
              <p>Reads host, CPU, memory, WP rows, program, error, job, log path, and RABAX rows.</p>
            </div>
            <div className="toolLogsIntakeCard">
              <span>02</span>
              <strong>Rank impact</strong>
              <p>Scores critical paths using CPU, RSS, AGE, severity, recurrence, and anomaly level.</p>
            </div>
            <div className="toolLogsIntakeCard">
              <span>03</span>
              <strong>Draft RCA</strong>
              <p>Builds evidence, likely cause, next checks, and export-ready incident notes.</p>
            </div>
          </div>
        </div>
      </section>
    );
  }

  return (
    <section className={`toolLogsPage toolLogsPage--rca toolLogsPage--${densityMode.toLowerCase()}`}>
      <div className="toolLogsTop">
        <div className="toolLogsTitleWrap">
          <h1 className="toolLogsTitle">SAP Log RCA Analyzer</h1>
          <label className="toolLogsUpload">
            Choose File(s)
            <input type="file" accept=".log,.txt" multiple onChange={onUpload} />
          </label>
          <div className="toolLogsFile">{fileNames.length ? fileNames.join(" • ") : "Belum ada file dipilih"}</div>
          {uploadStatus ? <div className="toolLogsMetaItem toolLogsMetaItem--wide">{uploadStatus}</div> : null}
        </div>
        <div className="toolLogsMetaRow">
          <div className="toolLogsMetaItem">Files: {data.files.length}</div>
          <div className="toolLogsMetaItem">Snapshots: {data.snapshots.length}</div>
          <div className="toolLogsMetaItem">Range: {snapshotRange}</div>
          <div className="toolLogsMetaItem">Raw Rows: {rawRowCountOf(data)}</div>
          <div className="toolLogsMetaItem">Merged Rows: {data.rows.length}</div>
          <div className="toolLogsMetaItem">Filtered: {view.filtered.length}</div>
          <button className="toolLogsMiniBtn" type="button" onClick={resetFilters}>Reset filters</button>
          <button className="toolLogsMiniBtn" type="button" onClick={() => setShowShortcutHelp(true)}>Shortcuts</button>
          <div className="toolLogsDensity" role="group" aria-label="Density mode">
            {["COMFY", "COMPACT", "OPS"].map((mode) => (
              <button
                key={mode}
                className={`toolLogsDensityBtn ${densityMode === mode ? "is-active" : ""}`}
                type="button"
                onClick={() => setDensityMode(mode)}
              >
                {mode}
              </button>
            ))}
          </div>
        </div>
      </div>

      <ToolLogsQuickDock hasData onTop={scrollToTop} onJump={scrollToToolSection} onReset={resetFilters} onToggleHelp={() => setShowShortcutHelp(true)} />

      <div className={`toolLogsActiveFilters ${activeFilterCount ? "has-active" : ""}`}>
        <span>{activeFilterCount ? `${activeFilterCount} filter aktif` : "Tidak ada filter aktif"}</span>
        <button type="button" onClick={resetFilters}>Reset filters</button>
      </div>

      <div className={`rcaShell ${leftCollapsed ? "is-left-collapsed" : ""} ${rightCollapsed ? "is-right-collapsed" : ""}`}>
        <aside className="rcaCol rcaCol--left">
          <div id="toolLogs-hosts" className="rcaPanel rcaPanel--grow">
            <div className="rcaPanelHead"><div><div className="rcaPanelTitle">Hosts</div><div className="rcaPanelSub">Filter cepat per host + pressure score</div></div><button className="rcaBtn rcaBtn--ghost rcaBtn--tiny" type="button" onClick={() => setLeftCollapsed(true)}>Hide</button></div>
            <div className="rcaPanelBody rcaScroll">
              <button className={`rcaHostItem ${selectedHost === "ALL" ? "is-active" : ""}`} onClick={() => setSelectedHost("ALL")}>
                <div className="rcaHostTop"><div className="rcaHostName">ALL HOSTS</div></div>
                <div className="rcaHostMeta">Aggregate view</div>
              </button>
              {view.hostStats.map((host) => (
                <button key={host.label} className={`rcaHostItem ${selectedHost === host.label ? "is-active" : ""}`} onClick={() => setSelectedHost(host.label)}>
                  <div className="rcaHostTop"><div className="rcaHostName">{host.label}</div><Chip>Score {host.score.toFixed(1)}</Chip></div>
                  <div className="rcaHostBadges">
                    <Chip tone="crit">CRIT {host.crit}</Chip>
                    <Chip tone="warn">WARN {host.warn}</Chip>
                    <Chip>REC {host.recurring}</Chip>
                    <Chip tone={host.anomalyHigh ? "crit" : "ok"}>HI {host.anomalyHigh}</Chip>
                  </div>
                  <div className="rcaHostStrip"><div className="rcaHostStripFill" style={{ width: `${Math.min(100, ((host.crit * 10 + host.warn * 5 + host.anomalyHigh * 12) / Math.max(1, host.count * 12)) * 100)}%` }} /></div>
                  <div className="rcaHostMetaCompact"><Chip>RSS {host.rss.toFixed(2)}GB</Chip><Chip>CPU {host.cpu.toFixed(1)}%</Chip><Chip>AGE {fmtAge(host.maxAge)}</Chip></div>
                  <div className="rcaHostSubtle">Top Error: {truncateEnd(host.topError, 28)}</div>
                </button>
              ))}
            </div>
          </div>
        </aside>

        <main className="rcaCol">
          {(leftCollapsed || rightCollapsed) ? (
            <div className="rcaCollapseBar">
              {leftCollapsed ? <button className="rcaBtn rcaBtn--ghost" type="button" onClick={() => setLeftCollapsed(false)}>Show hosts</button> : null}
              {rightCollapsed ? <button className="rcaBtn rcaBtn--ghost" type="button" onClick={() => setRightCollapsed(false)}>Show selected WP</button> : null}
            </div>
          ) : null}
          <div id="toolLogs-summary" className="rcaPanel rcaSummaryPanel">
            <div className="rcaPanelHead">
              <div>
                <div className="rcaPanelTitle">RCA Summary</div>
                <div className="rcaPanelSub">Signal utama untuk prioritas host, proses, dan next check.</div>
              </div>
              <div className="rcaSummaryState">
                <span>Impact</span>
                <strong>{view.summary.crit ? 'Critical' : view.summary.warn ? 'Warning' : 'Normal'}</strong>
              </div>
            </div>
            <div className="rcaPanelBody">
              <div className="rcaSummaryGrid rcaSummaryGrid--v4">
                <div className="rcaSummaryCard rcaSummaryCard--primary"><span>Critical / Warning</span><strong>{view.summary.crit} / {view.summary.warn}</strong><em>rows need attention</em></div>
                <div className="rcaSummaryCard"><span>Files</span><strong>{view.summary.files}</strong><em>{view.summary.snapshots} snapshots</em></div>
                <div className="rcaSummaryCard"><span>Hosts</span><strong>{view.summary.hosts}</strong><em>{view.summary.rows} parsed rows</em></div>
                <div className="rcaSummaryCard"><span>Top CPU</span><strong>{view.summary.topCpu.toFixed(1)}%</strong><em>highest process CPU</em></div>
                <div className="rcaSummaryCard"><span>Top RSS</span><strong>{view.summary.topRss.toFixed(2)} GB</strong><em>memory pressure</em></div>
                <div className="rcaSummaryCard"><span>Top Age</span><strong>{fmtAge(view.summary.topAge)}</strong><em>longest running item</em></div>
              </div>
            </div>
          </div>

          <div id="toolLogs-filters" className="rcaPanel rcaPanel--compact">
            <div className="rcaPanelHead rcaToolbarHead">
              <div><div className="rcaPanelTitle">Quick Filters</div><div className="rcaPanelSub">Primary filters untuk mempercepat triage. Advanced filters bisa dibuka saat perlu.</div></div>
              <div className="rcaTabs rcaToolbarActions">
                <button className={`rcaTabBtn ${showAdvancedFilters ? "is-active" : ""}`} onClick={() => setShowAdvancedFilters((v) => !v)}>{showAdvancedFilters ? "Hide advanced" : "Show advanced"}</button>
                <button className={`rcaTabBtn ${suspiciousOnly ? "is-active" : ""}`} onClick={() => setSuspiciousOnly((v) => !v)}>Suspicious only</button>
                <button className={`rcaTabBtn ${topOffendersOnly ? "is-active" : ""}`} onClick={() => setTopOffendersOnly((v) => !v)}>Top offenders</button>
                <button className="rcaTabBtn" onClick={() => { setSelectedHost("ALL"); setSelectedClass("ALL"); setSelectedState("ALL"); setSelectedFile("ALL"); setSelectedAnomaly("ALL"); setMinRss(""); setMinAge(""); setProgramContains(""); setErrorContains(""); setSearch(""); setPresetMode("ALL"); setSuspiciousOnly(false); setTopOffendersOnly(false); setPinnedKey(""); }}>Reset</button>
              </div>
            </div>
            <div className="rcaPanelBody">
              <div className="rcaFilterGroup"><div className="rcaFilterGroupTitle">Core filters</div><div className="rcaFilterRow rcaFilterRow--primary">
                <select className="rcaSelect" value={selectedHost} onChange={(e) => setSelectedHost(e.target.value)}><option value="ALL">Host: ALL</option>{view.hosts.map((host) => <option key={host} value={host}>{host}</option>)}</select>
                <select className="rcaSelect" value={selectedFile} onChange={(e) => setSelectedFile(e.target.value)}><option value="ALL">File: ALL</option>{data.files.map((file) => <option key={file} value={file}>{file}</option>)}</select>
                <select className="rcaSelect" value={selectedClass} onChange={(e) => setSelectedClass(e.target.value)}><option value="ALL">Severity: ALL</option><option value="CRIT">CRIT</option><option value="WARN">WARN</option><option value="OK">OK</option></select>
                <select className="rcaSelect" value={selectedAnomaly} onChange={(e) => setSelectedAnomaly(e.target.value)}><option value="ALL">Anomaly: ALL</option><option value="HIGH">HIGH</option><option value="MED">MED</option><option value="LOW">LOW</option></select>
                <input ref={searchRef} className="rcaInput rcaInput--search" value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Search host / file / error / program / job ..." />
              </div></div>
              {showAdvancedFilters ? (
                <div className="rcaFilterGroup rcaFilterGroup--advanced"><div className="rcaFilterGroupTitle">Advanced filters</div><div className="rcaFilterRow rcaFilterRow--advanced">
                  <select className="rcaSelect" value={selectedState} onChange={(e) => setSelectedState(e.target.value)}><option value="ALL">State: ALL</option><option value="R">R</option><option value="S">S</option></select>
                  <input className="rcaInput rcaInput--small" value={minRss} onChange={(e) => setMinRss(e.target.value)} placeholder="Min RSS GB" />
                  <input className="rcaInput rcaInput--small" value={minAge} onChange={(e) => setMinAge(e.target.value)} placeholder="Min AGE min" />
                  <input className="rcaInput" value={programContains} onChange={(e) => setProgramContains(e.target.value)} placeholder="Program contains ..." />
                  <input className="rcaInput" value={errorContains} onChange={(e) => setErrorContains(e.target.value)} placeholder="Error contains ..." />
                </div></div>
              ) : null}
              <div className="rcaPresetBlock"><div className="rcaFilterGroupTitle">Quick presets</div><div className="rcaPresetRow">
                <button className={`rcaBtn rcaBtn--ghost ${presetMode === 'ALL' ? 'is-active' : ''}`} onClick={() => setPresetMode('ALL')}>All rows</button>
                <button className={`rcaBtn rcaBtn--ghost ${presetMode === 'CRITICAL' ? 'is-active' : ''}`} onClick={() => setPresetMode('CRITICAL')}>Critical path</button>
                <button className={`rcaBtn rcaBtn--ghost ${presetMode === 'MEMORY' ? 'is-active' : ''}`} onClick={() => setPresetMode('MEMORY')}>Memory heavy</button>
                <button className={`rcaBtn rcaBtn--ghost ${presetMode === 'RECURRING' ? 'is-active' : ''}`} onClick={() => setPresetMode('RECURRING')}>Recurring</button>
                <button className={`rcaBtn rcaBtn--ghost ${presetMode === 'LONG' ? 'is-active' : ''}`} onClick={() => setPresetMode('LONG')}>Long running</button>
              </div></div>
            </div>
          </div>

          <div className="rcaSignalsGrid rcaSignalsGrid--triple">
            <div className="rcaPanel"><div className="rcaPanelHead"><div><div className="rcaPanelTitle">Error Frequency</div><div className="rcaPanelSub">Error code paling sering muncul</div></div></div><div className="rcaPanelBody rcaScroll"><SimpleBars items={view.topErrors} /></div></div>
            <div className="rcaPanel"><div className="rcaPanelHead"><div><div className="rcaPanelTitle">Host Hotspots</div><div className="rcaPanelSub">Host prioritas investigasi</div></div></div><div className="rcaPanelBody rcaScroll"><SimpleBars items={view.hostStats.map((h) => ({ label: h.label, value: h.score }))} formatter={(v) => `${v.toFixed(1)}`} /></div></div>
            <div className="rcaPanel"><div className="rcaPanelHead"><div><div className="rcaPanelTitle">Top Programs</div><div className="rcaPanelSub">Program paling dominan</div></div></div><div className="rcaPanelBody rcaScroll"><SimpleBars items={view.topPrograms} /></div></div>
          </div>

          <div className="rcaSignalsGrid rcaSignalsGrid--triple">
            <div className="rcaPanel"><div className="rcaPanelHead"><div><div className="rcaPanelTitle">WP State Distribution</div><div className="rcaPanelSub">Distribusi state work process</div></div></div><div className="rcaPanelBody rcaScroll"><SimpleBars items={view.stateDistribution} /></div></div>
            <div className="rcaPanel"><div className="rcaPanelHead"><div><div className="rcaPanelTitle">Memory Pressure</div><div className="rcaPanelSub">Jumlah WP dengan RSS tinggi</div></div></div><div className="rcaPanelBody rcaScroll"><SimpleBars items={view.memoryPressure} /></div></div>
            <div className="rcaPanel"><div className="rcaPanelHead"><div><div className="rcaPanelTitle">Anomaly Distribution</div><div className="rcaPanelSub">High / Medium / Low outlier</div></div></div><div className="rcaPanelBody rcaScroll"><SimpleBars items={view.anomalyDistribution} /></div></div>
          </div>

          <div id="toolLogs-workspace" className="rcaPanel rcaPanel--grow">
            <div className="rcaPanelHead">
              <div><div className="rcaPanelTitle">Analysis Workspace</div><div className="rcaPanelSub">Workspace utama untuk triage cepat. WP table diprioritaskan, correlation tetap satu area drilldown.</div></div>
              <div className="rcaTabs">
                <button className={`rcaTabBtn ${centerTab === "correlation" ? "is-active" : ""}`} onClick={() => setCenterTab("correlation")}>Correlation</button>
                <button className={`rcaTabBtn ${centerTab === "heatmap" ? "is-active" : ""}`} onClick={() => setCenterTab("heatmap")}>Heatmap</button>
                <button className={`rcaTabBtn ${centerTab === "table" ? "is-active" : ""}`} onClick={() => setCenterTab("table")}>WP Table</button>
                <button className={`rcaTabBtn ${centerTab === "timeline" ? "is-active" : ""}`} onClick={() => setCenterTab("timeline")}>Timeline</button>
              </div>
            </div>
            <div className="rcaWorkflowHint">{view.keyboardHint.join(" • ")}</div>{view.emptyMessage ? <div className="rcaStateBanner">{view.emptyMessage}</div> : null}{pinnedKey && view.selected ? <div className="rcaStateBanner rcaStateBanner--ok">Pinned row: {view.selected.host} • WP {view.selected.wp}</div> : null}{centerTab === "correlation" ? (
              <div className="rcaPanelBody rcaScroll">
                <div className="rcaCorrelationList">
                  {view.correlations.map((item) => (
                    <div key={`${item.label}-${item.host}`} className="rcaCorrelationItem rcaCorrelationItem--rich">
                      <div className="rcaCorrelationTop">
                        <div>
                          <div className="rcaCorrelationTitle truncate">{item.label}</div>
                          <div className="rcaCorrelationMeta">Host {item.host} • Count {item.count} • Files {item.fileCount}</div>
                        </div>
                        <div className="rcaHostBadges">
                          <Chip tone={item.fileCount > 1 ? "warn" : "ok"}>{item.fileCount > 1 ? "Recurring" : "Single"}</Chip>
                          <Chip tone={item.maxAnomaly >= 70 ? "crit" : item.maxAnomaly >= 45 ? "warn" : "ok"}>Anom {item.maxAnomaly.toFixed(1)}</Chip>
                          <Chip tone={item.maxImpact >= 140 ? "crit" : item.maxImpact >= 90 ? "warn" : "ok"}>Impact {item.maxImpact.toFixed(1)}</Chip>
                        </div>
                      </div>
                      <div className="rcaCorrelationStats">
                        <div className="rcaStatPill"><span>Pattern strength</span><strong>{(item.count * item.fileCount).toFixed(0)}</strong></div>
                        <div className="rcaStatPill"><span>Recurring files</span><strong>{item.fileCount}</strong></div>
                        <div className="rcaStatPill"><span>Max anomaly</span><strong>{item.maxAnomaly.toFixed(1)}</strong></div>
                        <div className="rcaStatPill"><span>Max impact</span><strong>{item.maxImpact.toFixed(1)}</strong></div>
                      </div>
                    </div>
                  ))}
                  {!view.correlations.length ? <div className="rcaEmpty">Belum ada recurring pattern.</div> : null}
                </div>
              </div>
            ) : null}
            {centerTab === "heatmap" ? (
              <div className="rcaPanelBody rcaScroll"><div className="rcaHeatmap">{view.programHeatmap.map((item) => <div key={item.label} className="rcaHeatmapCell" style={{ opacity: 0.25 + (item.weight / 100) * 0.75 }}><div className="rcaHeatmapLabel" title={item.label}>{item.label}</div><div className="rcaHeatmapValue">{item.value}</div></div>)}</div></div>
            ) : null}
            {centerTab === "timeline" ? (
              <div className="rcaPanelBody rcaScroll">
                {!view.selected ? <div className="rcaEmpty">Pilih row dari WP Table atau Top Suspects untuk melihat timeline.</div> : (
                  <div className="rcaWorkspaceGrid">
                    <div className="rcaSectionCard"><div className="rcaMiniTitle">Selected WP timeline</div><TimelineStrip points={view.selected.timeline || []} /></div>
                    <div className="rcaSectionCard"><div className="rcaMiniTitle">Selected WP CPU trend</div><CpuTrend points={view.selected.timeline || []} /></div>
                    <div className="rcaSectionCard"><div className="rcaMiniTitle">Recurring patterns</div><div className="rcaReasonList">{view.correlations.slice(0, 6).map((item) => <div key={`${item.label}-${item.host}`} className="rcaReasonItem">{item.label} • host {item.host} • files {item.fileCount} • max anom {item.maxAnomaly.toFixed(1)}</div>)}</div></div>
                    <div className="rcaSectionCard"><div className="rcaMiniTitle">Selected snapshot evidence</div><div className="rcaTableWrap rcaScroll"><table className="rcaTable"><thead><tr><th>Snapshot</th><th>File</th><th>CPU</th><th>RSS</th><th>AGE</th><th>State</th></tr></thead><tbody>{(view.selected.timeline || []).map((p, idx) => <tr key={`${p.ts}-${idx}`}><td>{p.ts}</td><td>{p.sourceFile || '-'}</td><td>{(p.cpu || 0).toFixed(1)}%</td><td>{(p.rssGb || 0).toFixed(2)}GB</td><td>{fmtAge(p.ageMin || 0)}</td><td>{p.state || '-'}</td></tr>)}</tbody></table></div></div>
                  </div>
                )}
              </div>
            ) : null}
            {centerTab === "table" ? (
              <>
                <div className="rcaPanelHead rcaPanelHead--sub">
                  <div><div className="rcaPanelTitle">WP Table</div><div className="rcaPanelSub">WP rows hasil gabungan filter global di atas. Klik row untuk sinkron ke RCA panel kanan.</div></div>
                </div>
                <div className="rcaPanelBody rcaTableWrap">
                  <VirtualWpTable
                    rows={view.filtered}
                    selectedKey={view.selected ? rowKeyOf(view.selected) : ""}
                    pinnedKey={pinnedKey}
                    emptyMessage={view.emptyMessage}
                    viewportRef={tableViewportRef}
                    onSelect={(rowKey) => setSelectedKey(rowKey)}
                    onPin={(rowKey) => {
                      setSelectedKey(rowKey);
                      setRightTab("rca");
                      setPinnedKey(rowKey);
                    }}
                  />
                </div>
              </>
            ) : null}
          </div>
        </main>

        <aside className="rcaCol rcaCol--right">
          <div id="toolLogs-detail" className="rcaPanel rcaPanel--grow">
            <div className="rcaPanelHead"><div><div className="rcaPanelTitle">Selected WP</div><div className="rcaPanelSub">Evidence, RCA, dan next checks untuk row terpilih</div></div><button className="rcaBtn rcaBtn--ghost rcaBtn--tiny" type="button" onClick={() => setRightCollapsed(true)}>Hide</button></div>
            <div className="rcaPanelHead rcaPanelHead--sub">
              <div className="rcaTabs">
                <button className={`rcaTabBtn ${rightTab === "rca" ? "is-active" : ""}`} onClick={() => setRightTab("rca")}>RCA</button>
                <button className={`rcaTabBtn ${rightTab === "evidence" ? "is-active" : ""}`} onClick={() => setRightTab("evidence")}>Evidence</button>
                <button className={`rcaTabBtn ${rightTab === "export" ? "is-active" : ""}`} onClick={() => setRightTab("export")}>Export</button>
              </div>
            </div>
            <div className="rcaPanelBody rcaScroll">
              {!view.selected ? <div className="rcaEmpty">Klik salah satu row atau suspect.</div> : (
                <div className="rcaDetailCard">
                  <div className="rcaFocusCard">
                    <div className="rcaDetailTitle">{view.selected.host} • WP {view.selected.wp}</div>
                    <div className="rcaDetailMeta">
                      <button className={`rcaBtn rcaBtn--ghost rcaBtn--tiny ${pinnedKey === rowKeyOf(view.selected) ? "is-active" : ""}`} onClick={() => setPinnedKey((curr) => curr === rowKeyOf(view.selected) ? "" : rowKeyOf(view.selected))}>{pinnedKey === rowKeyOf(view.selected) ? "Pinned" : "Pin row"}</button>
                      <Chip tone={view.selected.class === "CRIT" ? "crit" : view.selected.class === "WARN" ? "warn" : "ok"}>{view.selected.class}</Chip>
                      <Chip>{view.selected.wpType}</Chip>
                      <Chip>{view.selected.state}</Chip>
                      <Chip tone={view.selected.anomalyLevel === "HIGH" ? "crit" : view.selected.anomalyLevel === "MED" ? "warn" : "ok"}>Anomaly {view.selected.anomalyLevel}</Chip>
                      <Chip>Impact {view.selected.impactScore.toFixed(1)}</Chip>
                    </div>
                    <div className="rcaFocusStats">
                      <div className="rcaStatPill"><span>CPU</span><strong>{view.selected.cpu.toFixed(1)}%</strong></div>
                      <div className="rcaStatPill"><span>RSS</span><strong>{view.selected.rssGb.toFixed(2)}GB</strong></div>
                      <div className="rcaStatPill"><span>AGE</span><strong>{fmtAge(view.selected.ageMin)}</strong></div>
                      <div className="rcaStatPill"><span>RABAX</span><strong>{view.selected.rabax}</strong></div>
                    </div>
                  </div>

                  {rightTab !== "export" ? <div className="rcaSectionCard">
                    <div className="rcaSectionHead"><div className="rcaMiniTitle">Identity</div><button className="rcaBtn rcaBtn--ghost rcaBtn--tiny" onClick={() => toggleSection("identity")}>{collapsedSections.identity ? "Expand" : "Collapse"}</button></div>
                    {collapsedSections.identity ? null : <dl className="rcaDetailGrid">
                      <dt>PID</dt><dd>{view.selected.pid}</dd>
                      <dt>INST</dt><dd>{view.selected.inst}</dd>
                      <dt>Program</dt><dd className="truncate" title={view.selected.program}>{truncateEnd(view.selected.program, 34)}</dd>
                      <dt>Error</dt><dd className="truncate" title={view.selected.errorCode}>{truncateEnd(view.selected.errorCode, 34)}</dd>
                      <dt>Job</dt><dd className="truncate" title={view.selected.jobName}>{truncateEnd(view.selected.jobName, 30)}</dd>
                      <dt>File(s)</dt><dd className="truncate" title={(view.selected.sourceFiles || []).join(", ")}>{truncateEnd((view.selected.sourceFiles || []).slice(0, 1).join(", "), 28)}</dd>
                      <dt>Log</dt><dd className="truncate" title={view.selected.logPath}>{truncateMiddle(String(view.selected.logPath || '').split('/').slice(-3).join('/'), 14, 12)}</dd>
                    </dl>}
                  </div> : null}

                  {rightTab === "rca" ? <div className="rcaSectionCard">
                    <div className="rcaSectionHead"><div className="rcaMiniTitle">RCA summary</div><button className="rcaBtn rcaBtn--ghost rcaBtn--tiny" onClick={() => toggleSection("explain")}>{collapsedSections.explain ? "Expand" : "Collapse"}</button></div>{collapsedSections.explain ? null : <><div className="rcaGuessText"><strong>{view.selected.rca?.category}</strong> — {view.selected.rootCauseGuess}</div><div className="rcaBadgeRow">{recommendationBadges(view.selected).map((tag) => <Chip key={tag}>{tag}</Chip>)}</div><EvidenceList row={view.selected} /><div className="rcaConfidenceBlock"><div className="rcaMiniTitle">Confidence breakdown</div><div className="rcaConfidenceList">{confidenceBreakdown(view.selected).map((item) => <div key={item.label} className="rcaConfidenceItem"><span>{item.label}</span><div className="rcaConfidenceTrack"><div className="rcaConfidenceFill" style={{ width: `${item.value}%` }} /></div><strong>{Math.round(item.value)}%</strong></div>)}</div></div></>}
                  </div> : null}

                  {rightTab !== "export" ? <div className="rcaSectionCard">
                    <div className="rcaSectionHead"><div className="rcaMiniTitle">Evidence reasons</div><button className="rcaBtn rcaBtn--ghost rcaBtn--tiny" onClick={() => toggleSection("evidence")}>{collapsedSections.evidence ? "Expand" : "Collapse"}</button></div>
                    {collapsedSections.evidence ? null : <div className="rcaReasonList">{(showMoreEvidence ? (view.selected.rca?.reasons || []) : (view.selected.rca?.reasons || []).slice(0, 2)).map((reason) => <div key={reason} className="rcaReasonItem">{reason}</div>)}</div>}
                    {!collapsedSections.evidence && (view.selected.rca?.reasons || []).length > 2 ? <button className="rcaBtn rcaBtn--ghost" onClick={() => setShowMoreEvidence((v) => !v)}>{showMoreEvidence ? "Show less" : `Show more (${(view.selected.rca?.reasons || []).length - 2})`}</button> : null}
                  </div> : null}

                  {rightTab === "evidence" ? <div className="rcaSectionCard"><div className="rcaMiniTitle">Snapshot timeline</div><TimelineStrip points={view.selected.timeline || []} /></div> : null}
                  {rightTab === "evidence" ? <div className="rcaSectionCard"><div className="rcaMiniTitle">CPU trend</div><CpuTrend points={view.selected.timeline || []} /></div> : null}

                  {rightTab === "rca" ? <div className="rcaSectionCard rcaNextChecks">
                    <div className="rcaSectionHead"><div className="rcaMiniTitle">Suggested next checks</div><button className="rcaBtn rcaBtn--ghost rcaBtn--tiny" onClick={() => toggleSection("actions")}>{collapsedSections.actions ? "Expand" : "Collapse"}</button></div>{collapsedSections.actions ? null : <><ul>{(view.selected.rca?.nextChecks || []).map((step) => <li key={step}>{step}</li>)}</ul><div className="rcaActionPlan">{rowActionPlan(view.selected).map((step) => <div key={step} className="rcaReasonItem">{step}</div>)}</div></>}
                  </div> : null}

                  {rightTab === "export" ? <div className="rcaSectionCard">
                    <div className="rcaSectionHead"><div className="rcaMiniTitle">RCA Export</div><button className="rcaBtn rcaBtn--ghost rcaBtn--tiny" onClick={() => toggleSection("export")}>{collapsedSections.export ? "Expand" : "Collapse"}</button></div>
                    {collapsedSections.export ? null : <><div className="rcaExportBtns">
                      <button className="rcaBtn" onClick={() => downloadText("rca-report.txt", rcaNote)}>TXT</button>
                      <button className="rcaBtn" onClick={() => downloadText("rca-report.md", rcaNote)}>Incident MD</button>
                      <button className="rcaBtn" onClick={() => downloadText("postmortem.md", postmortemMd)}>Postmortem MD</button>
                      <button className="rcaBtn" onClick={() => downloadText("rca-report.json", exportJson)}>JSON</button>
                    </div>
                    <textarea className="rcaTextarea rcaTextarea--compact" value={showMorePreview ? `${rcaNote}

---

${postmortemMd}` : exportPreview} readOnly />
                    <button className="rcaBtn rcaBtn--ghost" onClick={() => setShowMorePreview((v) => !v)}>{showMorePreview ? "Show less" : "Show more"}</button></>}
                  </div> : null}
                </div>
              )}
            </div>
          </div>

          <div id="toolLogs-export" className="rcaPanel">
            <div className="rcaPanelHead">
              <div><div className="rcaPanelTitle">RCA Export</div><div className="rcaPanelSub">Quick draft preview ringkas untuk copy / export cepat</div></div>
              <div className="rcaExportBtns">
                <button className="rcaBtn" onClick={() => downloadText("rca-report.txt", rcaNote)}>TXT</button>
                <button className="rcaBtn" onClick={() => downloadText("rca-report.md", rcaNote)}>Incident MD</button>
                <button className="rcaBtn" onClick={() => downloadText("postmortem.md", postmortemMd)}>Postmortem MD</button>
                <button className="rcaBtn" onClick={() => downloadText("rca-report.json", exportJson)}>JSON</button>
              </div>
            </div>
            <div className="rcaPanelBody rcaScroll">
              <textarea className="rcaTextarea rcaTextarea--preview" value={showMorePreview ? `${rcaNote}\n\n---\n\n${postmortemMd}` : exportPreview} readOnly />
              <button className="rcaBtn rcaBtn--ghost" onClick={() => setShowMorePreview((v) => !v)}>{showMorePreview ? "Show less" : "Show more"}</button>
            </div>
          </div>
        </aside>
      </div>


      {showShortcutHelp ? (
        <div className="rcaShortcutOverlay" onClick={() => setShowShortcutHelp(false)}>
          <div className="rcaShortcutCard" onClick={(e) => e.stopPropagation()}>
            <div className="rcaPanelTitle">Keyboard shortcuts</div>
            <div className="rcaReasonList">
              <div className="rcaReasonItem">/ → fokus ke search</div>
              <div className="rcaReasonItem">↑ / ↓ → pindah selected row</div>
              <div className="rcaReasonItem">Enter → buka tab RCA</div>
              <div className="rcaReasonItem">E → buka tab Export</div>
              <div className="rcaReasonItem">P → pin / unpin row terpilih</div>
              <div className="rcaReasonItem">Esc → tutup help dan lepas pin</div>
              <div className="rcaReasonItem">Alt+1..5 → lompat ke Summary / Filters / Table / RCA / Export</div>
              <div className="rcaReasonItem">Alt+T → balik ke atas</div>
            </div>
          </div>
        </div>
      ) : null}

      {!rawTexts.length ? (
        <div className="toolLogsHint">
          Upload satu atau beberapa file <code>.log</code> / <code>.txt</code> format WP-SCOUT. V4 menambah <code>multi-log correlation</code>, <code>anomaly detection</code>, <code>smart RCA</code>, <code>tabbed workspace</code>, dan export incident / postmortem.
        </div>
      ) : null}
    </section>
  );
}
