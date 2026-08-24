import { classifySt03nFile, readSt03nMatrix, st03nRowsToObjects } from './parsers/st03nParser.js'
import { safe, toNumber } from './evidence-utils.js'

function lower(value = '') { return String(value || '').toLowerCase() }
function pick(keys = [], patterns = []) { return keys.find((key) => patterns.some((pattern) => pattern.test(lower(key)))) || '' }
function value(row, key, fallback = 0) { return key ? toNumber(row?.[key], fallback) : fallback }
function stringValue(row, key, fallback = '') { return key ? safe(row?.[key]) || fallback : fallback }

function dateTimeLabel(row, dateKey, timeKey) {
  const dateRaw = row?.[dateKey], timeRaw = row?.[timeKey]
  let dateText = safe(dateRaw)
  if (dateRaw instanceof Date && !Number.isNaN(dateRaw.getTime())) dateText = `${dateRaw.getFullYear()}-${String(dateRaw.getMonth() + 1).padStart(2, '0')}-${String(dateRaw.getDate()).padStart(2, '0')}`
  else if (typeof dateRaw === 'number' && Number.isFinite(dateRaw)) { const d = new Date(Math.round((dateRaw - 25569) * 86400 * 1000)); dateText = `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, '0')}-${String(d.getUTCDate()).padStart(2, '0')}` }
  let timeText = safe(timeRaw)
  if (typeof timeRaw === 'number' && Number.isFinite(timeRaw)) { const seconds = Math.round((timeRaw % 1) * 86400); timeText = `${String(Math.floor(seconds / 3600)).padStart(2, '0')}:${String(Math.floor((seconds % 3600) / 60)).padStart(2, '0')}:${String(seconds % 60).padStart(2, '0')}` }
  return [dateText.slice(0, 10), timeText.slice(0, 8)].filter(Boolean).join(' ')
}

function technicalObject(name = '') { return /^<.*>$/.test(String(name || '').trim()) }

function consistency(totalResponseSec = 0, avgResponseMs = 0, steps = 0) {
  const total = Number(totalResponseSec || 0), avg = Number(avgResponseMs || 0), count = Number(steps || 0)
  if (!(total > 0 && avg > 0 && count > 0)) return { expectedTotalResponseSec: 0, responseConsistencyPct: 0, responseConsistency: 'N/A' }
  const expected = (avg * count) / 1000
  const pct = Math.abs(total - expected) / Math.max(total, expected) * 100
  return { expectedTotalResponseSec: expected, responseConsistencyPct: pct, responseConsistency: pct <= 5 ? 'OK' : 'CHECK' }
}

function parseTimeProfile(objects = [], fileName = '') {
  const keys = Object.keys(objects[0] || {}), cInterval = pick(keys, [/^time interval$/]), cSteps = pick(keys, [/number of dialog steps/]), cTotalResponse = pick(keys, [/total response time/]), cResponse = pick(keys, [/average response time/]), cCpu = pick(keys, [/average cpu time/]), cDb = pick(keys, [/ø db time/, /average db time/]), cWait = pick(keys, [/average wait time/]), cRollWait = pick(keys, [/ø roll wait time/, /average roll wait/]), cLoad = pick(keys, [/average load and generation/])
  return objects.map((row) => ({ kind:'timeProfile', fileName, interval:stringValue(row,cInterval), steps:value(row,cSteps), totalResponseSec:value(row,cTotalResponse), avgResponseMs:value(row,cResponse), avgCpuMs:value(row,cCpu), avgDbMs:value(row,cDb), avgWaitMs:value(row,cWait), avgRollWaitMs:value(row,cRollWait), avgWaitTotalMs:value(row,cWait)+value(row,cRollWait), avgLoadMs:value(row,cLoad) })).filter((row)=>row.interval && (row.avgResponseMs || row.totalResponseSec || row.steps))
}

function parseWorkload(objects = [], fileName = '') {
  const keys=Object.keys(objects[0]||{}), cTask=pick(keys,[/task type name/]), cSteps=pick(keys,[/number of dialog steps/]), cResponse=pick(keys,[/average response time/]), cProcessing=pick(keys,[/avg\. processing time/,/average processing/]), cCpu=pick(keys,[/average cpu time/]), cDb=pick(keys,[/ø db time/,/average db time/]), cWait=pick(keys,[/average wait time/]), cRollWait=pick(keys,[/average roll wait/]), cLoad=pick(keys,[/average load and generation/]), cLock=pick(keys,[/average lock time/]), cRfc=pick(keys,[/average rfc interface/])
  return objects.map((row)=>({ kind:'taskType',fileName,taskType:stringValue(row,cTask),steps:value(row,cSteps),avgResponseMs:value(row,cResponse),avgProcessingMs:value(row,cProcessing),avgCpuMs:value(row,cCpu),avgDbMs:value(row,cDb),avgWaitMs:value(row,cWait),avgRollWaitMs:value(row,cRollWait),avgWaitTotalMs:value(row,cWait)+value(row,cRollWait),avgLoadMs:value(row,cLoad),avgLockMs:value(row,cLock),avgRfcMs:value(row,cRfc) })).filter((row)=>row.taskType&&(row.avgResponseMs||row.steps))
}

function parseTransactions(objects = [], fileName = '') {
  const keys=Object.keys(objects[0]||{}), cObject=pick(keys,[/report or transaction name/]), cJob=pick(keys,[/name of background job/]), cSteps=pick(keys,[/number of dialog steps/]), cTotalResponse=pick(keys,[/total response time/]), cResponse=pick(keys,[/average response time/]), cCpu=pick(keys,[/average cpu time/]), cDb=pick(keys,[/ø db time/,/average db time/]), cWait=pick(keys,[/average wait time/]), cLoad=pick(keys,[/average load and generation/]), cRollWait=pick(keys,[/ø roll wait time/,/average roll wait/])
  return objects.map((row)=>{
    const object=stringValue(row,cObject), steps=value(row,cSteps), totalResponseSec=value(row,cTotalResponse), avgResponseMs=value(row,cResponse)
    return { kind:'transaction',fileName,object,technical:technicalObject(object),jobName:stringValue(row,cJob),steps,totalResponseSec,avgResponseMs,avgCpuMs:value(row,cCpu),avgDbMs:value(row,cDb),avgWaitMs:value(row,cWait),avgRollWaitMs:value(row,cRollWait),avgWaitTotalMs:value(row,cWait)+value(row,cRollWait),avgLoadMs:value(row,cLoad),...consistency(totalResponseSec,avgResponseMs,steps) }
  }).filter((row)=>row.object&&(row.totalResponseSec||row.avgResponseMs||row.steps))
}

function parseTopResponse(objects = [], fileName = '') {
  const keys=Object.keys(objects[0]||{}), cDate=pick(keys,[/date stamp/]), cTime=pick(keys,[/time stamp/]), cTx=pick(keys,[/report or transaction name/]), cProgram=pick(keys,[/name of abap program/]), cTask=pick(keys,[/task type name/]), cWp=pick(keys,[/number of the work process/]), cUser=pick(keys,[/user in abap system/]), cResponse=pick(keys,[/dialog step response time/]), cProcessing=pick(keys,[/processing time of dialog step/]), cWait=pick(keys,[/wait time for dialog step/]), cCpu=pick(keys,[/cpu time per dialog step/]), cRollWait=pick(keys,[/roll wait time for dialog step/]), cDb=pick(keys,[/database time per dialog step/]), cLoad=pick(keys,[/load and generation time/])
  return objects.map((row)=>{const transaction=stringValue(row,cTx),program=stringValue(row,cProgram);return{kind:'responseRecord',fileName,timestamp:dateTimeLabel(row,cDate,cTime),transaction,program,label:transaction||program||'Unknown object',taskType:stringValue(row,cTask),wp:stringValue(row,cWp),user:stringValue(row,cUser),responseMs:value(row,cResponse),processingMs:value(row,cProcessing),waitMs:value(row,cWait),cpuMs:value(row,cCpu),rollWaitMs:value(row,cRollWait),dbMs:value(row,cDb),loadMs:value(row,cLoad),extreme:value(row,cResponse)>3600000}}).filter((row)=>row.responseMs>0)
}

function parseTopDb(objects = [], fileName = '') {
  const keys=Object.keys(objects[0]||{}), cDate=pick(keys,[/date stamp/]), cTime=pick(keys,[/time stamp/]), cTx=pick(keys,[/report or transaction name/]), cProgram=pick(keys,[/name of abap program/]), cTask=pick(keys,[/task type name/]), cWp=pick(keys,[/number of the work process/]), cUser=pick(keys,[/user in abap system/]), cCalls=pick(keys,[/number of logical database calls/]), cSeqTime=pick(keys,[/sequential reads time/]), cSeqReads=pick(keys,[/number of sequential reads/]), cDirectTime=pick(keys,[/time for log\. direct reads/,/time for logical direct reads/]), cDirectReads=pick(keys,[/number of direct reads/]), cChangeTime=pick(keys,[/time for logical database changes/]), cChanges=pick(keys,[/number of logical database changes/])
  return objects.map((row)=>{const transaction=stringValue(row,cTx),program=stringValue(row,cProgram),sequentialMs=value(row,cSeqTime),directMs=value(row,cDirectTime),changeMs=value(row,cChangeTime);return{kind:'dbRecord',fileName,timestamp:dateTimeLabel(row,cDate,cTime),transaction,program,label:transaction||program||'Unknown object',taskType:stringValue(row,cTask),wp:stringValue(row,cWp),user:stringValue(row,cUser),logicalCalls:value(row,cCalls),sequentialMs,sequentialReads:value(row,cSeqReads),directMs,directReads:value(row,cDirectReads),changeMs,changes:value(row,cChanges),dbAccessMs:sequentialMs+directMs+changeMs}}).filter((row)=>row.dbAccessMs>0||row.logicalCalls>0)
}

async function parseOne(file) {
  const kind=classifySt03nFile(file.name); const {objects,headerIdx,header}=st03nRowsToObjects(await readSt03nMatrix(file)); let rows=[]
  if(kind==='timeProfile')rows=parseTimeProfile(objects,file.name);else if(kind==='workload')rows=parseWorkload(objects,file.name);else if(kind==='transactionStandard')rows=parseTransactions(objects,file.name);else if(kind==='topResponse')rows=parseTopResponse(objects,file.name);else if(kind==='topDb')rows=parseTopDb(objects,file.name)
  return{kind,fileName:file.name,rows,headerIdx,header}
}
function peak(rows=[],key=''){return rows.reduce((best,row)=>Number(row[key]||0)>Number(best?.value||0)?{value:Number(row[key]||0),row}:best,{value:0,row:null})}

export async function analyzeSt03nFiles(files=[]) {
  const parsed=[]; for(const file of files) parsed.push(await parseOne(file))
  const byKind=Object.fromEntries(parsed.map((item)=>[item.kind,item.rows])); const timeProfile=[...(byKind.timeProfile||[])]; const taskTypes=[...(byKind.workload||[])].sort((a,b)=>b.avgResponseMs-a.avgResponseMs)
  const transactions=[...(byKind.transactionStandard||[])].sort((a,b)=>b.totalResponseSec-a.totalResponseSec||b.avgResponseMs-a.avgResponseMs); const workloadTransactions=transactions.filter((row)=>!row.technical)
  const responseRecords=[...(byKind.topResponse||[])].sort((a,b)=>b.responseMs-a.responseMs); const dbRecords=[...(byKind.topDb||[])].sort((a,b)=>b.dbAccessMs-a.dbAccessMs||b.logicalCalls-a.logicalCalls)
  const coverage=parsed.map((item)=>({kind:item.kind,fileName:item.fileName,rows:item.rows.length,ok:item.rows.length>0,headerRow:item.headerIdx+1})); const totalRows=parsed.reduce((sum,item)=>sum+item.rows.length,0)
  const consistencyCheckCount=transactions.filter((row)=>row.responseConsistency==='CHECK').length
  return{files:files.map((file)=>({name:file.name,size:file.size})),coverage,totalRows,timeProfile,taskTypes,transactions,workloadTransactions,responseRecords,dbRecords,consistencyCheckCount,peakInterval:peak(timeProfile,'avgResponseMs'),topTransaction:workloadTransactions[0]||transactions[0]||null,topResponseRecord:responseRecords[0]||null,topDbRecord:dbRecords[0]||null}
}

export function transactionDecomposition(rows=[],limit=8){return rows.slice(0,limit).map((row)=>{const response=Math.max(0,Number(row.avgResponseMs||0)),db=Math.max(0,Number(row.avgDbMs||0)),cpu=Math.max(0,Number(row.avgCpuMs||0)),wait=Math.max(0,Number(row.avgWaitMs||0)),rollWait=Math.max(0,Number(row.avgRollWaitMs||0)),load=Math.max(0,Number(row.avgLoadMs||0));return{name:row.object,db,cpu,wait,rollWait,load,unattributed:Math.max(0,response-db-cpu-wait-rollWait-load),response,totalResponseSec:row.totalResponseSec,steps:row.steps,jobName:row.jobName}})}
