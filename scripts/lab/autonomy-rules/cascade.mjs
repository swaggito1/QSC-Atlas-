// QSC Atlas Labs: never-graduate rules for the Standards Cascade (prompt 02). A proposal that
// adds a fork or a parallel national process always waits for Swann.

const forkish = (v) => v && typeof v === 'object' && ['fork', 'parallel-interoperable'].includes(v.relation);

export default [
  {
    id: 'cascade-fork-edges',
    reason: 'edges whose relation is fork or parallel-interoperable never graduate',
    applies(meta) {
      const op = meta.operation ?? {};
      const values = op.type === 'create' ? (op.record?.edges ?? []) : (op.ops ?? []).map((o) => o.value);
      return values.some((v) => forkish(v) || (Array.isArray(v) && v.some(forkish)));
    },
  },
];
