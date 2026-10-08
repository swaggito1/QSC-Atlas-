# Tool invariants

Each tool prompt adds one file here, `<tool>.mjs`, whose default export is an array of rules
with the same shape as the shared rules in `scripts/lab/lib/invariants.mjs`:

```js
export default [
  {
    id: 'cascade-fork-edges',
    describe: 'One sentence saying what the rule guarantees.',
    appliesTo: (rel) => rel.startsWith('data/lab/cascade/'),
    check({ rel, data, tool }, { today }) {
      return []; // or [{ path: ['edges', 3], message: 'what is wrong' }]
    },
  },
];
```

`scripts/lab/lib/validate-core.mjs` loads every `.mjs` file in this folder, so `npm run lab:validate`
and `scripts/lab/check-proposals.mjs` apply the rule without further wiring.
