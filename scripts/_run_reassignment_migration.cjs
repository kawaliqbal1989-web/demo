require('dotenv').config();
const { PrismaClient } = require('@prisma/client');
const fs = require('fs');

(async () => {
  const prisma = new PrismaClient();

  try {
    // Check if table already exists
    const existing = await prisma.$queryRawUnsafe("SHOW TABLES LIKE 'WorksheetReassignmentRequest'");
    if (existing.length > 0) {
      console.log('Table already exists.');
      const cols = await prisma.$queryRawUnsafe('DESCRIBE WorksheetReassignmentRequest');
      cols.forEach(c => console.log(' ', c.Field, c.Type));
    } else {
      console.log('Creating table...');
      await prisma.$executeRawUnsafe(`
        CREATE TABLE IF NOT EXISTS WorksheetReassignmentRequest (
          id                 VARCHAR(30)  NOT NULL,
          tenantId           VARCHAR(30)  NOT NULL,
          studentId          VARCHAR(30)  NOT NULL,
          currentWorksheetId VARCHAR(30)  NOT NULL,
          type               ENUM('RETRY','SWAP') NOT NULL DEFAULT 'RETRY',
          newWorksheetId     VARCHAR(30)  NULL,
          reason             TEXT         NOT NULL,
          status             ENUM('PENDING','APPROVED','REJECTED','CANCELLED') NOT NULL DEFAULT 'PENDING',
          requestedByUserId  VARCHAR(30)  NOT NULL,
          reviewedByUserId   VARCHAR(30)  NULL,
          reviewReason       TEXT         NULL,
          reviewedAt         DATETIME(3)  NULL,
          createdAt          DATETIME(3)  NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
          updatedAt          DATETIME(3)  NOT NULL,
          PRIMARY KEY (id)
        ) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci
      `);
      console.log('Table created.');

      // Indexes
      const indexes = [
        'CREATE INDEX idx_wrar_tenant_student_status ON WorksheetReassignmentRequest (tenantId, studentId, status)',
        'CREATE INDEX idx_wrar_tenant_status_created ON WorksheetReassignmentRequest (tenantId, status, createdAt)',
        'CREATE INDEX idx_wrar_tenant_worksheet ON WorksheetReassignmentRequest (tenantId, currentWorksheetId)',
        'CREATE INDEX idx_wrar_requestedBy ON WorksheetReassignmentRequest (requestedByUserId)',
        'CREATE INDEX idx_wrar_reviewedBy ON WorksheetReassignmentRequest (reviewedByUserId)'
      ];
      for (const idx of indexes) {
        try { await prisma.$executeRawUnsafe(idx); console.log('OK:', idx.substring(0,60)); }
        catch(e) { console.log('SKIP idx:', e.message?.substring(0,80)); }
      }

      // Foreign keys
      const fks = [
        'ALTER TABLE WorksheetReassignmentRequest ADD CONSTRAINT wrar_tenantId_fk FOREIGN KEY (tenantId) REFERENCES Tenant(id) ON DELETE RESTRICT ON UPDATE CASCADE',
        'ALTER TABLE WorksheetReassignmentRequest ADD CONSTRAINT wrar_studentId_fk FOREIGN KEY (studentId) REFERENCES Student(id) ON DELETE CASCADE ON UPDATE CASCADE',
        'ALTER TABLE WorksheetReassignmentRequest ADD CONSTRAINT wrar_currentWorksheetId_fk FOREIGN KEY (currentWorksheetId) REFERENCES Worksheet(id) ON DELETE CASCADE ON UPDATE CASCADE',
        'ALTER TABLE WorksheetReassignmentRequest ADD CONSTRAINT wrar_newWorksheetId_fk FOREIGN KEY (newWorksheetId) REFERENCES Worksheet(id) ON DELETE SET NULL ON UPDATE CASCADE',
        'ALTER TABLE WorksheetReassignmentRequest ADD CONSTRAINT wrar_requestedByUserId_fk FOREIGN KEY (requestedByUserId) REFERENCES AuthUser(id) ON DELETE CASCADE ON UPDATE CASCADE',
        'ALTER TABLE WorksheetReassignmentRequest ADD CONSTRAINT wrar_reviewedByUserId_fk FOREIGN KEY (reviewedByUserId) REFERENCES AuthUser(id) ON DELETE SET NULL ON UPDATE CASCADE'
      ];
      for (const fk of fks) {
        try { await prisma.$executeRawUnsafe(fk); console.log('OK:', fk.substring(0,70)); }
        catch(e) { console.log('SKIP fk:', e.message?.substring(0,80)); }
      }

      console.log('Migration complete.');
    }
  } catch (err) {
    console.error('Error:', err.message);
  } finally {
    await prisma.$disconnect();
  }
})();
