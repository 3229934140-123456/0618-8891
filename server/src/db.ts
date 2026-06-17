import fs from 'fs';
import path from 'path';

export interface DBData {
  users: any[];
  documents: any[];
  document_members: any[];
  modules: any[];
  endpoints: any[];
  document_versions: any[];
  comments: any[];
  changelogs: any[];
  subscriptions: any[];
}

const dbDir = path.join(__dirname, '..', 'data');
const dbPath = path.join(dbDir, 'db.json');

function now() {
  return new Date().toISOString();
}

function loadDB(): DBData {
  if (!fs.existsSync(dbPath)) {
    const initial: DBData = {
      users: [],
      documents: [],
      document_members: [],
      modules: [],
      endpoints: [],
      document_versions: [],
      comments: [],
      changelogs: [],
      subscriptions: [],
    };
    saveDB(initial);
    return initial;
  }
  try {
    return JSON.parse(fs.readFileSync(dbPath, 'utf-8'));
  } catch {
    return {
      users: [], documents: [], document_members: [], modules: [], endpoints: [],
      document_versions: [], comments: [], changelogs: [], subscriptions: [],
    };
  }
}

function saveDB(data: DBData) {
  if (!fs.existsSync(dbDir)) {
    fs.mkdirSync(dbDir, { recursive: true });
  }
  fs.writeFileSync(dbPath, JSON.stringify(data, null, 2));
}

export const db = {
  prepare: (sql: string) => {
    const data = loadDB();
    return {
      get(...args: any[]): any {
        const table = matchTable(sql);
        if (!table) return undefined;
        const wheres = parseWhere(sql, args);
        const list = (data as any)[table] || [];
        return list.find((row: any) => matchWheres(row, wheres));
      },
      all(...args: any[]): any[] {
        let result: any[] = [];
        if (sql.includes('SELECT') && sql.includes('INNER JOIN')) {
          result = handleJoin(sql, args, data);
        } else {
          const table = matchTable(sql);
          if (!table) return [];
          const wheres = parseWhere(sql, args);
          result = ((data as any)[table] || []).filter((row: any) => matchWheres(row, wheres));
        }
        if (sql.includes('ORDER BY')) {
          result = handleOrderBy(sql, result);
        }
        if (sql.includes('GROUP BY')) {
          const seen = new Set<string>();
          result = result.filter((r: any) => {
            const key = r.id || JSON.stringify(r);
            if (seen.has(key)) return false;
            seen.add(key);
            return true;
          });
        }
        return result;
      },
      run(...args: any[]) {
        if (sql.trim().toUpperCase().startsWith('INSERT')) {
          const table = matchInsertTable(sql);
          if (!table) return;
          const values = parseInsertValues(sql, args);
          if (!values.created_at && hasColumn(table, 'created_at')) {
            values.created_at = now();
          }
          if (!values.updated_at && hasColumn(table, 'updated_at')) {
            values.updated_at = now();
          }
          (data as any)[table].push(values);
        } else if (sql.trim().toUpperCase().startsWith('UPDATE')) {
          const table = matchUpdateTable(sql);
          if (!table) return;
          const sets = parseSet(sql, args);
          const wheres = parseWhere(sql, args);
          if (hasColumn(table, 'updated_at') && !sets.updated_at) {
            sets.updated_at = now();
          }
          const list = (data as any)[table] || [];
          for (const row of list) {
            if (matchWheres(row, wheres)) {
              Object.assign(row, sets);
            }
          }
        } else if (sql.trim().toUpperCase().startsWith('DELETE')) {
          const table = matchTable(sql);
          if (!table) return;
          const wheres = parseWhere(sql, args);
          const list = (data as any)[table] || [];
          const newList = list.filter((row: any) => !matchWheres(row, wheres));
          (data as any)[table] = newList;
        }
        saveDB(data);
        return { changes: 1 };
      },
    };
  },
  pragma: () => {},
};

function hasColumn(table: string, col: string): boolean {
  const cols: Record<string, string[]> = {
    users: ['created_at'],
    documents: ['created_at', 'updated_at'],
    modules: ['created_at', 'updated_at'],
    endpoints: ['created_at', 'updated_at'],
    document_versions: ['created_at'],
    comments: ['created_at'],
    changelogs: ['created_at'],
    subscriptions: ['created_at'],
    document_members: ['created_at'],
  };
  return cols[table]?.includes(col) || false;
}

function matchTable(sql: string): string | null {
  const m = sql.match(/FROM\s+(\w+)/i) || sql.match(/DELETE\s+FROM\s+(\w+)/i);
  return m ? m[1] : null;
}

function matchInsertTable(sql: string): string | null {
  const m = sql.match(/INSERT\s+INTO\s+(\w+)/i);
  return m ? m[1] : null;
}

function matchUpdateTable(sql: string): string | null {
  const m = sql.match(/UPDATE\s+(\w+)/i);
  return m ? m[1] : null;
}

function parseWhere(sql: string, args: any[]): Record<string, any> {
  const where: Record<string, any> = {};
  const whereMatch = sql.match(/WHERE\s+(.+?)(ORDER|GROUP|LIMIT|$)/i);
  if (!whereMatch) return where;
  const clause = whereMatch[1];
  const parts = clause.split(/\s+AND\s+/i);
  let argIdx = 0;
  for (const p of parts) {
    const eq = p.match(/(\w+)\s*=\s*\?/);
    if (eq) {
      where[eq[1]] = args[argIdx++];
    }
    const lit = p.match(/(\w+)\s*=\s*'([^']+)'/);
    if (lit) {
      where[lit[1]] = lit[2];
    }
  }
  return where;
}

function parseSet(sql: string, args: any[]): Record<string, any> {
  const sets: Record<string, any> = {};
  const setMatch = sql.match(/SET\s+(.+?)\s+WHERE/i);
  if (!setMatch) return sets;
  const clause = setMatch[1];
  const parts = clause.split(/\s*,\s*/);
  let argIdx = 0;
  for (const p of parts) {
    const eq = p.match(/(\w+)\s*=\s*\?/);
    if (eq) {
      sets[eq[1]] = args[argIdx++];
    }
    const func = p.match(/(\w+)\s*=\s*CURRENT_TIMESTAMP/i);
    if (func) {
      sets[func[1]] = now();
    }
  }
  return sets;
}

function parseInsertValues(sql: string, args: any[]): Record<string, any> {
  const colsMatch = sql.match(/\(([^)]+)\)\s*VALUES/i);
  const valsMatch = sql.match(/VALUES\s*\(([^)]+)\)/i);
  if (!colsMatch || !valsMatch) return {};
  const cols = colsMatch[1].split(',').map((c) => c.trim());
  const valPlaceholders = valsMatch[1].split(',').map((v) => v.trim());
  const result: Record<string, any> = {};
  let argIdx = 0;
  cols.forEach((col, i) => {
    if (valPlaceholders[i] === '?') {
      result[col] = args[argIdx++];
    } else if (valPlaceholders[i].toUpperCase() === 'CURRENT_TIMESTAMP') {
      result[col] = now();
    } else {
      const str = valPlaceholders[i].match(/^'(.+)'$/);
      result[col] = str ? str[1] : valPlaceholders[i];
    }
  });
  return result;
}

function matchWheres(row: any, wheres: Record<string, any>): boolean {
  for (const [k, v] of Object.entries(wheres)) {
    if (row[k] !== v) return false;
  }
  return true;
}

function handleOrderBy(sql: string, rows: any[]): any[] {
  const m = sql.match(/ORDER\s+BY\s+(\w+)(\s+(ASC|DESC))?/i);
  if (!m) return rows;
  const col = m[1];
  const dir = (m[3] || 'ASC').toUpperCase();
  return [...rows].sort((a, b) => {
    let va = a[col];
    let vb = b[col];
    if (typeof va === 'number' && typeof vb === 'number') {
      return dir === 'DESC' ? vb - va : va - vb;
    }
    va = String(va);
    vb = String(vb);
    return dir === 'DESC' ? vb.localeCompare(va) : va.localeCompare(vb);
  });
}

function handleJoin(sql: string, args: any[], data: DBData): any[] {
  const result: any[] = [];
  if (sql.includes('comments') && sql.includes('users')) {
    const wheres = parseWhere(sql, args);
    for (const c of data.comments) {
      if (matchWheres(c, wheres)) {
        const u = data.users.find((x) => x.id === c.created_by);
        result.push({ ...c, user_name: u?.name, user_email: u?.email });
      }
    }
  } else if (sql.includes('document_versions') && sql.includes('users')) {
    const wheres = parseWhere(sql, args);
    for (const v of data.document_versions) {
      if (matchWheres(v, wheres)) {
        const u = data.users.find((x) => x.id === v.created_by);
        result.push({ ...v, user_name: u?.name });
      }
    }
  } else if (sql.includes('endpoints') && sql.includes('modules')) {
    const wheres = parseWhere(sql, args);
    for (const e of data.endpoints) {
      const mod = data.modules.find((m) => m.id === e.module_id);
      if (mod && matchWheres(mod, wheres)) {
        result.push(e);
      }
    }
  } else if (sql.includes('documents') && sql.includes('document_members')) {
    const userId = args[0];
    for (const d of data.documents) {
      const member = data.document_members.find((m) => m.document_id === d.id && m.user_id === userId);
      if (d.created_by === userId || member || d.visibility === 'public') {
        if (!result.find((x) => x.id === d.id)) result.push(d);
      }
    }
  }
  return result;
}

export function initDatabase() {
  loadDB();
}
