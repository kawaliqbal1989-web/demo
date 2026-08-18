import { useEffect, useMemo, useRef, useState } from "react";
import { Link } from "react-router-dom";
import { ConfirmDialog } from "../../components/ConfirmDialog";
import { InputDialog } from "../../components/InputDialog";
import { LoadingState } from "../../components/LoadingState";
import { StatusBadge } from "../../components/StatusBadge";
import {
  enrollCompetitionStudent,
  forwardCompetitionEnrollmentList,
  getCompetitionEnrollmentList,
  listCompetitionEnrollmentLists,
  listCompetitions,
  updateCompetitionEnrollmentInclusion
} from "../../services/competitionsService";
import { listMyStudents } from "../../services/teacherPortalService";
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

function competitionLabel(competition) {
  const title = competition?.title || "Competition";
  const startsAt = competition?.startsAt
    ? new Date(competition.startsAt).toLocaleDateString()
    : "";
  return startsAt ? `${title} · ${startsAt}` : title;
}

function studentName(student) {
  return (
    student?.fullName ||
    [student?.firstName, student?.lastName]
      .filter(Boolean)
      .join(" ")
      .trim() ||
    "Unnamed student"
  );
}

function competitionLevels(competition) {
  const levels = [];

  for (const courseMapping of competition?.competitionCourses || []) {
    for (const levelMapping of courseMapping?.levels || []) {
      levels.push({
        id: levelMapping.id,
        course:
          courseMapping?.name ||
          courseMapping?.code ||
          "Course",
        level:
          levelMapping?.level?.name ||
          (levelMapping?.levelNumber
            ? `Level ${levelMapping.levelNumber}`
            : "Level"),
        sortOrder:
          Number(courseMapping?.sortOrder || 0) * 10000 +
          Number(levelMapping?.sortOrder || 0)
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

function isReturnedToTeacher(list) {
  return (
    list?.type === "TEACHER" &&
    list?.status === "REJECTED" &&
    list?.rejectedBy?.role === "CENTER"
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

function TeacherCompetitionEnrollmentPage() {
  const [competitions, setCompetitions] = useState([]);
  const [competitionId, setCompetitionId] = useState("");
  const [students, setStudents] = useState([]);
  const [studentSearch, setStudentSearch] = useState("");
  const [studentId, setStudentId] = useState("");
  const [selectedLevelIds, setSelectedLevelIds] = useState([]);

  const [teacherList, setTeacherList] = useState(null);
  const [loading, setLoading] = useState(true);
  const [listLoading, setListLoading] = useState(false);
  const [acting, setActing] = useState(false);
  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");

  const [submitOpen, setSubmitOpen] = useState(false);
  const [excludeTarget, setExcludeTarget] = useState(null);

  // Ignore stale responses when Competition selection changes or Refresh
  // is used while an earlier Teacher workspace request is still in flight.
  const baseDataRequestIdRef = useRef(0);
  const teacherListRequestIdRef = useRef(0);

  const selectedCompetition = useMemo(
    () =>
      competitions.find((competition) => competition.id === competitionId) ||
      null,
    [competitionId, competitions]
  );

  const availableLevels = useMemo(
    () => competitionLevels(selectedCompetition),
    [selectedCompetition]
  );

  const items = Array.isArray(teacherList?.items) ? teacherList.items : [];

  const includedItems = useMemo(
    () => items.filter((item) => item?.included),
    [items]
  );

  const enrolledStudentLevelKeys = useMemo(
    () =>
      new Set(
        items.map((item) => {
          const enrollment = item?.enrollment;
          return `${enrollment?.studentId || ""}:${
            enrollment?.competitionCourseLevel?.id || ""
          }`;
        })
      ),
    [items]
  );

  const studentsAlreadyAddedToRequest = useMemo(
    () =>
      new Set(
        items
          .map((item) => item?.enrollment?.studentId)
          .filter(Boolean)
      ),
    [items]
  );

  const filteredStudents = useMemo(() => {
    const availableStudents = students.filter(
      (student) => !studentsAlreadyAddedToRequest.has(student?.studentId)
    );
    const query = studentSearch.trim().toLowerCase();
    if (!query) return availableStudents;

    return availableStudents.filter((student) =>
      [
        student?.admissionNo,
        student?.fullName,
        student?.firstName,
        student?.lastName,
        studentName(student)
      ]
        .filter(Boolean)
        .some((value) => String(value).toLowerCase().includes(query))
    );
  }, [studentSearch, students, studentsAlreadyAddedToRequest]);

  const levelSummaries = useMemo(() => {
    const summaries = new Map();

    for (const item of items) {
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
  }, [items]);

  const enrollmentOpen = isEnrollmentWindowOpen(selectedCompetition);
  const listEditable =
    !teacherList ||
    teacherList.status === "DRAFT" ||
    isReturnedToTeacher(teacherList);
  const canEdit = Boolean(competitionId && enrollmentOpen && listEditable);

  const selectableLevels = useMemo(() => {
    if (!studentId) return availableLevels;
    return availableLevels.filter(
      (level) => !enrolledStudentLevelKeys.has(`${studentId}:${level.id}`)
    );
  }, [availableLevels, enrolledStudentLevelKeys, studentId]);

  const loadBaseData = async () => {
    const requestId = ++baseDataRequestIdRef.current;

    setLoading(true);
    setError("");
    try {
      const [competitionResponse, studentResponse] = await Promise.all([
        listCompetitions({ limit: 100, offset: 0 }),
        listMyStudents()
      ]);
      if (requestId !== baseDataRequestIdRef.current) return null;

      const competitionItems = responseItems(competitionResponse);
      const studentItems = responseItems(studentResponse).filter(
        (student) => student?.studentId
      );

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
          "Failed to load Teacher Competition enrollment data."
      );
      return null;
    } finally {
      if (requestId === baseDataRequestIdRef.current) {
        setLoading(false);
      }
    }
  };

  const loadTeacherList = async (targetCompetitionId = competitionId) => {
    const requestId = ++teacherListRequestIdRef.current;

    if (!targetCompetitionId) {
      setTeacherList(null);
      setListLoading(false);
      return null;
    }

    setListLoading(true);
    setError("");
    try {
      const listResponse = await listCompetitionEnrollmentLists(
        targetCompetitionId
      );
      if (requestId !== teacherListRequestIdRef.current) return null;

      const teacherLists = responseItems(listResponse).filter(
        (list) => list?.type === "TEACHER"
      );
      const listSummary =
        [...teacherLists].reverse().find(
          (list) => list?.status === "DRAFT" || isReturnedToTeacher(list)
        ) ||
        teacherLists[teacherLists.length - 1] ||
        null;

      if (!listSummary?.id) {
        setTeacherList(null);
        return null;
      }

      const detailResponse = await getCompetitionEnrollmentList(
        targetCompetitionId,
        listSummary.id
      );
      if (requestId !== teacherListRequestIdRef.current) return null;

      const detail = responseData(detailResponse);
      setTeacherList(detail);
      return detail;
    } catch (err) {
      if (requestId !== teacherListRequestIdRef.current) return null;

      setTeacherList(null);
      setError(
        getFriendlyErrorMessage(err) ||
          "Failed to load your Competition enrollment list."
      );
      return null;
    } finally {
      if (requestId === teacherListRequestIdRef.current) {
        setListLoading(false);
      }
    }
  };

  useEffect(() => {
    void loadBaseData();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    teacherListRequestIdRef.current += 1;

    setStudentId("");
    setStudentSearch("");
    setSelectedLevelIds([]);
    setTeacherList(null);
    setSuccess("");
    void loadTeacherList(competitionId);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [competitionId]);

  const refreshWorkspace = async () => {
    const targetCompetitionId = competitionId;
    await loadTeacherList(targetCompetitionId);
  };

  const toggleLevel = (levelId) => {
    setSelectedLevelIds((current) =>
      current.includes(levelId)
        ? current.filter((id) => id !== levelId)
        : [...current, levelId]
    );
  };

  const enrollStudent = async (event) => {
    event.preventDefault();
    if (!studentId) {
      setError("Select one of your assigned students.");
      return;
    }
    if (!selectedLevelIds.length) {
      setError("Select at least one Competition level.");
      return;
    }
    if (!canEdit || acting) return;

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
        } added to your Teacher list.`
      );
      setStudentId("");
      setSelectedLevelIds([]);
      await refreshWorkspace();
    } catch (err) {
      setError(
        getFriendlyErrorMessage(err) ||
          "Failed to add the selected student-level participation IDs."
      );
    } finally {
      setActing(false);
    }
  };

  const includeParticipation = async (item) => {
    const enrollmentId = item?.enrollment?.id;
    if (
      !competitionId ||
      !teacherList?.id ||
      !enrollmentId ||
      !canEdit ||
      acting
    ) {
      return;
    }

    setActing(true);
    setError("");
    setSuccess("");
    try {
      await updateCompetitionEnrollmentInclusion({
        competitionId,
        listId: teacherList.id,
        enrollmentId,
        included: true,
        reason: null
      });
      setSuccess("Student-level participation included.");
      await refreshWorkspace();
    } catch (err) {
      setError(
        getFriendlyErrorMessage(err) ||
          "Failed to include this participation ID."
      );
    } finally {
      setActing(false);
    }
  };

  const excludeParticipation = async (reason) => {
    const normalizedReason = String(reason || "").trim();
    const enrollmentId = excludeTarget?.enrollment?.id;

    if (!normalizedReason) {
      setError("Unselection reason is required.");
      return;
    }
    if (
      !competitionId ||
      !teacherList?.id ||
      !enrollmentId ||
      !canEdit ||
      acting
    ) {
      return;
    }

    setExcludeTarget(null);
    setActing(true);
    setError("");
    setSuccess("");
    try {
      await updateCompetitionEnrollmentInclusion({
        competitionId,
        listId: teacherList.id,
        enrollmentId,
        included: false,
        reason: normalizedReason
      });
      setSuccess("Student-level participation unselected.");
      await refreshWorkspace();
    } catch (err) {
      setError(
        getFriendlyErrorMessage(err) ||
          "Failed to unselect this participation ID."
      );
    } finally {
      setActing(false);
    }
  };

  const submitToCenter = async () => {
    if (
      !competitionId ||
      !teacherList?.id ||
      !canEdit ||
      includedItems.length < 1 ||
      acting
    ) {
      return;
    }

    setSubmitOpen(false);
    setActing(true);
    setError("");
    setSuccess("");
    try {
      const response = await forwardCompetitionEnrollmentList(
        competitionId,
        teacherList.id
      );
      const result = responseData(response);
      const count = result?.includedCount ?? includedItems.length;
      setSuccess(
        `${count} student-level participation ID${
          count === 1 ? "" : "s"
        } submitted to the Center.`
      );
      await refreshWorkspace();
    } catch (err) {
      setError(
        getFriendlyErrorMessage(err) ||
          "Failed to submit your Competition enrollment list."
      );
    } finally {
      setActing(false);
    }
  };

  if (loading && !competitions.length) {
    return <LoadingState label="Loading Competition enrollment..." />;
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
            Submit multiple student-level requests to your Center until Enrollment End
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
            disabled={loading || listLoading}
            onClick={() => {
              void (async () => {
                await loadBaseData();
                await refreshWorkspace();
              })();
            }}
          >
            Refresh
          </button>
          {competitionId && selectedCompetition?.resultStatus === "PUBLISHED" ? (
            <Link
              className="button secondary"
              to={`/teacher/competition/${competitionId}/results`}
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
            No Competition is available for your Center’s Business Partner.
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
                List status
              </div>
              <div style={{ marginTop: 6 }}>
                <StatusBadge status={teacherList?.status || "DRAFT"} />
              </div>
              <div style={{ fontSize: 12, color: "var(--color-text-muted)", marginTop: 4 }}>
                {teacherList?.scopeKey?.match(/REQ:(\d+)$/)?.[1]
                  ? `Request ${Number(teacherList.scopeKey.match(/REQ:(\d+)$/)[1])}`
                  : teacherList ? "Legacy Request 1" : "New request"}
              </div>
            </div>
            <div className="card">
              <div style={{ fontSize: 12, color: "var(--color-text-muted)" }}>
                Total participation IDs
              </div>
              <div style={{ fontSize: 24, fontWeight: 800 }}>
                {items.length}
              </div>
            </div>
            <div className="card">
              <div style={{ fontSize: 12, color: "var(--color-text-muted)" }}>
                Included IDs
              </div>
              <div style={{ fontSize: 24, fontWeight: 800 }}>
                {includedItems.length}
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
            </div>
          </div>

          {isReturnedToTeacher(teacherList) ? (
            <div className="card">
              <b>Returned by Center:</b>{" "}
              {teacherList?.rejectedRemark || "Correction required."}
            </div>
          ) : null}

          <form
            className="card"
            onSubmit={enrollStudent}
            style={{ display: "grid", gap: 12 }}
          >
            <div>
              <h3 style={{ margin: 0 }}>Add Assigned Student</h3>
              <div style={{ fontSize: 12, color: "var(--color-text-muted)" }}>
                Each selected Competition level creates one participation ID
              </div>
            </div>

            <div
              style={{
                display: "grid",
                gridTemplateColumns: "repeat(auto-fit, minmax(240px, 1fr))",
                gap: 10
              }}
            >
              <label>
                Search assigned students
                <input
                  className="input"
                  value={studentSearch}
                  onChange={(event) => setStudentSearch(event.target.value)}
                  placeholder="Student ID or name"
                  disabled={!canEdit || acting}
                />
              </label>

              <label>
                Student
                <select
                  className="select"
                  value={studentId}
                  onChange={(event) => {
                    setStudentId(event.target.value);
                    setSelectedLevelIds([]);
                  }}
                  disabled={!canEdit || acting}
                >
                  <option value="">Select student</option>
                  {filteredStudents.map((student) => (
                    <option
                      key={student.studentId}
                      value={student.studentId}
                    >
                      {student.admissionNo || "No ID"} ·{" "}
                      {studentName(student)}
                    </option>
                  ))}
                </select>
              </label>
            </div>

            <div style={{ display: "grid", gap: 6 }}>
              <b>Competition levels</b>
              <div
                style={{
                  display: "grid",
                  gridTemplateColumns:
                    "repeat(auto-fit, minmax(220px, 1fr))",
                  gap: 8
                }}
              >
                {selectableLevels.map((level) => (
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
                      checked={selectedLevelIds.includes(level.id)}
                      onChange={() => toggleLevel(level.id)}
                      disabled={!canEdit || acting}
                    />
                    <span>
                      <b>{level.course}</b> · {level.level}
                    </span>
                  </label>
                ))}
              </div>
              {!availableLevels.length ? (
                <span
                  style={{ fontSize: 12, color: "var(--color-text-muted)" }}
                >
                  No Competition course levels are configured.
                </span>
              ) : null}
              {studentId &&
              availableLevels.length > 0 &&
              selectableLevels.length === 0 ? (
                <span
                  style={{ fontSize: 12, color: "var(--color-text-muted)" }}
                >
                  This student is already listed for every Competition level.
                </span>
              ) : null}
            </div>

            <div
              style={{
                display: "flex",
                justifyContent: "space-between",
                alignItems: "center",
                gap: 10,
                flexWrap: "wrap"
              }}
            >
              <div style={{ fontSize: 12, color: "var(--color-text-muted)" }}>
                Only students currently assigned to your Teacher account are
                shown.
              </div>
              <button
                className="button"
                type="submit"
                style={{ width: "auto" }}
                disabled={!canEdit || acting}
              >
                {acting ? "Saving..." : "Add Participation IDs"}
              </button>
            </div>

            {!canEdit ? (
              <div style={{ fontSize: 12, color: "var(--color-text-muted)" }}>
                Enrollment is read-only because the window is closed or your
                list has already been submitted.
              </div>
            ) : null}
          </form>

          <div className="card" style={{ display: "grid", gap: 14 }}>
            <div
              style={{
                display: "flex",
                justifyContent: "space-between",
                alignItems: "flex-start",
                gap: 12,
                flexWrap: "wrap"
              }}
            >
              <div>
                <h3 style={{ margin: 0 }}>My Participation IDs</h3>
                <div
                  style={{ fontSize: 12, color: "var(--color-text-muted)" }}
                >
                  One row represents one student enrolled in one level
                </div>
              </div>
              <button
                className="button"
                type="button"
                style={{ width: "auto" }}
                disabled={
                  acting ||
                  listLoading ||
                  !canEdit ||
                  !teacherList?.id ||
                  includedItems.length < 1
                }
                onClick={() => setSubmitOpen(true)}
              >
                Submit to Center
              </button>
            </div>

            {listLoading ? (
              <LoadingState label="Loading your participation IDs..." />
            ) : null}

            <div style={{ overflowX: "auto" }}>
              <table
                style={{
                  width: "100%",
                  borderCollapse: "collapse",
                  minWidth: 920
                }}
              >
                <thead>
                  <tr>
                    {[
                      "Student ID",
                      "Student",
                      "Course",
                      "Level",
                      "Selection",
                      "Reason",
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
                  {items.map((item) => {
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
                          <StatusBadge
                            status={
                              item?.included ? "INCLUDED" : "UNSELECTED"
                            }
                          />
                        </td>
                        <td style={{ padding: 8 }}>
                          {item?.exclusionReason || "—"}
                        </td>
                        <td style={{ padding: 8 }}>
                          {item?.included ? (
                            <button
                              className="button secondary"
                              type="button"
                              style={{ width: "auto", fontSize: 12 }}
                              disabled={!canEdit || acting}
                              onClick={() => setExcludeTarget(item)}
                            >
                              Unselect
                            </button>
                          ) : (
                            <button
                              className="button secondary"
                              type="button"
                              style={{ width: "auto", fontSize: 12 }}
                              disabled={!canEdit || acting}
                              onClick={() =>
                                void includeParticipation(item)
                              }
                            >
                              Include
                            </button>
                          )}
                        </td>
                      </tr>
                    );
                  })}
                  {!listLoading && !items.length ? (
                    <tr>
                      <td
                        colSpan={7}
                        style={{
                          padding: 16,
                          textAlign: "center",
                          color: "var(--color-text-muted)"
                        }}
                      >
                        No student-level participation IDs have been added.
                      </td>
                    </tr>
                  ) : null}
                </tbody>
              </table>
            </div>

            {levelSummaries.length ? (
              <div style={{ display: "grid", gap: 8 }}>
                <h4 style={{ margin: 0 }}>Included IDs by Course Level</h4>
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
                      <div style={{ fontWeight: 700 }}>{summary.course}</div>
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
            ) : null}
          </div>
        </>
      ) : null}

      <ConfirmDialog
        open={submitOpen}
        title="Submit Competition Enrollment List"
        message={`Submit ${includedItems.length} included student-level participation ID${
          includedItems.length === 1 ? "" : "s"
        } to the Center? Your list becomes read-only unless the Center returns it.`}
        confirmLabel="Submit to Center"
        onCancel={() => setSubmitOpen(false)}
        onConfirm={() => void submitToCenter()}
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

export { TeacherCompetitionEnrollmentPage };
