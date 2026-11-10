import { fileURLToPath } from 'node:url';
import { publicCatalogState } from './catalog-files.mjs';
const state=await publicCatalogState(fileURLToPath(new URL('../',import.meta.url)));
console.log(JSON.stringify({
  result:'PASS',
  activeCatalogPresent:!!state.v4Catalog,
  published:state.v4Catalog?.plugins.filter(item=>item.status==='published').length??0,
  archivedCatalogPresent:!!state.catalog,
  immutablePackages:state.packages.length,
}));
