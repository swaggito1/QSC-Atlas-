# Watch state

Machine records written by `scripts/lab/watch.mjs` and committed by the `lab-watch` workflow.

- `state.json`: per source, the hash of the last snapshot, the last fetch, the last error, the count of consecutive failures, and whether the snapshot was truncated.
- `snapshots/<sourceId>.txt`: the latest normalised text of each watched source.
- `diffs/<sourceId>.diff`: the latest unified diff, overwritten on each change.

`lab:validate` skips this folder. Nothing here is shown to visitors.
