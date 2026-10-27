# EstateFlow

EstateFlow is a small, full-stack real-estate sales CRM. It brings customer
leads, sales follow-ups, project inventory, and unit bookings into one
role-aware workspace.

## Stack

- Next.js 16 App Router and React
- PostgreSQL with Prisma ORM 7 and the PostgreSQL driver adapter
- Server-side Route Handlers for authentication and CRM APIs
- Tailwind CSS for responsive layouts

## Run locally

Requirements: Node.js 20.19+ and a PostgreSQL database.

1. Install dependencies:

   ```bash
   npm install
   ```

2. Copy `.env.example` to `.env`. Set `DATABASE_URL` to your PostgreSQL
   connection string and replace `ADMIN_SETUP_KEY` with a private, random key.
   For example, generate a key with:

   ```bash
   node -e "console.log(require('node:crypto').randomBytes(32).toString('hex'))"
   ```

3. Generate the Prisma client and create/update the database schema:

   ```bash
   npm run db:generate
   npm run db:push
   ```

4. Start the app:

   ```bash
   npm run dev
   ```

5. Open `http://localhost:3000`. On the first visit, create the administrator
   account using `ADMIN_SETUP_KEY`. The setup endpoint closes after an
   administrator is created. Remove `ADMIN_SETUP_KEY` from the environment
   after setup.

The administrator can create sales employee accounts from **Sales Team**.
Passwords must contain at least 12 characters. Share temporary passwords
securely with employees.

## Deploy to Vercel

1. Push this project to a private GitHub repository and import it into Vercel
   as a Next.js project.
2. Set `DATABASE_URL` in the Vercel Production environment to the production
   PostgreSQL connection string. Use the provider's recommended pooled URL for
   the application and keep the direct URL private for database administration.
3. Set `ADMIN_SETUP_KEY` to a unique random value only if the database still
   needs initial administrator setup. Never commit `.env` or paste credentials
   into source code, chat, or build logs.
4. Deploy. The build script generates Prisma Client before running the Next.js
   production build. It does not create, reset, or migrate database tables.
5. Before pointing Vercel at an existing database, confirm it has the schema
   expected by `prisma/schema.prisma` and take a backup. This project has no
   committed migration baseline; do not run `db:push` against production as a
   deployment step.

Set environment variables in Vercel's project settings and redeploy after
changing them. Use Preview-scoped credentials or a separate database for
Preview deployments so preview builds cannot modify production data.

## Database overview

- `User` has an `ADMIN` or `SALES_EMPLOYEE` role. Leads, follow-ups, bookings,
  and sessions reference users.
- `Session` stores a hash of a random session token and its expiry; the
  un-hashed token is only sent in an HTTP-only cookie.
- `Lead` stores customer contact details, source, budget, notes, pipeline stage,
  optional project interest, assignee, and follow-ups.
- `Property` represents a project and owns `Building` records. A building owns
  units with a unit number, floor, type, price, and availability state.
- `Booking` links one lead to one unit and snapshots the unit price at booking
  time. Cancelling a booking releases its unit and moves the lead back to
  negotiation when it has no other active booking.

To create migration files for a production deployment, use Prisma migrations
against a fresh development database, review and commit the generated migration,
then apply committed migrations with `npx prisma migrate deploy`. This project
does not yet include a migration baseline. For an existing database with data,
baseline its current schema before applying migrations; do not run an initial
schema migration or reset against it without reviewing the SQL and preserving
existing records. `db:push` is included for quick local setup and schema
iteration, not as a production migration strategy.

## API overview

All CRM routes require a valid session cookie. Sales employees only see leads
assigned to them; administrators can manage all leads and team members.

| Route | Methods | Purpose |
| --- | --- | --- |
| `/api/auth` | `GET`, `POST`, `DELETE` | Read session, sign in, sign out |
| `/api/auth/setup` | `POST` | Create the first administrator using the setup key |
| `/api/leads` | `GET`, `POST`, `PATCH`, `DELETE` | Search/list, create, edit, and guarded lead deletion |
| `/api/properties` | `GET`, `POST`, `PATCH` | Read inventory; administrators create and edit projects |
| `/api/units` | `GET`, `POST`, `PATCH`, `DELETE` | Filter and manage units; deletion is blocked when booking history exists |
| `/api/bookings` | `GET`, `POST`, `PATCH` | Create, confirm, or cancel bookings |
| `/api/follow-ups` | `GET`, `POST`, `PATCH` | Schedule, edit, complete, and reopen reminders |
| `/api/users` | `GET`, `POST`, `PATCH` | View team members; administrators create and edit employee accounts |
| `/api/dashboard` | `GET` | Read role-scoped pipeline, inventory, follow-up, and revenue metrics |
| `/api/search` | `GET` | Search role-visible leads, projects, units, and bookings |

Booking creation claims the unit with a conditional database update inside a
transaction. If two requests try to reserve the same unit, only one can change
it from `AVAILABLE` to `BOOKED`; the other receives a conflict response.

## Important product decisions

1. **Sales employees see only their assigned leads.** This keeps customer
   ownership clear and makes the employee workspace focused, while
   administrators retain a team-wide view and reassignment controls.
2. **A booking is the source of truth for a booked lead.** Booking a unit and
   changing the lead stage happen in one transaction. This avoids a lead marked
   “Booked” without a reserved unit and prevents double-booking.
3. **Cancelled bookings remain in the history.** Cancellation releases the
   inventory but preserves who booked it and the original price for a useful
   sales record.
4. **Projects, buildings, and units are separate records.** This models real
   inventory relationships directly and makes availability and pricing
   manageable at the unit level.
5. **Authentication uses server-side sessions and password hashing.** Passwords
   use Node.js `scrypt`; the browser receives only a random, HTTP-only session
   cookie, while the database stores a hash of that session token.

## Checks

```bash
npm run db:generate
npx prisma validate
npx tsc --noEmit
npm run lint
npm run build
```
