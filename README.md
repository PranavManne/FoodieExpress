# FoodieExpress Full-Stack (React + Express + MySQL)

## Requirements

- Node.js and npm
- MySQL 8.0 running locally
- A MySQL account with permission to create/use the `foodieexpress` database and its tables

## Configure and initialize

From the project root in PowerShell:

```powershell
cd C:\Users\manne\Downloads\FoodieExpress_Final
npm install
if (-not (Test-Path .env)) { Copy-Item .env.example .env }
if (-not (Test-Path 'server\.env')) { Copy-Item 'server\.env.example' 'server\.env' }
```

Edit `.env` to configure `VITE_API_BASE_URL` if Express is not at its default URL. Edit `server\.env` with the MySQL host, port, username, password, and database name for your local installation. An empty `DB_PASSWORD` is supported when the MySQL account intentionally has no password; do not commit or share `server\.env`.

For a new installation, run `database\foodieexpress.sql` against your MySQL server using MySQL Workbench or the MySQL command-line client. The script creates `foodieexpress`, `menu_dishes`, `orders`, `order_items`, `users`, and `auth_sessions` if they do not exist. Its sample menu rows are inserted only when their IDs are unused; rerunning the script does not overwrite existing menu rows or remove order data.

For an existing installation, run any missing migration scripts in order after selecting `foodieexpress`: `database\migrations\001_add_order_tables.sql`, `database\migrations\002_add_auth_tables.sql`, and `database\migrations\003_add_user_phone_gender.sql` if the authentication tables were installed before phone/gender fields were added. Then run `npm run db:migrate:account` from the project root to safely apply the customer account schema. This account migration is idempotent: it creates the address book and wishlist if missing and adds nullable account ownership to orders only when needed, without removing or rewriting existing records. The current API reads `menu_dishes`; any older `food_items` table is left untouched.

## Start the application

The most reliable local workflow is two PowerShell terminals opened at the project root:

```powershell
npm run backend
```

```powershell
npm run frontend
```

Alternatively, `npm run dev` starts both processes with `concurrently`. The frontend uses a strict port so it fails clearly instead of silently moving away from the configured CORS origin.

If `npm run dev` reports `spawn cmd.exe ENOENT`, that is a Windows shell lookup/environment issue, not a MySQL or React error. Check the current shell without changing project files:

```powershell
$env:ComSpec
Test-Path "$env:WINDIR\System32\cmd.exe"
Get-Command node, npm
```

If `cmd.exe` exists but is missing from this PowerShell session's command lookup, you can correct only this session and retry:

```powershell
$env:ComSpec = "$env:WINDIR\System32\cmd.exe"
$env:Path = "$env:WINDIR\System32;$env:Path"
npm run dev
```

If the `Test-Path` check is false, repair the Windows installation/environment instead of changing application code.

## URLs

- Storefront: http://127.0.0.1:5173/
- Customer registration: http://127.0.0.1:5173/register
- Customer sign-in: http://127.0.0.1:5173/login
- Admin dashboard: http://127.0.0.1:5173/admin
- Backend and database health: http://localhost:5503/api/health
- Menu API: http://localhost:5503/api/foods

`GET /api/health` returns HTTP 200 when MySQL is reachable and HTTP 503 with `backend: "running"` and `database.connected: false` when it is not. The API continues to run so this status remains inspectable while MySQL is unavailable.

## Features and security notes

- Menu data and orders use the local MySQL database.
- Customers can register at `http://127.0.0.1:5173/register` with name, phone number, gender, email, and password. Gender options are Female, Male, Non-binary, and Prefer not to say. Phone numbers must contain 7–15 digits; spaces and common international formatting characters are allowed. Customers can then sign in at `/login`. Passwords are stored as salted scrypt hashes; authentication uses an HttpOnly, SameSite cookie backed by expiring MySQL sessions. Registration creates customer-role accounts only.
- The registered owner account has been granted the admin role in the current local database. For any future owner account, first register it, then run `UPDATE users SET role='admin' WHERE email='owner@example.com';` in MySQL, replacing the example with that account's email. Never add a public admin-registration option.
- `http://127.0.0.1:5173/admin` requires an admin account. Menu create/edit/delete, image uploads, order list/detail, and order status endpoints are also protected by server-side role checks.
- Dish changes are saved through the Express API to MySQL and are reflected in the customer menu. Name, category, selling price, and original price are required; description, tag, preparation time, and image are optional.
- Upload JPEG, PNG, or WebP menu photos (up to 5 MB) from a phone or computer. Express validates and saves the files under `server/uploads/`; the existing MySQL `image` field stores their URL, so no schema migration is required. Back up `server/uploads/` together with the database to preserve the uploaded photos.
- Search is not currently implemented; category filtering, cart quantity controls, and discounts are provided.
- Checkout prices and discounts are recalculated from database values on the backend. Orders and their items are committed in a transaction.
- The cart is kept in browser local storage; order history remains in MySQL.
- Signed-in customers can manage their profile, saved addresses, wishlist, order history, and cancellations at `/account`. Saved addresses can be selected at checkout. New orders placed while signed in are linked to that account; guest checkout remains available. Existing orders are not retroactively assigned to accounts. Only pending account-owned orders can be cancelled.
- After running `npm run db:migrate:account`, start the backend with `npm run backend`. This project's API uses port 5503 to avoid the unrelated process currently occupying port 5000. Sign in before opening `/account`; customer data and order history are available only to the signed-in account.
- Run `npm run test:account` to verify profile, address book, wishlist, order history, and cancellation API flows. It creates a clearly marked temporary customer and test order, then removes them and their related records.
- Checkout is a local demo and does not process online payments.
- Sign-in/register endpoints allow a limited number of attempts per IP. Use HTTPS and set `NODE_ENV=production` when deploying publicly so session cookies receive the Secure attribute. This local project has no password-reset or email-verification flow.
