import { Router } from 'express';
import { requireRole } from '../middleware/rbac.js';
import { auditAction } from '../middleware/audit-logger.js';
import {
  handleBulkStatusChange,
  handleBulkPromote,
  handleBulkTransfer,
  handleBulkFeeUpdate,
  handleBulkAssignTeacher,
} from '../controllers/bulk-operations.controller.js';

const bulkRouter = Router();

bulkRouter.use(requireRole('CENTER', 'SUPERADMIN'));

bulkRouter.post(
  '/status',
  auditAction('BULK_STATUS_CHANGE', 'STUDENT'),
  handleBulkStatusChange
);

bulkRouter.post(
  '/promote',
  auditAction('BULK_PROMOTE', 'STUDENT'),
  handleBulkPromote
);

bulkRouter.post(
  '/transfer',
  auditAction('BULK_TRANSFER', 'STUDENT'),
  handleBulkTransfer
);

bulkRouter.post(
  '/fees',
  auditAction('BULK_FEE_UPDATE', 'STUDENT'),
  handleBulkFeeUpdate
);

bulkRouter.post(
  '/assign-teacher',
  auditAction('BULK_ASSIGN_TEACHER', 'STUDENT'),
  handleBulkAssignTeacher
);

export default bulkRouter;
