/** Command-line entry for the offline image library synchronizer. */

import { parseArguments, syncUpstream } from '../src/sync-upstream.ts'

await syncUpstream(parseArguments(process.argv.slice(2)))
