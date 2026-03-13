-- Normalize the physical tenant table name to lowercase to match Prisma @@map("tenant").
-- If an old `Tenant` table exists, rename it. If neither table exists, create `tenant`.

SET @db_name = DATABASE();

SET @tenant_exists = (
  SELECT COUNT(*)
  FROM information_schema.tables
  WHERE table_schema = @db_name AND table_name = 'tenant'
);

SET @Tenant_exists = (
  SELECT COUNT(*)
  FROM information_schema.tables
  WHERE table_schema = @db_name AND table_name = 'Tenant'
);

SET @tenant_sql = IF(
  @tenant_exists = 0 AND @Tenant_exists > 0,
  'RENAME TABLE `Tenant` TO `tenant`',
  'SELECT 1'
);

PREPARE tenant_stmt FROM @tenant_sql;
EXECUTE tenant_stmt;
DEALLOCATE PREPARE tenant_stmt;

SET @tenant_exists = (
  SELECT COUNT(*)
  FROM information_schema.tables
  WHERE table_schema = @db_name AND table_name = 'tenant'
);

SET @tenant_sql = IF(
  @tenant_exists = 0,
  'CREATE TABLE `tenant` (
    `id` VARCHAR(191) NOT NULL,
    `name` VARCHAR(191) NOT NULL,
    `code` VARCHAR(191) NOT NULL,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updatedAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3) ON UPDATE CURRENT_TIMESTAMP(3),
    PRIMARY KEY (`id`),
    UNIQUE KEY `tenant_code_key` (`code`)
  ) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci',
  'SELECT 1'
);

PREPARE tenant_stmt FROM @tenant_sql;
EXECUTE tenant_stmt;
DEALLOCATE PREPARE tenant_stmt;