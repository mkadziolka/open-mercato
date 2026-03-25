/**
 * Load apps/mercato/.env before core/jest.setup.ts so DATABASE_URL matches `yarn dev`.
 * Jest does not use Next.js env loading; without this, jest.setup falls back to postgres://user:pass@...
 */
const fs = require('fs')
const path = require('path')
const dotenv = require('dotenv')

const envPath = path.join(__dirname, '.env')
if (fs.existsSync(envPath)) {
  dotenv.config({ path: envPath })
}
