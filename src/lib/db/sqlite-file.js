import initSqlJs from 'sql.js'
const locateFile = (f) => `${import.meta.env.BASE_URL}${f}`; // public/sql-wasm.wasm

export async function sqliteOpen(fileHandle){
  const SQL = await initSqlJs({ locateFile })
  let db
  if(fileHandle){
    const f = await fileHandle.getFile()
    const buf = await f.arrayBuffer()
    db = buf.byteLength ? new SQL.Database(new Uint8Array(buf)) : new SQL.Database()
  }else{
    db = new SQL.Database()
  }
  db.run('PRAGMA foreign_keys=ON;')
  db.run(`
    CREATE TABLE IF NOT EXISTS runs(
      id       INTEGER PRIMARY KEY AUTOINCREMENT,
      label    TEXT NOT NULL,
      period   TEXT NOT NULL,
      files    TEXT NOT NULL,
      saved_at TEXT NOT NULL,
      json     TEXT NOT NULL
    );
  `)
  async function persist(){
    if(!fileHandle) return
    const data = db.export()
    const w = await fileHandle.createWritable()
    await w.write(data)
    await w.close()
  }
  return { db, persist }
}

export async function sqliteChooseDb(){
  try{
    const [h] = await window.showOpenFilePicker({
      types:[{ description:'SQLite DB', accept:{'application/x-sqlite3':['.db','.sqlite']} }],
      excludeAcceptAllOption:false, multiple:false
    })
    return h
  }catch(e){
    const h = await window.showSaveFilePicker({
      suggestedName:'sap-tools.db',
      types:[{ description:'SQLite DB', accept:{'application/x-sqlite3':['.db','.sqlite']} }]
    })
    return h
  }
}

export async function sqliteList(fileHandle){
  const { db } = await sqliteOpen(fileHandle)
  const res = db.exec(`SELECT id,label,period,files,saved_at FROM runs ORDER BY id DESC`)
  db.close()
  const rows = res[0]?.values || []
  return rows.map(([id,label,period,files,saved_at]) => ({ id, label, period, files, savedAt:saved_at }))
}

export async function sqliteSave(fileHandle, meta, payload){
  const { db, persist } = await sqliteOpen(fileHandle)
  const stmt = db.prepare(`INSERT INTO runs(label,period,files,saved_at,json) VALUES (?,?,?,?,?)`)
  stmt.run([meta.label, meta.period, meta.files, meta.savedAt, JSON.stringify(payload)])
  stmt.free()
  await persist()
  const id = db.exec(`SELECT last_insert_rowid()`)[0].values[0][0]
  db.close()
  return id
}

export async function sqliteLoad(fileHandle, id){
  const { db } = await sqliteOpen(fileHandle)
  const res = db.exec(`SELECT json FROM runs WHERE id=?`, [id])
  db.close()
  const json = res[0]?.values?.[0]?.[0]
  if(!json) throw new Error('Run not found')
  return JSON.parse(json)
}

export async function sqliteDelete(fileHandle, id){
  const { db, persist } = await sqliteOpen(fileHandle)
  db.run(`DELETE FROM runs WHERE id=?`, [id])
  await persist()
  db.close()
}
