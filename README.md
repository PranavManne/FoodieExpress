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

For a new installation, run `database\foodieexpress.sql` against your MySQL server using MySQL Workbench or the MySQL command-line client. The script creates `foodieexpress`, `menu_dishes`, `orders`, and `order_items` if they do not exist. Its sample menu rows are inserted only when their IDs are unused; rerunning the script does not overwrite existing menu rows or remove order data.

For an existing installation where only the order tables are missing, run `database\migrations\001_add_order_tables.sql` after selecting `foodieexpress`. It uses `CREATE TABLE IF NOT EXISTS` and does not modify menu rows or existing orders. The current API reads `menu_dishes`; any older `food_items` table is left untouched.

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
- Admin dashboard: http://127.0.0.1:5173/admin
- Backend and database health: http://localhost:5000/api/health
- Menu API: http://localhost:5000/api/foods

`GET /api/health` returns HTTP 200 when MySQL is reachable and HTTP 503 with `backend: "running"` and `database.connected: false` when it is not. The API continues to run so this status remains inspectable while MySQL is unavailable.

## Features and security notes

- Menu data and orders use the local MySQL database.
- Open `http://127.0.0.1:5173/admin` to add, edit, or remove menu dishes. Dish changes are saved through the Express API to MySQL and are reflected in the customer menu. Name, category, selling price, and original price are required; description, tag, preparation time, and image URL are optional.
- Search is not currently implemented; category filtering, cart quantity controls, and discounts are provided.
- Checkout prices and discounts are recalculated from database values on the backend. Orders and their items are committed in a transaction.
- The cart is kept in browser local storage; order history remains in MySQL.
- Checkout is a local demo and does not process online payments.
- The admin dashboard has no login protection. Keep it on a trusted local network and do not expose it to the public internet without adding authentication and authorization.
