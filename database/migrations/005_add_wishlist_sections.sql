USE foodieexpress;

CREATE TABLE IF NOT EXISTS wishlist_lists (
  id INT AUTO_INCREMENT PRIMARY KEY,
  user_id INT NOT NULL,
  name VARCHAR(60) NOT NULL,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT fk_wishlist_lists_user FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
  UNIQUE KEY uq_wishlist_lists_user_name (user_id,name)
);

ALTER TABLE wishlist_items
  ADD COLUMN list_id INT NULL AFTER dish_id;

INSERT INTO wishlist_lists (user_id,name)
SELECT DISTINCT w.user_id,'My wishlist'
FROM wishlist_items w
WHERE NOT EXISTS (
  SELECT 1 FROM wishlist_lists l WHERE l.user_id=w.user_id AND l.name='My wishlist'
);

UPDATE wishlist_items w
JOIN wishlist_lists l ON l.user_id=w.user_id AND l.name='My wishlist'
SET w.list_id=l.id
WHERE w.list_id IS NULL;

ALTER TABLE wishlist_items
  ADD INDEX idx_wishlist_user (user_id);

ALTER TABLE wishlist_items
  MODIFY list_id INT NOT NULL,
  DROP PRIMARY KEY,
  ADD PRIMARY KEY (list_id,dish_id),
  ADD INDEX idx_wishlist_list (list_id),
  ADD CONSTRAINT fk_wishlist_list FOREIGN KEY (list_id) REFERENCES wishlist_lists(id) ON DELETE CASCADE;
