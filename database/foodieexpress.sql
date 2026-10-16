CREATE DATABASE IF NOT EXISTS foodieexpress;
USE foodieexpress;

CREATE TABLE IF NOT EXISTS menu_dishes (
  id INT AUTO_INCREMENT PRIMARY KEY,
  name VARCHAR(150) NOT NULL,
  category VARCHAR(50) NOT NULL,
  price DECIMAL(10,2) NOT NULL,
  old_price DECIMAL(10,2) NOT NULL,
  description TEXT,
  image TEXT,
  tag VARCHAR(100),
  prep_time VARCHAR(50)
);

INSERT INTO menu_dishes
(id,name,category,price,old_price,description,image,tag,prep_time)
VALUES
(1,'Hyderabadi Dum Biryani','Mains',249,299,'Fragrant basmati rice, slow-cooked spices and tender chicken.','https://images.unsplash.com/photo-1633945274405-b6c8069047b0?auto=format&fit=crop&w=1000&q=85','Bestseller','25–30 min'),
(2,'Truffle Mushroom Pizza','Mains',329,399,'Wood-fired crust, roasted mushrooms and a little truffle magic.','https://images.unsplash.com/photo-1579751626657-72bc17010498?auto=format&fit=crop&w=1000&q=85','Chef''s pick','20–25 min'),
(3,'Smash House Burger','Mains',219,279,'A juicy, golden-edged patty with house sauce and crisp lettuce.','https://images.unsplash.com/photo-1568901346375-23c9450c58cd?auto=format&fit=crop&w=1000&q=85','Fan favourite','20–25 min'),
(4,'Crispy Parmesan Fries','Sides',129,159,'Twice-cooked potatoes, parmesan dust and a herb finish.','https://images.unsplash.com/photo-1573080496219-bb080dd4f877?auto=format&fit=crop&w=1000&q=85','Perfect side','15–20 min'),
(5,'Berry Cloud Pancakes','Desserts',189,229,'Fluffy buttermilk pancakes, fresh berries and maple drizzle.','https://images.unsplash.com/photo-1528207776546-365bb710ee93?auto=format&fit=crop&w=1000&q=85','Sweet treat','20–25 min'),
(6,'Garden Glow Salad','Fresh',169,199,'Crunchy greens, avocado, seasonal vegetables and citrus dressing.','https://images.unsplash.com/photo-1512621776951-a57141f2eefd?auto=format&fit=crop&w=1000&q=85','Fresh choice','15–20 min')
ON DUPLICATE KEY UPDATE id=menu_dishes.id;

CREATE TABLE IF NOT EXISTS users (
  id INT AUTO_INCREMENT PRIMARY KEY,
  name VARCHAR(100) NOT NULL,
  phone VARCHAR(20) NOT NULL,
  gender ENUM('female','male','non_binary','prefer_not_to_say') NOT NULL,
  email VARCHAR(254) NOT NULL UNIQUE,
  password_hash CHAR(128) NOT NULL,
  password_salt CHAR(32) NOT NULL,
  role ENUM('customer','admin') NOT NULL DEFAULT 'customer',
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS auth_sessions (
  id BIGINT AUTO_INCREMENT PRIMARY KEY,
  user_id INT NOT NULL,
  token_hash CHAR(64) NOT NULL UNIQUE,
  expires_at TIMESTAMP NOT NULL,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT fk_auth_sessions_user FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
  INDEX idx_auth_sessions_expiry (expires_at)
);

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

CREATE TABLE IF NOT EXISTS orders (
  id INT AUTO_INCREMENT PRIMARY KEY,
  user_id INT NULL,
  customer_name VARCHAR(120) NOT NULL,
  phone VARCHAR(20) NOT NULL,
  address TEXT NOT NULL,
  original_total DECIMAL(10,2) NOT NULL,
  item_discount DECIMAL(10,2) NOT NULL DEFAULT 0,
  subtotal DECIMAL(10,2) NOT NULL,
  extra_discount DECIMAL(10,2) NOT NULL DEFAULT 0,
  total DECIMAL(10,2) NOT NULL,
  status ENUM('Pending','Preparing','Out for delivery','Completed','Cancelled') NOT NULL DEFAULT 'Pending',
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT fk_orders_user FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE SET NULL,
  INDEX idx_orders_user (user_id)
);

CREATE TABLE IF NOT EXISTS order_items (
  id INT AUTO_INCREMENT PRIMARY KEY,
  order_id INT NOT NULL,
  dish_id INT NULL,
  dish_name VARCHAR(150) NOT NULL,
  unit_price DECIMAL(10,2) NOT NULL,
  original_price DECIMAL(10,2) NOT NULL,
  quantity INT NOT NULL,
  line_total DECIMAL(10,2) NOT NULL,
  CONSTRAINT fk_order_items_order FOREIGN KEY (order_id) REFERENCES orders(id) ON DELETE CASCADE,
  CONSTRAINT fk_order_items_dish FOREIGN KEY (dish_id) REFERENCES menu_dishes(id) ON DELETE SET NULL
);
