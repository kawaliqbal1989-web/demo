import { useEffect, useMemo, useRef, useState } from "react";
import { Link } from "react-router-dom";
import { ConfirmDialog } from "../../components/ConfirmDialog";
import { InputDialog } from "../../components/InputDialog";
import { LoadingState } from "../../components/LoadingState";
import { StatusBadge } from "../../components/StatusBadge";
import {
  createCompetitionTemporaryStudents,
  enrollCompetitionStudent,
  forwardCompetitionEnrollmentList,
  getCompetitionEnrollmentList,
  listCompetitionEnrollmentLists,
  listCompetitions,
  returnCompetitionEnrollmentList,
  updateCompetitionEnrollmentInclusion
} from "../../services/competitionsService";
import { listStudents } from "../../services/studentsService";
import { getFriendlyErrorMessage } from "../../utils/apiErrors";

function responseData(response) {
  return response?.data ?? response ?? null;
}

function responseItems(response) {
  const data = responseData(response);
  if (Array.isArray(data)) return data;
  if (Array.isArray(data?.items)) return data.items;
  if (Array.isArray(response?.items)) return response.items;
  return [];
}

async function listAllCenterStudents() {
  // The students endpoint caps each response at 100 rows. Requesting 200 and
  // stopping when fewer than 200 rows were returned caused loading to end
  // after the first (capped) page.
  const pageSize = 100;
  const allStudents = [];

  for (let offset = 0; ; offset += pageSize) {
    const response = await listStudents({ limit: pageSize, offset });
    const items = responseItems(response);
    allStudents.push(...items);

    if (items.length < pageSize) break;
  }

  return allStudents;
}

async function listAllCompetitions() {
  const pageSize = 100;
  const allCompetitions = [];

  for (let offset = 0; ; offset += pageSize) {
    const response = await listCompetitions({ limit: pageSize, offset });
    const items = responseItems(response);
    allCompetitions.push(...items);

    if (items.length < pageSize) break;
  }

  return allCompetitions;
}

function formatDateTime(value) {
  if (!value) return "—";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "—";
  return date.toLocaleString();
}

function competitionLabel(competition) {
  const title = competition?.title || "Competition";
  const startsAt = competition?.startsAt
    ? new Date(competition.startsAt).toLocaleDateString()
    : "";
  return startsAt ? `${title} · ${startsAt}` : title;
}

function studentName(student) {
  return (
    [student?.firstName, student?.lastName]
      .filter(Boolean)
      .join(" ")
      .trim() || "Unnamed student"
  );
}

function studentAcademicDetails(student) {
  const activeEnrollment = Array.isArray(student?.batchEnrollments)
    ? student.batchEnrollments[0]
    : null;
  const teacher = activeEnrollment?.assignedTeacher || student?.currentTeacher;

  return {
    teacher:
      teacher?.teacherProfile?.fullName ||
      teacher?.username ||
      teacher?.email ||
      "No teacher",
    batch: activeEnrollment?.batch?.name || "No batch",
    level:
      activeEnrollment?.level?.name || student?.level?.name || "No level",
    course: student?.course?.name || student?.course?.code || "No course"
  };
}

function studentOptionLabel(student) {
  const details = studentAcademicDetails(student);
  return `${student?.admissionNo || "No ID"} · ${studentName(student)} · ${details.teacher} · ${details.batch} · ${details.level} · ${details.course}`;
}

function competitionLevels(competition) {
  const levels = [];

  for (const course of competition?.competitionCourses || []) {
    for (const levelMapping of course?.levels || []) {
      levels.push({
        id: levelMapping.id,
        course: course?.name || course?.code || "Course",
        level:
          levelMapping?.level?.name ||
          (levelMapping?.levelNumber
            ? `Level ${levelMapping.levelNumber}`
            : "Level"),
        sortOrder:
          Number(levelMapping?.sortOrder ?? levelMapping?.levelNumber ?? 0)
      });
    }
  }

  return levels.sort(
    (left, right) =>
      left.sortOrder - right.sortOrder ||
      `${left.course} ${left.level}`.localeCompare(
        `${right.course} ${right.level}`
      )
  );
}

function participationLabel(item) {
  const mapping = item?.enrollment?.competitionCourseLevel;
  const course = mapping?.courseLevel?.course;
  const courseLevel = mapping?.courseLevel;
  const level = mapping?.level;

  return {
    course: course?.name || course?.code || "Course",
    level:
      courseLevel?.title ||
      level?.name ||
      (courseLevel?.levelNumber
        ? `Level ${courseLevel.levelNumber}`
        : "Level")
  };
}

function levelSummaryKey(item) {
  const mapping = item?.enrollment?.competitionCourseLevel;
  return mapping?.id || item?.enrollment?.enrolledLevelId || "unmapped";
}

function isReturnedToCenter(list) {
  return (
    list?.type === "CENTER_COMBINED" &&
    list?.status === "REJECTED" &&
    list?.rejectedBy?.role === "FRANCHISE"
  );
}

function isEnrollmentWindowOpen(competition) {
  if (!competition) return false;
  if (!["DRAFT", "SCHEDULED", "ACTIVE"].includes(competition.status)) {
    return false;
  }

  const now = Date.now();
  const startsAt = competition.enrollmentStartAt
    ? new Date(competition.enrollmentStartAt).getTime()
    : null;
  const endsAt = competition.enrollmentEndAt
    ? new Date(competition.enrollmentEndAt).getTime()
    : null;

  if (startsAt && Number.isFinite(startsAt) && now < startsAt) return false;
  if (endsAt && Number.isFinite(endsAt) && now > endsAt) return false;
  return true;
}

function emptyTemporaryStudent() {
  return {
    firstName: "",
    lastName: "",
    dateOfBirth: "",
    guardianName: "",
    guardianPhone: ""
  };
}

function CenterCompetitionEnrollmentPage() {
  const [competitions, setCompetitions] = useState([]);
  const [competitionId, setCompetitionId] = useState("");
  const [students, setStudents] = useState([]);
  const [studentSearch, setStudentSearch] = useState("");
  const [studentTeacherFilter, setStudentTeacherFilter] = useState("");
  const [studentBatchFilter, setStudentBatchFilter] = useState("");
  const [studentLevelFilter, setStudentLevelFilter] = useState("");
  const [studentCourseFilter, setStudentCourseFilter] = useState("");
  const [studentPage, setStudentPage] = useState(1);
  const [studentPageSize, setStudentPageSize] = useState(25);
  const [studentId, setStudentId] = useState("");
  const [selectedLevelIds, setSelectedLevelIds] = useState([]);

  const [lists, setLists] = useState([]);
  const [selectedListId, setSelectedListId] = useState("");
  const [selectedList, setSelectedList] = useState(null);

  const [loading, setLoading] = useState(true);
  const [listsLoading, setListsLoading] = useState(false);
  const [detailLoading, setDetailLoading] = useState(false);
  const [acting, setActing] = useState(false);
  const [error, setError] = useState("");
  const [detailError, setDetailError] = useState("");
  const [success, setSuccess] = useState("");

  const [showTemporaryForm, setShowTemporaryForm] = useState(false);
  const [temporaryStudent, setTemporaryStudent] = useState(
    emptyTemporaryStudent
  );
  const [temporaryLevelIds, setTemporaryLevelIds] = useState([]);
  const [createdCredentials, setCreatedCredentials] = useState([]);

  const [forwardOpen, setForwardOpen] = useState(false);
  const [returnTeacherOpen, setReturnTeacherOpen] = useState(false);
  const [excludeTarget, setExcludeTarget] = useState(null);

  // Ignore stale async responses when Competition/list selection changes
  // while an earlier request is still in flight.
  const baseDataRequestIdRef = useRef(0);
  const listsRequestIdRef = useRef(0);
  const detailRequestIdRef = useRef(0);

  const selectedCompetition = useMemo(
    () =>
      competitions.find((competition) => competition.id === competitionId) ||
      null,
    [competitionId, competitions]
  );

  const configuredLevels = useMemo(
    () => competitionLevels(selectedCompetition),
    [selectedCompetition]
  );

  const availableLevels = useMemo(
    () => configuredLevels,
    [configuredLevels]
  );

  const combinedList = useMemo(
    () => {
      const combinedLists = lists.filter(
        (list) => list?.type === "CENTER_COMBINED"
      );
      return (
        [...combinedLists].reverse().find(
          (list) => list?.status === "DRAFT" || isReturnedToCenter(list)
        ) ||
        combinedLists[combinedLists.length - 1] ||
        null
      );
    },
    [lists]
  );

  const submittedStudentLevelKeys = useMemo(
    () =>
      new Set(
        lists
          .filter((list) => list?.status !== "REJECTED")
          .flatMap((list) =>
            Array.isArray(list?.participantStudentLevelKeys)
              ? list.participantStudentLevelKeys
              : []
          )
      ),
    [lists]
  );

  const selectableLevels = useMemo(
    () =>
      studentId
        ? availableLevels.filter(
            (level) =>
              !submittedStudentLevelKeys.has(`${studentId}:${level.id}`)
          )
        : availableLevels,
    [availableLevels, studentId, submittedStudentLevelKeys]
  );

  const addableStudents = students;

  const teacherLists = useMemo(
    () =>
      lists
        .filter((list) => list?.type === "TEACHER")
        .sort((left, right) =>
          String(
            left?.teacherUser?.teacherProfile?.fullName ||
              left?.teacherUser?.email ||
              ""
          ).localeCompare(
            String(
              right?.teacherUser?.teacherProfile?.fullName ||
                right?.teacherUser?.email ||
                ""
            )
          )
        ),
    [lists]
  );

  const studentFilterOptions = useMemo(() => {
    const values = {
      teachers: new Set(),
      batches: new Set(),
      levels: new Set(),
      courses: new Set()
    };

    for (const student of addableStudents) {
      const details = studentAcademicDetails(student);
      values.teachers.add(details.teacher);
      values.batches.add(details.batch);
      values.levels.add(details.level);
      values.courses.add(details.course);
    }

    const sorted = (items) =>
      [...items].filter(Boolean).sort((left, right) => left.localeCompare(right));

    return {
      teachers: sorted(values.teachers),
      batches: sorted(values.batches),
      levels: sorted(values.levels),
      courses: sorted(values.courses)
    };
  }, [addableStudents]);

  const filteredStudents = useMemo(() => {
    const query = studentSearch.trim().toLowerCase();
    return addableStudents.filter((student) => {
      const details = studentAcademicDetails(student);
      const matchesSearch =
        !query ||
        [
        student?.admissionNo,
        student?.firstName,
        student?.lastName,
        studentName(student),
          details.teacher,
          details.batch,
          details.level,
          details.course
      ]
        .filter(Boolean)
          .some((value) => String(value).toLowerCase().includes(query));

      return (
        matchesSearch &&
        (!studentTeacherFilter || details.teacher === studentTeacherFilter) &&
        (!studentBatchFilter || details.batch === studentBatchFilter) &&
        (!studentLevelFilter || details.level === studentLevelFilter) &&
        (!studentCourseFilter || details.course === studentCourseFilter)
      );
    });
  }, [
    studentBatchFilter,
    studentCourseFilter,
    studentLevelFilter,
    studentSearch,
    studentTeacherFilter,
    addableStudents
  ]);

  const studentPageCount = Math.max(
    1,
    Math.ceil(filteredStudents.length / studentPageSize)
  );

  const pagedStudents = useMemo(() => {
    const start = (studentPage - 1) * studentPageSize;
    return filteredStudents.slice(start, start + studentPageSize);
  }, [filteredStudents, studentPage, studentPageSize]);

  const visibleStudentOptions = useMemo(() => {
    const selectedStudent = addableStudents.find(
      (student) => student.id === studentId
    );
    if (
      !selectedStudent ||
      pagedStudents.some((student) => student.id === selectedStudent.id)
    ) {
      return pagedStudents;
    }
    return [selectedStudent, ...pagedStudents];
  }, [addableStudents, pagedStudents, studentId]);

  const selectedItems = Array.isArray(selectedList?.items)
    ? selectedList.items
    : [];

  const includedItems = useMemo(
    () => selectedItems.filter((item) => item?.included),
    [selectedItems]
  );

  const temporaryCount = useMemo(
    () =>
      includedItems.filter((item) => item?.enrollment?.isTemporary).length,
    [includedItems]
  );

  const levelSummaries = useMemo(() => {
    const summaries = new Map();

    for (const item of selectedItems) {
      const key = levelSummaryKey(item);
      const label = participationLabel(item);
      const current = summaries.get(key) || {
        key,
        course: label.course,
        level: label.level,
        total: 0,
        included: 0
      };
      current.total += 1;
      if (item?.included) current.included += 1;
      summaries.set(key, current);
    }

    return [...summaries.values()].sort((left, right) =>
      `${left.course} ${left.level}`.localeCompare(
        `${right.course} ${right.level}`
      )
    );
  }, [selectedItems]);

  const combinedEditable =
    combinedList?.status === "DRAFT" || isReturnedToCenter(combinedList);

  const enrollmentOpen = isEnrollmentWindowOpen(selectedCompetition);
  const canEnroll = Boolean(
    competitionId && combinedEditable && enrollmentOpen
  );

  const selectedListIsCombined = selectedList?.type === "CENTER_COMBINED";
  const canEditSelectedCombined =
    selectedListIsCombined &&
    (selectedList?.status === "DRAFT" || isReturnedToCenter(selectedList));
  const canReturnSelectedTeacher =
    selectedList?.type === "TEACHER" &&
    selectedList?.status === "SUBMITTED_TO_CENTER";

  const loadBaseData = async () => {
    const requestId = ++baseDataRequestIdRef.current;

    setLoading(true);
    setError("");
    try {
      const [competitionResponse, studentItems] = await Promise.all([
        listAllCompetitions(),
        listAllCenterStudents()
      ]);
      if (requestId !== baseDataRequestIdRef.current) return null;

      const competitionItems = responseItems(competitionResponse);

      setCompetitions(competitionItems);
      setStudents(studentItems);
      setCompetitionId((currentId) =>
        currentId &&
        competitionItems.some((competition) => competition.id === currentId)
          ? currentId
          : competitionItems[0]?.id || ""
      );

      return {
        competitions: competitionItems,
        students: studentItems
      };
    } catch (err) {
      if (requestId !== baseDataRequestIdRef.current) return null;

      setCompetitions([]);
      setStudents([]);
      setCompetitionId("");
      setError(
        getFriendlyErrorMessage(err) ||
          "Failed to load Center Competition enrollment data."
      );
      return null;
    } finally {
      if (requestId === baseDataRequestIdRef.current) {
        setLoading(false);
      }
    }
  };

  const chooseSelectedListId = (
    listItems,
    { preferCombined = false, preferredListId = "" } = {}
  ) => {
    if (
      !preferCombined &&
      preferredListId &&
      listItems.some((list) => list.id === preferredListId)
    ) {
      return preferredListId;
    }

    const combinedLists = listItems.filter(
      (list) => list.type === "CENTER_COMBINED"
    );
    return (
      [...combinedLists].reverse().find(
        (list) => list.status === "DRAFT" || isReturnedToCenter(list)
      )?.id ||
      combinedLists[combinedLists.length - 1]?.id ||
      listItems[0]?.id ||
      ""
    );
  };

  const loadLists = async ({
    targetCompetitionId = competitionId,
    preferCombined = false,
    preferredListId = selectedListId
  } = {}) => {
    const requestId = ++listsRequestIdRef.current;

    if (!targetCompetitionId) {
      setLists([]);
      setSelectedListId("");
      setSelectedList(null);
      setListsLoading(false);
      return { items: [], selectedListId: "" };
    }

    setListsLoading(true);
    setError("");
    try {
      const response = await listCompetitionEnrollmentLists(
        targetCompetitionId
      );
      if (requestId !== listsRequestIdRef.current) return null;

      const listItems = responseItems(response);
      const nextSelectedListId = chooseSelectedListId(listItems, {
        preferCombined,
        preferredListId
      });

      setLists(listItems);
      setSelectedListId(nextSelectedListId);

      return {
        items: listItems,
        selectedListId: nextSelectedListId
      };
    } catch (err) {
      if (requestId !== listsRequestIdRef.current) return null;

      setLists([]);
      setSelectedListId("");
      setSelectedList(null);
      setError(
        getFriendlyErrorMessage(err) ||
          "Failed to load Center enrollment lists."
      );

      return { items: [], selectedListId: "" };
    } finally {
      if (requestId === listsRequestIdRef.current) {
        setListsLoading(false);
      }
    }
  };

  const loadSelectedList = async (
    targetListId,
    targetCompetitionId = competitionId
  ) => {
    const requestId = ++detailRequestIdRef.current;

    if (!targetCompetitionId || !targetListId) {
      setSelectedList(null);
      setDetailLoading(false);
      return null;
    }

    setDetailLoading(true);
    setDetailError("");
    try {
      const response = await getCompetitionEnrollmentList(
        targetCompetitionId,
        targetListId
      );
      if (requestId !== detailRequestIdRef.current) return null;

      const detail = responseData(response);
      setSelectedList(detail);
      return detail;
    } catch (err) {
      if (requestId !== detailRequestIdRef.current) return null;

      setSelectedList(null);
      setDetailError(
        getFriendlyErrorMessage(err) ||
          "Failed to load this enrollment list."
      );
      return null;
    } finally {
      if (requestId === detailRequestIdRef.current) {
        setDetailLoading(false);
      }
    }
  };

  useEffect(() => {
    void loadBaseData();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    setStudentPage(1);
  }, [
    studentBatchFilter,
    studentCourseFilter,
    studentLevelFilter,
    studentPageSize,
    studentSearch,
    studentTeacherFilter
  ]);

  useEffect(() => {
    if (studentPage > studentPageCount) setStudentPage(studentPageCount);
  }, [studentPage, studentPageCount]);

  useEffect(() => {
    listsRequestIdRef.current += 1;
    detailRequestIdRef.current += 1;

    setStudentId("");
    setStudentSearch("");
    setStudentTeacherFilter("");
    setStudentBatchFilter("");
    setStudentLevelFilter("");
    setStudentCourseFilter("");
    setStudentPage(1);
    setSelectedLevelIds([]);
    setTemporaryLevelIds([]);
    setCreatedCredentials([]);
    setSuccess("");
    setDetailError("");
    setSelectedList(null);
    void loadLists({
      targetCompetitionId: competitionId,
      preferCombined: true,
      preferredListId: ""
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [competitionId]);

  useEffect(() => {
    void loadSelectedList(selectedListId);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedListId]);

  const refreshWorkspace = async ({ preferCombined = false } = {}) => {
    const targetCompetitionId = competitionId;
    const preferredListId = selectedListId;

    const result = await loadLists({
      targetCompetitionId,
      preferCombined,
      preferredListId
    });

    if (!result || targetCompetitionId !== competitionId) return;

    if (result.selectedListId) {
      await loadSelectedList(result.selectedListId, targetCompetitionId);
    } else {
      detailRequestIdRef.current += 1;
      setSelectedList(null);
      setDetailLoading(false);
    }
  };

  const toggleLevel = (id, temporary = false) => {
    const setter = temporary
      ? setTemporaryLevelIds
      : setSelectedLevelIds;
    setter((current) =>
      current.includes(id)
        ? current.filter((levelId) => levelId !== id)
        : [...current, id]
    );
  };

  const enrollRegularStudent = async (event) => {
    event.preventDefault();
    if (!studentId) {
      setError("Select a student.");
      return;
    }
    if (!selectedLevelIds.length) {
      setError("Select at least one Competition level.");
      return;
    }
    if (!canEnroll || acting) return;

    setActing(true);
    setError("");
    setSuccess("");
    try {
      const response = await enrollCompetitionStudent({
        competitionId,
        studentId,
        competitionCourseLevelIds: selectedLevelIds
      });
      const result = responseData(response);
      const count = result?.participationCount ?? selectedLevelIds.length;
      setSuccess(
        `${count} student-level participation ID${
          count === 1 ? "" : "s"
        } added to the Center list.`
      );
      setStudentId("");
      setSelectedLevelIds([]);
      await refreshWorkspace({ preferCombined: true });
    } catch (err) {
      setError(
        getFriendlyErrorMessage(err) || "Failed to enroll this student."
      );
    } finally {
      setActing(false);
    }
  };

  const createTemporaryStudent = async (event) => {
    event.preventDefault();
    const firstName = temporaryStudent.firstName.trim();

    if (!firstName) {
      setError("Competition-only Student first name is required.");
      return;
    }
    if (!temporaryLevelIds.length) {
      setError("Select at least one Competition level.");
      return;
    }
    if (!canEnroll || acting) return;

    const payload = {
      firstName,
      lastName: temporaryStudent.lastName.trim(),
      dateOfBirth: temporaryStudent.dateOfBirth || null,
      guardianName: temporaryStudent.guardianName.trim() || null,
      guardianPhone: temporaryStudent.guardianPhone.trim() || null,
      competitionCourseLevelIds: temporaryLevelIds
    };

    setActing(true);
    setError("");
    setSuccess("");
    try {
      const response = await createCompetitionTemporaryStudents({
        competitionId,
        students: [payload]
      });
      const result = responseData(response);
      const credentials = (result?.students || []).map((entry) => ({
        username:
          entry?.login?.username || entry?.student?.admissionNo || "—",
        password: entry?.tempPassword || "—",
        name: studentName(entry?.student)
      }));
      setCreatedCredentials(credentials);
      setSuccess(
        `${result?.createdCount ?? 1} Competition-only Student created with ${
          result?.participationCount ?? temporaryLevelIds.length
        } participation ID${
          (result?.participationCount ?? temporaryLevelIds.length) === 1
            ? ""
            : "s"
        }.`
      );
      setTemporaryStudent(emptyTemporaryStudent());
      setTemporaryLevelIds([]);
      setShowTemporaryForm(false);
      await Promise.all([
        refreshWorkspace({ preferCombined: true }),
        loadBaseData()
      ]);
    } catch (err) {
      setError(
        getFriendlyErrorMessage(err) ||
          "Failed to create the Competition-only Student."
      );
    } finally {
      setActing(false);
    }
  };

  const includeParticipation = async (item) => {
    const enrollmentId = item?.enrollment?.id;
    if (!competitionId || !selectedListId || !enrollmentId || acting) return;

    setActing(true);
    setDetailError("");
    setSuccess("");
    try {
      await updateCompetitionEnrollmentInclusion({
        competitionId,
        listId: selectedListId,
        enrollmentId,
        included: true,
        reason: null
      });
      setSuccess("Student-level participation included.");
      await refreshWorkspace();
    } catch (err) {
      setDetailError(
        getFriendlyErrorMessage(err) ||
          "Failed to include this participation."
      );
    } finally {
      setActing(false);
    }
  };

  const excludeParticipation = async (reason) => {
    const normalizedReason = String(reason || "").trim();
    const enrollmentId = excludeTarget?.enrollment?.id;

    if (!normalizedReason) {
      setDetailError("Unselection reason is required.");
      return;
    }
    if (!competitionId || !selectedListId || !enrollmentId || acting) return;

    setExcludeTarget(null);
    setActing(true);
    setDetailError("");
    setSuccess("");
    try {
      await updateCompetitionEnrollmentInclusion({
        competitionId,
        listId: selectedListId,
        enrollmentId,
        included: false,
        reason: normalizedReason
      });
      setSuccess("Student-level participation unselected.");
      await refreshWorkspace();
    } catch (err) {
      setDetailError(
        getFriendlyErrorMessage(err) ||
          "Failed to unselect this participation."
      );
    } finally {
      setActing(false);
    }
  };

  const returnTeacherList = async (reason) => {
    const normalizedReason = String(reason || "").trim();
    if (!normalizedReason) {
      setDetailError("Return reason is required.");
      return;
    }
    if (!competitionId || !selectedListId || acting) return;

    setReturnTeacherOpen(false);
    setActing(true);
    setDetailError("");
    setSuccess("");
    try {
      await returnCompetitionEnrollmentList(
        competitionId,
        selectedListId,
        normalizedReason
      );
      setSuccess("Teacher enrollment list returned for correction.");
      await refreshWorkspace({ preferCombined: true });
    } catch (err) {
      setDetailError(
        getFriendlyErrorMessage(err) ||
          "Failed to return the Teacher enrollment list."
      );
    } finally {
      setActing(false);
    }
  };

  const forwardCombinedList = async () => {
    if (!competitionId || !combinedList?.id || acting) return;

    setForwardOpen(false);
    setActing(true);
    setDetailError("");
    setSuccess("");
    try {
      const response = await forwardCompetitionEnrollmentList(
        competitionId,
        combinedList.id
      );
      const result = responseData(response);
      const count = result?.includedCount ?? includedItems.length;
      setSuccess(
        `${count} student-level participation ID${
          count === 1 ? "" : "s"
        } forwarded to the Franchise.`
      );
      await refreshWorkspace({ preferCombined: true });
    } catch (err) {
      setDetailError(
        getFriendlyErrorMessage(err) ||
          "Failed to forward the Center enrollment list."
      );
    } finally {
      setActing(false);
    }
  };

  if (loading && !competitions.length) {
    return <LoadingState label="Loading Competition enrollment workspace..." />;
  }

  return (
    <section style={{ display: "grid", gap: 14 }}>
      <div
        className="card"
        style={{
          display: "flex",
          justifyContent: "space-between",
          alignItems: "flex-start",
          gap: 12,
          flexWrap: "wrap"
        }}
      >
        <div>
          <h2 style={{ margin: 0 }}>Competition Enrollment</h2>
          <div style={{ fontSize: 12, color: "var(--color-text-muted)" }}>
            Build the Center’s combined multi-level participation list
          </div>
        </div>
        <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
          <select
            className="select"
            value={competitionId}
            onChange={(event) => setCompetitionId(event.target.value)}
            style={{ minWidth: 280 }}
            aria-label="Competition"
          >
            <option value="">Select Competition</option>
            {competitions.map((competition) => (
              <option key={competition.id} value={competition.id}>
                {competitionLabel(competition)}
              </option>
            ))}
          </select>
          <button
            className="button secondary"
            type="button"
            style={{ width: "auto" }}
            disabled={loading || listsLoading}
            onClick={() => {
              void (async () => {
                await loadBaseData();
                await refreshWorkspace({ preferCombined: true });
              })();
            }}
          >
            Refresh
          </button>
          {competitionId && selectedCompetition?.resultStatus === "PUBLISHED" ? (
            <Link
              className="button secondary"
              to={`/center/competition/${competitionId}/results`}
              style={{ width: "auto" }}
            >
              View Results
            </Link>
          ) : competitionId ? (
            <button
              className="button secondary"
              type="button"
              disabled
              style={{ width: "auto" }}
            >
              Results Not Published
            </button>
          ) : null}
        </div>
      </div>

      {error ? (
        <div className="card">
          <p className="error" style={{ margin: 0 }}>
            {error}
          </p>
        </div>
      ) : null}

      {success ? (
        <div className="card">
          <p
            style={{
              margin: 0,
              color: "var(--color-text-success)",
              fontWeight: 700
            }}
          >
            {success}
          </p>
        </div>
      ) : null}

      {!loading && !competitions.length ? (
        <div className="card">
          <p style={{ margin: 0, color: "var(--color-text-muted)" }}>
            No Competition is available for this Center.
          </p>
        </div>
      ) : null}

      {competitionId ? (
        <>
          <div
            style={{
              display: "grid",
              gridTemplateColumns: "repeat(auto-fit, minmax(170px, 1fr))",
              gap: 10
            }}
          >
            <div className="card">
              <div style={{ fontSize: 12, color: "var(--color-text-muted)" }}>
                Combined list status
              </div>
              <div style={{ marginTop: 6 }}>
                <StatusBadge status={combinedList?.status || "DRAFT"} />
              </div>
            </div>
            <div className="card">
              <div style={{ fontSize: 12, color: "var(--color-text-muted)" }}>
                Included Participation IDs
              </div>
              <div style={{ fontSize: 24, fontWeight: 800 }}>
                {combinedList?.itemCounts?.included || 0}
              </div>
              <div style={{ fontSize: 12, color: "var(--color-text-muted)" }}>
                Unselected: {combinedList?.itemCounts?.excluded || 0}
              </div>
            </div>
            <div className="card">
              <div style={{ fontSize: 12, color: "var(--color-text-muted)" }}>
                Teacher lists awaiting review
              </div>
              <div style={{ fontSize: 24, fontWeight: 800 }}>
                {
                  teacherLists.filter(
                    (list) => list.status === "SUBMITTED_TO_CENTER"
                  ).length
                }
              </div>
            </div>
            <div className="card">
              <div style={{ fontSize: 12, color: "var(--color-text-muted)" }}>
                Enrollment window
              </div>
              <div
                style={{
                  fontSize: 16,
                  fontWeight: 800,
                  color: enrollmentOpen
                    ? "var(--color-text-success)"
                    : "var(--color-text-muted)"
                }}
              >
                {enrollmentOpen ? "Open" : "Closed / not open"}
              </div>
              <div style={{ fontSize: 12, color: "var(--color-text-muted)" }}>
                Until {formatDateTime(selectedCompetition?.enrollmentEndAt)}
              </div>
            </div>
          </div>

          {isReturnedToCenter(combinedList) ? (
            <div className="card">
              <b>Returned by Franchise:</b>{" "}
              {combinedList?.rejectedRemark || "Correction required."}
            </div>
          ) : null}

          <div
            style={{
              display: "grid",
              gridTemplateColumns: "repeat(auto-fit, minmax(320px, 1fr))",
              gap: 12
            }}
          >
            <form
              className="card"
              onSubmit={enrollRegularStudent}
              style={{ display: "grid", gap: 10 }}
            >
              <div>
                <h3 style={{ margin: 0 }}>Add Regular Student</h3>
                <div
                  style={{ fontSize: 12, color: "var(--color-text-muted)" }}
                >
                  One selected level creates one participation ID
                </div>
              </div>

              <label>
                Search student
                <input
                  className="input"
                  value={studentSearch}
                  onChange={(event) => setStudentSearch(event.target.value)}
                  placeholder="Student ID, name, teacher, batch, level or course"
                  autoComplete="off"
                  name="competition-student-search"
                  disabled={!canEnroll || acting}
                />
              </label>

              <div
                style={{
                  display: "grid",
                  gridTemplateColumns: "repeat(auto-fit, minmax(145px, 1fr))",
                  gap: 8
                }}
              >
                <label>
                  Teacher
                  <select
                    className="select"
                    value={studentTeacherFilter}
                    onChange={(event) =>
                      setStudentTeacherFilter(event.target.value)
                    }
                    disabled={!canEnroll || acting}
                  >
                    <option value="">All teachers</option>
                    {studentFilterOptions.teachers.map((teacher) => (
                      <option key={teacher} value={teacher}>{teacher}</option>
                    ))}
                  </select>
                </label>
                <label>
                  Batch
                  <select
                    className="select"
                    value={studentBatchFilter}
                    onChange={(event) =>
                      setStudentBatchFilter(event.target.value)
                    }
                    disabled={!canEnroll || acting}
                  >
                    <option value="">All batches</option>
                    {studentFilterOptions.batches.map((batch) => (
                      <option key={batch} value={batch}>{batch}</option>
                    ))}
                  </select>
                </label>
                <label>
                  Current level
                  <select
                    className="select"
                    value={studentLevelFilter}
                    onChange={(event) =>
                      setStudentLevelFilter(event.target.value)
                    }
                    disabled={!canEnroll || acting}
                  >
                    <option value="">All levels</option>
                    {studentFilterOptions.levels.map((level) => (
                      <option key={level} value={level}>{level}</option>
                    ))}
                  </select>
                </label>
                <label>
                  Course
                  <select
                    className="select"
                    value={studentCourseFilter}
                    onChange={(event) =>
                      setStudentCourseFilter(event.target.value)
                    }
                    disabled={!canEnroll || acting}
                  >
                    <option value="">All courses</option>
                    {studentFilterOptions.courses.map((course) => (
                      <option key={course} value={course}>{course}</option>
                    ))}
                  </select>
                </label>
              </div>

              <label>
                Student ({filteredStudents.length} found)
                <select
                  className="select"
                  value={studentId}
                  onChange={(event) => setStudentId(event.target.value)}
                  disabled={!canEnroll || acting}
                >
                  <option value="">Select student</option>
                  {visibleStudentOptions.map((student) => (
                    <option key={student.id} value={student.id}>
                      {studentOptionLabel(student)}
                    </option>
                  ))}
                </select>
              </label>

              <div
                style={{
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "space-between",
                  flexWrap: "wrap",
                  gap: 8
                }}
              >
                <span style={{ fontSize: 12, color: "var(--color-text-muted)" }}>
                  Page {studentPage} of {studentPageCount} · showing{" "}
                  {pagedStudents.length} students
                </span>
                <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
                  <select
                    className="select"
                    value={studentPageSize}
                    onChange={(event) =>
                      setStudentPageSize(Number(event.target.value))
                    }
                    aria-label="Students per page"
                    style={{ width: "auto" }}
                  >
                    <option value={25}>25 / page</option>
                    <option value={50}>50 / page</option>
                    <option value={100}>100 / page</option>
                  </select>
                  <button
                    className="btn secondary"
                    type="button"
                    onClick={() => setStudentPage((page) => Math.max(1, page - 1))}
                    disabled={studentPage <= 1}
                  >
                    Previous
                  </button>
                  <button
                    className="btn secondary"
                    type="button"
                    onClick={() =>
                      setStudentPage((page) => Math.min(studentPageCount, page + 1))
                    }
                    disabled={studentPage >= studentPageCount}
                  >
                    Next
                  </button>
                </div>
              </div>

              <div style={{ display: "grid", gap: 6 }}>
                <b>Competition levels</b>
                <span
                  style={{ fontSize: 12, color: "var(--color-text-muted)" }}
                >
                  Select one or more levels for the same student. Each selected
                  level creates a separate participation ID.
                </span>
                {availableLevels.map((level) => {
                  const alreadySubmitted = Boolean(
                    studentId &&
                    submittedStudentLevelKeys.has(`${studentId}:${level.id}`)
                  );
                  return (
                  <label
                    key={level.id}
                    style={{
                      display: "flex",
                      alignItems: "center",
                      gap: 8,
                      padding: 8,
                      border: "1px solid var(--color-border)",
                      borderRadius: 8
                    }}
                  >
                    <input
                      type="checkbox"
                      checked={
                        alreadySubmitted || selectedLevelIds.includes(level.id)
                      }
                      onChange={() => toggleLevel(level.id)}
                      disabled={!canEnroll || acting || alreadySubmitted}
                    />
                    <span>
                      <b>{level.course}</b> · {level.level}
                      {alreadySubmitted ? " · Already submitted" : ""}
                    </span>
                  </label>
                  );
                })}
                {studentId &&
                availableLevels.length > 0 &&
                selectableLevels.length === 0 ? (
                  <span style={{ fontSize: 12, color: "var(--color-text-muted)" }}>
                    This student is already submitted for every Competition level.
                  </span>
                ) : null}
                {!configuredLevels.length ? (
                  <span style={{ fontSize: 12, color: "var(--color-text-muted)" }}>
                    No Competition Courses and Levels are configured by Superadmin.
                  </span>
                ) : null}
              </div>

              <button
                className="button"
                type="submit"
                style={{ width: "auto" }}
                disabled={!canEnroll || acting || !selectedLevelIds.length}
              >
                {acting ? "Saving..." : "Add Participation IDs"}
              </button>

              {!canEnroll ? (
                <div style={{ fontSize: 12, color: "var(--color-text-muted)" }}>
                  Enrollment is read-only because the window is closed or the
                  Center list has moved to a later workflow stage.
                </div>
              ) : null}
            </form>

            <div className="card" style={{ display: "grid", gap: 10 }}>
              <div
                style={{
                  display: "flex",
                  justifyContent: "space-between",
                  gap: 8,
                  alignItems: "flex-start",
                  flexWrap: "wrap"
                }}
              >
                <div>
                  <h3 style={{ margin: 0 }}>Competition-only Student</h3>
                  <div
                    style={{ fontSize: 12, color: "var(--color-text-muted)" }}
                  >
                    Creates a reusable Competition-only Student login under
                    this Center
                  </div>
                </div>
                <button
                  className="button secondary"
                  type="button"
                  style={{ width: "auto" }}
                  disabled={!canEnroll || acting}
                  onClick={() => setShowTemporaryForm((current) => !current)}
                >
                  {showTemporaryForm
                    ? "Close"
                    : "Add Competition-only Student"}
                </button>
              </div>

              {showTemporaryForm ? (
                <form
                  onSubmit={createTemporaryStudent}
                  style={{ display: "grid", gap: 8 }}
                >
                  <div
                    style={{
                      display: "grid",
                      gridTemplateColumns:
                        "repeat(auto-fit, minmax(180px, 1fr))",
                      gap: 8
                    }}
                  >
                    <label>
                      First name
                      <input
                        className="input"
                        value={temporaryStudent.firstName}
                        onChange={(event) =>
                          setTemporaryStudent((current) => ({
                            ...current,
                            firstName: event.target.value
                          }))
                        }
                        required
                      />
                    </label>
                    <label>
                      Last name
                      <input
                        className="input"
                        value={temporaryStudent.lastName}
                        onChange={(event) =>
                          setTemporaryStudent((current) => ({
                            ...current,
                            lastName: event.target.value
                          }))
                        }
                      />
                    </label>
                    <label>
                      Date of birth
                      <input
                        className="input"
                        type="date"
                        value={temporaryStudent.dateOfBirth}
                        onChange={(event) =>
                          setTemporaryStudent((current) => ({
                            ...current,
                            dateOfBirth: event.target.value
                          }))
                        }
                      />
                    </label>
                    <label>
                      Guardian name
                      <input
                        className="input"
                        value={temporaryStudent.guardianName}
                        onChange={(event) =>
                          setTemporaryStudent((current) => ({
                            ...current,
                            guardianName: event.target.value
                          }))
                        }
                      />
                    </label>
                    <label>
                      Guardian phone
                      <input
                        className="input"
                        value={temporaryStudent.guardianPhone}
                        onChange={(event) =>
                          setTemporaryStudent((current) => ({
                            ...current,
                            guardianPhone: event.target.value
                          }))
                        }
                      />
                    </label>
                  </div>

                  <div style={{ display: "grid", gap: 6 }}>
                    <b>Competition levels</b>
                    {availableLevels.map((level) => (
                      <label
                        key={level.id}
                        style={{
                          display: "flex",
                          alignItems: "center",
                          gap: 8,
                          padding: 8,
                          border: "1px solid var(--color-border)",
                          borderRadius: 8
                        }}
                      >
                        <input
                          type="checkbox"
                          checked={temporaryLevelIds.includes(level.id)}
                          onChange={() => toggleLevel(level.id, true)}
                        />
                        <span>
                          <b>{level.course}</b> · {level.level}
                        </span>
                      </label>
                    ))}
                  </div>

                  <button
                    className="button"
                    type="submit"
                    style={{ width: "auto" }}
                    disabled={!canEnroll || acting}
                  >
                    {acting
                      ? "Creating..."
                      : "Create Competition-only Student"}
                  </button>
                </form>
              ) : (
                <div style={{ color: "var(--color-text-muted)" }}>
                  The Competition-only Student account remains reusable for
                  later Competitions under the same Center. No Competition fee
                  transaction is created.
                </div>
              )}

              {createdCredentials.length ? (
                <div
                  style={{
                    padding: 10,
                    border: "1px solid var(--color-border)",
                    borderRadius: 8,
                    display: "grid",
                    gap: 6
                  }}
                >
                  <b>Save these login credentials now</b>
                  {createdCredentials.map((credential) => (
                    <div key={credential.username}>
                      {credential.name}: <b>{credential.username}</b> /{" "}
                      <b>{credential.password}</b>
                    </div>
                  ))}
                </div>
              ) : null}
            </div>
          </div>

          <div className="card" style={{ display: "grid", gap: 10 }}>
            <div>
              <h3 style={{ margin: 0 }}>Center and Teacher Lists</h3>
              <div style={{ fontSize: 12, color: "var(--color-text-muted)" }}>
                Submitted Teacher entries are synchronized into the combined
                Center list on refresh
              </div>
            </div>

            {listsLoading ? (
              <LoadingState label="Loading enrollment lists..." />
            ) : null}

            <div style={{ overflowX: "auto" }}>
              <table
                style={{
                  width: "100%",
                  borderCollapse: "collapse",
                  minWidth: 780
                }}
              >
                <thead>
                  <tr>
                    {[
                      "List",
                      "Owner",
                      "Participation IDs",
                      "Status",
                      "Forwarded",
                      "Return reason",
                      "Action"
                    ].map((header) => (
                      <th
                        key={header}
                        style={{
                          textAlign: "left",
                          padding: 8,
                          borderBottom: "1px solid var(--color-border)"
                        }}
                      >
                        {header}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {lists.map((list) => (
                    <tr
                      key={list.id}
                      style={{
                        background:
                          list.id === selectedListId
                            ? "var(--color-surface-muted)"
                            : "transparent"
                      }}
                    >
                      <td style={{ padding: 8 }}>
                        {list.type === "CENTER_COMBINED"
                          ? `Center Request ${list.scopeKey?.match(/REQ:(\d+)$/)?.[1] ? Number(list.scopeKey.match(/REQ:(\d+)$/)[1]) : 1}`
                          : "Teacher List"}
                      </td>
                      <td style={{ padding: 8 }}>
                        {list.type === "CENTER_COMBINED"
                          ? list?.centerNode?.name || "Center"
                          : list?.teacherUser?.teacherProfile?.fullName ||
                            list?.teacherUser?.email ||
                            "Teacher"}
                      </td>
                      <td style={{ padding: 8 }}>
                        {list?.itemCounts?.included || 0}
                      </td>
                      <td style={{ padding: 8 }}>
                        <StatusBadge status={list.status || "DRAFT"} />
                      </td>
                      <td style={{ padding: 8 }}>
                        {formatDateTime(list.forwardedAt)}
                      </td>
                      <td style={{ padding: 8 }}>
                        {list.rejectedRemark || "—"}
                      </td>
                      <td style={{ padding: 8 }}>
                        <button
                          className="button secondary"
                          type="button"
                          style={{ width: "auto", fontSize: 12 }}
                          onClick={() => {
                            setSuccess("");
                            setSelectedListId(list.id);
                          }}
                        >
                          {list.id === selectedListId ? "Selected" : "Review"}
                        </button>
                      </td>
                    </tr>
                  ))}
                  {!listsLoading && !lists.length ? (
                    <tr>
                      <td
                        colSpan={7}
                        style={{
                          padding: 16,
                          textAlign: "center",
                          color: "var(--color-text-muted)"
                        }}
                      >
                        No Center or Teacher list exists for this Competition.
                      </td>
                    </tr>
                  ) : null}
                </tbody>
              </table>
            </div>
          </div>

          {selectedListId ? (
            <div className="card" style={{ display: "grid", gap: 14 }}>
              {detailLoading ? (
                <LoadingState label="Loading participation IDs..." />
              ) : null}

              {detailError ? (
                <p className="error" style={{ margin: 0 }}>
                  {detailError}
                </p>
              ) : null}

              {selectedList && !detailLoading ? (
                <>
                  <div
                    style={{
                      display: "flex",
                      justifyContent: "space-between",
                      gap: 12,
                      alignItems: "flex-start",
                      flexWrap: "wrap"
                    }}
                  >
                    <div>
                      <h3 style={{ margin: 0 }}>
                        {selectedList.type === "CENTER_COMBINED"
                          ? "Combined Center Participation IDs"
                          : `${
                              selectedList?.teacherUser?.teacherProfile
                                ?.fullName ||
                              selectedList?.teacherUser?.email ||
                              "Teacher"
                            } Participation IDs`}
                      </h3>
                      <div
                        style={{
                          fontSize: 12,
                          color: "var(--color-text-muted)"
                        }}
                      >
                        One row represents one student-level participation ID
                      </div>
                    </div>
                    <StatusBadge status={selectedList.status || "DRAFT"} />
                  </div>

                  <div
                    style={{
                      display: "grid",
                      gridTemplateColumns:
                        "repeat(auto-fit, minmax(150px, 1fr))",
                      gap: 8
                    }}
                  >
                    {[
                      ["Total IDs", selectedItems.length],
                      ["Included IDs", includedItems.length],
                      [
                        "Unselected IDs",
                        selectedItems.length - includedItems.length
                      ],
                      ["Competition-only IDs", temporaryCount]
                    ].map(([label, value]) => (
                      <div
                        key={label}
                        style={{
                          padding: 10,
                          border: "1px solid var(--color-border)",
                          borderRadius: 8
                        }}
                      >
                        <div
                          style={{
                            fontSize: 12,
                            color: "var(--color-text-muted)"
                          }}
                        >
                          {label}
                        </div>
                        <b>{value}</b>
                      </div>
                    ))}
                  </div>

                  <div style={{ overflowX: "auto" }}>
                    <table
                      style={{
                        width: "100%",
                        borderCollapse: "collapse",
                        minWidth: 980
                      }}
                    >
                      <thead>
                        <tr>
                          {[
                            "Student ID",
                            "Student",
                            "Course",
                            "Level",
                            "Type",
                            "Selection",
                            "Reason",
                            "Action"
                          ].map((header) => (
                            <th
                              key={header}
                              style={{
                                textAlign: "left",
                                padding: 8,
                                borderBottom:
                                  "1px solid var(--color-border)"
                              }}
                            >
                              {header}
                            </th>
                          ))}
                        </tr>
                      </thead>
                      <tbody>
                        {selectedItems.map((item) => {
                          const enrollment = item?.enrollment;
                          const label = participationLabel(item);
                          return (
                            <tr key={enrollment?.id}>
                              <td style={{ padding: 8 }}>
                                {enrollment?.student?.admissionNo || "—"}
                              </td>
                              <td style={{ padding: 8 }}>
                                {studentName(enrollment?.student)}
                              </td>
                              <td style={{ padding: 8 }}>{label.course}</td>
                              <td style={{ padding: 8 }}>{label.level}</td>
                              <td style={{ padding: 8 }}>
                                {enrollment?.isTemporary
                                  ? "Competition-only"
                                  : "Regular"}
                              </td>
                              <td style={{ padding: 8 }}>
                                <StatusBadge
                                  status={
                                    item?.included
                                      ? "INCLUDED"
                                      : "UNSELECTED"
                                  }
                                />
                              </td>
                              <td style={{ padding: 8 }}>
                                {item?.exclusionReason || "—"}
                              </td>
                              <td style={{ padding: 8 }}>
                                {selectedListIsCombined ? (
                                  item?.included ? (
                                    <button
                                      className="button secondary"
                                      type="button"
                                      style={{ width: "auto", fontSize: 12 }}
                                      disabled={
                                        acting || !canEditSelectedCombined
                                      }
                                      onClick={() => setExcludeTarget(item)}
                                    >
                                      Unselect
                                    </button>
                                  ) : (
                                    <button
                                      className="button secondary"
                                      type="button"
                                      style={{ width: "auto", fontSize: 12 }}
                                      disabled={
                                        acting || !canEditSelectedCombined
                                      }
                                      onClick={() =>
                                        void includeParticipation(item)
                                      }
                                    >
                                      Include
                                    </button>
                                  )
                                ) : (
                                  <span
                                    style={{
                                      fontSize: 12,
                                      color: "var(--color-text-muted)"
                                    }}
                                  >
                                    Review only
                                  </span>
                                )}
                              </td>
                            </tr>
                          );
                        })}
                        {!selectedItems.length ? (
                          <tr>
                            <td
                              colSpan={8}
                              style={{
                                padding: 16,
                                textAlign: "center",
                                color: "var(--color-text-muted)"
                              }}
                            >
                              This list has no student-level participation IDs.
                            </td>
                          </tr>
                        ) : null}
                      </tbody>
                    </table>
                  </div>

                  <div style={{ display: "grid", gap: 8 }}>
                    <h4 style={{ margin: 0 }}>
                      Included IDs by Course Level
                    </h4>
                    <div
                      style={{
                        display: "grid",
                        gridTemplateColumns:
                          "repeat(auto-fit, minmax(210px, 1fr))",
                        gap: 8
                      }}
                    >
                      {levelSummaries.map((summary) => (
                        <div
                          key={summary.key}
                          style={{
                            padding: 10,
                            border: "1px solid var(--color-border)",
                            borderRadius: 8
                          }}
                        >
                          <div style={{ fontWeight: 700 }}>
                            {summary.course}
                          </div>
                          <div
                            style={{
                              fontSize: 12,
                              color: "var(--color-text-muted)"
                            }}
                          >
                            {summary.level}
                          </div>
                          <div style={{ marginTop: 4 }}>
                            {summary.included}/{summary.total} included
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>

                  {selectedList.rejectedRemark ? (
                    <div
                      style={{
                        padding: 10,
                        border: "1px solid var(--color-border)",
                        borderRadius: 8
                      }}
                    >
                      <b>Latest return reason:</b>{" "}
                      {selectedList.rejectedRemark}
                    </div>
                  ) : null}

                  <div
                    style={{
                      display: "flex",
                      justifyContent: "flex-end",
                      gap: 8,
                      flexWrap: "wrap"
                    }}
                  >
                    {canReturnSelectedTeacher ? (
                      <button
                        className="button danger"
                        type="button"
                        style={{ width: "auto" }}
                        disabled={acting}
                        onClick={() => setReturnTeacherOpen(true)}
                      >
                        Return to Teacher
                      </button>
                    ) : null}

                    {selectedListIsCombined ? (
                      <button
                        className="button"
                        type="button"
                        style={{ width: "auto" }}
                        disabled={
                          acting ||
                          !canEditSelectedCombined ||
                          includedItems.length < 1
                        }
                        onClick={() => setForwardOpen(true)}
                      >
                        Forward to Franchise
                      </button>
                    ) : null}
                  </div>

                  {!canEditSelectedCombined &&
                  selectedListIsCombined ? (
                    <div
                      style={{
                        fontSize: 12,
                        color: "var(--color-text-muted)",
                        textAlign: "right"
                      }}
                    >
                      The combined list is read-only at its current workflow
                      stage.
                    </div>
                  ) : null}
                </>
              ) : null}
            </div>
          ) : null}
        </>
      ) : null}

      <ConfirmDialog
        open={forwardOpen}
        title="Forward Combined Center List"
        message={`Forward ${includedItems.length} included student-level participation ID${
          includedItems.length === 1 ? "" : "s"
        } to the Franchise? Enrollment becomes read-only until the Franchise returns it.`}
        confirmLabel="Forward to Franchise"
        onCancel={() => setForwardOpen(false)}
        onConfirm={() => void forwardCombinedList()}
      />

      <InputDialog
        open={returnTeacherOpen}
        title="Return Teacher Enrollment List"
        message="Return this Teacher list for correction? The Teacher can edit and resubmit it."
        inputLabel="Return reason"
        inputPlaceholder="Explain what the Teacher must correct"
        required
        confirmLabel="Return to Teacher"
        onCancel={() => setReturnTeacherOpen(false)}
        onConfirm={(value) => void returnTeacherList(value)}
      />

      <InputDialog
        open={Boolean(excludeTarget)}
        title="Unselect Participation ID"
        message={`Unselect ${
          excludeTarget?.enrollment?.student?.admissionNo || "this student"
        } for ${
          participationLabel(excludeTarget).level
        }? Other enrolled levels remain unchanged.`}
        inputLabel="Reason"
        inputPlaceholder="Reason for unselecting this student-level ID"
        required
        confirmLabel="Unselect"
        onCancel={() => setExcludeTarget(null)}
        onConfirm={(value) => void excludeParticipation(value)}
      />
    </section>
  );
}

export { CenterCompetitionEnrollmentPage };
