const DB_NAME = 'blast'
const DB_VERSION = 2 // v2: autosave store re-keyed by content hash (was blockId in v1)

let dbPromise: Promise<IDBDatabase> | null = null

// A user-managed named sample in the `library` store.
export interface LibraryEntry {
  id: string
  name: string
  fileName: string
  blob: Blob
  addedAt: number
}

// A content-addressed autosave blob in the `autosave` store.
interface AutosaveEntry {
  hash: string
  blob: Blob
  fileName: string
}

function openDB(): Promise<IDBDatabase> {
  if (!dbPromise) {
    dbPromise = new Promise((resolve, reject) => {
      const req = indexedDB.open(DB_NAME, DB_VERSION)
      req.onupgradeneeded = () => {
        const db = req.result
        if (!db.objectStoreNames.contains('library')) {
          db.createObjectStore('library', { keyPath: 'id' })
        }
        // v1 created autosave with keyPath:'blockId' — drop and recreate with 'hash'
        if (db.objectStoreNames.contains('autosave')) db.deleteObjectStore('autosave')
        db.createObjectStore('autosave', { keyPath: 'hash' })
      }
      req.onsuccess = () => resolve(req.result)
      req.onerror = () => { dbPromise = null; reject(req.error) }
    })
  }
  return dbPromise
}

// Closes any open connection (deleteDatabase blocks while one is open) then
// drops the whole IndexedDB database — used by the System settings tab to
// wipe everything.
export async function deleteAllData(): Promise<void> {
  if (dbPromise) {
    try { (await dbPromise).close() } catch { /* never opened */ }
    dbPromise = null
  }
  return new Promise((resolve, reject) => {
    const req = indexedDB.deleteDatabase(DB_NAME)
    req.onsuccess = () => resolve()
    req.onerror = () => reject(req.error)
    req.onblocked = () => resolve()
  })
}

function getAll<T>(storeName: string): Promise<T[]> {
  return openDB().then((db) => new Promise<T[]>((resolve, reject) => {
    const req = db.transaction(storeName, 'readonly').objectStore(storeName).getAll()
    req.onsuccess = () => resolve(req.result as T[])
    req.onerror = () => reject(req.error)
  }))
}

function write(storeName: string, fn: (store: IDBObjectStore) => void): Promise<void> {
  return openDB().then((db) => new Promise<void>((resolve, reject) => {
    const t = db.transaction(storeName, 'readwrite')
    fn(t.objectStore(storeName))
    t.oncomplete = () => resolve()
    t.onerror = () => reject(t.error)
  }))
}

// ---- Library (user-managed named samples) --------------------------------

export function listLibrary(): Promise<LibraryEntry[]> {
  return getAll<LibraryEntry>('library').then((all) => [...all].sort((a, b) => b.addedAt - a.addedAt))
}

export function addToLibrary({ name, fileName, blob }: { name: string; fileName: string; blob: Blob }): Promise<string> {
  const id = `lib_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 6)}`
  return write('library', (store) => store.put({ id, name, fileName, blob, addedAt: Date.now() }))
    .then(() => id)
}

export function removeFromLibrary(id: string): Promise<void> {
  return write('library', (store) => store.delete(id))
}

// ---- Autosave sample store (project sample blob persistence) -------------
// Blobs are content-addressed: same file used in N blocks is stored once.
// App.jsx keeps a { blockId: hash } manifest in localStorage to reconstruct
// per-block assignments on load.

async function hashBlob(blob: Blob): Promise<string> {
  const h = await crypto.subtle.digest('SHA-256', await blob.arrayBuffer())
  return [...new Uint8Array(h)].map((b) => b.toString(16).padStart(2, '0')).join('')
}

export interface AutosaveSampleInput {
  blockId: string
  blob: Blob
  fileName: string
}

// Save deduplicated blobs; return manifest { [blockId]: hash }
export async function saveAutosaveSamples(entries: AutosaveSampleInput[]): Promise<Record<string, string>> {
  const hashed = await Promise.all(
    entries.map(async ({ blockId, blob, fileName }) => ({
      blockId, fileName, blob, hash: await hashBlob(blob),
    })),
  )
  const manifest: Record<string, string> = {}
  const unique = new Map<string, AutosaveEntry>() // hash -> { hash, blob, fileName }
  for (const { blockId, hash, blob, fileName } of hashed) {
    manifest[blockId] = hash
    if (!unique.has(hash)) unique.set(hash, { hash, blob, fileName })
  }
  await write('autosave', (store) => {
    store.clear()
    for (const entry of unique.values()) store.put(entry)
  }).catch(() => {})
  return manifest
}

// Load blobs by manifest; return [{ blockId, blob, fileName }]
export async function loadAutosaveSamples(manifest: Record<string, string> | null | undefined): Promise<AutosaveSampleInput[]> {
  if (!manifest || !Object.keys(manifest).length) return []
  const all = await getAll<AutosaveEntry>('autosave').catch(() => [] as AutosaveEntry[])
  const byHash = new Map(all.map((e) => [e.hash, e]))
  return Object.entries(manifest)
    .map(([blockId, hash]) => {
      const e = byHash.get(hash)
      return e ? { blockId, blob: e.blob, fileName: e.fileName } : null
    })
    .filter((x): x is AutosaveSampleInput => x !== null)
}
