USE foodieexpress;

CREATE TABLE IF NOT EXISTS address_book (
  id INT AUTO_INCREMENT PRIMARY KEY,
  user_id INT NOT NULL,
  label VARCHAR(40) NOT NULL,
  recipient VARCHAR(100) NOT NULL,
  phone VARCHAR(20) NOT NULL,
  line1 VARCHAR(200) NOT NULL,
  line2 VARCHAR(200) NOT NULL DEFAULT '',
  city VARCHAR(100) NOT NULL,
  state VARCHAR(100) NOT NULL,
  postal_code VARCHAR(20) NOT NULL,
  is_default BOOLEAN NOT NULL DEFAULT FALSE,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT fk_address_book_user FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
  INDEX idx_address_book_user (user_id)
);

CREATE TABLE IF NOT EXISTS wishlist_items (
  user_id INT NOT NULL,
  dish_id INT NOT NULL,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (user_id,dish_id),
  CONSTRAINT fk_wishlist_user FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
  CONSTRAINT fk_wishlist_dish FOREIGN KEY (dish_id) REFERENCES menu_dishes(id) ON DELETE CASCADE,
  INDEX idx_wishlist_dish (dish_id)
);

ALTER TABLE orders
  ADD COLUMN user_id INT NULL AFTER id,
  ADD INDEX idx_orders_user (user_id),
  ADD CONSTRAINT fk_orders_user FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE SET NULL;
