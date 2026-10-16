# FoodieExpress End-to-End Testing Guide

This guide tests the existing React/Vite storefront and admin dashboard, Express API, and MySQL database together. It uses the project's actual API paths and schema. Work through the stages in order and record PASS, FAIL, or NOT TESTED for each test.

## 1. Project-specific facts and safety

- Frontend: React and Vite, served at `http://127.0.0.1:5173`.
- Backend: Express, normally served at `http://localhost:5503`.
- Health endpoint: `GET /api/health`.
- Menu endpoint: `GET /api/foods` (plural).
- Order endpoints: `POST /api/orders`, `GET /api/orders`, `GET /api/orders/:id`, and `PATCH /api/orders/:id/status`.
- Admin menu endpoints: `GET /api/foods`, `POST /api/foods`, `PUT /api/foods/:id`, and `DELETE /api/foods/:id`.
- Menu data is read from `foodieexpress.menu_dishes`. Do not assume the legacy `food_items` table powers the current storefront.
- Order persistence requires `orders` and `order_items`.
- The admin page has **no login protection**. Use it only in a trusted local environment.
- Checkout records orders but does **not** process payments.
- Never paste, print, or commit the real MySQL password. The backend reads it from `server\.env`.
- Do not delete, truncate, or modify existing menu/order data during testing. For cleanup, target only the uniquely named test order or test menu item you created.

## 2. Prepare the environment

1. Open PowerShell in the project root:

   ```powershell
   Set-Location 'C:\Users\manne\Downloads\FoodieExpress_Final'
   ```

2. Confirm Node.js, npm, and MySQL command-line tools are available:

   ```powershell
   node --version 
   npm --version
   Get-Command node, npm, mysql, mysqld
   ```

3. If dependencies have not been installed, install them:

   ```powershell
   npm install
   ```

4. Confirm the local configuration files exist without printing their values:

   ```powershell
   Test-Path '.env'
   Test-Path 'server\.env'
   ```

   If either file is missing, create it from its placeholder template:

   ```powershell
   if (-not (Test-Path '.env')) { Copy-Item '.env.example' '.env' }
   if (-not (Test-Path 'server\.env')) { Copy-Item 'server\.env.example' 'server\.env' }
   ```

   Configure `server\.env` locally with your MySQL host, port, account, password, and database (`foodieexpress`). A blank password is valid only if that MySQL account intentionally has no password. The root `.env` configures `VITE_API_BASE_URL`; the default is `http://localhost:5503/api`.

5. Check that MySQL is running:

   ```powershell
   Get-Service -Name 'MySQL80' -ErrorAction SilentlyContinue
   Test-NetConnection 127.0.0.1 -Port 3306
   ```

   **Pass:** the MySQL service is Running and TCP port 3306 is reachable.

6. Check the application ports before starting anything:

   ```powershell
   foreach ($port in @(5503, 5173)) {
     $listener = Get-NetTCPConnection -State Listen -LocalPort $port -ErrorAction SilentlyContinue
     if ($listener) {
       $listener | Select-Object LocalAddress, LocalPort, OwningProcess
       Write-Output "Port $port is already in use; identify its process before starting another server."
     } else {
       Write-Output "Port $port is available."
     }
   }
   ```

   Do not start another copy on an occupied port. Identify the reported process with:

   ```powershell
   Get-Process -Id <PID>
   ```

7. If `npm run dev` fails with `spawn cmd.exe ENOENT`, check the current Windows shell environment:

   ```powershell
   $env:ComSpec
   Test-Path "$env:WINDIR\System32\cmd.exe"
   $env:Path -split ';' | Where-Object { $_ -ieq "$env:WINDIR\System32" }
   ```

   If `cmd.exe` exists but `System32` is absent from the current session's PATH, correct only that PowerShell session and retry:

   ```powershell
   $env:Path = "$env:WINDIR\System32;$env:Path"
   $env:ComSpec = "$env:WINDIR\System32\cmd.exe"
   ```

   If `cmd.exe` does not exist, repair the Windows environment. Do not change the app to mask a missing operating-system executable.

## 3. Verify MySQL and the existing schema

1. Connect with the MySQL CLI. Substitute the username configured in `server\.env`; `-p` prompts for the password without placing it in the command:

   ```powershell
   mysql --host=127.0.0.1 --port=3306 --user=<DB_USER> -p
   ```

2. At the MySQL prompt, inspect the database, tables, row counts, column types, and foreign keys:

   ```sql
   SELECT VERSION() AS mysql_version, DATABASE() AS selected_database;
   USE foodieexpress;
   SHOW TABLES;
   SHOW COLUMNS FROM menu_dishes;
   SHOW COLUMNS FROM orders;
   SHOW COLUMNS FROM order_items;
   SELECT COUNT(*) AS menu_dish_count FROM menu_dishes;
   SELECT COUNT(*) AS order_count FROM orders;
   SELECT COUNT(*) AS order_item_count FROM order_items;
   SELECT id, name, category, price, old_price FROM menu_dishes ORDER BY id;
   SELECT CONSTRAINT_NAME, TABLE_NAME, COLUMN_NAME, REFERENCED_TABLE_NAME, REFERENCED_COLUMN_NAME
     FROM information_schema.KEY_COLUMN_USAGE
     WHERE TABLE_SCHEMA = 'foodieexpress'
       AND TABLE_NAME = 'order_items'
       AND REFERENCED_TABLE_NAME IS NOT NULL;
   ```

   `DATABASE()` may be `NULL` until `USE foodieexpress` is run. The expected menu columns include `id`, `name`, `category`, `price`, `old_price`, `description`, `image`, `tag`, and `prep_time`. The order item table should reference `orders.id` and `menu_dishes.id`.

3. **Pass:** MySQL is version 8.0.x; `foodieexpress` exists; the three application tables are present; prices and totals use `DECIMAL(10,2)`; existing rows are readable; and the order foreign keys are present.

4. If `orders` or `order_items` are missing, stop and review the existing schema first. The safe, additive migration is `database\migrations\001_add_order_tables.sql`. Apply it only after confirming `foodieexpress` and `menu_dishes` exist:

   ```powershell
   mysql --host=127.0.0.1 --port=3306 --user=<DB_USER> -p foodieexpress < 'database\migrations\001_add_order_tables.sql'
   ```

   This migration uses `CREATE TABLE IF NOT EXISTS`; it does not drop tables, rewrite menu rows, or remove orders.

## 4. Build the frontend

From the project root:

```powershell
npm run build
```

**Pass:** Vite exits successfully and produces `dist\index.html` and bundled assets. **Fail:** investigate the first reported compilation/import error before proceeding.

## 5. Start the backend and verify health

1. In PowerShell terminal 1, from the project root:

   ```powershell
   Set-Location 'C:\Users\manne\Downloads\FoodieExpress_Final'
   npm run backend
   ```

2. **Pass:** the terminal reports the API is listening and `MySQL connected successfully`. If configuration is invalid or missing, correct `server\.env`; do not copy the password into a command or report.

3. In another terminal or browser, check health:

   ```powershell
   Invoke-RestMethod 'http://localhost:5503/api/health'
   ```

   **Pass:** HTTP 200 with `status = ok`, `backend = running`, and `database.connected = true`.

4. Check that invalid routes return a JSON 404 rather than an HTML stack trace:

   ```powershell
   try {
     Invoke-RestMethod 'http://localhost:5503/api/not-a-real-route'
     throw 'Unexpected success for unknown route.'
   } catch {
     if ($_.Exception.Response.StatusCode.value__ -ne 404) { throw }
     Write-Output 'PASS: unknown route returns HTTP 404.'
   }
   ```

5. Check database-failure handling on a **separate, temporary test server**, not the normal server. This deliberately points a new process at a closed database port and must not change your real MySQL data:

   ```powershell
   $env:PORT = '5502'
   $env:DB_PORT = '1'
   npm run backend
   ```

   In another terminal:

   ```powershell
   Invoke-RestMethod 'http://localhost:5502/api/health'
   ```

   **Pass:** health returns HTTP 503, reports `backend = running` and `database.connected = false`, and does not disclose connection details. Stop this temporary server with Ctrl+C, then close its terminal. Restore the usual process environment by opening a fresh terminal (or, in the same terminal, set `Remove-Item Env:DB_PORT` and `Remove-Item Env:PORT` before starting the normal server).

## 6. Test the menu and validation APIs

1. Fetch the menu:

   ```powershell
   $foods = Invoke-RestMethod 'http://localhost:5503/api/foods'
   $foods | Format-Table id, name, category, price, oldPrice
   ```

   **Pass:** HTTP 200, a JSON array, database-backed dish records, numeric `price` and `oldPrice`, and the expected fields `id`, `name`, `category`, `description`, `image`, `tag`, and `time`. Compare the API's row count with `SELECT COUNT(*) FROM menu_dishes`.

2. Fetch an unknown route and submit invalid JSON/order/menu input. Each request must fail safely; no SQL error, credentials, or stack trace should appear in the response.

   Order validation cases (each should return HTTP 400):
   - Missing name, phone, address, or `items`.
   - Empty `items` array or more than 50 item entries.
   - Phone number containing letters or an invalid length.
   - Quantity 0, negative, fractional, or above 99.
   - An item with a missing, nonnumeric, or nonexistent dish ID.
   - A repeated dish whose combined quantity exceeds 99.
   - Malformed JSON.

   Menu validation cases (HTTP 400):
   - Missing/blank dish name or a name longer than 150 characters.
   - Unsupported category.
   - Zero/negative price, original price lower than selling price, or a value above the supported `DECIMAL(10,2)` range.
   - A non-HTTP(S) image URL or an image URL longer than 2048 characters.
   - A description over 5000 characters, tag over 100 characters, or preparation time over 50 characters.

   An invalid order must not add any rows to `orders` or `order_items`; compare counts before and after in MySQL.

## 7. Start the frontend and test storefront behavior

1. In PowerShell terminal 2, from the project root:

   ```powershell
   Set-Location 'C:\Users\manne\Downloads\FoodieExpress_Final'
   npm run frontend
   ```

2. Open **http://127.0.0.1:5173/**. Use browser Developer Tools:
   - Console: no uncaught errors.
   - Network: `GET http://localhost:5503/api/foods` returns HTTP 200.
   - Elements/UI: menu dishes match the records served by `/api/foods`.

3. Test menu loading states:
   - With the backend running, menu cards appear and the loading message disappears.
   - Stop the backend briefly and reload: a useful “Unable to load the menu” message appears; the page does not crash.
   - Restart the backend and reload: the menu recovers.

4. Test categories using the tabs. With the verified six-row sample menu, expected counts are All: 6; Mains: 3; Sides: 1; Desserts: 1; Fresh: 1. If the database menu has changed, compare each displayed category to the current MySQL/API data instead.

5. **Search feature:** the current storefront has category tabs but no search box/search behavior. Mark search tests **NOT APPLICABLE** rather than treating a nonexistent feature as a failure.

6. Test cart and quantity controls:
   - Add a dish; the bag count and cart item both increase.
   - Add the same dish repeatedly; its quantity and line total increase correctly.
   - Decrease quantity; it decreases by one.
   - Decrease quantity to zero; the item is removed.
   - Add multiple different dishes; verify each has the correct name, image, unit sale price, original price, and line total.
   - Reload the page; verify cart contents and bag count persist.
   - Remove remaining items; cart count becomes zero and the empty-cart state is shown.

7. Test totals using the current sample prices:
   - Three Hyderabadi Dum Biryani at ₹249 each: original price ₹897, item savings ₹150, subtotal ₹747, extra discount ₹75, final total ₹672.
   - One biryani: subtotal ₹249 and no extra discount.
   - Two biryanis: subtotal ₹498 and no extra discount (the threshold is **above** ₹500, not ₹500 or more).
   - Add enough items to make subtotal greater than ₹500: the order discount is 10%, rounded to the nearest whole rupee, and is subtracted from subtotal.
   - Verify the displayed “amount more” hint at or below the threshold and the discount message above it.

8. Test checkout validation from the cart:
   - Submit with no customer fields: browser validation should block submission.
   - Enter a malformed phone number such as `abc12345`: browser/server validation should reject it.
   - Confirm name, phone, and address limits/required status.
   - Confirm the Place order button is disabled while the request is in flight.
   - Do not click twice or refresh during submission; first verify a completed request in Network to avoid duplicate test orders.

## 8. Create and verify one clearly identified test order

Use a visibly test-only customer and delivery address. This creates a real database record, so either keep it as test evidence or remove only that exact record after verification.

### Option A: Place the order through the storefront

1. Add three biryanis to the cart (expected final total ₹672 using the sample data).
2. Enter a name such as `E2E QA <date-time>`, a test phone number, and an address explicitly marked `AUTOMATED TEST - NOT FOR DELIVERY`.
3. Submit the order once.
4. **Pass:** only after the server confirms HTTP 201 does the cart clear and an `Order #<id> saved successfully` confirmation appear.
5. If the request fails, **Fail:** preserve the cart and show the error; do not count a failure toast as success.
6. Use the displayed order ID in the database and admin checks below.

### Option B: Submit directly to Express from PowerShell

```powershell
$testName = "E2E QA $(Get-Date -Format 'yyyyMMdd-HHmmss')"
$body = @{
  customerName = $testName
  phone = '9876543210'
  address = 'AUTOMATED TEST - NOT FOR DELIVERY'
  items = @(@{ id = 1; quantity = 3 })
} | ConvertTo-Json -Depth 5

$created = Invoke-RestMethod `
  -Uri 'http://localhost:5503/api/orders' `
  -Method Post `
  -ContentType 'application/json' `
  -Body $body
$created
```

**Pass:** HTTP 201 and a positive `orderId`; server-calculated totals match the trusted database menu price, not a client-supplied total. For the sample first dish and three units, expect original ₹897, item discount ₹150, subtotal ₹747, extra discount ₹75, total ₹672.

### Verify order persistence, retrieval, and admin status

1. Retrieve the order:

   ```powershell
   $orderId = $created.orderId
   Invoke-RestMethod "http://localhost:5503/api/orders/$orderId"
   ```

   **Pass:** the `order` and `items` match the test customer, selected dish, quantity, prices, discounts, and total.

2. In MySQL, verify the same exact record (substitute the returned ID):

   ```sql
   SELECT id, customer_name, phone, original_total, item_discount, subtotal, extra_discount, total, status, created_at
     FROM orders WHERE id = <ORDER_ID>;
   SELECT order_id, dish_id, dish_name, unit_price, original_price, quantity, line_total
     FROM order_items WHERE order_id = <ORDER_ID>;
   ```

   **Pass:** exactly one order and the expected line item are stored with `Pending` status.

3. List orders:

   ```powershell
   Invoke-RestMethod 'http://localhost:5503/api/orders'
   ```

   **Pass:** the newly created order appears in the returned array.

4. Open **http://127.0.0.1:5173/admin**:
   - The Orders tab shows the test order and totals.
   - “View order details” opens `/api/orders/<id>` and shows the same record.
   - Change status to `Preparing`; refresh and verify it persists.
   - Optionally test `Out for delivery`, `Completed`, and `Cancelled` using only the test order. Do not cancel or alter someone else's order.
   - Invalid status values through the API should return HTTP 400.

5. Restart the backend and repeat the order GET. **Pass:** the order remains in MySQL; server restarts do not erase persisted data.

### Optional cleanup for the test order

Cleanup is optional. Keep the order as test evidence if preferred. If removing it, first verify the order ID and unique test customer name. The following transaction targets only that ID/name pair; the foreign key normally removes its order items automatically:

```sql
START TRANSACTION;
SELECT id, customer_name FROM orders WHERE id = <ORDER_ID>;
DELETE FROM orders
 WHERE id = <ORDER_ID>
   AND customer_name = '<EXACT_TEST_CUSTOMER_NAME>'
   AND address = 'AUTOMATED TEST - NOT FOR DELIVERY';
SELECT COUNT(*) AS remaining_test_orders
  FROM orders
 WHERE id = <ORDER_ID>
   AND customer_name = '<EXACT_TEST_CUSTOMER_NAME>';
COMMIT;
```

Confirm the `SELECT` identifies only the test record before issuing `DELETE`. If it does not, run `ROLLBACK` and stop. Verify the related item is gone:

```sql
SELECT COUNT(*) AS remaining_test_items FROM order_items WHERE order_id = <ORDER_ID>;
```

Do not use broad deletes, wildcard customer names, `TRUNCATE`, or `DROP`.

## 9. Test the admin menu CRUD without touching sample dishes

1. Open **http://127.0.0.1:5173/admin** and the Menu tab.
2. Create a uniquely named item, e.g. `E2E QA Dish <date-time>`, with a supported category, sale price, higher original price, description, HTTPS image URL, tag, and preparation time.
3. **Pass:** a success message appears, the new item appears in admin, and `GET /api/foods` returns it.
4. Edit only this test dish. Change its description/price and save.
5. **Pass:** the changed fields appear in admin and the API; the category filter on the storefront reflects its category.
6. Submit invalid test dish details; **pass:** HTTP 400 and the database row remains unchanged.
7. Delete only the uniquely named test dish using the admin Delete action; confirm the prompt.
8. **Pass:** the test dish is removed from the menu. Verify with:

   ```sql
   SELECT id, name FROM menu_dishes WHERE name = '<EXACT_TEST_DISH_NAME>';
   ```

   It should return no row. Existing seeded/customer dishes must remain.

## 10. CORS, API configuration, and request security checks

1. Confirm the configured storefront origin works: browser requests from `http://127.0.0.1:5173` should receive API responses and the expected CORS header.
2. Confirm an untrusted `Origin` is rejected (HTTP 403); do not loosen CORS to `*` as a workaround.
3. Confirm frontend bundles and browser storage do not contain MySQL credentials. Only `VITE_API_BASE_URL` belongs in the frontend `.env`; database secrets belong only in ignored `server\.env`.
4. Verify API URLs in Network use the configured base URL and the `/foods` and `/orders` paths.
5. Confirm server SQL statements continue to use placeholders for user-provided values; never test SQL injection against a real/production database.
6. Check that invalid input produces JSON status/error responses and not SQL details, stack traces, file paths, or credentials.
7. Confirm request bodies larger than the configured 1 MB limit fail with HTTP 413, not a server crash.
8. Keep admin local-only: there is no authentication/authorization. Do not expose this app publicly until access control is implemented.

## 11. Final regression checklist and shutdown

Before finishing, record the result of every applicable item:

- [ ] MySQL 8.0 service reachable; correct database selected.
- [ ] `menu_dishes`, `orders`, and `order_items` have expected columns/types/foreign keys.
- [ ] Existing menu/order data preserved; no broad deletion or truncation used.
- [ ] `npm run build` passes.
- [ ] Backend starts and logs its listen/database status.
- [ ] Health returns 200 when MySQL is available.
- [ ] Health returns sanitized 503 when MySQL is unavailable.
- [ ] Menu API matches MySQL rows and frontend displays them.
- [ ] Invalid orders, dishes, statuses, JSON, and unknown paths are rejected safely.
- [ ] CORS permits the configured local frontend and rejects an untrusted origin.
- [ ] Category filters, loading/error states, cart add/remove/quantity, and totals work.
- [ ] Cart survives refresh and clears only after successful checkout.
- [ ] Checkout errors do not show a success confirmation.
- [ ] A test order is created, retrieved, verified in MySQL, and either deliberately retained or narrowly cleaned up.
- [ ] Admin menu CRUD and test-order status changes work without altering existing records.
- [ ] Browser Console has no uncaught errors; Network responses have the expected statuses.
- [ ] No unexpected processes or test servers remain on ports 5503, 5173, or any temporary test port.

Stop foreground backend/frontend terminals with Ctrl+C. Recheck ports before launching again; do not terminate a process unless you have identified that it is the test server you started.
