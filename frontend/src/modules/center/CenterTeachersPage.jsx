import { useEffect, useState } from "react";
import toast from "react-hot-toast";
import { DataTable } from "../../components/DataTable";
import { SkeletonLoader } from "../../components/SkeletonLoader";
import { PageHeader } from "../../components/PageHeader";
import { createTeacher, listTeachers, resetTeacherPassword, shiftTeacherStudents, updateTeacher, uploadTeacherPhoto } from "../../services/teachersService";
import { baseURL } from "../../services/apiClient";
import { listStudents } from "../../services/studentsService";
import { getFriendlyErrorMessage } from "../../utils/apiErrors";

const photoFrameStyle = {
  display: "inline-flex",
  alignItems: "center",
  justifyContent: "center",
  padding: 8,
  background: "linear-gradient(180deg, var(--color-bg-subtle), var(--color-bg-muted))",
  border: "1px solid var(--color-border-strong)",
  borderRadius: 12,
  boxShadow: "0 8px 24px rgba(0,0,0,0.12)"
};

const buildPhotoStyle = (size, objectFit = "cover") => ({
  width: size,
  height: size,
  objectFit,
  borderRadius: 10,
  border: "1px solid var(--color-border)",
  background: "var(--color-bg-card)"
});

function CenterTeachersPage() {
  const [rows, setRows] = useState([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  const [fullName, setFullName] = useState("");
  const [phonePrimary, setPhonePrimary] = useState("");
  const [email, setEmail] = useState("");
  const [joiningDate, setJoiningDate] = useState("");
  const [qualification, setQualification] = useState("");
  const [experienceYears, setExperienceYears] = useState("");
  const [specialization, setSpecialization] = useState("");
  const [phoneAlternate, setPhoneAlternate] = useState("");
  const [whatsappNumber, setWhatsappNumber] = useState("");
  const [address, setAddress] = useState("");
  const [city, setCity] = useState("");
  const [stateName, setStateName] = useState("");
  const [pincode, setPincode] = useState("");
  const [emergencyContactName, setEmergencyContactName] = useState("");
  const [emergencyContactPhone, setEmergencyContactPhone] = useState("");
  const [relation, setRelation] = useState("");
  const [photoUrl, setPhotoUrl] = useState("");
  const [notes, setNotes] = useState("");
  const [preferredLanguage, setPreferredLanguage] = useState("");
  const [employmentType, setEmploymentType] = useState("FULL_TIME");
  const [salaryType, setSalaryType] = useState("FIXED");
  const [isProbation, setIsProbation] = useState(false);
  const [status, setStatus] = useState("ACTIVE");
  const [createLoginAccount, setCreateLoginAccount] = useState(true);
  const [creating, setCreating] = useState(false);
  const [photoFile, setPhotoFile] = useState(null);
  const [photoPreview, setPhotoPreview] = useState("");
  const [tempPasswordDialog, setTempPasswordDialog] = useState(null);

  const [q, setQ] = useState("");
  const [statusFilter, setStatusFilter] = useState("");

  const [selectedTeacher, setSelectedTeacher] = useState(null);
  const [assignedStudents, setAssignedStudents] = useState([]);
  const [loadingStudents, setLoadingStudents] = useState(false);
  const [assignedStudentsPage, setAssignedStudentsPage] = useState(0);
  const [assignedStudentsTotal, setAssignedStudentsTotal] = useState(0);
  const ASSIGNED_STUDENTS_PAGE_SIZE = 100;

  const [editingTeacher, setEditingTeacher] = useState(null);
  const [viewTeacher, setViewTeacher] = useState(null);
  const [editPhotoFile, setEditPhotoFile] = useState(null);
  const [editPhotoPreview, setEditPhotoPreview] = useState("");
  const [editSaving, setEditSaving] = useState(false);

  const [shiftSourceTeacher, setShiftSourceTeacher] = useState(null);
  const [shiftTargetTeacherId, setShiftTargetTeacherId] = useState("");
  const [shiftSaving, setShiftSaving] = useState(false);
  const [shiftError, setShiftError] = useState("");

  const toDateInputValue = (value) => {
    if (!value) return "";
    const asString = String(value);
    return asString.length >= 10 ? asString.slice(0, 10) : asString;
  };

  const mapTeacherToForm = (row) => {
    const profile = row?.teacherProfile || {};
    return {
      id: row?.id,
      username: row?.username || "",
      fullName: profile?.fullName || "",
      phonePrimary: profile?.phonePrimary || "",
      email: row?.email || "",
      joiningDate: toDateInputValue(profile?.joiningDate),
      qualification: profile?.qualification || "",
      experienceYears: profile?.experienceYears ?? "",
      specialization: profile?.specialization || "",
      phoneAlternate: profile?.phoneAlternate || "",
      whatsappNumber: profile?.whatsappNumber || "",
      address: profile?.address || "",
      city: profile?.city || "",
      state: profile?.state || "",
      pincode: profile?.pincode || "",
      emergencyContactName: profile?.emergencyContactName || "",
      emergencyContactPhone: profile?.emergencyContactPhone || "",
      relation: profile?.emergencyContactRelation || "",
      photoUrl: profile?.photoUrl || "",
      notes: profile?.notes || "",
      preferredLanguage: profile?.preferredLanguage || "",
      employmentType: profile?.employmentType || "FULL_TIME",
      salaryType: profile?.salaryType || "FIXED",
      isProbation: Boolean(profile?.isProbation),
      status: profile?.status || (row?.isActive ? "ACTIVE" : "INACTIVE")
    };
  };

  const resolvePhotoUrl = (value) => {
    const text = String(value || "").trim();
    if (!text) return "";
    if (/^https?:\/\//i.test(text) || text.startsWith("data:")) return text;
    const apiOrigin = String(baseURL || "").replace(/\/api\/?$/, "");
    if (text.startsWith("/")) {
      return `${apiOrigin}${text}`;
    }
    return `${apiOrigin}/${text}`;
  };

  const load = async ({ q: nextQ = q, status: nextStatus = statusFilter } = {}) => {
    setLoading(true);
    setError("");
    try {
      const data = await listTeachers({ limit: 100, offset: 0, q: nextQ, status: nextStatus });
      setRows(data?.data?.items || data?.data || []);
    } catch (err) {
      setError(getFriendlyErrorMessage(err) || "Failed to load teachers.");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    void load();
  }, []);

  useEffect(() => {
    if (!photoFile) {
      setPhotoPreview("");
      return undefined;
    }
    const objectUrl = URL.createObjectURL(photoFile);
    setPhotoPreview(objectUrl);
    return () => {
      URL.revokeObjectURL(objectUrl);
    };
  }, [photoFile]);

  useEffect(() => {
    if (!editPhotoFile) {
      setEditPhotoPreview("");
      return undefined;
    }
    const objectUrl = URL.createObjectURL(editPhotoFile);
    setEditPhotoPreview(objectUrl);
    return () => {
      URL.revokeObjectURL(objectUrl);
    };
  }, [editPhotoFile]);

  const resetForm = () => {
    setFullName("");
    setPhonePrimary("");
    setEmail("");
    setJoiningDate("");
    setQualification("");
    setExperienceYears("");
    setSpecialization("");
    setPhoneAlternate("");
    setWhatsappNumber("");
    setAddress("");
    setCity("");
    setStateName("");
    setPincode("");
    setEmergencyContactName("");
    setEmergencyContactPhone("");
    setRelation("");
    setPhotoUrl("");
    setNotes("");
    setPreferredLanguage("");
    setEmploymentType("FULL_TIME");
    setSalaryType("FIXED");
    setIsProbation(false);
    setStatus("ACTIVE");
    setCreateLoginAccount(true);
    setPhotoFile(null);
    setPhotoPreview("");
  };

  const getTeacherInitials = (row) => {
    const label = row?.teacherProfile?.fullName || row?.username || "Teacher";
    const parts = String(label)
      .split(/\s+/)
      .filter(Boolean)
      .slice(0, 2);
    return (parts.map((part) => part[0]).join("") || "T").toUpperCase();
  };

  const loadAssignedStudents = async (teacher, page = 0) => {
    const targetTeacher = teacher || selectedTeacher;
    setSelectedTeacher(targetTeacher || null);
    if (!targetTeacher?.id) {
      setAssignedStudents([]);
      setAssignedStudentsPage(0);
      setAssignedStudentsTotal(0);
      return;
    }

    setLoadingStudents(true);
    try {
      const res = await listStudents({
        limit: ASSIGNED_STUDENTS_PAGE_SIZE,
        offset: page * ASSIGNED_STUDENTS_PAGE_SIZE,
        teacherUserId: targetTeacher.id
      });
      const data = res?.data;
      const items = data?.items || data || [];
      const total = data?.total ?? items.length;
      setAssignedStudents(items);
      setAssignedStudentsPage(page);
      setAssignedStudentsTotal(total);
    } catch (err) {
      toast.error(getFriendlyErrorMessage(err) || "Failed to load assigned students");
      setAssignedStudents([]);
      setAssignedStudentsPage(0);
      setAssignedStudentsTotal(0);
    } finally {
      setLoadingStudents(false);
    }
  };

  const onCreate = async (e) => {
    e.preventDefault();
    setCreating(true);
    setError("");
    try {
      const res = await createTeacher({
        fullName,
        email,
        phonePrimary,
        joiningDate,
        qualification,
        experienceYears: experienceYears === "" ? null : Number(experienceYears),
        specialization,
        phoneAlternate,
        whatsappNumber,
        address,
        city,
        state: stateName,
        pincode,
        emergencyContactName,
        emergencyContactPhone,
        relation,
        photoUrl,
        notes,
        preferredLanguage,
        employmentType,
        salaryType,
        isProbation,
        status,
        createLoginAccount
      });

      const tempPassword = res?.data?.tempPassword;
      const createdTeacherId = res?.data?.user?.id;
      if (createdTeacherId && photoFile) {
        try {
          const up = await uploadTeacherPhoto(createdTeacherId, photoFile);
          const newPhotoUrl = up?.data?.photoUrl || up?.photoUrl || null;
          if (newPhotoUrl) {
            toast.success("Teacher created and photo uploaded.");
          }
        } catch (uploadErr) {
          toast.error(getFriendlyErrorMessage(uploadErr) || "Teacher created, but photo upload failed");
        }
      }
      if (tempPassword) {
        setTempPasswordDialog({ username: res?.data?.user?.username || fullName, tempPassword });
      } else if (!photoFile) {
        toast.success("Teacher created!");
      }

      resetForm();
      await load({ q, status: statusFilter });
    } catch (err) {
      setError(getFriendlyErrorMessage(err) || "Failed to create teacher.");
    } finally {
      setCreating(false);
    }
  };

  const onToggleActive = async (row) => {
    try {
      const nextActive = !row.isActive;
      await updateTeacher(row.id, {
        isActive: nextActive,
        status: nextActive ? "ACTIVE" : "INACTIVE"
      });
      await load({ q, status: statusFilter });
    } catch (err) {
      toast.error(getFriendlyErrorMessage(err) || "Update failed");
    }
  };

  const onOpenShiftStudents = async (row) => {
    setShiftSourceTeacher(row);
    setShiftTargetTeacherId("");
    setShiftError("");
    await loadAssignedStudents(row, 0);
  };

  const onSaveShiftStudents = async (e) => {
    e.preventDefault();
    if (!shiftSourceTeacher?.id || !shiftTargetTeacherId) {
      setShiftError("Please select a target teacher.");
      return;
    }

    setShiftSaving(true);
    setShiftError("");
    try {
      const res = await shiftTeacherStudents(shiftSourceTeacher.id, { targetTeacherId: shiftTargetTeacherId });
      toast.success(`Shifted ${res?.data?.shiftedCount ?? 0} students.`);
      setShiftSourceTeacher(null);
      setShiftTargetTeacherId("");
      await load({ q, status: statusFilter });
      setSelectedTeacher(null);
      setAssignedStudents([]);
      setAssignedStudentsPage(0);
      setAssignedStudentsTotal(0);
    } catch (err) {
      setShiftError(getFriendlyErrorMessage(err) || "Failed to shift students.");
    } finally {
      setShiftSaving(false);
    }
  };

  const onEdit = (row) => {
    setEditingTeacher(mapTeacherToForm(row));
  };

  const onCancelEdit = () => {
    setEditingTeacher(null);
    setEditPhotoFile(null);
  };

  const onView = (row) => {
    setViewTeacher(mapTeacherToForm(row));
  };

  const onSaveEdit = async (row) => {
    if (!editingTeacher) return;
    setEditSaving(true);
    try {
      await updateTeacher(row.id, {
        fullName: editingTeacher.fullName,
        phonePrimary: editingTeacher.phonePrimary,
        email: editingTeacher.email,
        joiningDate: editingTeacher.joiningDate,
        qualification: editingTeacher.qualification,
        experienceYears: editingTeacher.experienceYears === "" ? null : Number(editingTeacher.experienceYears),
        specialization: editingTeacher.specialization,
        phoneAlternate: editingTeacher.phoneAlternate,
        whatsappNumber: editingTeacher.whatsappNumber,
        address: editingTeacher.address,
        city: editingTeacher.city,
        state: editingTeacher.state,
        pincode: editingTeacher.pincode,
        emergencyContactName: editingTeacher.emergencyContactName,
        emergencyContactPhone: editingTeacher.emergencyContactPhone,
        relation: editingTeacher.relation,
        photoUrl: editingTeacher.photoUrl,
        notes: editingTeacher.notes,
        preferredLanguage: editingTeacher.preferredLanguage,
        employmentType: editingTeacher.employmentType,
        salaryType: editingTeacher.salaryType,
        isProbation: editingTeacher.isProbation,
        status: editingTeacher.status
      });

      if (editPhotoFile) {
        const up = await uploadTeacherPhoto(row.id, editPhotoFile);
        const newPhotoUrl = up?.data?.photoUrl || up?.photoUrl || null;
        if (newPhotoUrl) {
          setEditingTeacher((prev) => (prev ? { ...prev, photoUrl: newPhotoUrl } : prev));
        }
      }

      setEditingTeacher(null);
      setEditPhotoFile(null);
      await load({ q, status: statusFilter });
    } catch (err) {
      toast.error(getFriendlyErrorMessage(err) || "Update failed");
    } finally {
      setEditSaving(false);
    }
  };

  const onResetPassword = async (row) => {
    try {
      const res = await resetTeacherPassword(row.id, { mustChangePassword: true });
      const username = res?.data?.username || row?.username || "";
      const tempPassword = res?.data?.tempPassword;
      if (tempPassword) {
        setTempPasswordDialog({ username, tempPassword });
      } else {
        toast.success("Password reset successful.");
      }
    } catch (err) {
      toast.error(getFriendlyErrorMessage(err) || "Password reset failed");
    }
  };

  const columns = [
    {
      key: "photo",
      header: "Photo",
      render: (r) => {
        const src = resolvePhotoUrl(r?.teacherProfile?.photoUrl);
        const label = r?.teacherProfile?.fullName || r?.username || "Teacher";
        return src ? (
          <div style={photoFrameStyle}>
            <img src={src} alt={label} style={buildPhotoStyle(52)} />
          </div>
        ) : (
          <div
            style={{
              ...photoFrameStyle,
              width: 68,
              height: 68,
              padding: 0,
              color: "var(--color-text-secondary)",
              fontSize: 14,
              fontWeight: 800
            }}
          >
            {getTeacherInitials(r)}
          </div>
        );
      }
    },
    {
      key: "username",
      header: "Code",
      render: (r) => (r?.username || "")
    },
    {
      key: "name",
      header: "Name",
      render: (r) => (r?.teacherProfile?.fullName || "")
    },
    {
      key: "phone",
      header: "Phone",
      render: (r) => (r?.teacherProfile?.phonePrimary || "")
    },
    {
      key: "email",
      header: "Email",
      render: (r) => (r?.email || "")
    },
    {
      key: "status",
      header: "Status",
      render: (r) => (r?.teacherProfile?.status ? String(r.teacherProfile.status) : (r?.isActive ? "ACTIVE" : "INACTIVE"))
    },
    {
      key: "actions",
      header: "Actions",
      render: (r) => (
        <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
          <button className="button secondary" style={{ width: "auto" }} onClick={() => onView(r)}>
            View
          </button>
          <button className="button secondary" style={{ width: "auto" }} onClick={() => onEdit(r)}>
            Edit
          </button>
          <button className="button secondary" style={{ width: "auto" }} onClick={() => onToggleActive(r)}>
            {r?.isActive ? "Suspend" : "Activate"}
          </button>
          <button className="button secondary" style={{ width: "auto" }} onClick={() => void loadAssignedStudents(r)}>
            View Students
          </button>
          <button className="button secondary" style={{ width: "auto" }} onClick={() => void onOpenShiftStudents(r)}>
            Shift Students
          </button>
          <button className="button secondary" style={{ width: "auto" }} onClick={() => onResetPassword(r)}>
            Reset Password
          </button>
        </div>
      )
    }
  ];

  const selectedTeacherLabel = selectedTeacher
    ? `${selectedTeacher?.teacherProfile?.fullName || selectedTeacher?.username || "Teacher"} (${selectedTeacher?.username || ""})`.trim()
    : "";
  const createPhotoPreviewSrc = photoPreview || resolvePhotoUrl(photoUrl);
  const createPhotoPreviewLabel = photoPreview ? "Selected Photo" : "Photo Preview";

  if (loading && !rows.length) {
    return <SkeletonLoader variant="table" rows={6} />;
  }

  return (
    <section style={{ display: "grid", gap: 12 }}>
      <PageHeader title="Teachers" subtitle="Create and manage teachers for this center." />

      {error ? (
        <div className="card">
          <p className="error">{error}</p>
        </div>
      ) : null}

      {tempPasswordDialog ? (
        <div className="card" style={{ display: "grid", gap: 10, maxWidth: 560 }}>
          <div style={{ display: "flex", justifyContent: "space-between", gap: 10, flexWrap: "wrap" }}>
            <div>
              <div style={{ fontWeight: 800 }}>Temporary Password</div>
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
            <div style={{ fontWeight: 700 }}>{tempPasswordDialog.tempPassword}</div>
          </div>

          <div style={{ display: "flex", gap: 10, flexWrap: "wrap" }}>
            <button
              className="button secondary"
              style={{ width: "auto" }}
              onClick={async () => {
                const text = tempPasswordDialog.tempPassword;
                try {
                  await navigator.clipboard.writeText(text);
                  toast.success("Copied!");
                } catch {
                  toast("Could not copy to clipboard");
                }
              }}
            >
              Copy
            </button>
          </div>
        </div>
      ) : null}

      <form className="card" onSubmit={onCreate} style={{ display: "grid", gap: 10, maxWidth: 920 }}>
        <h3 style={{ marginTop: 0 }}>Teachers</h3>

        <div style={{ fontSize: 12, fontWeight: 700, color: "var(--color-text-muted)", textTransform: "uppercase" }}>Basic</div>

        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(180px, 1fr))", gap: 10 }}>
          <label>
            Teacher Code
            <input className="input" value="Auto-generated" readOnly disabled />
          </label>
          <label>
            Full Name
            <input className="input" value={fullName} onChange={(e) => setFullName(e.target.value)} placeholder="Teacher name" required />
          </label>
          <label>
            Phone
            <input className="input" value={phonePrimary} onChange={(e) => setPhonePrimary(e.target.value)} placeholder="9999999999" />
          </label>
          <label>
            Email (optional)
            <input className="input" value={email} onChange={(e) => setEmail(e.target.value)} placeholder="name@example.com" />
          </label>
          <label>
            Joining Date
            <input className="input" type="date" value={joiningDate} onChange={(e) => setJoiningDate(e.target.value)} />
          </label>
          <label>
            Qualification
            <input className="input" value={qualification} onChange={(e) => setQualification(e.target.value)} placeholder="B.Ed / M.Sc" />
          </label>
          <label>
            Experience (years)
            <input className="input" type="number" min="0" value={experienceYears} onChange={(e) => setExperienceYears(e.target.value)} placeholder="2" />
          </label>
          <label>
            Specialization
            <input className="input" value={specialization} onChange={(e) => setSpecialization(e.target.value)} placeholder="Mental Math" />
          </label>
          <label>
            Preferred Language
            <input className="input" value={preferredLanguage} onChange={(e) => setPreferredLanguage(e.target.value)} placeholder="English" />
          </label>
          <label>
            Status
            <select className="select" value={status} onChange={(e) => setStatus(e.target.value)}>
              <option value="ACTIVE">ACTIVE</option>
              <option value="INACTIVE">INACTIVE</option>
              <option value="ARCHIVED">ARCHIVED</option>
            </select>
          </label>
          <label>
            Employment Type
            <select className="select" value={employmentType} onChange={(e) => setEmploymentType(e.target.value)}>
              <option value="FULL_TIME">Full-time</option>
              <option value="PART_TIME">Part-time</option>
            </select>
          </label>
          <label>
            Salary Type
            <select className="select" value={salaryType} onChange={(e) => setSalaryType(e.target.value)}>
              <option value="FIXED">Fixed</option>
              <option value="HOURLY">Hourly</option>
            </select>
          </label>
          <label style={{ display: "flex", gap: 8, alignItems: "center", marginTop: 22 }}>
            <input type="checkbox" checked={isProbation} onChange={(e) => setIsProbation(e.target.checked)} />
            Is probation
          </label>
          <label style={{ display: "flex", gap: 8, alignItems: "center", marginTop: 22 }}>
            <input type="checkbox" checked={createLoginAccount} onChange={(e) => setCreateLoginAccount(e.target.checked)} />
            Create login account
          </label>
        </div>

        <div style={{ fontSize: 12, fontWeight: 700, color: "var(--color-text-muted)", textTransform: "uppercase", marginTop: 6 }}>Contact</div>
        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(180px, 1fr))", gap: 10 }}>
          <label>
            Alternate Phone
            <input className="input" value={phoneAlternate} onChange={(e) => setPhoneAlternate(e.target.value)} placeholder="9876543210" />
          </label>
          <label>
            WhatsApp Number
            <input className="input" value={whatsappNumber} onChange={(e) => setWhatsappNumber(e.target.value)} placeholder="9876543210" />
          </label>
          <label>
            Address
            <input className="input" value={address} onChange={(e) => setAddress(e.target.value)} placeholder="Street / Area" />
          </label>
          <label>
            City
            <input className="input" value={city} onChange={(e) => setCity(e.target.value)} placeholder="City" />
          </label>
          <label>
            State
            <input className="input" value={stateName} onChange={(e) => setStateName(e.target.value)} placeholder="State" />
          </label>
          <label>
            Pincode
            <input className="input" value={pincode} onChange={(e) => setPincode(e.target.value)} placeholder="400001" />
          </label>
        </div>

        <div style={{ fontSize: 12, fontWeight: 700, color: "var(--color-text-muted)", textTransform: "uppercase", marginTop: 6 }}>Emergency</div>
        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(180px, 1fr))", gap: 10 }}>
          <label>
            Emergency Contact Name
            <input className="input" value={emergencyContactName} onChange={(e) => setEmergencyContactName(e.target.value)} placeholder="Contact person" />
          </label>
          <label>
            Emergency Contact Phone
            <input className="input" value={emergencyContactPhone} onChange={(e) => setEmergencyContactPhone(e.target.value)} placeholder="9999999999" />
          </label>
          <label>
            Relation
            <input className="input" value={relation} onChange={(e) => setRelation(e.target.value)} placeholder="Spouse / Parent" />
          </label>
        </div>

        <div style={{ fontSize: 12, fontWeight: 700, color: "var(--color-text-muted)", textTransform: "uppercase", marginTop: 6 }}>Profile</div>
        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(180px, 1fr))", gap: 10 }}>
          <label>
            Photo URL
            <input className="input" value={photoUrl} onChange={(e) => setPhotoUrl(e.target.value)} placeholder="https://..." />
          </label>
          <label>
            Photo Upload
            <input
              className="input"
              type="file"
              accept="image/png,image/jpg,image/jpeg"
              onChange={(e) => setPhotoFile(e.target.files && e.target.files[0] ? e.target.files[0] : null)}
            />
          </label>
          {createPhotoPreviewSrc ? (
            <div style={{ gridColumn: "1 / -1", display: "grid", gap: 6 }}>
              <div style={{ fontSize: 12, color: "var(--color-text-muted)" }}>{createPhotoPreviewLabel}</div>
              <div style={photoFrameStyle}>
                <img src={createPhotoPreviewSrc} alt="Teacher selected" style={buildPhotoStyle(160, "contain")} />
              </div>
            </div>
          ) : null}
          <label style={{ gridColumn: "1 / -1" }}>
            Notes
            <textarea className="input" value={notes} onChange={(e) => setNotes(e.target.value)} placeholder="Additional notes" rows={3} />
          </label>
        </div>

        <div style={{ display: "flex", gap: 10, alignItems: "center" }}>
          <button className="button" style={{ width: "auto" }} disabled={creating}>
            {creating ? "Creating..." : "Create Teacher"}
          </button>
          <button type="button" className="button secondary" style={{ width: "auto" }} onClick={resetForm} disabled={creating}>
            Reset
          </button>
        </div>
      </form>

      <div className="card" style={{ display: "grid", gap: 10 }}>
        <div>
          <h3 style={{ margin: 0 }}>Teacher List</h3>
          <div style={{ fontSize: 12, color: "var(--color-text-muted)" }}>Search and filter teachers.</div>
        </div>

        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(180px, 1fr))", gap: 10, alignItems: "end" }}>
          <label>
            Search name or phone
            <input className="input" value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search name or phone" />
          </label>
          <label>
            All Status
            <select className="select" value={statusFilter} onChange={(e) => setStatusFilter(e.target.value)}>
              <option value="">All</option>
              <option value="ACTIVE">ACTIVE</option>
              <option value="INACTIVE">INACTIVE</option>
              <option value="ARCHIVED">ARCHIVED</option>
            </select>
          </label>
          <button
            type="button"
            className="button secondary"
            style={{ width: "auto" }}
            onClick={() => void load({ q, status: statusFilter })}
          >
            Refresh
          </button>
        </div>
      </div>

      <DataTable
        columns={columns}
        rows={rows}
        keyField="id"
      />

      {viewTeacher ? (
        <div className="card" style={{ display: "grid", gap: 10, maxWidth: 920 }}>
          <div style={{ display: "flex", justifyContent: "space-between", gap: 10, flexWrap: "wrap" }}>
            <div>
              <h3 style={{ margin: 0 }}>View Teacher</h3>
              <div style={{ fontSize: 12, color: "var(--color-text-muted)" }}>Read-only teacher details.</div>
            </div>
            <button className="button secondary" style={{ width: "auto" }} onClick={() => setViewTeacher(null)}>
              Close
            </button>
          </div>

          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(220px, 1fr))", gap: 10 }}>
            <label>Teacher Code<input className="input" value={viewTeacher.username || ""} readOnly /></label>
            <label>Full Name<input className="input" value={viewTeacher.fullName || ""} readOnly /></label>
            <label>Phone<input className="input" value={viewTeacher.phonePrimary || ""} readOnly /></label>
            <label>Email<input className="input" value={viewTeacher.email || ""} readOnly /></label>
            <label>Joining Date<input className="input" value={viewTeacher.joiningDate || ""} readOnly /></label>
            <label>Qualification<input className="input" value={viewTeacher.qualification || ""} readOnly /></label>
            <label>Experience Years<input className="input" value={viewTeacher.experienceYears === "" ? "" : String(viewTeacher.experienceYears)} readOnly /></label>
            <label>Specialization<input className="input" value={viewTeacher.specialization || ""} readOnly /></label>
            <label>Preferred Language<input className="input" value={viewTeacher.preferredLanguage || ""} readOnly /></label>
            <label>Status<input className="input" value={viewTeacher.status || ""} readOnly /></label>
            <label>Employment Type<input className="input" value={viewTeacher.employmentType || ""} readOnly /></label>
            <label>Salary Type<input className="input" value={viewTeacher.salaryType || ""} readOnly /></label>
            <label>Alternate Phone<input className="input" value={viewTeacher.phoneAlternate || ""} readOnly /></label>
            <label>WhatsApp Number<input className="input" value={viewTeacher.whatsappNumber || ""} readOnly /></label>
            <label>Address<input className="input" value={viewTeacher.address || ""} readOnly /></label>
            <label>City<input className="input" value={viewTeacher.city || ""} readOnly /></label>
            <label>State<input className="input" value={viewTeacher.state || ""} readOnly /></label>
            <label>Pincode<input className="input" value={viewTeacher.pincode || ""} readOnly /></label>
            <label>Emergency Contact Name<input className="input" value={viewTeacher.emergencyContactName || ""} readOnly /></label>
            <label>Emergency Contact Phone<input className="input" value={viewTeacher.emergencyContactPhone || ""} readOnly /></label>
            <label>Relation<input className="input" value={viewTeacher.relation || ""} readOnly /></label>
            <label>Photo URL<input className="input" value={viewTeacher.photoUrl || ""} readOnly /></label>
            <label>Is Probation<input className="input" value={viewTeacher.isProbation ? "Yes" : "No"} readOnly /></label>
            <label style={{ gridColumn: "1 / -1" }}>Notes<textarea className="input" value={viewTeacher.notes || ""} readOnly rows={3} /></label>
            {resolvePhotoUrl(viewTeacher.photoUrl) ? (
              <div style={{ gridColumn: "1 / -1", display: "grid", gap: 6 }}>
                <div style={{ fontSize: 12, color: "var(--color-text-muted)" }}>Photo Preview</div>
                <div style={photoFrameStyle}>
                  <img
                    src={resolvePhotoUrl(viewTeacher.photoUrl)}
                    alt="Teacher"
                    style={buildPhotoStyle(160, "contain")}
                  />
                </div>
              </div>
            ) : null}
          </div>
        </div>
      ) : null}

      {editingTeacher ? (
        <form className="card" onSubmit={(e) => { e.preventDefault(); void onSaveEdit(editingTeacher); }} style={{ display: "grid", gap: 10, maxWidth: 920 }}>
          <div style={{ display: "flex", justifyContent: "space-between", gap: 10, flexWrap: "wrap" }}>
            <div>
              <h3 style={{ margin: 0 }}>Edit Teacher</h3>
              <div style={{ fontSize: 12, color: "var(--color-text-muted)" }}>Update all teacher details.</div>
            </div>
            <button type="button" className="button secondary" style={{ width: "auto" }} onClick={onCancelEdit}>
              Close
            </button>
          </div>

          <div style={{ fontSize: 12, fontWeight: 700, color: "var(--color-text-muted)", textTransform: "uppercase" }}>Basic</div>
          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(180px, 1fr))", gap: 10 }}>
            <label>
              Teacher Code
              <input className="input" value={editingTeacher.username || ""} readOnly disabled />
            </label>
            <label>
              Full Name
              <input className="input" value={editingTeacher.fullName} onChange={(e) => setEditingTeacher((prev) => ({ ...prev, fullName: e.target.value }))} required />
            </label>
            <label>
              Phone
              <input className="input" value={editingTeacher.phonePrimary} onChange={(e) => setEditingTeacher((prev) => ({ ...prev, phonePrimary: e.target.value }))} />
            </label>
            <label>
              Email
              <input className="input" value={editingTeacher.email} onChange={(e) => setEditingTeacher((prev) => ({ ...prev, email: e.target.value }))} />
            </label>
            <label>
              Joining Date
              <input className="input" type="date" value={editingTeacher.joiningDate} onChange={(e) => setEditingTeacher((prev) => ({ ...prev, joiningDate: e.target.value }))} />
            </label>
            <label>
              Qualification
              <input className="input" value={editingTeacher.qualification} onChange={(e) => setEditingTeacher((prev) => ({ ...prev, qualification: e.target.value }))} />
            </label>
            <label>
              Experience (years)
              <input className="input" type="number" min="0" value={editingTeacher.experienceYears} onChange={(e) => setEditingTeacher((prev) => ({ ...prev, experienceYears: e.target.value }))} />
            </label>
            <label>
              Specialization
              <input className="input" value={editingTeacher.specialization} onChange={(e) => setEditingTeacher((prev) => ({ ...prev, specialization: e.target.value }))} />
            </label>
            <label>
              Preferred Language
              <input className="input" value={editingTeacher.preferredLanguage} onChange={(e) => setEditingTeacher((prev) => ({ ...prev, preferredLanguage: e.target.value }))} />
            </label>
            <label>
              Status
              <select className="select" value={editingTeacher.status} onChange={(e) => setEditingTeacher((prev) => ({ ...prev, status: e.target.value }))}>
                <option value="ACTIVE">ACTIVE</option>
                <option value="INACTIVE">INACTIVE</option>
                <option value="ARCHIVED">ARCHIVED</option>
              </select>
            </label>
            <label>
              Employment Type
              <select className="select" value={editingTeacher.employmentType} onChange={(e) => setEditingTeacher((prev) => ({ ...prev, employmentType: e.target.value }))}>
                <option value="FULL_TIME">Full-time</option>
                <option value="PART_TIME">Part-time</option>
              </select>
            </label>
            <label>
              Salary Type
              <select className="select" value={editingTeacher.salaryType} onChange={(e) => setEditingTeacher((prev) => ({ ...prev, salaryType: e.target.value }))}>
                <option value="FIXED">Fixed</option>
                <option value="HOURLY">Hourly</option>
              </select>
            </label>
            <label style={{ display: "flex", gap: 8, alignItems: "center", marginTop: 22 }}>
              <input type="checkbox" checked={editingTeacher.isProbation} onChange={(e) => setEditingTeacher((prev) => ({ ...prev, isProbation: e.target.checked }))} />
              Is probation
            </label>
          </div>

          <div style={{ fontSize: 12, fontWeight: 700, color: "var(--color-text-muted)", textTransform: "uppercase", marginTop: 6 }}>Contact</div>
          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(180px, 1fr))", gap: 10 }}>
            <label>
              Alternate Phone
              <input className="input" value={editingTeacher.phoneAlternate} onChange={(e) => setEditingTeacher((prev) => ({ ...prev, phoneAlternate: e.target.value }))} />
            </label>
            <label>
              WhatsApp Number
              <input className="input" value={editingTeacher.whatsappNumber} onChange={(e) => setEditingTeacher((prev) => ({ ...prev, whatsappNumber: e.target.value }))} />
            </label>
            <label>
              Address
              <input className="input" value={editingTeacher.address} onChange={(e) => setEditingTeacher((prev) => ({ ...prev, address: e.target.value }))} />
            </label>
            <label>
              City
              <input className="input" value={editingTeacher.city} onChange={(e) => setEditingTeacher((prev) => ({ ...prev, city: e.target.value }))} />
            </label>
            <label>
              State
              <input className="input" value={editingTeacher.state} onChange={(e) => setEditingTeacher((prev) => ({ ...prev, state: e.target.value }))} />
            </label>
            <label>
              Pincode
              <input className="input" value={editingTeacher.pincode} onChange={(e) => setEditingTeacher((prev) => ({ ...prev, pincode: e.target.value }))} />
            </label>
          </div>

          <div style={{ fontSize: 12, fontWeight: 700, color: "var(--color-text-muted)", textTransform: "uppercase", marginTop: 6 }}>Emergency</div>
          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(180px, 1fr))", gap: 10 }}>
            <label>
              Emergency Contact Name
              <input className="input" value={editingTeacher.emergencyContactName} onChange={(e) => setEditingTeacher((prev) => ({ ...prev, emergencyContactName: e.target.value }))} />
            </label>
            <label>
              Emergency Contact Phone
              <input className="input" value={editingTeacher.emergencyContactPhone} onChange={(e) => setEditingTeacher((prev) => ({ ...prev, emergencyContactPhone: e.target.value }))} />
            </label>
            <label>
              Relation
              <input className="input" value={editingTeacher.relation} onChange={(e) => setEditingTeacher((prev) => ({ ...prev, relation: e.target.value }))} />
            </label>
          </div>

          <div style={{ fontSize: 12, fontWeight: 700, color: "var(--color-text-muted)", textTransform: "uppercase", marginTop: 6 }}>Profile</div>
          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(180px, 1fr))", gap: 10 }}>
            <label>
              Photo URL
              <input className="input" value={editingTeacher.photoUrl} onChange={(e) => setEditingTeacher((prev) => ({ ...prev, photoUrl: e.target.value }))} />
            </label>
            <label>
              Photo Upload
              <input
                className="input"
                type="file"
                accept="image/png,image/jpg,image/jpeg"
                onChange={(e) => setEditPhotoFile(e.target.files && e.target.files[0] ? e.target.files[0] : null)}
              />
            </label>
            <label style={{ gridColumn: "1 / -1" }}>
              Notes
              <textarea className="input" value={editingTeacher.notes} onChange={(e) => setEditingTeacher((prev) => ({ ...prev, notes: e.target.value }))} rows={3} />
            </label>
            {resolvePhotoUrl(editingTeacher.photoUrl) ? (
              <div style={{ gridColumn: "1 / -1", display: "grid", gap: 6 }}>
                <div style={{ fontSize: 12, color: "var(--color-text-muted)" }}>Current Photo</div>
                <div style={photoFrameStyle}>
                  <img
                    src={resolvePhotoUrl(editingTeacher.photoUrl)}
                    alt="Teacher"
                    style={buildPhotoStyle(160, "contain")}
                  />
                </div>
              </div>
            ) : null}
            {editPhotoFile ? (
              <div style={{ gridColumn: "1 / -1", display: "grid", gap: 6 }}>
                <div style={{ fontSize: 12, color: "var(--color-text-muted)" }}>Selected New Photo</div>
                <div style={photoFrameStyle}>
                  <img
                    src={editPhotoPreview}
                    alt="Teacher new"
                    style={buildPhotoStyle(160, "contain")}
                  />
                </div>
              </div>
            ) : null}
          </div>

          <div style={{ display: "flex", gap: 10, alignItems: "center" }}>
            <button type="submit" className="button" style={{ width: "auto" }} disabled={editSaving}>
              {editSaving ? "Saving..." : "Save Changes"}
            </button>
            <button type="button" className="button secondary" style={{ width: "auto" }} disabled={editSaving} onClick={onCancelEdit}>
              Cancel
            </button>
          </div>
        </form>
      ) : null}

      {selectedTeacher ? (
        <div className="card" style={{ display: "grid", gap: 10 }}>
          <div>
            <h3 style={{ margin: 0 }}>Students Assigned to Teacher</h3>
            <div style={{ fontSize: 12, color: "var(--color-text-muted)" }}>Active enrollments for this teacher.</div>
            <div style={{ fontSize: 12, marginTop: 6 }}>{selectedTeacherLabel}</div>
            <div style={{ fontSize: 12, color: "var(--color-text-muted)", marginTop: 6 }}>
              Showing {assignedStudents.length} of {assignedStudentsTotal} students
            </div>
          </div>

          {loadingStudents ? <SkeletonLoader variant="list" rows={3} /> : null}

          <DataTable
            columns={[
              { key: "admissionNo", header: "Student Code", render: (r) => r?.admissionNo || "" },
              {
                key: "studentName",
                header: "Student Name",
                render: (r) => `${r?.firstName || ""} ${r?.lastName || ""}`.trim()
              },
              { key: "course", header: "Course", render: (r) => r?.level?.name || "" },
              { key: "level", header: "Level", render: (r) => (r?.level?.rank != null ? String(r.level.rank) : "") }
            ]}
            rows={assignedStudents}
            keyField="id"
          />

          <div style={{ display: "flex", alignItems: "center", gap: 10, flexWrap: "wrap" }}>
            <button
              className="button secondary"
              style={{ width: "auto" }}
              disabled={loadingStudents || assignedStudentsPage === 0}
              onClick={() => void loadAssignedStudents(selectedTeacher, assignedStudentsPage - 1)}
            >
              Prev
            </button>
            <div style={{ fontSize: 12, color: "var(--color-text-muted)" }}>
              Page {assignedStudentsPage + 1} of {Math.max(1, Math.ceil(assignedStudentsTotal / ASSIGNED_STUDENTS_PAGE_SIZE))}
            </div>
            <button
              className="button secondary"
              style={{ width: "auto" }}
              disabled={loadingStudents || (assignedStudentsPage + 1) * ASSIGNED_STUDENTS_PAGE_SIZE >= assignedStudentsTotal}
              onClick={() => void loadAssignedStudents(selectedTeacher, assignedStudentsPage + 1)}
            >
              Next
            </button>
          </div>
        </div>
      ) : null}

      {shiftSourceTeacher ? (
        <form className="card" onSubmit={onSaveShiftStudents} style={{ display: "grid", gap: 10 }}>
          <div style={{ display: "flex", justifyContent: "space-between", gap: 10, flexWrap: "wrap", alignItems: "center" }}>
            <div>
              <h3 style={{ margin: 0 }}>Shift Students To Another Teacher</h3>
              <div style={{ fontSize: 12, color: "var(--color-text-muted)" }}>
                Source: {shiftSourceTeacher?.teacherProfile?.fullName || shiftSourceTeacher?.username || "Teacher"}
              </div>
            </div>
            <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
              <button
                type="button"
                className="button secondary"
                style={{ width: "auto" }}
                onClick={() => {
                  setShiftSourceTeacher(null);
                  setShiftTargetTeacherId("");
                  setShiftError("");
                }}
                disabled={shiftSaving}
              >
                Cancel
              </button>
              <button className="button" style={{ width: "auto" }} disabled={shiftSaving || !shiftTargetTeacherId}>
                {shiftSaving ? "Shifting..." : "Shift Now"}
              </button>
            </div>
          </div>

          {shiftError ? <p className="error">{shiftError}</p> : null}

          <label>
            Target Teacher
            <select className="select" value={shiftTargetTeacherId} onChange={(e) => setShiftTargetTeacherId(e.target.value)}>
              <option value="">Select</option>
              {rows
                .filter((t) => t?.id !== shiftSourceTeacher?.id && t?.isActive)
                .map((t) => (
                  <option key={t.id} value={t.id}>
                    {t?.teacherProfile?.fullName || t?.username || t?.email}
                  </option>
                ))}
            </select>
          </label>
        </form>
      ) : null}
    </section>
  );
}

export { CenterTeachersPage };
