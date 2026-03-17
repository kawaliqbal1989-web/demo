require('dotenv').config();
const { PrismaClient } = require('@prisma/client');

const LOWER_TABLE = 'worksheetreassignmentrequest';
const UPPER_TABLE = 'WorksheetReassignmentRequest';

async function tableExists(prisma, tableName) {
  const rows = await prisma.$queryRawUnsafe(`SHOW TABLES LIKE '${tableName}'`);
  return rows.length > 0;
}

async function showColumns(prisma, tableName) {
  const cols = await prisma.$queryRawUnsafe(`DESCRIBE \`${tableName}\``);
  cols.forEach((col) => console.log(' ', col.Field, col.Type));
}

async function ensureColumn(prisma, tableName, columnName, sqlType) {
  const existing = await prisma.$queryRawUnsafe(
    'SELECT COLUMN_NAME FROM information_schema.COLUMNS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = ? AND COLUMN_NAME = ?',
    tableName,
    columnName
  );
  if (existing.length > 0) {
    return;
  }

  await prisma.$executeRawUnsafe(`ALTER TABLE \`${tableName}\` ADD COLUMN \`${columnName}\` ${sqlType}`);
  console.log('Added column:', columnName);
}

async function ensureIndex(prisma, indexName, createSql) {
  try {
    await prisma.$executeRawUnsafe(createSql);
    console.log('OK idx:', indexName);
  } catch (error) {
    console.log('SKIP idx:', indexName, '-', error.message?.substring(0, 80));
  }
}

async function ensureForeignKey(prisma, constraintName, alterSql) {
  const existing = await prisma.$queryRawUnsafe(
    'SELECT CONSTRAINT_NAME FROM information_schema.TABLE_CONSTRAINTS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = ? AND CONSTRAINT_NAME = ?',
    LOWER_TABLE,
    constraintName
  );
  if (existing.length > 0) {
    return;
  }

  try {
    await prisma.$executeRawUnsafe(alterSql);
    console.log('OK fk:', constraintName);
  } catch (error) {
    console.log('SKIP fk:', constraintName, '-', error.message?.substring(0, 80));
  }
}

async function createLowercaseTable(prisma) {
  await prisma.$executeRawUnsafe(`
    CREATE TABLE IF NOT EXISTS \`${LOWER_TABLE}\` (
      id                     VARCHAR(30) NOT NULL,
      tenantId               VARCHAR(30) NOT NULL,
      studentId              VARCHAR(30) NOT NULL,
      currentWorksheetId     VARCHAR(30) NOT NULL,
      type                   ENUM('RETRY','SWAP') NOT NULL DEFAULT 'RETRY',
      newWorksheetId         VARCHAR(30) NULL,
      reason                 TEXT NOT NULL,
      status                 ENUM('PENDING','APPROVED','REJECTED','CANCELLED') NOT NULL DEFAULT 'PENDING',
      requestedByUserId      VARCHAR(30) NOT NULL,
      reviewedByUserId       VARCHAR(30) NULL,
      reviewReason           TEXT NULL,
      archivedResultSnapshot JSON NULL,
      reviewedAt             DATETIME(3) NULL,
      createdAt              DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
      updatedAt              DATETIME(3) NOT NULL,
      PRIMARY KEY (id)
    ) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci
  `);
  console.log('Table created.');
}

(async () => {
  const prisma = new PrismaClient();

  try {
    const lowerExists = await tableExists(prisma, LOWER_TABLE);
    const upperExists = await tableExists(prisma, UPPER_TABLE);

    if (lowerExists && upperExists) {
      console.error(`Both ${LOWER_TABLE} and ${UPPER_TABLE} exist. Resolve manually before continuing.`);
      process.exitCode = 1;
      return;
    }

    if (upperExists && !lowerExists) {
      console.log(`Renaming ${UPPER_TABLE} -> ${LOWER_TABLE} ...`);
      await prisma.$executeRawUnsafe(`RENAME TABLE \`${UPPER_TABLE}\` TO \`${LOWER_TABLE}\``);
    }

    if (!(await tableExists(prisma, LOWER_TABLE))) {
      console.log('Creating table...');
      await createLowercaseTable(prisma);
    } else {
      console.log('Table already exists.');
    }

    await ensureColumn(prisma, LOWER_TABLE, 'archivedResultSnapshot', 'JSON NULL');

    const indexes = [
      ['idx_wrar_tenant_student_status', `CREATE INDEX idx_wrar_tenant_student_status ON \`${LOWER_TABLE}\` (tenantId, studentId, status)`],
      ['idx_wrar_tenant_status_created', `CREATE INDEX idx_wrar_tenant_status_created ON \`${LOWER_TABLE}\` (tenantId, status, createdAt)`],
      ['idx_wrar_tenant_worksheet', `CREATE INDEX idx_wrar_tenant_worksheet ON \`${LOWER_TABLE}\` (tenantId, currentWorksheetId)`],
      ['idx_wrar_requestedBy', `CREATE INDEX idx_wrar_requestedBy ON \`${LOWER_TABLE}\` (requestedByUserId)`],
      ['idx_wrar_reviewedBy', `CREATE INDEX idx_wrar_reviewedBy ON \`${LOWER_TABLE}\` (reviewedByUserId)`]
    ];
    for (const [name, sql] of indexes) {
      await ensureIndex(prisma, name, sql);
    }

    const fks = [
      ['wrar_tenantId_fk', `ALTER TABLE \`${LOWER_TABLE}\` ADD CONSTRAINT wrar_tenantId_fk FOREIGN KEY (tenantId) REFERENCES tenant(id) ON DELETE RESTRICT ON UPDATE CASCADE`],
      ['wrar_studentId_fk', `ALTER TABLE \`${LOWER_TABLE}\` ADD CONSTRAINT wrar_studentId_fk FOREIGN KEY (studentId) REFERENCES student(id) ON DELETE CASCADE ON UPDATE CASCADE`],
      ['wrar_currentWorksheetId_fk', `ALTER TABLE \`${LOWER_TABLE}\` ADD CONSTRAINT wrar_currentWorksheetId_fk FOREIGN KEY (currentWorksheetId) REFERENCES worksheet(id) ON DELETE CASCADE ON UPDATE CASCADE`],
      ['wrar_newWorksheetId_fk', `ALTER TABLE \`${LOWER_TABLE}\` ADD CONSTRAINT wrar_newWorksheetId_fk FOREIGN KEY (newWorksheetId) REFERENCES worksheet(id) ON DELETE SET NULL ON UPDATE CASCADE`],
      ['wrar_requestedByUserId_fk', `ALTER TABLE \`${LOWER_TABLE}\` ADD CONSTRAINT wrar_requestedByUserId_fk FOREIGN KEY (requestedByUserId) REFERENCES authuser(id) ON DELETE CASCADE ON UPDATE CASCADE`],
      ['wrar_reviewedByUserId_fk', `ALTER TABLE \`${LOWER_TABLE}\` ADD CONSTRAINT wrar_reviewedByUserId_fk FOREIGN KEY (reviewedByUserId) REFERENCES authuser(id) ON DELETE SET NULL ON UPDATE CASCADE`]
    ];
    for (const [name, sql] of fks) {
      await ensureForeignKey(prisma, name, sql);
    }

    await showColumns(prisma, LOWER_TABLE);
    console.log('Migration complete.');
  } catch (error) {
    console.error('Error:', error.message);
    process.exitCode = 1;
  } finally {
    await prisma.$disconnect();
  }
})();
