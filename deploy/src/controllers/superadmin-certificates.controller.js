import { prisma } from "../lib/prisma.js";
import { asyncHandler } from "../utils/async-handler.js";
import { parsePagination } from "../utils/pagination.js";
import { toCsv } from "../utils/csv.js";

function parseISODateOnly(value) {
  const text = String(value || "").trim();
  if (!/^\d{4}-\d{2}-\d{2}$/.test(text)) return null;
  const date = new Date(`${text}T00:00:00.000Z`);
  return Number.isNaN(date.getTime()) ? null : date;
}

function parseCertificateStatus(status) {
  if (!status) return null;
  const s = String(status).trim().toUpperCase();
  if (s === "ISSUED" || s === "REVOKED") return s;
  return null;
}

const listSuperadminCertificates = asyncHandler(async (req, res) => {
  const { take, skip, limit, offset, orderBy } = parsePagination(req.query);
  const q = req.query.q ? String(req.query.q).trim() : null;
  const status = parseCertificateStatus(req.query.status);
  const levelId = req.query.levelId ? String(req.query.levelId) : null;
  const centerId = req.query.centerId ? String(req.query.centerId) : null;
  const bpId = req.query.bpId ? String(req.query.bpId) : null;
  const issuedFrom = req.query.issuedFrom ? parseISODateOnly(req.query.issuedFrom) : null;
  const issuedTo = req.query.issuedTo ? parseISODateOnly(req.query.issuedTo) : null;

  const studentFilter = {};
  if (centerId) {
    studentFilter.hierarchyNodeId = centerId;
  } else if (bpId) {
    const bp = await prisma.businessPartner.findFirst({
      where: { id: bpId, tenantId: req.auth.tenantId },
      select: { hierarchyNodeId: true }
    });
    if (bp?.hierarchyNodeId) {
      const descendants = await prisma.hierarchyNode.findMany({
        where: { tenantId: req.auth.tenantId, path: { contains: bp.hierarchyNodeId } },
        select: { id: true }
      });
      const nodeIds = descendants.map((d) => d.id);
      if (nodeIds.length) studentFilter.hierarchyNodeId = { in: nodeIds };
    }
  }

  const where = {
    tenantId: req.auth.tenantId,
    ...(status ? { status } : {}),
    ...(levelId ? { levelId } : {}),
    ...(Object.keys(studentFilter).length ? { student: { is: studentFilter } } : {})
  };

  if (issuedFrom || issuedTo) {
    where.issuedAt = {};
    if (issuedFrom) where.issuedAt.gte = issuedFrom;
    if (issuedTo) {
      const to = new Date(issuedTo);
      to.setUTCHours(23, 59, 59, 999);
      where.issuedAt.lte = to;
    }
  }

  if (q) {
    where.OR = [
      { certificateNumber: { contains: q } },
      { student: { is: { admissionNo: { contains: q } } } },
      { student: { is: { firstName: { contains: q } } } },
      { student: { is: { lastName: { contains: q } } } }
    ];
  }

  const [items, total] = await Promise.all([
    prisma.certificate.findMany({
      where,
      orderBy,
      skip,
      take,
      select: {
        id: true,
        certificateNumber: true,
        status: true,
        issuedAt: true,
        revokedAt: true,
        reason: true,
        student: {
          select: {
            id: true,
            admissionNo: true,
            firstName: true,
            lastName: true,
            hierarchyNode: {
              select: {
                id: true,
                name: true,
                code: true,
                type: true,
                parent: {
                  select: {
                    id: true,
                    name: true,
                    code: true,
                    type: true,
                    parent: {
                      select: { id: true, name: true, code: true, type: true }
                    }
                  }
                }
              }
            }
          }
        },
        level: { select: { id: true, name: true, rank: true } },
        issuedBy: { select: { id: true, username: true, email: true, role: true } },
        revokedBy: { select: { id: true, username: true, email: true, role: true } }
      }
    }),
    prisma.certificate.count({ where })
  ]);

  return res.apiSuccess("Certificates fetched", { items, limit, offset, total });
});

const revokeSuperadminCertificate = asyncHandler(async (req, res) => {
  const { id } = req.params;
  const { reason } = req.body;

  const existing = await prisma.certificate.findFirst({
    where: { id, tenantId: req.auth.tenantId },
    select: { id: true, status: true }
  });

  if (!existing) return res.apiError(404, "Certificate not found", "CERTIFICATE_NOT_FOUND");
  if (existing.status === "REVOKED") return res.apiError(409, "Certificate already revoked", "CERTIFICATE_ALREADY_REVOKED");

  const updated = await prisma.certificate.update({
    where: { id },
    data: {
      status: "REVOKED",
      revokedAt: new Date(),
      revokedByUserId: req.auth.userId,
      reason: reason ? String(reason).trim() : "Revoked by superadmin"
    }
  });

  res.locals.entityId = updated.id;
  return res.apiSuccess("Certificate revoked", updated);
});

const exportSuperadminCertificatesCsv = asyncHandler(async (req, res) => {
  const q = req.query.q ? String(req.query.q).trim() : null;
  const status = parseCertificateStatus(req.query.status);
  const levelId = req.query.levelId ? String(req.query.levelId) : null;
  const centerId = req.query.centerId ? String(req.query.centerId) : null;
  const bpId = req.query.bpId ? String(req.query.bpId) : null;
  const issuedFrom = req.query.issuedFrom ? parseISODateOnly(req.query.issuedFrom) : null;
  const issuedTo = req.query.issuedTo ? parseISODateOnly(req.query.issuedTo) : null;

  const studentFilter = {};
  if (centerId) {
    studentFilter.hierarchyNodeId = centerId;
  } else if (bpId) {
    const bp = await prisma.businessPartner.findFirst({
      where: { id: bpId, tenantId: req.auth.tenantId },
      select: { hierarchyNodeId: true }
    });
    if (bp?.hierarchyNodeId) {
      const descendants = await prisma.hierarchyNode.findMany({
        where: { tenantId: req.auth.tenantId, path: { contains: bp.hierarchyNodeId } },
        select: { id: true }
      });
      const nodeIds = descendants.map((d) => d.id);
      if (nodeIds.length) studentFilter.hierarchyNodeId = { in: nodeIds };
    }
  }

  const where = {
    tenantId: req.auth.tenantId,
    ...(status ? { status } : {}),
    ...(levelId ? { levelId } : {}),
    ...(Object.keys(studentFilter).length ? { student: { is: studentFilter } } : {})
  };

  if (issuedFrom || issuedTo) {
    where.issuedAt = {};
    if (issuedFrom) where.issuedAt.gte = issuedFrom;
    if (issuedTo) {
      const to = new Date(issuedTo);
      to.setUTCHours(23, 59, 59, 999);
      where.issuedAt.lte = to;
    }
  }

  if (q) {
    where.OR = [
      { certificateNumber: { contains: q } },
      { student: { is: { admissionNo: { contains: q } } } }
    ];
  }

  const rows = await prisma.certificate.findMany({
    where,
    orderBy: [{ issuedAt: "desc" }],
    take: 10000,
    select: {
      certificateNumber: true,
      status: true,
      issuedAt: true,
      revokedAt: true,
      reason: true,
      student: {
        select: {
          admissionNo: true,
          firstName: true,
          lastName: true,
          hierarchyNode: {
            select: {
              name: true,
              parent: { select: { name: true, parent: { select: { name: true } } } }
            }
          }
        }
      },
      level: { select: { name: true, rank: true } }
    }
  });

  const headers = [
    "certificateNumber", "status", "issuedAt", "revokedAt", "reason",
    "admissionNo", "firstName", "lastName",
    "center", "franchise", "businessPartner",
    "levelRank", "levelName"
  ];

  const csvRows = rows.map((r) => [
    r.certificateNumber,
    r.status,
    r.issuedAt.toISOString(),
    r.revokedAt ? r.revokedAt.toISOString() : "",
    r.reason || "",
    r.student?.admissionNo || "",
    r.student?.firstName || "",
    r.student?.lastName || "",
    r.student?.hierarchyNode?.name || "",
    r.student?.hierarchyNode?.parent?.name || "",
    r.student?.hierarchyNode?.parent?.parent?.name || "",
    String(r.level?.rank ?? ""),
    r.level?.name || ""
  ]);

  const csv = toCsv({ headers, rows: csvRows });

  res.setHeader("Content-Type", "text/csv; charset=utf-8");
  res.setHeader("Content-Disposition", `attachment; filename=certificates_${Date.now()}.csv`);
  return res.status(200).send(csv);
});

const getSuperadminBpCertificateTemplate = asyncHandler(async (req, res) => {
  const { bpId } = req.params;

  const template = await prisma.certificateTemplate.findFirst({
    where: {
      businessPartner: { id: bpId, tenantId: req.auth.tenantId }
    }
  });

  return res.apiSuccess("Certificate template fetched", template);
});

const updateSuperadminBpCertificateTemplate = asyncHandler(async (req, res) => {
  const { bpId } = req.params;
  const { title, signatoryName, signatoryDesignation } = req.body;

  const bp = await prisma.businessPartner.findFirst({
    where: { id: bpId, tenantId: req.auth.tenantId },
    select: { id: true, tenantId: true }
  });
  if (!bp) return res.apiError(404, "Business partner not found", "BP_NOT_FOUND");

  const template = await prisma.certificateTemplate.upsert({
    where: { businessPartnerId: bpId },
    update: {
      ...(title !== undefined ? { title } : {}),
      ...(signatoryName !== undefined ? { signatoryName } : {}),
      ...(signatoryDesignation !== undefined ? { signatoryDesignation } : {})
    },
    create: {
      tenantId: bp.tenantId,
      businessPartnerId: bpId,
      title: title || "Certificate of Achievement",
      signatoryName: signatoryName || null,
      signatoryDesignation: signatoryDesignation || null
    }
  });

  return res.apiSuccess("Certificate template updated", template);
});

export {
  listSuperadminCertificates,
  revokeSuperadminCertificate,
  exportSuperadminCertificatesCsv,
  getSuperadminBpCertificateTemplate,
  updateSuperadminBpCertificateTemplate
};
