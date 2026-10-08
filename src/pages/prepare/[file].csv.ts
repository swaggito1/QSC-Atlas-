// /prepare/inventory-template.csv: the inventory template (spec 5.2), generated only when the
// inventory page is shown in this build (csvFiles reads the gated-file list in routes.ts), so a
// production build with the inventory private has no such file. One header row and nothing else:
// each column names its source, and there are no example rows, because they would be invented data.

import type { APIRoute } from 'astro';
import { csvFiles, inventoryCsv } from '../../lib/site/prepare-elements';

export function getStaticPaths() {
  return csvFiles().map((f) => ({ params: { file: f.file } }));
}

export const GET: APIRoute = ({ params }) => {
  if (params.file !== 'inventory-template') return new Response(null, { status: 404 });
  return new Response(inventoryCsv(), {
    headers: {
      'Content-Type': 'text/csv; charset=utf-8',
      'Content-Disposition': 'attachment; filename="inventory-template.csv"',
    },
  });
};
