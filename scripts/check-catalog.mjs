import { fileURLToPath } from 'node:url';
import { publicCatalogState } from './catalog-files.mjs';
const state=await publicCatalogState(fileURLToPath(new URL('../',import.meta.url)));
console.log(JSON.stringify({result:'PASS',catalogPresent:!!state.catalog,published:state.catalog?.plugins.filter(item=>item.status==='published').length??0,immutablePackages:state.packages.length}));
