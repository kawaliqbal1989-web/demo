import { useEffect, useMemo, useRef, useState } from "react";
import toast from "react-hot-toast";
import { listCatalogCourseLevels } from "../../services/catalogService";
import { createEnrollment } from "../../services/enrollmentsService";
import { listStudents, assignStudentCourse } from "../../services/studentsService";
import { getFriendlyErrorMessage } from "../../utils/apiErrors";
import { useDebouncedValue } from "./batches/useDebouncedValue";

const PAGE_SIZE = 100;

function useCenterEnrollmentForm({ batchId, teacherOptions, batches = [], rosterPage, loadEnrollments, onError }) {
  const [students, setStudents] = useState([]);
  const [studentQuery, setStudentQuery] = useState("");
  const [studentsLoading, setStudentsLoading] = useState(false);
  const [studentsError, setStudentsError] = useState("");
  const [studentId, setStudentId] = useState("");
  const [assignedTeacherUserId, setAssignedTeacherUserId] = useState("");
  const [courseId, setCourseId] = useState("");
  const [courseLevelId, setCourseLevelId] = useState("");
  const [courseLevels, setCourseLevels] = useState([]);
  const [courseLevelsLoading, setCourseLevelsLoading] = useState(false);
  const [creating, setCreating] = useState(false);
  const [studentPage, setStudentPage] = useState(0);
  const [studentTotal, setStudentTotal] = useState(0);
  const debouncedStudentQuery = useDebouncedValue(studentQuery.trim(), 350);
  const didInitStudentSearch = useRef(false);

  const selectedBatch = useMemo(
    () => batches.find((b) => b.id === batchId) || null,
    [batches, batchId]
  );

  const teacherDropdownOptions = useMemo(() => {
    const batchTeacherIds = new Set(
      [
        selectedBatch?.primaryTeacherUserId,
        ...(selectedBatch?.teacherAssignments || []).map((a) => a.teacher?.id)
      ].filter(Boolean)
    );
    const batchTeachers = [];
    const otherTeachers = [];
    for (const teacher of teacherOptions) {
      if (batchTeacherIds.has(teacher.id)) {
        batchTeachers.push(teacher);
      } else {
        otherTeachers.push(teacher);
      }
    }
    return [
      { value: "", label: "None" },
      ...batchTeachers.map((t) => ({
        value: t.id,
        label: `\u2605 ${t?.teacherProfile?.fullName || t.username || t.email || "Teacher"}`
      })),
      ...otherTeachers.map((t) => ({
        value: t.id,
        label: t?.teacherProfile?.fullName || t.username || t.email || "Teacher"
      }))
    ];
  }, [teacherOptions, selectedBatch]);

  const availableStudents = useMemo(
    () => students.filter((student) => !Array.isArray(student?.batchEnrollments) || student.batchEnrollments.length === 0),
    [students]
  );

  const studentDropdownOptions = useMemo(
    () => availableStudents.map((student) => ({
      value: student.id,
      label: `${student.admissionNo || ""} - ${student.firstName || ""} ${student.lastName || ""}`.trim()
    })),
    [availableStudents]
  );

  const loadStudentOptions = async (query = "", page = 0) => {
    setStudentsLoading(true);
    setStudentsError("");
    try {
      const response = await listStudents({
        limit: PAGE_SIZE,
        offset: page * PAGE_SIZE,
        q: query,
        status: "ACTIVE",
        notEnrolledOnly: true
      });
      const result = response.data || {};
      setStudents(result.items || result || []);
      setStudentTotal(result.total ?? 0);
      setStudentPage(page);
    } catch (error) {
      setStudentsError(getFriendlyErrorMessage(error) || "Failed to load students.");
    } finally {
      setStudentsLoading(false);
    }
  };

  useEffect(() => {
    if (!didInitStudentSearch.current) {
      didInitStudentSearch.current = true;
      return;
    }

    setStudentId("");
    void loadStudentOptions(debouncedStudentQuery, 0);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [debouncedStudentQuery]);

  useEffect(() => {
    let cancelled = false;

    const loadCourseLevels = async () => {
      if (!courseId) {
        setCourseLevels([]);
        setCourseLevelId("");
        return;
      }

      setCourseLevelsLoading(true);
      try {
        const response = await listCatalogCourseLevels({ courseId, limit: 200, offset: 0, status: "ACTIVE" });
        if (cancelled) return;

        const items = Array.isArray(response?.data?.items) ? response.data.items : [];
        setCourseLevels(items);
        setCourseLevelId((previous) => (items.some((item) => item?.level?.id === previous) ? previous : ""));
      } catch (_error) {
        if (cancelled) return;
        setCourseLevels([]);
        setCourseLevelId("");
        toast.error("Failed to load course levels.");
      } finally {
        if (!cancelled) {
          setCourseLevelsLoading(false);
        }
      }
    };

    void loadCourseLevels();

    return () => {
      cancelled = true;
    };
  }, [courseId]);

  const resetEnrollmentForm = () => {
    setStudentId("");
    setAssignedTeacherUserId("");
    setCourseId("");
    setCourseLevelId("");
  };

  const clearStudentSearch = () => {
    setStudentQuery("");
    setStudentId("");
    void loadStudentOptions("", 0);
  };

  const submitEnrollment = async (event) => {
    event.preventDefault();
    if (!batchId || !studentId) {
      onError?.("batchId and studentId are required");
      return;
    }

    setCreating(true);
    onError?.("");
    try {
      await createEnrollment({
        batchId,
        studentId,
        assignedTeacherUserId: assignedTeacherUserId || undefined,
        levelId: courseLevelId || undefined
      });

      if (courseId) {
        try {
          await assignStudentCourse(studentId, courseId);
        } catch (_courseError) {
          toast.error("Enrolled successfully but failed to assign course.");
        }
      }

      resetEnrollmentForm();
      await loadEnrollments(batchId, rosterPage);
    } catch (error) {
      onError?.(getFriendlyErrorMessage(error) || "Failed to enroll.");
    } finally {
      setCreating(false);
    }
  };

  return {
    PAGE_SIZE,
    students,
    studentQuery,
    setStudentQuery,
    studentsLoading,
    studentsError,
    studentId,
    setStudentId,
    assignedTeacherUserId,
    setAssignedTeacherUserId,
    courseId,
    setCourseId,
    courseLevelId,
    setCourseLevelId,
    courseLevels,
    courseLevelsLoading,
    creating,
    studentPage,
    studentTotal,
    teacherDropdownOptions,
    studentDropdownOptions,
    loadStudentOptions,
    clearStudentSearch,
    resetEnrollmentForm,
    submitEnrollment
  };
}

export { useCenterEnrollmentForm };