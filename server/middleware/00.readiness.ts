// 503 until startup work has finished (ticktimer/Tick#9).
//
// Nitro opens the listener before async plugins are done, so without this a
// request can be answered while server/plugins/migrate.ts is still applying
// migrations — i.e. against a half-migrated schema. Everything is refused
// until the gate opens, the Docker healthcheck included: a container that is
// still migrating is not yet healthy. A migration that FAILS never opens the
// gate at all; the plugin exits the process instead.
//
// Ordering does not matter: the other middleware only cap body size, count
// rate-limit buckets and set response headers, none of which is harmful on a
// request that is about to be refused anyway.
import { isStartupReady } from '../utils/startup-ready'

export default defineEventHandler((event) => {
  if (isStartupReady()) return
  setResponseHeader(event, 'retry-after', 2)
  throw createError({
    statusCode: 503,
    statusMessage: 'Starting up',
    message: 'The server is still applying database migrations. Try again shortly.'
  })
})
