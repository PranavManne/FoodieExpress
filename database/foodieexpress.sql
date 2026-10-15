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

CREATE TABLE IF NOT EXISTS orders (
  id INT AUTO_INCREMENT PRIMARY KEY,
  customer_name VARCHAR(120) NOT NULL,
  phone VARCHAR(20) NOT NULL,
  address TEXT NOT NULL,
  original_total DECIMAL(10,2) NOT NULL,
  item_discount DECIMAL(10,2) NOT NULL DEFAULT 0,
  subtotal DECIMAL(10,2) NOT NULL,
  extra_discount DECIMAL(10,2) NOT NULL DEFAULT 0,
  total DECIMAL(10,2) NOT NULL,
  status ENUM('Pending','Preparing','Out for delivery','Completed','Cancelled') NOT NULL DEFAULT 'Pending',
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
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
