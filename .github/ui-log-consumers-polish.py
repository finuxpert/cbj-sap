from pathlib import Path


def replace_once(path, old, new):
    p = Path(path)
    text = p.read_text()
    count = text.count(old)
    if count != 1:
        raise SystemExit(f'{path}: expected 1 match, got {count}')
    p.write_text(text.replace(old, new, 1))


tool = 'src/tools/ToolLogAutoSphereV5.jsx'
replace_once(
    tool,
    "<div className=\"logV2PanelHead\"><div><h2>Application Server Trend</h2><p>Click any point or MAX marker to inspect metric-relevant contributors on that server at that sample.</p></div><div className=\"logV2MetricTabs\">",
    "<div className=\"logV2PanelHead\"><div><h2>Application Server Trend</h2><p>Click point or MAX for contributors.</p></div><div className=\"logV2MetricTabs\">",
)
replace_once(
    tool,
    "<div className=\"logV2PanelHead\"><div><h2>{sampleFocus ? `${samplePresentation.title} · ${sampleFocus.host}` : 'Top Resource Consumers'}</h2><p>{sampleFocus ? `${shortTime(sampleFocus.timeLabel)} · ${samplePresentation.description}.` : pointInTime ? 'Jobs and ABAP programs observed in this collection.' : 'Jobs and ABAP programs observed across the selected period.'}</p></div>{sampleFocus ? <div className=\"logV2QuickFilters\"><button type=\"button\" onClick={clearSampleFocus}>Full period</button></div> : null}</div>",
    "<div className=\"logV2PanelHead\"><div><h2>{sampleFocus ? `${samplePresentation.title} · ${sampleFocus.host}` : 'Top Resource Consumers'}</h2>{sampleFocus ? <p>{shortTime(sampleFocus.timeLabel)}</p> : null}</div>{sampleFocus ? <div className=\"logV2QuickFilters\"><button type=\"button\" onClick={clearSampleFocus}>Full period</button></div> : null}</div>",
)
replace_once(
    tool,
    "<div><span>{presentation.hostLabel}</span><strong>{metricText(focus.value, hostMetric.digits, hostMetric.suffix)}</strong><small>{presentation.hostNote}</small></div>\n      <div><span>Top Contributor</span><strong>{top?.workload || '—'}</strong><small>{top?.program || '—'}</small></div>\n      <div><span>{presentation.contributorLabel}</span><strong>{metricText(contribution, presentation.contributorDigits, presentation.contributorSuffix)}</strong><small>at selected sample</small></div>\n      <div><span>WP Type</span><strong>{top?.type || '—'}</strong><small>{rows.length} consumers observed</small></div>",
    "<div><span>{presentation.hostLabel}</span><strong>{metricText(focus.value, hostMetric.digits, hostMetric.suffix)}</strong></div>\n      <div><span>Top Contributor</span><strong>{top?.workload || '—'}</strong><small>{top?.program || '—'}</small></div>\n      <div><span>{presentation.contributorLabel}</span><strong>{metricText(contribution, presentation.contributorDigits, presentation.contributorSuffix)}</strong></div>\n      <div><span>WP Type</span><strong>{top?.type || '—'}</strong><small>{rows.length} rows</small></div>",
)

table = 'src/tools/components/VirtualResourceTableV14.jsx'
replace_once(
    table,
    "  const activeSortLabel = activeSortId === 'memory' ? (pointInTime ? 'memory' : 'peak memory') : activeSortId === 'dState' ? (pointInTime ? 'D-State WP' : 'D-State hits') : (pointInTime ? 'CPU' : 'peak CPU')\n",
    "  const activeSortLabel = activeSortId === 'memory' ? (pointInTime ? 'Memory' : 'Peak memory') : activeSortId === 'dState' ? (pointInTime ? 'D-State' : 'D-State hits') : (pointInTime ? 'CPU' : 'Peak CPU')\n  const activeSortArrow = sorting[0]?.desc === false ? '↑' : '↓'\n",
)
replace_once(
    table,
    "      <span><b>{tableRows.length}</b> consumers · sorted by {activeSortLabel}</span>",
    "      <span className=\"logV2TableMeta\"><b>{tableRows.length}</b><em>rows</em><strong>{activeSortLabel} {activeSortArrow}</strong></span>",
)

css = Path('src/tools/LogAutoSphereV141.css')
css.write_text(css.read_text() + r'''

/* v1.15.5: LOG consumer table density and alignment polish */
.logV2TableShell{border-radius:8px;overflow:hidden;background:#081418}
.logV2TableToolbar.logV2BasisToolbar{display:grid;grid-template-columns:minmax(280px,1fr) auto;grid-template-areas:"search meta" "filters filters";gap:9px 14px;padding:10px 12px;background:#091419}
.logV2BasisToolbar>input{grid-area:search;width:100%;max-width:none;height:34px;box-sizing:border-box;border-radius:7px;padding:0 11px}
.logV2BasisToolbar>.logV2QuickFilters{grid-area:filters;gap:6px;flex-wrap:nowrap;overflow-x:auto;padding-top:1px;scrollbar-width:none}
.logV2BasisToolbar>.logV2QuickFilters::-webkit-scrollbar{display:none}
.logV2BasisToolbar>.logV2QuickFilters button{padding:5px 9px;min-height:27px;white-space:nowrap;border-radius:5px;font-size:9px}
.logV2TableMeta{grid-area:meta;display:inline-flex;align-items:center;justify-self:end;gap:6px;padding:5px 8px;border:1px solid #2a4148;border-radius:6px;background:#0c1a1f;color:#7f949a;white-space:nowrap;font-size:9px!important;line-height:1}
.logV2TableMeta b{color:#edf4f5;font-size:11px}.logV2TableMeta em{font-style:normal;color:#70868d}.logV2TableMeta strong{padding-left:7px;border-left:1px solid #2a4148;color:#9eb1b6;font-size:9px;letter-spacing:.02em}
.logV2TableHeader button{height:38px;padding:0 11px;letter-spacing:.045em}
.logV2TableHeader button:nth-child(4),.logV2TableHeader button:nth-child(5),.logV2TableHeader button:nth-child(6),.logV2TableHeader button:nth-child(8){text-align:right}
.logV2VirtualRow{height:44px}
.logV2VirtualRow>span{padding:0 11px;font-size:10px;line-height:1.25}
.logV2VirtualRow>span:nth-child(4),.logV2VirtualRow>span:nth-child(5),.logV2VirtualRow>span:nth-child(6),.logV2VirtualRow>span:nth-child(8){text-align:right;font-variant-numeric:tabular-nums}
.logV2VirtualRow>span:nth-child(2){font-weight:650;color:#e3ecee}
.logV2Finding{display:inline-flex;align-items:center;min-height:20px;font-size:9px;line-height:1.15}
.logV2VirtualBody{scrollbar-width:thin;scrollbar-color:#52636a #0a171c}
.logV2VirtualBody::-webkit-scrollbar{width:8px;height:8px}.logV2VirtualBody::-webkit-scrollbar-track{background:#0a171c}.logV2VirtualBody::-webkit-scrollbar-thumb{background:#52636a;border:2px solid #0a171c;border-radius:8px}
@media(max-width:1300px){.logV2TableToolbar.logV2BasisToolbar{grid-template-columns:1fr;grid-template-areas:"search" "filters" "meta"}.logV2TableMeta{justify-self:start}}
''')

print('LOG UI polish patch applied')
