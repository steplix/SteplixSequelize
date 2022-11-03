DROP DATABASE IF EXISTS `steplix`;
CREATE DATABASE `steplix` CHARACTER SET utf8 COLLATE utf8_general_ci;
USE `steplix`;



CREATE USER 'test'@'%' IDENTIFIED BY 'test';
GRANT ALL PRIVILEGES ON steplix.* TO 'test'@'%';

CREATE USER 'read'@'%' IDENTIFIED BY 'test';
GRANT SELECT ON steplix.* To 'read'@'%';

CREATE USER 'write'@'%' IDENTIFIED BY 'test';
GRANT SELECT, INSERT, UPDATE, DELETE ON steplix.* To 'write'@'%';

FLUSH PRIVILEGES;
