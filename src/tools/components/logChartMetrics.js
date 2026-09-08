// Lightweight labels are needed before the chart renderer is loaded.
export const LOG_V14_METRICS = {
  cpuPct: { label: 'CPU', suffix: '%', digits: 1 },
  memoryPct: { label: 'RAM', suffix: '%', digits: 1 },
  resourceLoadRatio: { label: 'Load1/vCPU', suffix: '', digits: 2 },
  swapIn: { label: 'Swap In', suffix: ' p/s', digits: 0 },
  iowaitPct: { label: 'CPU iowait', suffix: '%', digits: 1, enhanced: true },
  psiMemoryFull10: { label: 'PSI Mem Full', suffix: '%', digits: 1, enhanced: true },
  psiIoFull10: { label: 'PSI IO Full', suffix: '%', digits: 1, enhanced: true },
  wpCritical: { label: 'WP Critical', suffix: '', digits: 0 },
}
