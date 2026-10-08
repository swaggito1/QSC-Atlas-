// QSC Atlas Labs: a small RFC 6902 JSON Patch applier (add, remove, replace, move, copy, test).
// Written here rather than added as a dependency; the proposals only ever carry a few operations.

const clone = (v) => (v === undefined ? v : JSON.parse(JSON.stringify(v)));

/** "/a/0/b~1c" gives ["a", "0", "b/c"]. */
export function parsePointer(pointer) {
  if (pointer === '') return [];
  if (!pointer.startsWith('/')) throw new Error(`"${pointer}" is not a JSON pointer`);
  return pointer.slice(1).split('/').map((t) => t.replace(/~1/g, '/').replace(/~0/g, '~'));
}

function parentOf(doc, tokens, pointer) {
  let node = doc;
  for (const t of tokens.slice(0, -1)) {
    if (node === null || typeof node !== 'object' || !(t in node)) throw new Error(`path ${pointer} does not exist`);
    node = node[t];
  }
  if (node === null || typeof node !== 'object') throw new Error(`path ${pointer} does not exist`);
  return node;
}

/** The value at a pointer, or undefined when the path does not exist. */
export function getAt(doc, pointer) {
  let node = doc;
  for (const t of parsePointer(pointer)) {
    if (node === null || typeof node !== 'object' || !(t in node)) return undefined;
    node = node[t];
  }
  return node;
}

function arrayIndex(arr, token, pointer, forAdd) {
  if (forAdd && token === '-') return arr.length;
  if (!/^(0|[1-9]\d*)$/.test(token)) throw new Error(`"${token}" is not an array index in ${pointer}`);
  const i = Number(token);
  if (i > arr.length || (!forAdd && i === arr.length)) throw new Error(`index ${i} is out of range in ${pointer}`);
  return i;
}

function add(doc, pointer, value) {
  const tokens = parsePointer(pointer);
  if (!tokens.length) return clone(value);
  const parent = parentOf(doc, tokens, pointer);
  const last = tokens[tokens.length - 1];
  if (Array.isArray(parent)) parent.splice(arrayIndex(parent, last, pointer, true), 0, clone(value));
  else parent[last] = clone(value);
  return doc;
}

function remove(doc, pointer) {
  const tokens = parsePointer(pointer);
  if (!tokens.length) throw new Error('cannot remove the whole document');
  const parent = parentOf(doc, tokens, pointer);
  const last = tokens[tokens.length - 1];
  if (Array.isArray(parent)) parent.splice(arrayIndex(parent, last, pointer, false), 1);
  else {
    if (!(last in parent)) throw new Error(`path ${pointer} does not exist`);
    delete parent[last];
  }
  return doc;
}

/** Apply operations to a copy of `doc`. Throws on the first operation that does not apply cleanly. */
export function applyPatch(doc, ops) {
  if (!Array.isArray(ops)) throw new Error('ops must be an array');
  let out = clone(doc);
  ops.forEach((op, i) => {
    const where = `operation ${i} (${op?.op} ${op?.path})`;
    try {
      switch (op.op) {
        case 'add':
          out = add(out, op.path, op.value);
          break;
        case 'remove':
          out = remove(out, op.path);
          break;
        case 'replace':
          if (getAt(out, op.path) === undefined) throw new Error(`path ${op.path} does not exist`);
          out = add(remove(out, op.path), op.path, op.value);
          break;
        case 'move': {
          const v = getAt(out, op.from);
          if (v === undefined) throw new Error(`path ${op.from} does not exist`);
          out = add(remove(out, op.from), op.path, v);
          break;
        }
        case 'copy': {
          const v = getAt(out, op.from);
          if (v === undefined) throw new Error(`path ${op.from} does not exist`);
          out = add(out, op.path, v);
          break;
        }
        case 'test':
          if (JSON.stringify(getAt(out, op.path)) !== JSON.stringify(op.value)) throw new Error(`test failed at ${op.path}`);
          break;
        default:
          throw new Error(`unknown op "${op.op}"`);
      }
    } catch (err) {
      throw new Error(`${where}: ${err.message}`);
    }
  });
  return out;
}
