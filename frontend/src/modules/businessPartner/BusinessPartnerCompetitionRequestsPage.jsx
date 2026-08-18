import { useEffect, useMemo, useRef, useState } from "react";
import { Link } from "react-router-dom";
import { LoadingState } from "../../components/LoadingState";
import { StatusBadge } from "../../components/StatusBadge";
import { getFriendlyErrorMessage } from "../../utils/apiErrors";
import {
  getCompetitionEnrollmentList,
  listCompetitionEnrollmentLists,
  listCompetitions
} from "../../services/competitionsService";

const BP_PENDING_STATUS = "SUBMITTED_TO_BUSINESS_PARTNER";

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

function formatDateTime(value) {
  if (!value) return "—";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "—";
  return date.toLocaleString();
}

function studentName(student) {
  const name = [student?.firstName, student?.lastName]
    .filter(Boolean)
    .join(" ")
    .trim();
  return name || "Unnamed student";
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

function isReturnedToBusinessPartner(list) {
  return (
    list?.status === "REJECTED" &&
    list?.rejectedBy?.role === "SUPERADMIN"
  );
}

function competitionLabel(competition) {
  const title = competition?.title || "Competition";
  const startsAt = competition?.startsAt
    ? new Date(competition.startsAt).toLocaleDateString()
    : "";
  return startsAt ? `${title} · ${startsAt}` : title;
}

function BusinessPartnerCompetitionRequestsPage() {
  const [competitions, setCompetitions] = useState([]);
  const [competitionId, setCompetitionId] = useState("");
  const [lists, setLists] = useState([]);
  const [selectedListId, setSelectedListId] = useState("");
  const [selectedList, setSelectedList] = useState(null);
  const [statusFilter, setStatusFilter] = useState("ALL");

  const [loading, setLoading] = useState(true);
  const [listsLoading, setListsLoading] = useState(false);
  const [detailLoading, setDetailLoading] = useState(false);
  const [error, setError] = useState("");
  const [detailError, setDetailError] = useState("");

  // Ignore stale async responses when the user switches Competition/list
  // or refreshes while a previous request is still in flight.
  const competitionsRequestIdRef = useRef(0);
  const listsRequestIdRef = useRef(0);
  const detailRequestIdRef = useRef(0);

  const selectedCompetition = useMemo(
    () => competitions.find((competition) => competition.id === competitionId),
    [competitionId, competitions]
  );

  const loadCompetitions = async () => {
    const requestId = ++competitionsRequestIdRef.current;

    setLoading(true);
    setError("");
    try {
      const response = await listCompetitions({ limit: 100, offset: 0 });
      if (requestId !== competitionsRequestIdRef.current) return;

      const items = responseItems(response);
      setCompetitions(items);
      setCompetitionId((currentId) =>
        currentId && items.some((item) => item.id === currentId)
          ? currentId
          : items[0]?.id || ""
      );
    } catch (err) {
      if (requestId !== competitionsRequestIdRef.current) return;

      setCompetitions([]);
      setCompetitionId("");
      setError(
        getFriendlyErrorMessage(err) ||
          "Failed to load assigned Competitions."
      );
    } finally {
      if (requestId === competitionsRequestIdRef.current) {
        setLoading(false);
      }
    }
  };

  const chooseSelectedListId = (listItems, preferredListId = "") => {
    if (
      preferredListId &&
      listItems.some((list) => list.id === preferredListId)
    ) {
      return preferredListId;
    }

    return (
      listItems.find(
        (list) =>
          list.status === BP_PENDING_STATUS ||
          isReturnedToBusinessPartner(list)
      )?.id ||
      listItems[0]?.id ||
      ""
    );
  };

  const loadLists = async ({
    targetCompetitionId = competitionId,
    preserveSelection = true,
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

      const items = responseItems(response)
        .filter((list) => list?.type === "CENTER_COMBINED")
        .sort((left, right) => {
          const leftPending =
            left?.status === BP_PENDING_STATUS ||
            isReturnedToBusinessPartner(left)
              ? 0
              : 1;
          const rightPending =
            right?.status === BP_PENDING_STATUS ||
            isReturnedToBusinessPartner(right)
              ? 0
              : 1;
          if (leftPending !== rightPending) return leftPending - rightPending;
          return String(
            right?.forwardedAt || right?.createdAt || ""
          ).localeCompare(
            String(left?.forwardedAt || left?.createdAt || "")
          );
        });

      const nextSelectedListId = chooseSelectedListId(
        items,
        preserveSelection ? preferredListId : ""
      );

      setLists(items);
      setSelectedListId(nextSelectedListId);

      return {
        items,
        selectedListId: nextSelectedListId
      };
    } catch (err) {
      if (requestId !== listsRequestIdRef.current) return null;

      setLists([]);
      setSelectedListId("");
      setSelectedList(null);
      setError(
        getFriendlyErrorMessage(err) ||
          "Failed to load Competition enrollment lists."
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
          "Failed to load this Center enrollment list."
      );
      return null;
    } finally {
      if (requestId === detailRequestIdRef.current) {
        setDetailLoading(false);
      }
    }
  };

  useEffect(() => {
    void loadCompetitions();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    listsRequestIdRef.current += 1;
    detailRequestIdRef.current += 1;

    setStatusFilter("ALL");
    setDetailError("");
    setSelectedList(null);
    void loadLists({
      targetCompetitionId: competitionId,
      preserveSelection: false,
      preferredListId: ""
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [competitionId]);

  useEffect(() => {
    void loadSelectedList(selectedListId);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [competitionId, selectedListId]);

  const filteredLists = useMemo(() => {
    if (statusFilter === "ALL") return lists;
    if (statusFilter === "RETURNED_TO_BP") {
      return lists.filter(isReturnedToBusinessPartner);
    }
    return lists.filter((list) => list?.status === statusFilter);
  }, [lists, statusFilter]);

  const waitingCount = useMemo(
    () => lists.filter((list) => list?.status === "WAITING_FOR_QUOTA").length,
    [lists]
  );

  const approvedCount = useMemo(
    () => lists.filter((list) => list?.status === "APPROVED").length,
    [lists]
  );

  const participationIdCount = useMemo(
    () =>
      lists.reduce(
        (total, list) => total + (list?._count?.items || 0),
        0
      ),
    [lists]
  );

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

  const refreshSelected = async () => {
    const targetCompetitionId = competitionId;
    const preferredListId = selectedListId;

    const result = await loadLists({
      targetCompetitionId,
      preserveSelection: true,
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

  if (loading && !competitions.length) {
    return <LoadingState label="Loading assigned Competitions..." />;
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
          <h2 style={{ margin: 0 }}>Competition Enrollment Preview</h2>
          <div style={{ fontSize: 12, color: "var(--color-text-muted)" }}>
            View Center participation IDs under this Business Partner. This workspace is read-only.
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
            onClick={async () => {
              await loadCompetitions();
              await refreshSelected();
            }}
          >
            Refresh
          </button>
          {competitionId && selectedCompetition?.resultStatus === "PUBLISHED" ? (
            <Link
              className="button secondary"
              to={`/bp/competition/${competitionId}/results`}
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

      {!loading && !competitions.length ? (
        <div className="card">
          <p style={{ margin: 0, color: "var(--color-text-muted)" }}>
            No Competition has been assigned to this Business Partner.
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
                Waiting for quota
              </div>
              <div style={{ fontSize: 24, fontWeight: 800 }}>
                {waitingCount}
              </div>
            </div>
            <div className="card">
              <div style={{ fontSize: 12, color: "var(--color-text-muted)" }}>
                Approved lists
              </div>
              <div style={{ fontSize: 24, fontWeight: 800 }}>
                {approvedCount}
              </div>
            </div>
            <div className="card">
              <div style={{ fontSize: 12, color: "var(--color-text-muted)" }}>
                Total participation IDs
              </div>
              <div style={{ fontSize: 24, fontWeight: 800 }}>
                {participationIdCount}
              </div>
            </div>
            <div className="card">
              <div style={{ fontSize: 12, color: "var(--color-text-muted)" }}>
                Competition
              </div>
              <div style={{ fontSize: 16, fontWeight: 800 }}>
                {selectedCompetition?.title || "—"}
              </div>
              <div style={{ fontSize: 12, color: "var(--color-text-muted)" }}>
                {selectedCompetition?.status || "—"}
              </div>
            </div>
          </div>

          <div className="card" style={{ display: "grid", gap: 10 }}>
            <div
              style={{
                display: "flex",
                justifyContent: "space-between",
                alignItems: "center",
                gap: 10,
                flexWrap: "wrap"
              }}
            >
              <div>
                <h3 style={{ margin: 0 }}>Center Lists</h3>
                <div
                  style={{ fontSize: 12, color: "var(--color-text-muted)" }}
                >
                  One combined student-level list per Center
                </div>
              </div>
              <label
                style={{ display: "flex", gap: 8, alignItems: "center" }}
              >
                Status
                <select
                  className="select"
                  value={statusFilter}
                  onChange={(event) => setStatusFilter(event.target.value)}
                  style={{ minWidth: 220 }}
                >
                  <option value="ALL">All statuses</option>
                  <option value="WAITING_FOR_QUOTA">Waiting for quota</option>
                  <option value="RETURNED_TO_BP">
                    Returned by Superadmin
                  </option>
                  <option value="SUBMITTED_TO_SUPERADMIN">
                    With Superadmin
                  </option>
                  <option value="APPROVED">Approved</option>
                  <option value="SUBMITTED_TO_FRANCHISE">
                    With Franchise
                  </option>
                  <option value="REJECTED">Returned</option>
                  <option value="DRAFT">With Center</option>
                </select>
              </label>
            </div>

            {listsLoading ? (
              <LoadingState label="Loading Center enrollment lists..." />
            ) : null}

            <div style={{ overflowX: "auto" }}>
              <table
                style={{
                  width: "100%",
                  borderCollapse: "collapse",
                  minWidth: 760
                }}
              >
                <thead>
                  <tr>
                    {[
                      "Center",
                      "Participation IDs",
                      "Status",
                      "Forwarded",
                      "Return reason",
                      "Preview"
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
                  {filteredLists.map((list) => (
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
                        <div style={{ fontWeight: 700 }}>
                          {list?.centerNode?.name || "Center"}
                        </div>
                        <div
                          style={{
                            fontSize: 12,
                            color: "var(--color-text-muted)"
                          }}
                        >
                          {list?.centerNode?.code || list?.scopeKey || "—"}
                        </div>
                      </td>
                      <td style={{ padding: 8 }}>
                        {list?._count?.items || 0}
                      </td>
                      <td style={{ padding: 8 }}>
                        <StatusBadge status={list?.status || "DRAFT"} />
                      </td>
                      <td style={{ padding: 8 }}>
                        {formatDateTime(list?.forwardedAt)}
                      </td>
                      <td style={{ padding: 8 }}>
                        {list?.rejectedRemark || "—"}
                      </td>
                      <td style={{ padding: 8 }}>
                        <button
                          className="button secondary"
                          type="button"
                          style={{ width: "auto", fontSize: 12 }}
                          onClick={() => {
                            setDetailError("");
                            setSelectedList(null);
                            setSelectedListId(list.id);
                          }}
                        >
                          {list.id === selectedListId ? "Selected" : "Preview"}
                        </button>
                      </td>
                    </tr>
                  ))}
                  {!listsLoading && !filteredLists.length ? (
                    <tr>
                      <td
                        colSpan={6}
                        style={{
                          padding: 16,
                          textAlign: "center",
                          color: "var(--color-text-muted)"
                        }}
                      >
                        No combined Center lists match this status.
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
                <LoadingState label="Loading Center participation IDs..." />
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
                        {selectedList?.centerNode?.name || "Center"}{" "}
                        Participation IDs
                      </h3>
                      <div
                        style={{
                          fontSize: 12,
                          color: "var(--color-text-muted)"
                        }}
                      >
                        {selectedList?.centerNode?.code || "—"} · Forwarded{" "}
                        {formatDateTime(selectedList?.forwardedAt)}
                      </div>
                    </div>
                    <StatusBadge status={selectedList?.status || "DRAFT"} />
                  </div>

                  <div
                    style={{
                      display: "grid",
                      gridTemplateColumns:
                        "repeat(auto-fit, minmax(150px, 1fr))",
                      gap: 8
                    }}
                  >
                    <div
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
                        Total IDs
                      </div>
                      <b>{selectedItems.length}</b>
                    </div>
                    <div
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
                        Included IDs
                      </div>
                      <b>{includedItems.length}</b>
                    </div>
                    <div
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
                        Unselected IDs
                      </div>
                      <b>{selectedItems.length - includedItems.length}</b>
                    </div>
                    <div
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
                        Competition-only IDs
                      </div>
                      <b>{temporaryCount}</b>
                    </div>
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
                            "Reason"
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
                            </tr>
                          );
                        })}
                        {!selectedItems.length ? (
                          <tr>
                            <td
                              colSpan={7}
                              style={{
                                padding: 16,
                                textAlign: "center",
                                color: "var(--color-text-muted)"
                              }}
                            >
                              This Center list has no student-level
                              participation IDs.
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

                  {selectedList?.rejectedRemark ? (
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
                      fontSize: 12,
                      color: "var(--color-text-muted)",
                      textAlign: "right"
                    }}
                  >
                    View only — approval and quota processing are managed by the system.
                  </div>
                </>
              ) : null}
            </div>
          ) : (
            <div className="card">
              <p style={{ margin: 0, color: "var(--color-text-muted)" }}>
                No combined Center enrollment list exists for this Competition
                yet.
              </p>
            </div>
          )}
        </>
      ) : null}

    </section>
  );
}

export { BusinessPartnerCompetitionRequestsPage };
