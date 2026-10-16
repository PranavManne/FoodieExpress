USE foodieexpress;

ALTER TABLE users
  ADD COLUMN phone VARCHAR(20) NULL AFTER name,
  ADD COLUMN gender ENUM('female','male','non_binary','prefer_not_to_say') NULL AFTER phone;
