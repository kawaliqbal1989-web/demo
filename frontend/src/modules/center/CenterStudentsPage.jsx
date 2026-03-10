import { useEffect, useMemo, useState } from "react";
import { Link } from "react-router-dom";
import toast from "react-hot-toast";
import { DataTable, PaginationBar } from "../../components/DataTable";
import { LoadingState } from "../../components/LoadingState";
import { ConfirmDialog } from "../../components/ConfirmDialog";
import { InputDialog } from "../../components/InputDialog";
import {
  assignStudentCourse,
  assignStudentLevel,
  bulkImportStudentsCsv,
  createStudent,
  createStudentLogin,
  exportStudentsCsv,
  exportStudentsExcel,
  getNextStudentCode,
  listStudents,
  recordStudentPayment,
  resetStudentPassword,
  uploadStudentPhoto,
  updateStudent
} from "../../services/studentsService";
import { listTeachers } from "../../services/teachersService";
import { createEnrollment, updateEnrollment } from "../../services/enrollmentsService";
import { listBatches } from "../../services/batchesService";
import { listLevels } from "../../services/levelsService";
import { listCatalogCourses } from "../../services/catalogService";
import { listLedger } from "../../services/ledgerService";
import { getFriendlyErrorMessage } from "../../utils/apiErrors";
import {
  FEE_SCHEDULE_OPTIONS,
  formatFeeScheduleTarget
} from "../../utils/feeSchedules.js";

function parseName(value) {
  const parts = String(value || "").trim().split(/\s+/).filter(Boolean);
  if (!parts.length) return { firstName: "", lastName: "" };
  if (parts.length === 1) return { firstName: parts[0], lastName: "" };
  return { firstName: parts[0], lastName: parts.slice(1).join(" ") };
}

function pickTeacherLabel(teacher) {
  if (!teacher) return "";
  return teacher.teacherProfile?.fullName || teacher.username || teacher.email || "";
}

function CenterStudentsPage() {
  const [rows, setRows] = useState([]);
  const [limit, setLimit] = useState(20);
  const [offset, setOffset] = useState(0);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  const [teachers, setTeachers] = useState([]);
  const [levels, setLevels] = useState([]);
  const [courses, setCourses] = useState([]);

  const [q, setQ] = useState("");
  const [statusFilter, setStatusFilter] = useState("");
  const [teacherFilter, setTeacherFilter] = useState("");
  const [levelFilter, setLevelFilter] = useState("");
  const [courseCodeFilter, setCourseCodeFilter] = useState("");

  const [studentCode, setStudentCode] = useState("");
  const [fullName, setFullName] = useState("");
  const [gender, setGender] = useState("MALE");
  const [dateOfBirth, setDateOfBirth] = useState("");
  const [guardianName, setGuardianName] = useState("");
  const [guardianPhone, setGuardianPhone] = useState("");
  const [contactNo2, setContactNo2] = useState("");
  const [guardianEmail, setGuardianEmail] = useState("");
  const [studentEmail, setStudentEmail] = useState("");
  const [address, setAddress] = useState("");
  const [stateField, setStateField] = useState("");
  const [district, setDistrict] = useState("");
  const [tehsil, setTehsil] = useState("");
  const [currentTeacherUserId, setCurrentTeacherUserId] = useState("");
  const [admissionLevelId, setAdmissionLevelId] = useState("");
  const [photoFile, setPhotoFile] = useState(null);
  const [photoPreview, setPhotoPreview] = useState(null);
  const [status, setStatus] = useState("ACTIVE");
  const [createLoginAccountFlag, setCreateLoginAccountFlag] = useState(true);
  const [enrollmentFeeAmount, setEnrollmentFeeAmount] = useState(0);
  const [totalFeeAmount, setTotalFeeAmount] = useState(0);
  const [admissionFeeAmount, setAdmissionFeeAmount] = useState(0);
  const [creating, setCreating] = useState(false);
  const [admissionInfo, setAdmissionInfo] = useState("");
  const [tempPasswordDialog, setTempPasswordDialog] = useState(null);

  const [csvImportOpen, setCsvImportOpen] = useState(false);
  const [csvFile, setCsvFile] = useState(null);
  const [csvImporting, setCsvImporting] = useState(false);
  const [csvImportResult, setCsvImportResult] = useState(null);
  const [csvImportError, setCsvImportError] = useState("");
  const [csvImportBatchId, setCsvImportBatchId] = useState("");
  const [csvImportLevelId, setCsvImportLevelId] = useState("");
  const [csvImportTeacherUserId, setCsvImportTeacherUserId] = useState("");
  const [csvImportStartDate, setCsvImportStartDate] = useState("");
  const [csvExporting, setCsvExporting] = useState(false);
  const [excelExporting, setExcelExporting] = useState(false);

  const [feesStudentId, setFeesStudentId] = useState(null);
  const [feesStudentSnapshot, setFeesStudentSnapshot] = useState(null);
  const [feesLoading, setFeesLoading] = useState(false);
  const [feesError, setFeesError] = useState("");
  const [feesItems, setFeesItems] = useState([]);
  const [feeEntryType, setFeeEntryType] = useState("ENROLLMENT");
  const [feeEntryAmount, setFeeEntryAmount] = useState(0);
  const [feeEntryMode, setFeeEntryMode] = useState("CASH");
  const [feeEntryReceivedDate, setFeeEntryReceivedDate] = useState("");
  const [feeEntryScheduleType, setFeeEntryScheduleType] = useState("ADVANCE");
  const [feeEntryMonth, setFeeEntryMonth] = useState("");
  const [feeEntryYear, setFeeEntryYear] = useState("");
  const [feeEntryLevelId, setFeeEntryLevelId] = useState("");
  const [feeEntryReference, setFeeEntryReference] = useState("");
  const [feeEntrySaving, setFeeEntrySaving] = useState(false);
  const [feeEntryError, setFeeEntryError] = useState("");

  const [changeTeacherStudentId, setChangeTeacherStudentId] = useState(null);
  const [changeTeacherEnrollmentId, setChangeTeacherEnrollmentId] = useState(null);
  const [changeTeacherCurrentLabel, setChangeTeacherCurrentLabel] = useState("");
  const [changeTeacherNextTeacherId, setChangeTeacherNextTeacherId] = useState("");
  const [changeTeacherSaving, setChangeTeacherSaving] = useState(false);
  const [changeTeacherError, setChangeTeacherError] = useState("");

  const [assignCourseStudentId, setAssignCourseStudentId] = useState(null);
  const [assignCourseCurrentLabel, setAssignCourseCurrentLabel] = useState("");
  const [assignCourseNextCourseIds, setAssignCourseNextCourseIds] = useState([]);
  const [assignCourseSaving, setAssignCourseSaving] = useState(false);
  const [assignCourseError, setAssignCourseError] = useState("");

  const [batches, setBatches] = useState([]);
  const [enrollStudentId, setEnrollStudentId] = useState(null);
  const [enrollCurrentLabel, setEnrollCurrentLabel] = useState("");
  const [enrollSelectedBatchId, setEnrollSelectedBatchId] = useState("");
  const [enrollSaving, setEnrollSaving] = useState(false);
  const [enrollError, setEnrollError] = useState("");
  const [unenrollConfirmOpen, setUnenrollConfirmOpen] = useState(null);
  const [unenrollSaving, setUnenrollSaving] = useState(false);

  const [editingStudentId, setEditingStudentId] = useState(null);
  const [editFirstName, setEditFirstName] = useState("");
  const [editLastName, setEditLastName] = useState("");
  const [editAdmissionNo, setEditAdmissionNo] = useState("");
  const [editGender, setEditGender] = useState("");
  const [editDateOfBirth, setEditDateOfBirth] = useState("");
  const [editGuardianName, setEditGuardianName] = useState("");
  const [editGuardianPhone, setEditGuardianPhone] = useState("");
  const [editGuardianEmail, setEditGuardianEmail] = useState("");
  const [editPhonePrimary, setEditPhonePrimary] = useState("");
  const [editPhoneSecondary, setEditPhoneSecondary] = useState("");
  const [editStudentEmail, setEditStudentEmail] = useState("");
  const [editAddress, setEditAddress] = useState("");
  const [editState, setEditState] = useState("");
  const [editDistrict, setEditDistrict] = useState("");
  const [editTehsil, setEditTehsil] = useState("");
  const [editTotalFeeAmount, setEditTotalFeeAmount] = useState("");
  const [editAdmissionFeeAmount, setEditAdmissionFeeAmount] = useState("");
  const [editLevelId, setEditLevelId] = useState("");
  const [editCurrentTeacherUserId, setEditCurrentTeacherUserId] = useState("");
  const [editStatus, setEditStatus] = useState("ACTIVE");
  const [editPhotoFile, setEditPhotoFile] = useState(null);
  const [editPhotoPreview, setEditPhotoPreview] = useState(null);
  const [editing, setEditing] = useState(false);
  const [editError, setEditError] = useState("");
  const [editInfo, setEditInfo] = useState("");

  const load = async (next) => {
    setLoading(true);
    setError("");
    try {
      const data = await listStudents(next);
      setRows(data?.data?.items || data?.data || []);
      setLimit(next.limit);
      setOffset(next.offset);
    } catch (err) {
      setError(getFriendlyErrorMessage(err) || "Failed to load students.");
    } finally {
      setLoading(false);
    }
  };

  const loadLookups = async () => {
    try {
      const [teachersRes, levelsRes, coursesRes, batchesRes] = await Promise.all([
        listTeachers({ limit: 200, offset: 0 }),
        listLevels(),
        listCatalogCourses({ limit: 200, offset: 0, status: "ACTIVE" }),
        listBatches({ limit: 200, offset: 0, status: "ACTIVE" })
      ]);
      setTeachers(teachersRes?.data?.items || teachersRes?.data || []);
      setLevels(levelsRes?.data?.items || levelsRes?.data || []);
      setCourses(coursesRes?.data?.items || coursesRes?.data || []);
      setBatches(batchesRes?.data?.items || batchesRes?.data || []);
    } catch {
      // ignore
    }
  };

  const loadNextStudentCode = async () => {
    try {
      const resp = await getNextStudentCode();
      const code = resp?.data?.admissionNo || "";
      setStudentCode(code);
    } catch {
      setStudentCode("");
    }
  };

  useEffect(() => {
    void Promise.all([
      loadLookups(),
      load({ limit, offset, q: "", status: "", teacherUserId: "", levelId: "", courseCode: "" }),
      loadNextStudentCode()
    ]);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const resetAdmissionForm = () => {
    setStudentCode("");
    setFullName("");
    setGender("MALE");
    setDateOfBirth("");
    setGuardianName("");
    setGuardianPhone("");
    setContactNo2("");
    setGuardianEmail("");
    setStudentEmail("");
    setAddress("");
    setStateField("");
    setDistrict("");
    setTehsil("");
    setCurrentTeacherUserId("");
    setAdmissionLevelId("");
    setPhotoFile(null);
    setPhotoPreview(null);
    setStatus("ACTIVE");
    setCreateLoginAccountFlag(true);
    setEnrollmentFeeAmount(0);
    setTotalFeeAmount(0);
    setAdmissionFeeAmount(0);
    setAdmissionInfo("");
    void loadNextStudentCode();
  };

  const resetEditForm = () => {
    setEditingStudentId(null);
    setEditFirstName("");
    setEditLastName("");
    setEditAdmissionNo("");
    setEditGender("");
    setEditDateOfBirth("");
    setEditGuardianName("");
    setEditGuardianPhone("");
    setEditGuardianEmail("");
    setEditPhonePrimary("");
    setEditPhoneSecondary("");
    setEditStudentEmail("");
    setEditAddress("");
    setEditState("");
    setEditDistrict("");
    setEditTehsil("");
    setEditTotalFeeAmount("");
    setEditAdmissionFeeAmount("");
    setEditLevelId("");
    setEditCurrentTeacherUserId("");
    setEditStatus("ACTIVE");
    setEditPhotoFile(null);
    setEditError("");
    setEditInfo("");
  };

  const resetCsvImportState = () => {
    setCsvFile(null);
    setCsvImportResult(null);
    setCsvImportError("");
    setCsvImportBatchId("");
    setCsvImportLevelId("");
    setCsvImportTeacherUserId("");
    setCsvImportStartDate("");
  };

  const openCsvImportModal = () => {
    resetCsvImportState();
    setCsvImportOpen(true);
  };

  const refreshWithFilters = async (nextOffset = 0) => {
    await load({
      limit,
      offset: nextOffset,
      q,
      status: statusFilter,
      teacherUserId: teacherFilter,
      levelId: levelFilter,
      courseCode: courseCodeFilter
    });
  };

  const exportFilters = {
    q,
    status: statusFilter,
    teacherUserId: teacherFilter,
    levelId: levelFilter,
    courseCode: courseCodeFilter
  };

  const handleDownloadStudentsCsv = async () => {
    setCsvExporting(true);
    try {
      await exportStudentsCsv(exportFilters);
    } catch (err) {
      toast.error(getFriendlyErrorMessage(err) || "CSV export failed.");
    } finally {
      setCsvExporting(false);
    }
  };

  const handleDownloadStudentsExcel = async () => {
    setExcelExporting(true);
    try {
      await exportStudentsExcel(exportFilters);
    } catch (err) {
      toast.error(getFriendlyErrorMessage(err) || "Excel export failed.");
    } finally {
      setExcelExporting(false);
    }
  };

  const handleDownloadImportTemplate = () => {
    const template = [
      [
        "admissionNo",
        "firstName",
        "lastName",
        "gender",
        "dateOfBirth",
        "guardianName",
        "guardianPhone",
        "guardianEmail",
        "email",
        "phonePrimary",
        "phoneSecondary",
        "address",
        "state",
        "district",
        "tehsil",
        "levelName",
        "batchName",
        "teacherEmail",
        "startDate",
        "totalFeeAmount",
        "admissionFeeAmount",
        "feeConcessionAmount",
        "isActive"
      ],
      [
        "",
        "Aarav",
        "Sharma",
        "MALE",
        "2015-06-15",
        "Rohit Sharma",
        "9876543210",
        "parent@example.com",
        "student@example.com",
        "9876543210",
        "9123456780",
        "Ward 5",
        "Uttar Pradesh",
        "Kanpur",
        "Sadar",
        "Level 1",
        "Morning Batch",
        "teacher@example.com",
        "2025-04-01",
        "12000",
        "1000",
        "500",
        "true"
      ]
    ];
    const csv = template.map((row) => row.map((cell) => `"${String(cell).replace(/"/g, '""')}"`).join(",")).join("\n");
    const blob = new Blob([csv], { type: "text/csv;charset=utf-8" });
    const url = window.URL.createObjectURL(blob);
    const anchor = document.createElement("a");
    anchor.href = url;
    anchor.download = "student_import_template.csv";
    document.body.appendChild(anchor);
    anchor.click();
    anchor.remove();
    window.URL.revokeObjectURL(url);
  };

  const handleSubmitCsvImport = async () => {
    if (!csvFile) return;
    if (!csvImportBatchId) {
      setCsvImportError("Default batch is required for enrollment import.");
      return;
    }

    setCsvImporting(true);
    setCsvImportError("");
    setCsvImportResult(null);
    try {
      const res = await bulkImportStudentsCsv(csvFile, {
        batchId: csvImportBatchId,
        levelId: csvImportLevelId || undefined,
        assignedTeacherUserId: csvImportTeacherUserId || undefined,
        startDate: csvImportStartDate || undefined
      });
      setCsvImportResult(res?.data || res);
      await refreshWithFilters(0);
      setOffset(0);
    } catch (err) {
      setCsvImportError(getFriendlyErrorMessage(err) || "Import failed.");
    } finally {
      setCsvImporting(false);
    }
  };

  const getPrimaryLogin = (row) => {
    const users = row?.authUsers || [];
    return users.find((u) => u?.role === "STUDENT") || users[0] || null;
  };

  const getActiveEnrollment = (row) => {
    const enrollments = row?.batchEnrollments || [];
    return enrollments[0] || null;
  };

  const onCreate = async (e) => {
    e.preventDefault();
    setCreating(true);
    setError("");
    setAdmissionInfo("");

    try {
      const { firstName, lastName } = parseName(fullName);

      const res = await createStudent({
        firstName,
        lastName,
        gender,
        email: createLoginAccountFlag ? (studentEmail || undefined) : undefined,
        dateOfBirth: dateOfBirth || undefined,
        guardianName: guardianName || undefined,
        guardianPhone: guardianPhone || undefined,
        guardianEmail: guardianEmail || undefined,
        phonePrimary: guardianPhone || undefined,
        phoneSecondary: contactNo2 || undefined,
        address: address || undefined,
        state: stateField || undefined,
        district: district || undefined,
        tehsil: tehsil || undefined,
        levelId: admissionLevelId || undefined,
        currentTeacherUserId: currentTeacherUserId || undefined,
        isActive: status === "ACTIVE",
        createLoginAccount: createLoginAccountFlag,
        enrollmentFeeAmount
      });

      const createdStudentId = res?.data?.id;
      if (createdStudentId && photoFile) {
        try {
          const up = await uploadStudentPhoto(createdStudentId, photoFile);
          const newPhotoUrl = up?.data?.photoUrl || up?.photoUrl || null;
          if (newPhotoUrl) {
            setRows((prev) => prev.map((r) => (r.id === createdStudentId ? { ...r, photoUrl: newPhotoUrl } : r)));
          }
        } catch {
          // ignore
        }
      }

      const createdCode = res?.data?.admissionNo || "";
      const tempPassword = res?.data?.tempPassword;
      if (tempPassword) {
        setTempPasswordDialog({ username: createdCode, tempPassword });
        setAdmissionInfo("Student admitted. Temporary password shown below.");
      } else {
        setAdmissionInfo(`Student admitted. Student Code: ${createdCode}.`);
      }

      resetAdmissionForm();
      await refreshWithFilters(0);
      setOffset(0);
    } catch (err) {
      setError(getFriendlyErrorMessage(err) || "Create failed.");
    } finally {
      setCreating(false);
    }
  };

  const onEdit = (row) => {
    setEditError("");
    setEditInfo("");
    setEditingStudentId(row.id);
    setEditFirstName(row?.firstName || "");
    setEditLastName(row?.lastName || "");
    setEditAdmissionNo(row?.admissionNo || "");
    setEditGender(row?.gender || "");
    setEditDateOfBirth(row?.dateOfBirth ? String(row.dateOfBirth).slice(0, 10) : "");
    setEditGuardianName(row?.guardianName || "");
    setEditGuardianPhone(row?.guardianPhone || "");
    setEditGuardianEmail(row?.guardianEmail || "");
    setEditPhonePrimary(row?.phonePrimary || "");
    setEditPhoneSecondary(row?.phoneSecondary || "");
    setEditStudentEmail(row?.email || "");
    setEditAddress(row?.address || "");
    setEditState(row?.state || "");
    setEditDistrict(row?.district || "");
    setEditTehsil(row?.tehsil || "");
    setEditTotalFeeAmount(row?.totalFeeAmount != null ? String(row.totalFeeAmount) : "");
    setEditAdmissionFeeAmount(row?.admissionFeeAmount != null ? String(row.admissionFeeAmount) : "");
    setEditLevelId(row?.levelId || row?.level?.id || "");
    setEditCurrentTeacherUserId(row?.currentTeacherUserId || row?.currentTeacher?.id || "");
    setEditStatus(row?.isActive ? "ACTIVE" : "INACTIVE");
    setEditPhotoFile(null);
    setEditPhotoPreview(null);
  };

  // create object URLs for previews
  useEffect(() => {
    if (!photoFile) {
      setPhotoPreview(null);
      return undefined;
    }
    const u = URL.createObjectURL(photoFile);
    setPhotoPreview(u);
    return () => { URL.revokeObjectURL(u); };
  }, [photoFile]);

  useEffect(() => {
    if (!editPhotoFile) {
      setEditPhotoPreview(null);
      return undefined;
    }
    const u = URL.createObjectURL(editPhotoFile);
    setEditPhotoPreview(u);
    return () => { URL.revokeObjectURL(u); };
  }, [editPhotoFile]);

  const onSaveEdit = async (e) => {
    e.preventDefault();
    if (!editingStudentId) return;

    setEditing(true);
    setEditError("");
    setEditInfo("");

    try {
      await updateStudent(editingStudentId, {
        firstName: editFirstName || undefined,
        lastName: editLastName || undefined,
        admissionNo: editAdmissionNo || undefined,
        gender: editGender || undefined,
        dateOfBirth: editDateOfBirth || undefined,
        email: editStudentEmail || null,
        guardianName: editGuardianName || null,
        guardianPhone: editGuardianPhone || null,
        guardianEmail: editGuardianEmail || null,
        phonePrimary: editPhonePrimary || null,
        phoneSecondary: editPhoneSecondary || null,
        address: editAddress || null,
        state: editState || null,
        district: editDistrict || null,
        tehsil: editTehsil || null,
        levelId: editLevelId || undefined,
        currentTeacherUserId: editCurrentTeacherUserId || null,
        isActive: editStatus === "ACTIVE"
      });

      if (editPhotoFile) {
        try {
          const up = await uploadStudentPhoto(editingStudentId, editPhotoFile);
          const newPhotoUrl = up?.data?.photoUrl || up?.photoUrl || null;
          if (newPhotoUrl) {
            setRows((prev) => prev.map((r) => (r.id === editingStudentId ? { ...r, photoUrl: newPhotoUrl } : r)));
          }
        } catch {
          // ignore
        }
      }

      setEditInfo("Student updated.");
      await refreshWithFilters(0);
      setOffset(0);
      resetEditForm();
    } catch (err) {
      setEditError(getFriendlyErrorMessage(err) || "Update failed.");
    } finally {
      setEditing(false);
    }
  };

  const onChangeTeacher = async (row) => {
    const enrollment = getActiveEnrollment(row);
    if (!enrollment?.id) {
      toast.error("No active enrollment found for this student. Create an enrollment first.");
      return;
    }

    const currentTeacher = enrollment?.assignedTeacher;
    const currentLabel = currentTeacher
      ? `${pickTeacherLabel(currentTeacher)} (${currentTeacher.username || ""})`.trim()
      : "(None)";

    setChangeTeacherError("");
    setChangeTeacherStudentId(row.id);
    setChangeTeacherEnrollmentId(enrollment.id);
    setChangeTeacherCurrentLabel(currentLabel);
    setChangeTeacherNextTeacherId(currentTeacher?.id || "");
  };

  const onSaveTeacherChange = async (e) => {
    e.preventDefault();
    if (!changeTeacherEnrollmentId) return;

    setChangeTeacherSaving(true);
    setChangeTeacherError("");
    try {
      await updateEnrollment(changeTeacherEnrollmentId, {
        assignedTeacherUserId: changeTeacherNextTeacherId ? changeTeacherNextTeacherId : null
      });
      await refreshWithFilters(0);
      setOffset(0);
      setChangeTeacherStudentId(null);
      setChangeTeacherEnrollmentId(null);
      setChangeTeacherCurrentLabel("");
      setChangeTeacherNextTeacherId("");
    } catch (err) {
      setChangeTeacherError(getFriendlyErrorMessage(err) || "Failed to change teacher.");
    } finally {
      setChangeTeacherSaving(false);
    }
  };

  const onAssignCourse = (row) => {
    const existingIds = Array.isArray(row?.assignedCourses) && row.assignedCourses.length
      ? row.assignedCourses.map((item) => item?.courseId).filter(Boolean)
      : (row?.course?.id ? [row.course.id] : []);

    const existingLabels = Array.isArray(row?.assignedCourses) && row.assignedCourses.length
      ? row.assignedCourses
        .map((item) => item?.course ? `${item.course.name}${item.course.code ? ` (${item.course.code})` : ""}` : "")
        .filter(Boolean)
      : (row?.course ? [`${row.course.name}${row.course.code ? ` (${row.course.code})` : ""}`] : []);

    setAssignCourseError("");
    setAssignCourseStudentId(row.id);
    setAssignCourseCurrentLabel(existingLabels.length ? existingLabels.join(", ") : "(None)");
    setAssignCourseNextCourseIds(existingIds);
  };

  const onSaveAssignCourse = async (e) => {
    e.preventDefault();
    if (!assignCourseStudentId) return;

    setAssignCourseSaving(true);
    setAssignCourseError("");
    try {
      await assignStudentCourse(assignCourseStudentId, assignCourseNextCourseIds);
      await refreshWithFilters(0);
      setOffset(0);
      setAssignCourseStudentId(null);
      setAssignCourseCurrentLabel("");
      setAssignCourseNextCourseIds([]);
    } catch (err) {
      setAssignCourseError(getFriendlyErrorMessage(err) || "Failed to assign course.");
    } finally {
      setAssignCourseSaving(false);
    }
  };

  const onEnroll = (row) => {
    const enrollment = getActiveEnrollment(row);
    if (enrollment?.id) {
      toast.error("Student already has an active enrollment.");
      return;
    }

    setEnrollError("");
    setEnrollStudentId(row.id);
    setEnrollCurrentLabel(`${row?.firstName || ""} ${row?.lastName || ""}`.trim());
    setEnrollSelectedBatchId("");
  };

  const onSaveEnroll = async (e) => {
    e.preventDefault();
    if (!enrollStudentId || !enrollSelectedBatchId) {
      return;
    }

    setEnrollSaving(true);
    setEnrollError("");
    try {
      await createEnrollment({
        studentId: enrollStudentId,
        batchId: enrollSelectedBatchId,
        status: "ACTIVE"
      });

      await refreshWithFilters(0);
      setOffset(0);
      setEnrollStudentId(null);
      setEnrollCurrentLabel("");
      setEnrollSelectedBatchId("");
      toast.success("Student enrolled successfully.");
    } catch (err) {
      setEnrollError(getFriendlyErrorMessage(err) || "Failed to enroll student.");
    } finally {
      setEnrollSaving(false);
    }
  };

  const onUnenroll = (row) => {
    const enrollment = getActiveEnrollment(row);
    if (!enrollment?.id) {
      toast.error("No active enrollment found for this student.");
      return;
    }

    setUnenrollConfirmOpen(enrollment);
  };

  const handleUnenrollConfirm = async () => {
    const enrollment = unenrollConfirmOpen;
    if (!enrollment?.id) {
      return;
    }

    setUnenrollSaving(true);
    try {
      await updateEnrollment(enrollment.id, { status: "INACTIVE" });
      await refreshWithFilters(0);
      setOffset(0);
      setUnenrollConfirmOpen(null);
      toast.success("Student unenrolled successfully.");
    } catch (err) {
      toast.error(getFriendlyErrorMessage(err) || "Failed to unenroll student.");
    } finally {
      setUnenrollSaving(false);
    }
  };

  const [createLoginTarget, setCreateLoginTarget] = useState(null);

  const onCreateLogin = (row) => {
    setCreateLoginTarget(row);
  };

  const handleCreateLoginConfirm = async (password) => {
    const row = createLoginTarget;
    setCreateLoginTarget(null);
    if (!row) return;

    try {
      const res = await createStudentLogin(row.id, { password: password || undefined });
      const tempPassword = res?.data?.tempPassword;
      setTempPasswordDialog({
        username: row.admissionNo || row.firstName || "Student",
        tempPassword: tempPassword || "(set)"
      });
      await refreshWithFilters(0);
      setOffset(0);
    } catch (err) {
      setError(getFriendlyErrorMessage(err) || "Failed to create login");
    }
  };

  const onResetPassword = async (row) => {
    const login = getPrimaryLogin(row);
    if (!login?.id) {
      setError("No login account exists for this student.");
      return;
    }

    try {
      const res = await resetStudentPassword(row.id, { mustChangePassword: true });
      const username = res?.data?.username || login.username || "";
      const tempPassword = res?.data?.tempPassword;
      if (tempPassword) {
        setTempPasswordDialog({ username, tempPassword });
      } else {
        setTempPasswordDialog({ username, tempPassword: "(Password reset — student must change on next login)" });
      }
    } catch (err) {
      setError(getFriendlyErrorMessage(err) || "Password reset failed");
    }
  };

  const openFees = async (row) => {
    if (!row?.id) return;
    setFeesStudentId(row.id);
    setFeesStudentSnapshot(row);
    setFeesItems([]);
    setFeesError("");
    setFeesLoading(true);

    try {
      const data = await listLedger({ limit: 50, offset: 0, studentId: row.id });
      setFeesItems(data?.data?.items || []);
    } catch (err) {
      setFeesError(getFriendlyErrorMessage(err) || "Failed to load fees.");
    } finally {
      setFeesLoading(false);
    }
  };

  const addFeeEntry = async (e) => {
    e.preventDefault();
    if (!feesStudentId) return;

    setFeeEntrySaving(true);
    setFeeEntryError("");
    try {
      await recordStudentPayment(feesStudentId, {
        type: feeEntryType,
        grossAmount: feeEntryAmount,
        paymentMode: feeEntryMode,
        receivedAt: feeEntryReceivedDate || undefined,
        feeScheduleType: feeEntryScheduleType,
        feeMonth: feeEntryScheduleType === "MONTHLY" ? feeEntryMonth : undefined,
        feeYear: feeEntryScheduleType === "MONTHLY" ? feeEntryYear : undefined,
        feeLevelId: feeEntryScheduleType === "LEVEL_WISE" ? feeEntryLevelId : undefined,
        paymentReference: feeEntryReference || undefined
      });
      const data = await listLedger({ limit: 50, offset: 0, studentId: feesStudentId });
      setFeesItems(data?.data?.items || []);
      setFeeEntryAmount(0);
      setFeeEntryType("ENROLLMENT");
      setFeeEntryMode("CASH");
      setFeeEntryReceivedDate("");
      setFeeEntryScheduleType("ADVANCE");
      setFeeEntryMonth("");
      setFeeEntryYear("");
      setFeeEntryLevelId("");
      setFeeEntryReference("");
    } catch (err) {
      setFeeEntryError(getFriendlyErrorMessage(err) || "Failed to record payment.");
    } finally {
      setFeeEntrySaving(false);
    }
  };

  const [overridePromotionTarget, setOverridePromotionTarget] = useState(null);

  const onOverridePromotion = (row) => {
    if (!levels.length) {
      toast.error("No levels loaded.");
      return;
    }
    setOverridePromotionTarget(row);
  };

  const handleOverridePromotionConfirm = async (value) => {
    const row = overridePromotionTarget;
    setOverridePromotionTarget(null);
    if (!row) return;

    const trimmed = String(value).trim();
    const rankNum = Number(trimmed);
    const level = Number.isFinite(rankNum)
      ? levels.find((l) => Number(l?.rank) === rankNum)
      : levels.find((l) => String(l?.id) === trimmed);

    if (!level) {
      toast.error("Level not found.");
      return;
    }

    try {
      await assignStudentLevel(row.id, { levelId: level.id });
      await refreshWithFilters(0);
      setOffset(0);
    } catch (err) {
      toast.error(getFriendlyErrorMessage(err) || "Failed to assign level");
    }
  };

  const columns = useMemo(
    () => [
      { key: "admissionNo", header: "Code" },
      {
        key: "name",
        header: "Name",
        render: (r) => `${r?.firstName || ""} ${r?.lastName || ""}`.trim()
      },
      {
        key: "courseLevel",
        header: "Course / Level",
        render: (r) => {
          const assignedCourseNames = Array.isArray(r?.assignedCourses)
            ? r.assignedCourses
              .map((item) => item?.course?.name || "")
              .filter(Boolean)
            : [];
          const course = assignedCourseNames.length
            ? assignedCourseNames.join(", ")
            : (r?.course ? `${r.course.name}` : "");
          const level = r?.level ? `${r.level.name} / ${r.level.rank}` : "";
          return course ? `${course} → ${level}` : level;
        }
      },
      {
        key: "assignedTeacher",
        header: "Assigned Teacher",
        render: (r) => {
          if (r?.currentTeacher) {
            return pickTeacherLabel(r.currentTeacher);
          }
          const enrollment = getActiveEnrollment(r);
          const teacher = enrollment?.assignedTeacher;
          return pickTeacherLabel(teacher);
        }
      },
      {
        key: "login",
        header: "Login",
        render: (r) => {
          const login = getPrimaryLogin(r);
          return login?.username || "";
        }
      },
      { key: "isActive", header: "Status", render: (r) => (r?.isActive ? "ACTIVE" : "INACTIVE") },
      { key: "createdAt", header: "Admission Date", render: (r) => String(r?.createdAt || "").slice(0, 10) },
      {
        key: "actions",
        header: "Actions",
        render: (r) => {
          const login = getPrimaryLogin(r);
          const enrollment = getActiveEnrollment(r);
          const teacherLabel = enrollment?.assignedTeacher
            ? `${pickTeacherLabel(enrollment.assignedTeacher)} (${enrollment.assignedTeacher.username || ""})`.trim()
            : "";

          return (
            <div style={{ display: "flex", gap: 10, alignItems: "center" }}>
              <Link className="button" style={{ width: "auto" }} to={`/center/students/${r.id}`}>
                View
              </Link>
              <Link className="button" style={{ width: "auto", background: "#7c3aed" }} to={`/center/students/${r.id}/360`}>
                360°
              </Link>
              <button className="button secondary" style={{ width: "auto" }} onClick={() => void onEdit(r)}>
                Edit
              </button>
              <details>
                <summary style={{ cursor: "pointer" }}>{teacherLabel || "Actions"}</summary>
                <div style={{ display: "grid", gap: 6, paddingTop: 8 }}>
                  {!enrollment?.id ? (
                    <button className="button secondary" style={{ width: "auto" }} onClick={() => void onEnroll(r)}>
                      Enroll
                    </button>
                  ) : (
                    <button className="button secondary" style={{ width: "auto" }} onClick={() => void onUnenroll(r)}>
                      Unenroll
                    </button>
                  )}
                  <Link
                    className="button secondary"
                    style={{ width: "auto" }}
                    to={`/center/students/${r.id}/change-teacher`}
                  >
                    Change Teacher
                  </Link>
                  <button className="button secondary" style={{ width: "auto" }} onClick={() => void onAssignCourse(r)}>
                    Assign Course
                  </button>
                  <Link
                    className="button secondary"
                    style={{ width: "auto" }}
                    to={`/center/students/${r.id}/assign-worksheets`}
                    title="Assign worksheets for this student's active enrollment."
                  >
                    Assign Worksheets
                  </Link>
                  <Link className="button secondary" style={{ width: "auto" }} to={`/center/students/${r.id}/fees`}>
                    Fees
                  </Link>
                  <Link className="button secondary" style={{ width: "auto" }} to={`/center/students/${r.id}/notes`}>
                    View Notes
                  </Link>
                  <button className="button secondary" style={{ width: "auto" }} onClick={() => void onOverridePromotion(r)}>
                    Override Promotion
                  </button>
                  {!login ? (
                    <button className="button secondary" style={{ width: "auto" }} onClick={() => void onCreateLogin(r)}>
                      Create Login
                    </button>
                  ) : null}
                  <button className="button secondary" style={{ width: "auto" }} onClick={() => void onResetPassword(r)}>
                    Reset Password
                  </button>
                </div>
              </details>
            </div>
          );
        }
      }
    ],
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [teachers, levels]
  );

  const teacherOptions = useMemo(() => teachers, [teachers]);
  const levelOptions = useMemo(() => levels, [levels]);

  if (loading && !rows.length) {
    return <LoadingState label="Loading students..." />;
  }

  return (
    <section style={{ display: "grid", gap: 12 }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", flexWrap: "wrap", gap: 10 }}>
        <div>
          <h2 style={{ margin: 0 }}>Students</h2>
          <div style={{ fontSize: 12, color: "var(--color-text-muted)" }}>Manage teachers, students, enrollments, and worksheets.</div>
        </div>
        <div style={{ display: "flex", flexWrap: "wrap", gap: 8 }}>
          <button
            className="button secondary"
            type="button"
            style={{ width: "auto", fontSize: 13 }}
            disabled={csvExporting}
            onClick={() => void handleDownloadStudentsCsv()}
          >
            {csvExporting ? "Exporting CSV…" : "Export CSV"}
          </button>
          <button
            className="button secondary"
            type="button"
            style={{ width: "auto", fontSize: 13 }}
            disabled={excelExporting}
            onClick={() => void handleDownloadStudentsExcel()}
          >
            {excelExporting ? "Exporting Excel…" : "Export Excel"}
          </button>
          <button
            className="button secondary"
            type="button"
            style={{ width: "auto", fontSize: 13 }}
            onClick={openCsvImportModal}
          >
            Import CSV
          </button>
        </div>
      </div>

      <form className="card" onSubmit={onCreate} style={{ display: "grid", gap: 10 }}>
        <h3 style={{ marginTop: 0 }}>Student Admission</h3>
        <div style={{ fontSize: 12, color: "var(--color-text-muted)" }}>Admit new students into the center.</div>
        {error ? <p className="error">{error}</p> : null}
        {admissionInfo ? <p style={{ margin: 0, color: "var(--color-text-success)", fontWeight: 700 }}>{admissionInfo}</p> : null}

        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(180px, 1fr))", gap: 10 }}>
          <label>
            Student Code
            <input className="input" value={studentCode} placeholder="Auto-generated" disabled />
          </label>

          <label>
            Full Name
            <input className="input" value={fullName} onChange={(e) => setFullName(e.target.value)} placeholder="Student name" required />
          </label>

          <label>
            Gender
            <select className="select" value={gender} onChange={(e) => setGender(e.target.value)}>
              <option value="MALE">MALE</option>
              <option value="FEMALE">FEMALE</option>
              <option value="OTHER">OTHER</option>
            </select>
          </label>

          <label>
            Date of Birth
            <input className="input" type="date" value={dateOfBirth} onChange={(e) => setDateOfBirth(e.target.value)} />
          </label>

          <label>
            Guardian Name
            <input className="input" value={guardianName} onChange={(e) => setGuardianName(e.target.value)} />
          </label>

          <label>
            Guardian Phone
            <input className="input" value={guardianPhone} onChange={(e) => setGuardianPhone(e.target.value)} />
          </label>

          <label>
            Contact No:2
            <input className="input" value={contactNo2} onChange={(e) => setContactNo2(e.target.value)} />
          </label>

          <label>
            Guardian Email (optional)
            <input className="input" value={guardianEmail} onChange={(e) => setGuardianEmail(e.target.value)} placeholder="guardian@example.com" />
          </label>

          {createLoginAccountFlag ? (
            <label>
              Student Email (optional)
              <input
                className="input"
                value={studentEmail}
                onChange={(e) => setStudentEmail(e.target.value)}
                placeholder="student@example.com"
              />
            </label>
          ) : null}

          <label style={{ gridColumn: "1 / -1" }}>
            Address
            <textarea className="input" value={address} onChange={(e) => setAddress(e.target.value)} rows={2} />
          </label>

          <label>
            State
            <input className="input" value={stateField} onChange={(e) => setStateField(e.target.value)} placeholder="State" />
          </label>

          <label>
            District
            <input className="input" value={district} onChange={(e) => setDistrict(e.target.value)} placeholder="District" />
          </label>

          <label>
             Tehsil
             <input className="input" value={tehsil} onChange={(e) => setTehsil(e.target.value)} placeholder="Tehsil" />
          </label>

          <label>
            Current Level
            <select className="select" value={admissionLevelId} onChange={(e) => setAdmissionLevelId(e.target.value)}>
              <option value="">(Default)</option>
              {levelOptions.map((l) => (
                <option key={l.id} value={l.id}>
                  {l.name} / {l.rank}
                </option>
              ))}
            </select>
          </label>

          <label>
            Current Teacher
            <select className="select" value={currentTeacherUserId} onChange={(e) => setCurrentTeacherUserId(e.target.value)}>
              <option value="">Select</option>
              {teacherOptions.map((t) => (
                <option key={t.id} value={t.id}>
                  {t?.teacherProfile?.fullName || t.username || t.email}
                </option>
              ))}
            </select>
          </label>

          <label style={{ gridColumn: "1 / -1" }}>
            Photo Upload
            <input
              className="input"
              type="file"
              accept="image/png,image/jpg,image/jpeg"
              onChange={(e) => setPhotoFile(e.target.files && e.target.files[0] ? e.target.files[0] : null)}
            />
          </label>
          {photoPreview ? (
            <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
              <div style={{ fontSize: 12, color: "var(--color-text-muted)" }}>Preview</div>
              <img src={photoPreview} alt="preview" style={{ width: 80, height: 80, objectFit: "cover", borderRadius: 8, border: "1px solid var(--color-border)" }} />
            </div>
          ) : null}

          <label>
            Status
            <select className="select" value={status} onChange={(e) => setStatus(e.target.value)}>
              <option value="ACTIVE">ACTIVE</option>
              <option value="INACTIVE">INACTIVE</option>
            </select>
          </label>

          <label>
            Enrollment fee (optional)
            <input className="input" value={enrollmentFeeAmount} onChange={(e) => setEnrollmentFeeAmount(Number(e.target.value) || 0)} />
          </label>

          <div style={{ gridColumn: "1 / -1", fontSize: 12, color: "var(--color-text-muted)" }}>
            Student-specific fee concessions are managed from the Fees page with a note.
          </div>

          <label style={{ display: "flex", gap: 8, alignItems: "center", marginTop: 22 }}>
            <input type="checkbox" checked={createLoginAccountFlag} onChange={(e) => setCreateLoginAccountFlag(e.target.checked)} />
            Create login account
          </label>
        </div>

        {createLoginAccountFlag && studentCode ? (
          <div style={{ fontSize: 12, color: "var(--color-text-muted)" }}>Login enabled: <strong>{studentCode}</strong></div>
        ) : null}

        <div style={{ display: "flex", gap: 10, alignItems: "center" }}>
          <button className="button" disabled={creating} style={{ width: "auto" }}>
            {creating ? "Admitting..." : "Admit Student"}
          </button>
          <button
            type="button"
            className="button secondary"
            style={{ width: "auto" }}
            onClick={resetAdmissionForm}
            disabled={creating}
          >
            Reset
          </button>
        </div>
      </form>

      {tempPasswordDialog ? (
        <div className="dash-modal" role="dialog" aria-modal="true" aria-label="Temporary Password">
          <div className="card dash-modal__panel" style={{ display: "grid", gap: 12 }}>
            <div className="dash-modal__header">
              <div>
                <div style={{ fontWeight: 800, fontSize: 16 }}>Temporary Password</div>
                <div style={{ fontSize: 12, color: "var(--color-text-muted)" }}>Save this now. It will not be shown again.</div>
              </div>
              <button className="button secondary" style={{ width: "auto" }} onClick={() => setTempPasswordDialog(null)}>
                Close
              </button>
            </div>

            <div style={{ display: "grid", gridTemplateColumns: "160px 1fr", gap: 8, alignItems: "center" }}>
              <div style={{ color: "var(--color-text-muted)" }}>Username</div>
              <div style={{ fontWeight: 700 }}>{tempPasswordDialog.username}</div>

              <div style={{ color: "var(--color-text-muted)" }}>Temporary Password</div>
              <div style={{ fontWeight: 700, fontFamily: "monospace", fontSize: 15, letterSpacing: 1 }}>{tempPasswordDialog.tempPassword}</div>
            </div>

            <div style={{ display: "flex", gap: 10, flexWrap: "wrap", alignItems: "center" }}>
              <button
                className="button"
                style={{ width: "auto" }}
                onClick={async (e) => {
                  const btn = e.currentTarget;
                  const text = tempPasswordDialog.tempPassword;
                  try {
                    await navigator.clipboard.writeText(text);
                    btn.textContent = "Copied!";
                    setTimeout(() => { btn.textContent = "Copy Password"; }, 2000);
                  } catch {
                    toast("Could not copy to clipboard");
                  }
                }}
              >
                Copy Password
              </button>
              <button
                className="button secondary"
                style={{ width: "auto" }}
                onClick={async (e) => {
                  const btn = e.currentTarget;
                  const text = `Username: ${tempPasswordDialog.username}\nPassword: ${tempPasswordDialog.tempPassword}`;
                  try {
                    await navigator.clipboard.writeText(text);
                    btn.textContent = "Copied!";
                    setTimeout(() => { btn.textContent = "Copy Both"; }, 2000);
                  } catch {
                    toast("Could not copy to clipboard");
                  }
                }}
              >
                Copy Both
              </button>
            </div>
          </div>
        </div>
      ) : null}

      {feesStudentId ? (
        <div className="card" style={{ display: "grid", gap: 10 }}>
          <div style={{ display: "flex", justifyContent: "space-between", gap: 10, flexWrap: "wrap", alignItems: "center" }}>
            <div>
              <h3 style={{ margin: 0 }}>Fees</h3>
              <div style={{ fontSize: 12, color: "var(--color-text-muted)" }}>Recent ledger transactions for this student.</div>
            </div>
            <button
              type="button"
              className="button secondary"
              style={{ width: "auto" }}
              onClick={() => {
                setFeesStudentId(null);
                setFeesStudentSnapshot(null);
                setFeesItems([]);
                setFeesError("");
              }}
            >
              Close
            </button>
          </div>

          {feesError ? <p className="error">{feesError}</p> : null}
          {feesLoading ? <div style={{ fontSize: 12, color: "var(--color-text-muted)" }}>Loading...</div> : null}

          <form onSubmit={addFeeEntry} style={{ display: "grid", gap: 10 }}>
            <div style={{ fontWeight: 800 }}>Add Payment</div>
            {feeEntryError ? <p className="error">{feeEntryError}</p> : null}
            <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(180px, 1fr))", gap: 10, alignItems: "end" }}>
              <label>
                Type
                <select className="select" value={feeEntryType} onChange={(e) => setFeeEntryType(e.target.value)}>
                  <option value="ENROLLMENT">ENROLLMENT (Admission)</option>
                  <option value="RENEWAL">RENEWAL</option>
                  <option value="ADJUSTMENT">ADJUSTMENT (Final payment)</option>
                </select>
              </label>

              {feeEntryType === "ADJUSTMENT" ? (
                <div style={{ gridColumn: "1 / -1", fontSize: 12, color: "var(--color-text-muted)" }}>
                  Adjustment records the last payment and waives the remaining due balance.
                </div>
              ) : null}

              <label>
                Pay Mode
                <select className="select" value={feeEntryMode} onChange={(e) => setFeeEntryMode(e.target.value)}>
                  <option value="CASH">CASH</option>
                  <option value="ONLINE">ONLINE</option>
                  <option value="GPAY">GPAY</option>
                  <option value="PAYTM">PAYTM</option>
                </select>
              </label>

              <label>
                Received Date
                <input className="input" type="date" value={feeEntryReceivedDate} onChange={(e) => setFeeEntryReceivedDate(e.target.value)} />
              </label>

              <label>
                Fee Schedule
                <select className="select" value={feeEntryScheduleType} onChange={(e) => setFeeEntryScheduleType(e.target.value)}>
                  {FEE_SCHEDULE_OPTIONS.map((option) => (
                    <option key={option.value} value={option.value}>
                      {option.value === "ADVANCE" ? "ADVANCE (Whole fee)" : option.label.replaceAll("_", " ")}
                    </option>
                  ))}
                </select>
              </label>

              {feeEntryScheduleType === "MONTHLY" ? (
                <label>
                  Month (1-12)
                  <input className="input" value={feeEntryMonth} onChange={(e) => setFeeEntryMonth(e.target.value)} placeholder="2" />
                </label>
              ) : null}

              {feeEntryScheduleType === "MONTHLY" ? (
                <label>
                  Year
                  <input className="input" value={feeEntryYear} onChange={(e) => setFeeEntryYear(e.target.value)} placeholder="2026" />
                </label>
              ) : null}

              {feeEntryScheduleType === "LEVEL_WISE" ? (
                <label>
                  Level
                  <select className="select" value={feeEntryLevelId} onChange={(e) => setFeeEntryLevelId(e.target.value)}>
                    <option value="">Select</option>
                    {levelOptions.map((l) => (
                      <option key={l.id} value={l.id}>
                        {l.name} / {l.rank}
                      </option>
                    ))}
                  </select>
                </label>
              ) : null}

              <label>
                Reference (optional)
                <input className="input" value={feeEntryReference} onChange={(e) => setFeeEntryReference(e.target.value)} placeholder="UPI / Txn id" />
              </label>

              <label>
                Amount
                <input className="input" value={feeEntryAmount} onChange={(e) => setFeeEntryAmount(Number(e.target.value) || 0)} />
              </label>

              <button className="button" style={{ width: "auto" }} disabled={feeEntrySaving || feeEntryAmount <= 0}>
                {feeEntrySaving ? "Saving..." : "Add"}
              </button>
            </div>
          </form>

          {!feesLoading ? (() => {
            const totalFee = feesStudentSnapshot?.totalFeeAmount != null ? Number(feesStudentSnapshot.totalFeeAmount) : null;
            const admissionFee = feesStudentSnapshot?.admissionFeeAmount != null ? Number(feesStudentSnapshot.admissionFeeAmount) : null;
            const paidTotal = (feesItems || []).reduce((sum, t) => sum + Number(t?.grossAmount || 0), 0);
            const admissionPaid = (feesItems || [])
              .filter((t) => String(t?.type || "").toUpperCase() === "ENROLLMENT")
              .reduce((sum, t) => sum + Number(t?.grossAmount || 0), 0);

            const pendingTotal = totalFee == null ? null : Math.max(0, Number((totalFee - paidTotal).toFixed(2)));
            const pendingAdmission = admissionFee == null ? null : Math.max(0, Number((admissionFee - admissionPaid).toFixed(2)));

            return (
              <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(180px, 1fr))", gap: 10 }}>
                <div className="card" style={{ padding: 12 }}>
                  <div style={{ fontSize: 12, color: "var(--color-text-muted)" }}>Total Fee</div>
                  <div style={{ fontWeight: 900 }}>{totalFee == null ? "—" : totalFee}</div>
                </div>
                <div className="card" style={{ padding: 12 }}>
                  <div style={{ fontSize: 12, color: "var(--color-text-muted)" }}>Admission Fee</div>
                  <div style={{ fontWeight: 900 }}>{admissionFee == null ? "—" : admissionFee}</div>
                </div>
                <div className="card" style={{ padding: 12 }}>
                  <div style={{ fontSize: 12, color: "var(--color-text-muted)" }}>Paid</div>
                  <div style={{ fontWeight: 900 }}>{Number(paidTotal.toFixed(2))}</div>
                </div>
                <div className="card" style={{ padding: 12 }}>
                  <div style={{ fontSize: 12, color: "var(--color-text-muted)" }}>Pending</div>
                  <div style={{ fontWeight: 900 }}>{pendingTotal == null ? "—" : pendingTotal}</div>
                </div>
                <div className="card" style={{ padding: 12 }}>
                  <div style={{ fontSize: 12, color: "var(--color-text-muted)" }}>Admission Paid</div>
                  <div style={{ fontWeight: 900 }}>{Number(admissionPaid.toFixed(2))}</div>
                </div>
                <div className="card" style={{ padding: 12 }}>
                  <div style={{ fontSize: 12, color: "var(--color-text-muted)" }}>Admission Pending</div>
                  <div style={{ fontWeight: 900 }}>{pendingAdmission == null ? "—" : pendingAdmission}</div>
                </div>
              </div>
            );
          })() : null}

          {!feesLoading && !feesItems.length ? (
            <div style={{ fontSize: 12, color: "var(--color-text-muted)" }}>No transactions found.</div>
          ) : null}

          {feesItems.length ? (
            <div style={{ overflowX: "auto" }}>
              <table style={{ width: "100%", borderCollapse: "collapse" }}>
                <thead>
                  <tr>
                    <th style={{ textAlign: "left", padding: "8px 6px" }}>Received</th>
                    <th style={{ textAlign: "left", padding: "8px 6px" }}>Type</th>
                    <th style={{ textAlign: "left", padding: "8px 6px" }}>Mode</th>
                    <th style={{ textAlign: "left", padding: "8px 6px" }}>Schedule</th>
                    <th style={{ textAlign: "left", padding: "8px 6px" }}>For</th>
                    <th style={{ textAlign: "left", padding: "8px 6px" }}>Ref</th>
                    <th style={{ textAlign: "left", padding: "8px 6px" }}>Paid By</th>
                    <th style={{ textAlign: "right", padding: "8px 6px" }}>Amount</th>
                  </tr>
                </thead>
                <tbody>
                  {feesItems.map((t) => {
                    const schedule = t?.feeScheduleType || "";
                    const forLabel = formatFeeScheduleTarget(
                      schedule,
                      t?.feeLevel,
                      t?.feeLevelId,
                      t?.feeMonth,
                      t?.feeYear
                    );

                    return (
                      <tr key={t.id}>
                        <td style={{ padding: "8px 6px", borderTop: "1px solid rgba(0,0,0,0.06)" }}>{String(t.receivedAt || t.createdAt || "").slice(0, 10)}</td>
                        <td style={{ padding: "8px 6px", borderTop: "1px solid rgba(0,0,0,0.06)" }}>{t.type}</td>
                        <td style={{ padding: "8px 6px", borderTop: "1px solid rgba(0,0,0,0.06)" }}>{t.paymentMode || ""}</td>
                        <td style={{ padding: "8px 6px", borderTop: "1px solid rgba(0,0,0,0.06)" }}>{schedule}</td>
                        <td style={{ padding: "8px 6px", borderTop: "1px solid rgba(0,0,0,0.06)" }}>{forLabel}</td>
                        <td style={{ padding: "8px 6px", borderTop: "1px solid rgba(0,0,0,0.06)" }}>{t.paymentReference || ""}</td>
                        <td style={{ padding: "8px 6px", borderTop: "1px solid rgba(0,0,0,0.06)" }}>{t?.createdBy?.username || t?.createdBy?.email || ""}</td>
                        <td style={{ padding: "8px 6px", borderTop: "1px solid rgba(0,0,0,0.06)", textAlign: "right" }}>{Number(t.grossAmount || 0)}</td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          ) : null}
        </div>
      ) : null}

      {changeTeacherEnrollmentId ? (
        <form className="card" onSubmit={onSaveTeacherChange} style={{ display: "grid", gap: 10 }}>
          <div style={{ display: "flex", justifyContent: "space-between", gap: 10, flexWrap: "wrap", alignItems: "center" }}>
            <div>
              <h3 style={{ margin: 0 }}>Change Teacher</h3>
              <div style={{ fontSize: 12, color: "var(--color-text-muted)" }}>Update the assigned teacher for the student’s active enrollment.</div>
            </div>
            <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
              <button
                type="button"
                className="button secondary"
                style={{ width: "auto" }}
                onClick={() => {
                  setChangeTeacherStudentId(null);
                  setChangeTeacherEnrollmentId(null);
                  setChangeTeacherCurrentLabel("");
                  setChangeTeacherNextTeacherId("");
                  setChangeTeacherError("");
                }}
                disabled={changeTeacherSaving}
              >
                Cancel
              </button>
              <button className="button" style={{ width: "auto" }} disabled={changeTeacherSaving}>
                {changeTeacherSaving ? "Saving..." : "Save"}
              </button>
            </div>
          </div>

          {changeTeacherError ? <p className="error">{changeTeacherError}</p> : null}

          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(220px, 1fr))", gap: 10 }}>
            <div>
              <div style={{ fontSize: 12, color: "var(--color-text-muted)" }}>Current Teacher</div>
              <div style={{ fontWeight: 800 }}>{changeTeacherCurrentLabel}</div>
            </div>

            <label>
              New Teacher
              <select className="select" value={changeTeacherNextTeacherId} onChange={(e) => setChangeTeacherNextTeacherId(e.target.value)}>
                <option value="">(None)</option>
                {teacherOptions.map((t) => (
                  <option key={t.id} value={t.id}>
                    {t?.teacherProfile?.fullName || t.username || t.email}
                  </option>
                ))}
              </select>
            </label>
          </div>
        </form>
      ) : null}

      {assignCourseStudentId ? (
        <form className="card" onSubmit={onSaveAssignCourse} style={{ display: "grid", gap: 10 }}>
          <div style={{ display: "flex", justifyContent: "space-between", gap: 10, flexWrap: "wrap", alignItems: "center" }}>
            <div>
              <h3 style={{ margin: 0 }}>Assign Course</h3>
              <div style={{ fontSize: 12, color: "var(--color-text-muted)" }}>Update the student’s assigned course.</div>
            </div>
            <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
              <button
                type="button"
                className="button secondary"
                style={{ width: "auto" }}
                onClick={() => {
                  setAssignCourseStudentId(null);
                  setAssignCourseCurrentLabel("");
                  setAssignCourseNextCourseIds([]);
                  setAssignCourseError("");
                }}
                disabled={assignCourseSaving}
              >
                Cancel
              </button>
              <button className="button" style={{ width: "auto" }} disabled={assignCourseSaving}>
                {assignCourseSaving ? "Saving..." : "Save"}
              </button>
            </div>
          </div>

          {assignCourseError ? <p className="error">{assignCourseError}</p> : null}

          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(220px, 1fr))", gap: 10 }}>
            <div>
              <div style={{ fontSize: 12, color: "var(--color-text-muted)" }}>Current Course</div>
              <div style={{ fontWeight: 800 }}>{assignCourseCurrentLabel}</div>
            </div>

            <label>
              Select Courses (multiple)
              <select
                className="select"
                multiple
                size={Math.min(8, Math.max(4, courses.length || 4))}
                value={assignCourseNextCourseIds}
                onChange={(e) => {
                  const selected = Array.from(e.target.selectedOptions).map((opt) => opt.value);
                  setAssignCourseNextCourseIds(selected);
                }}
              >
                {courses.map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.name} {c.code ? `(${c.code})` : ""}
                  </option>
                ))}
              </select>
              <div style={{ fontSize: 12, color: "var(--color-text-muted)", marginTop: 4 }}>
                Hold Ctrl (Windows) to select multiple courses.
              </div>
            </label>
          </div>
        </form>
      ) : null}

      {enrollStudentId ? (
        <form className="card" onSubmit={onSaveEnroll} style={{ display: "grid", gap: 10 }}>
          <div style={{ display: "flex", justifyContent: "space-between", gap: 10, flexWrap: "wrap", alignItems: "center" }}>
            <div>
              <h3 style={{ margin: 0 }}>Enroll Student</h3>
              <div style={{ fontSize: 12, color: "var(--color-text-muted)" }}>Select a batch and enroll this student.</div>
            </div>
            <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
              <button
                type="button"
                className="button secondary"
                style={{ width: "auto" }}
                onClick={() => {
                  setEnrollStudentId(null);
                  setEnrollCurrentLabel("");
                  setEnrollSelectedBatchId("");
                  setEnrollError("");
                }}
                disabled={enrollSaving}
              >
                Cancel
              </button>
              <button className="button" style={{ width: "auto" }} disabled={enrollSaving || !enrollSelectedBatchId}>
                {enrollSaving ? "Enrolling..." : "Enroll"}
              </button>
            </div>
          </div>

          {enrollError ? <p className="error">{enrollError}</p> : null}

          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(220px, 1fr))", gap: 10 }}>
            <div>
              <div style={{ fontSize: 12, color: "var(--color-text-muted)" }}>Student</div>
              <div style={{ fontWeight: 800 }}>{enrollCurrentLabel}</div>
            </div>

            <label>
              Batch
              <select className="select" value={enrollSelectedBatchId} onChange={(e) => setEnrollSelectedBatchId(e.target.value)}>
                <option value="">Select</option>
                {batches.map((b) => (
                  <option key={b.id} value={b.id}>
                    {b.name}
                  </option>
                ))}
              </select>
            </label>
          </div>
        </form>
      ) : null}

      <div className="card" style={{ display: "grid", gap: 10 }}>
        <div>
          <h3 style={{ margin: 0 }}>Student List</h3>
          <div style={{ fontSize: 12, color: "var(--color-text-muted)" }}>Track students and their enrollments.</div>
        </div>

        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(180px, 1fr))", gap: 10, alignItems: "end" }}>
          <label>
            Search name or code
            <input className="input" value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search name or code" />
          </label>

          <label>
            All Status
            <select className="select" value={statusFilter} onChange={(e) => setStatusFilter(e.target.value)}>
              <option value="">All</option>
              <option value="ACTIVE">ACTIVE</option>
              <option value="INACTIVE">INACTIVE</option>
            </select>
          </label>

          <label>
            All Teachers
            <select className="select" value={teacherFilter} onChange={(e) => setTeacherFilter(e.target.value)}>
              <option value="">All</option>
              {teacherOptions.map((t) => (
                <option key={t.id} value={t.id}>
                  {t?.teacherProfile?.fullName || t.username || t.email}
                </option>
              ))}
            </select>
          </label>

          <label>
            Course code
            <input className="input" value={courseCodeFilter} onChange={(e) => setCourseCodeFilter(e.target.value)} placeholder="AB-L1" />
          </label>

          <label>
            Level
            <select className="select" value={levelFilter} onChange={(e) => setLevelFilter(e.target.value)}>
              <option value="">All</option>
              {levelOptions.map((l) => (
                <option key={l.id} value={l.id}>
                  {l.name} / {l.rank}
                </option>
              ))}
            </select>
          </label>

          <button
            type="button"
            className="button secondary"
            style={{ width: "auto" }}
            onClick={() => {
              void refreshWithFilters(0);
              setOffset(0);
            }}
          >
            Refresh
          </button>
        </div>
      </div>

      {editingStudentId ? (
        <form className="card" onSubmit={onSaveEdit} style={{ display: "grid", gap: 10 }}>
          <div style={{ display: "flex", justifyContent: "space-between", gap: 10, flexWrap: "wrap", alignItems: "center" }}>
            <div>
              <h3 style={{ margin: 0 }}>Edit Student</h3>
              <div style={{ fontSize: 12, color: "var(--color-text-muted)" }}>Update student profile, level, teacher, and contact details.</div>
            </div>
            <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
              <button type="button" className="button secondary" style={{ width: "auto" }} onClick={resetEditForm} disabled={editing}>
                Cancel
              </button>
              <button className="button" style={{ width: "auto" }} disabled={editing}>
                {editing ? "Saving..." : "Save"}
              </button>
            </div>
          </div>

          {editError ? <p className="error">{editError}</p> : null}
          {editInfo ? <p style={{ margin: 0, color: "var(--color-text-success)", fontWeight: 700 }}>{editInfo}</p> : null}

          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(180px, 1fr))", gap: 10 }}>
            <label>
              Student Code
              <input className="input" value={editAdmissionNo} onChange={(e) => setEditAdmissionNo(e.target.value)} disabled />
            </label>

            <label>
              First Name
              <input className="input" value={editFirstName} onChange={(e) => setEditFirstName(e.target.value)} required />
            </label>

            <label>
              Last Name
              <input className="input" value={editLastName} onChange={(e) => setEditLastName(e.target.value)} />
            </label>

            <label>
              Gender
              <select className="select" value={editGender || ""} onChange={(e) => setEditGender(e.target.value)}>
                <option value="">(None)</option>
                <option value="MALE">MALE</option>
                <option value="FEMALE">FEMALE</option>
                <option value="OTHER">OTHER</option>
              </select>
            </label>

            <label>
              Date of Birth
              <input className="input" type="date" value={editDateOfBirth} onChange={(e) => setEditDateOfBirth(e.target.value)} />
            </label>

            <label>
              Guardian Name
              <input className="input" value={editGuardianName} onChange={(e) => setEditGuardianName(e.target.value)} />
            </label>

            <label>
              Guardian Phone
              <input className="input" value={editGuardianPhone} onChange={(e) => setEditGuardianPhone(e.target.value)} />
            </label>

            <label>
              Guardian Email
              <input className="input" value={editGuardianEmail} onChange={(e) => setEditGuardianEmail(e.target.value)} placeholder="guardian@example.com" />
            </label>

            <label>
              Student Email (optional)
              <input className="input" value={editStudentEmail} onChange={(e) => setEditStudentEmail(e.target.value)} placeholder="student@example.com" />
            </label>

            <label>
              Phone Primary
              <input className="input" value={editPhonePrimary} onChange={(e) => setEditPhonePrimary(e.target.value)} />
            </label>

            <label>
              Phone Secondary
              <input className="input" value={editPhoneSecondary} onChange={(e) => setEditPhoneSecondary(e.target.value)} />
            </label>

            <label style={{ gridColumn: "1 / -1" }}>
              Address
              <textarea className="input" value={editAddress} onChange={(e) => setEditAddress(e.target.value)} rows={2} />
            </label>

            <label>
              State
              <input className="input" value={editState} onChange={(e) => setEditState(e.target.value)} />
            </label>

            <label>
              District
              <input className="input" value={editDistrict} onChange={(e) => setEditDistrict(e.target.value)} />
            </label>

            <label>
              Tehsil
              <input className="input" value={editTehsil} onChange={(e) => setEditTehsil(e.target.value)} />
            </label>

            <div style={{ gridColumn: "1 / -1", fontSize: 12, color: "var(--color-text-muted)" }}>
              Direct fee edits are locked. Use the student Fees page to add a concession note.
            </div>

            <label>
              Current Level
              <select className="select" value={editLevelId} onChange={(e) => setEditLevelId(e.target.value)}>
                <option value="">(None)</option>
                {levelOptions.map((l) => (
                  <option key={l.id} value={l.id}>
                    {l.name} / {l.rank}
                  </option>
                ))}
              </select>
            </label>

            <label>
              Current Teacher
              <select className="select" value={editCurrentTeacherUserId} onChange={(e) => setEditCurrentTeacherUserId(e.target.value)}>
                <option value="">(None)</option>
                {teacherOptions.map((t) => (
                  <option key={t.id} value={t.id}>
                    {t?.teacherProfile?.fullName || t.username || t.email}
                  </option>
                ))}
              </select>
            </label>

            <label>
              Status
              <select className="select" value={editStatus} onChange={(e) => setEditStatus(e.target.value)}>
                <option value="ACTIVE">ACTIVE</option>
                <option value="INACTIVE">INACTIVE</option>
              </select>
            </label>

            <label style={{ gridColumn: "1 / -1" }}>
              Replace Photo (optional)
              <input
                className="input"
                type="file"
                accept="image/png,image/jpg,image/jpeg"
                onChange={(e) => setEditPhotoFile(e.target.files && e.target.files[0] ? e.target.files[0] : null)}
              />
            </label>
            {editPhotoPreview ? (
              <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                <div style={{ fontSize: 12, color: "var(--color-text-muted)" }}>Preview</div>
                <img src={editPhotoPreview} alt="preview" style={{ width: 80, height: 80, objectFit: "cover", borderRadius: 8, border: "1px solid var(--color-border)" }} />
              </div>
            ) : null}
          </div>
        </form>
      ) : null}

      <DataTable columns={columns} rows={rows} keyField="id" />

      <PaginationBar
        limit={limit}
        offset={offset}
        count={rows.length}
        onChange={(next) => {
          setLimit(next.limit);
          setOffset(next.offset);
          void load({
            ...next,
            q,
            status: statusFilter,
            teacherUserId: teacherFilter,
            levelId: levelFilter,
            courseCode: courseCodeFilter
          });
        }}
      />

      {csvImportOpen ? (
        <div
          role="dialog"
          aria-modal="true"
          aria-label="Import students from CSV"
          style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,0.4)", display: "flex", alignItems: "center", justifyContent: "center", padding: 16, zIndex: 1000 }}
        >
          <div className="card" style={{ maxWidth: 520, width: "100%" }}>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
              <h3 style={{ margin: 0 }}>Import Students</h3>
              <button className="button secondary" type="button" style={{ width: "auto", fontSize: 11, padding: "2px 8px" }} onClick={() => setCsvImportOpen(false)}>✕</button>
            </div>

            <p style={{ fontSize: 13, color: "var(--color-text-muted)", marginTop: 8 }}>
              Upload a CSV file to create students, active enrollments, and optional teacher assignment together. Max 500 rows per import.
            </p>

            <div style={{ display: "flex", gap: 8, flexWrap: "wrap", marginTop: 8 }}>
              <button className="button secondary" type="button" style={{ width: "auto" }} onClick={handleDownloadImportTemplate}>
                Download Template
              </button>
            </div>

            <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(180px, 1fr))", gap: 10, marginTop: 12 }}>
              <label>
                Default Batch
                <select className="select" value={csvImportBatchId} onChange={(e) => setCsvImportBatchId(e.target.value)} required>
                  <option value="">Select batch</option>
                  {batches.map((batch) => (
                    <option key={batch.id} value={batch.id}>{batch.name}</option>
                  ))}
                </select>
              </label>

              <label>
                Default Level
                <select className="select" value={csvImportLevelId} onChange={(e) => setCsvImportLevelId(e.target.value)}>
                  <option value="">Use CSV value or tenant default</option>
                  {levels.map((level) => (
                    <option key={level.id} value={level.id}>{level.name}</option>
                  ))}
                </select>
              </label>

              <label>
                Default Teacher
                <select className="select" value={csvImportTeacherUserId} onChange={(e) => setCsvImportTeacherUserId(e.target.value)}>
                  <option value="">Optional</option>
                  {teachers.map((teacher) => (
                    <option key={teacher.id} value={teacher.id}>{pickTeacherLabel(teacher)}</option>
                  ))}
                </select>
              </label>

              <label>
                Default Start Date
                <input className="input" type="date" value={csvImportStartDate} onChange={(e) => setCsvImportStartDate(e.target.value)} />
              </label>
            </div>

            <div style={{ marginTop: 10 }}>
              <input
                type="file"
                accept=".csv"
                onChange={(e) => { setCsvFile(e.target.files?.[0] || null); setCsvImportResult(null); setCsvImportError(""); }}
              />
            </div>

            {csvImportError ? <p className="error" style={{ marginTop: 8 }}>{csvImportError}</p> : null}

            <div style={{ marginTop: 10, fontSize: 12, color: "var(--color-text-muted)", lineHeight: 1.5 }}>
              Accepted columns include: <strong>admissionNo, firstName, lastName, gender, dateOfBirth, guardianName, guardianPhone, guardianEmail, email, phonePrimary, phoneSecondary, address, state, district, tehsil, levelName, levelRank, batchName, teacherEmail, startDate, totalFeeAmount, admissionFeeAmount, feeConcessionAmount, isActive</strong>.
            </div>

            {csvImportResult ? (
              <div style={{ marginTop: 10, padding: 10, background: "var(--color-bg-success-light)", borderRadius: 6, fontSize: 13 }}>
                <div><strong>Total rows:</strong> {csvImportResult.totalRows}</div>
                <div style={{ color: "var(--color-text-success)" }}><strong>Created:</strong> {csvImportResult.created}</div>
                {csvImportResult.errorCount > 0 ? (
                  <div style={{ color: "var(--color-text-danger)", marginTop: 4 }}>
                    <strong>Errors:</strong> {csvImportResult.errorCount}
                    <ul style={{ margin: "4px 0 0 16px", padding: 0 }}>
                      {(csvImportResult.errors || []).slice(0, 10).map((e, i) => (
                        <li key={i}>Row {e.row}: {e.error}</li>
                      ))}
                    </ul>
                  </div>
                ) : null}
              </div>
            ) : null}

            <div style={{ display: "flex", gap: 10, justifyContent: "flex-end", marginTop: 12 }}>
              <button className="button secondary" type="button" style={{ width: "auto" }} onClick={() => setCsvImportOpen(false)}>Close</button>
              <button
                className="button"
                type="button"
                style={{ width: "auto" }}
                disabled={!csvFile || csvImporting}
                onClick={() => void handleSubmitCsvImport()}
              >
                {csvImporting ? "Importing…" : "Import"}
              </button>
            </div>
          </div>
        </div>
      ) : null}

      <InputDialog
        open={!!createLoginTarget}
        title="Create Login"
        message="Temporary password (blank uses student code):"
        inputLabel="Password"
        inputPlaceholder="Leave blank for default"
        confirmLabel="Create"
        onConfirm={handleCreateLoginConfirm}
        onCancel={() => setCreateLoginTarget(null)}
      />

      <InputDialog
        open={!!overridePromotionTarget}
        title="Assign Level"
        message="Enter the level rank number (or level id):"
        inputLabel="Level Rank"
        defaultValue={overridePromotionTarget?.level?.rank != null ? String(overridePromotionTarget.level.rank) : "1"}
        confirmLabel="Assign"
        onConfirm={handleOverridePromotionConfirm}
        onCancel={() => setOverridePromotionTarget(null)}
      />

      <ConfirmDialog
        open={!!unenrollConfirmOpen}
        title="Unenroll Student"
        message={`Unenroll this student from ${unenrollConfirmOpen?.batch?.name || "the selected batch"}?`}
        confirmLabel={unenrollSaving ? "Unenrolling..." : "Unenroll"}
        cancelLabel="Cancel"
        onConfirm={handleUnenrollConfirm}
        onCancel={() => {
          if (!unenrollSaving) {
            setUnenrollConfirmOpen(null);
          }
        }}
      />
    </section>
  );
}

export { CenterStudentsPage };
