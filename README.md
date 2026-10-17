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

For a new installation, run `database\foodieexpress.sql` against your MySQL server using MySQL Workbench or the MySQL command-line client. The script creates `foodieexpress`, the menu, account, order, offer, and bundle tables if they do not exist. Its sample menu rows are inserted only when their IDs are unused; rerunning the script does not overwrite existing menu rows or remove order data.

For an existing installation, run any missing migration scripts in order after selecting `foodieexpress`: `database\migrations\001_add_order_tables.sql`, `database\migrations\002_add_auth_tables.sql`, and `database\migrations\003_add_user_phone_gender.sql` if the authentication tables were installed before phone/gender fields were added. Then run `npm run db:migrate:account`, `npm run db:migrate:offers`, and `npm run db:migrate:locations` from the project root. Run these application migrations for new installations as well, after applying the base schema. The account migration safely applies profile, address, and wishlist tables. The special-offers migration adds featured-dish controls, app-visibility settings, offer and bundle tables, and order-item offer snapshots; it also seeds the current recommended-mains BOGO as an editable offer. The delivery-location migration adds structured city, state, and postal-code snapshots to orders while preserving all existing address and order records. These migrations are idempotent and preserve existing menu, customer, and order data. The current API reads `menu_dishes`; any older `food_items` table is left untouched.

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

- Storefront pages:
  - Home: http://127.0.0.1:5173/
  - Our menu: http://127.0.0.1:5173/menu
  - Our story: http://127.0.0.1:5173/story
  - Kind words: http://127.0.0.1:5173/reviews
  - Contact: http://127.0.0.1:5173/contact
- Customer registration: http://127.0.0.1:5173/register
- Customer sign-in: http://127.0.0.1:5173/login
- Admin sign-in: http://127.0.0.1:5173/admin/login
- Admin dashboard: http://127.0.0.1:5173/admin/dashboard
- Manage menu: http://127.0.0.1:5173/admin/menu
- Special offers: http://127.0.0.1:5173/admin/offers
- Manage orders: http://127.0.0.1:5173/admin/orders
- Backend and database health: http://localhost:5503/api/health
- Menu API: http://localhost:5503/api/foods

`GET /api/health` returns HTTP 200 when MySQL is reachable and HTTP 503 with `backend: "running"` and `database.connected: false` when it is not. The API continues to run so this status remains inspectable while MySQL is unavailable.

## Features and security notes

- Menu data and orders use the local MySQL database.
- Customers can register at `http://127.0.0.1:5173/register` with name, phone number, gender, email, and password. Gender options are Female, Male, Non-binary, and Prefer not to say. Phone numbers must contain 7–15 digits; spaces and common international formatting characters are allowed. Customers can then sign in at `/login`. Passwords are stored as salted scrypt hashes; authentication uses an HttpOnly, SameSite cookie backed by expiring MySQL sessions. Registration creates customer-role accounts only.
- The registered owner account has been granted the admin role in the current local database. For any future owner account, first register it, then run `UPDATE users SET role='admin' WHERE email='owner@example.com';` in MySQL, replacing the example with that account's email. Never add a public admin-registration option.
- `/admin/login` is the dedicated administrator sign-in page. After authentication, `/admin/dashboard` shows menu, order, and active-offer summaries, with separate `/admin/menu`, `/admin/offers`, and `/admin/orders` pages for management. `/admin` opens the dashboard for admins or redirects signed-out visitors to admin sign-in. Menu create/edit/delete, image uploads, offers, bundles, order list/detail, and order status endpoints are protected by server-side role checks; no admin link is exposed in the customer storefront navigation or footer.
- The admin workspace uses a left sidebar for Dashboard, Menu, Orders, Pending orders, and Offers & bundles. Its dashboard summarizes today's non-cancelled sales, order count and average order value, with a seven-day sales chart, order-status breakdown, recent orders, and a delivery-area section grouped by city/state. Expand a city to view its orders and customer-entered addresses. Older free-text addresses are grouped only when their city is clear; ambiguous historical locations remain marked as unrecorded. Checkout stores city, state, and postal code with each new order alongside the full street address. Use **Refresh data** to reload the figures. No GPS coordinates are collected.
- Dish changes are saved through the Express API to MySQL and are reflected in the customer menu. Name, category, selling price, and original price are required; description, tag, preparation time, and image are optional.
- The admin menu opens with the current catalogue at the top. Use **Add new dish** to open the dish form in a modal, or **Edit** on an existing dish to edit its details and gallery in that modal.
- The menu editor supports a cover image and, when editing a saved dish, a gallery of up to 10 additional JPEG, PNG, or WebP photos (5 MB each) and one MP4 or WebM video (50 MB). Run `npm run db:migrate:gallery` once on an existing database before restarting the API. Gallery metadata is stored in `menu_dish_media`; uploaded files are validated and saved under `server/uploads/`. The storefront menu and recommendations allow customers to browse the dish media. Back up `server/uploads/` together with the database to preserve uploaded media.
- The restaurant recommendations are visible on both Home and Our menu. Admins choose which individual dishes are featured using the menu editor; new installs initially feature the Bestseller, Chef's pick, and Fan favourite sample mains.
- Admins can create, edit, pause, and delete Buy 1 Get 1 Free, percentage-off, and fixed-amount offers. Offers can target selected dishes or the entire menu; activating an overlapping offer automatically deactivates the previous offer for those dishes. The initial recommended-mains BOGO is seeded by migration and can be managed like any other offer.
- Checkout prices and discounts are recalculated from current MySQL prices and active offers on the backend. BOGO charges for one serving per pair; percentage and fixed discounts apply per serving and are capped at the dish price. Order items retain the offer title and discount snapshot for customer order history. Offers, item discounts, and existing order discounts are committed with the order in a transaction.
- The Special offers admin page also controls whether active promotions are featured in the app, separately from whether their discounts remain active. Admins can create bundle products from existing dishes, set component quantities and a manual bundle price, and independently control purchase availability and app visibility. Customers can add bundles as their own cart items; bundle prices and component values are checked against current MySQL data at checkout and saved as order-item snapshots.
- The cart is kept in browser local storage; order history remains in MySQL.
- Signed-in customers can manage their profile, saved addresses, wishlist, order history, and cancellations at `/account`. On the menu, click a dish's heart to choose which wishlist section to save it in. Wishlist sections can be created, renamed, deleted, and named for anyone in the family; a dish can be saved in more than one section. Existing wishlist dishes are kept in a default section. Saved addresses can be selected at checkout. New orders placed while signed in are linked to that account; guest checkout remains available. Existing orders are not retroactively assigned to accounts. Only pending account-owned orders can be cancelled.
- After running `npm run db:migrate:account` and `npm run db:migrate:offers`, start the backend with `npm run backend`. This project's API uses port 5503 to avoid the unrelated process currently occupying port 5000. Sign in before opening `/account`; customer data and order history are available only to the signed-in account.
- Run `npm run test:account` to verify profile, address book, custom wishlist sections and dishes, order history, and cancellation API flows. It creates a clearly marked temporary customer and test order, then removes them and their related records.
- Run `npm run test:offers` with the backend running to verify offer access and calculations, admin-only bundle management, hidden/visible bundle behavior, manual bundle price validation, bundle checkout snapshots, and overlap replacement. It creates temporary test data and restores the original offer activation states.
- Checkout is a local demo and does not process online payments.
- Sign-in/register endpoints allow a limited number of attempts per IP. Use HTTPS and set `NODE_ENV=production` when deploying publicly so session cookies receive the Secure attribute. This local project has no password-reset or email-verification flow.
