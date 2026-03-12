import { useEffect, useMemo, useState } from "react";
import { useLocation, useNavigate, useParams } from "react-router-dom";
import toast from "react-hot-toast";
import {
  createBusinessPartner,
  getBusinessPartner,
  uploadBusinessPartnerLogo,
  updateBusinessPartner,
  getBPPracticeEntitlements,
  updateBPPracticeEntitlements,
  getBPPracticeUsage
} from "../../services/businessPartnersService";
import { listCourses } from "../../services/coursesService";
import { LoadingState } from "../../components/LoadingState";
import { getFriendlyErrorMessage } from "../../utils/apiErrors";
import { resolveAssetUrl } from "../../utils/assetUrls";

function splitComma(value) {
  if (!value) {
    return [];
  }

  return String(value)
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean);
}

function joinComma(values) {
  if (!Array.isArray(values)) {
    return "";
  }
  return values
    .map((v) => (typeof v === "string" ? v : ""))
    .map((v) => v.trim())
    .filter(Boolean)
    .join(", ");
}

function toDateInputValue(value) {
  if (!value) {
    return "";
  }

  try {
    return new Date(value).toISOString().slice(0, 10);
  } catch {
    return "";
  }
}

function SuperadminBusinessPartnerProfilePage() {
  const navigate = useNavigate();
  const { id } = useParams();
  const location = useLocation();

  const mode = useMemo(() => {
    if (!id) {
      return "create";
    }

    const queryMode = new URLSearchParams(location.search).get("mode");
    return queryMode === "edit" ? "edit" : "view";
  }, [id, location.search]);

  const readOnly = mode === "view";

  const [loading, setLoading] = useState(Boolean(id));
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");

  const [logoFile, setLogoFile] = useState(null);
  const [logoPreviewUrl, setLogoPreviewUrl] = useState("");
  const [logoUploading, setLogoUploading] = useState(false);

  const [initialForm, setInitialForm] = useState(null);
  const [form, setForm] = useState(() => ({
    code: "",
    name: "",
    displayName: "",
    status: "ACTIVE",
    logoUrl: "",

    primaryPhone: "",
    alternatePhone: "",
    contactEmail: "",
    supportEmail: "",
    whatsappEnabled: false,

    addressLine1: "",
    addressLine2: "",
    city: "",
    district: "",
    state: "",
    country: "India",
    pincode: "",

    operationalStates: "",
    operationalDistricts: "",
    operationalCities: "",

    businessType: "INDIVIDUAL",
    gstNumber: "",
    panNumber: "",
    onboardingDate: "",

    primaryBrandColor: "#6c7cff",
    secondaryBrandColor: "#23c1ff",
    websiteUrl: "",
    facebookUrl: "",
    instagramUrl: "",
    youtubeUrl: "",

    accessMode: "ALL",
    subscriptionStatus: "ACTIVE",
    subscriptionType: "TRIAL",
    subscriptionExpiresAt: "",
    legacyLoginEnabled: false,
    legacyUsername: "",
    legacyPassword: "",
    legacyPrograms: "",

    adminPassword: "",
    trialDays: "30",
    courseIds: []
  }));

  const [allCourses, setAllCourses] = useState([]);

  // Practice feature entitlements state
  const [practiceEntitlements, setPracticeEntitlements] = useState({
    practice: { isEnabled: false, totalSeats: 0 },
    abacusPractice: { isEnabled: false, totalSeats: 0 }
  });
  const [practiceUsage, setPracticeUsage] = useState(null);
  const [practiceLoading, setPracticeLoading] = useState(false);
  const [practiceSaving, setPracticeSaving] = useState(false);

  const resolvedLogoPreviewUrl = logoPreviewUrl || resolveAssetUrl(form.logoUrl);

  useEffect(() => {
    listCourses({ limit: 200, offset: 0 })
      .then((res) => setAllCourses(res?.data?.items || []))
      .catch(() => setAllCourses([]));
  }, []);

  // Load practice entitlements when viewing/editing an existing partner
  useEffect(() => {
    if (!id) return;

    async function loadPractice() {
      setPracticeLoading(true);
      try {
        const [entRes, usageRes] = await Promise.all([
          getBPPracticeEntitlements(id),
          getBPPracticeUsage(id)
        ]);

        const entData = entRes?.data || {};
        setPracticeEntitlements({
          practice: {
            isEnabled: entData.PRACTICE?.isEnabled || false,
            totalSeats: entData.PRACTICE?.totalSeats || 0
          },
          abacusPractice: {
            isEnabled: entData.ABACUS_PRACTICE?.isEnabled || false,
            totalSeats: entData.ABACUS_PRACTICE?.totalSeats || 0
          }
        });

        setPracticeUsage(usageRes?.data?.usage || null);
      } catch (err) {
        if (import.meta.env.DEV) console.error("Failed to load practice entitlements:", err);
      } finally {
        setPracticeLoading(false);
      }
    }

    loadPractice();
  }, [id]);

  const handleSavePracticeEntitlements = async () => {
    if (!id) return;

    setPracticeSaving(true);
    try {
      const saveResp = await updateBPPracticeEntitlements({
        id,
        practice: practiceEntitlements.practice,
        abacusPractice: practiceEntitlements.abacusPractice
      });

      if (saveResp?.data?._meta?.unavailable) {
        toast("Practice entitlement feature is unavailable in this environment.");
        return;
      }

      // Reload usage
      const usageRes = await getBPPracticeUsage(id);
      setPracticeUsage(usageRes?.data?.usage || null);

      toast.success("Practice entitlements saved");
    } catch (err) {
      toast.error(getFriendlyErrorMessage(err) || "Failed to save practice entitlements");
    } finally {
      setPracticeSaving(false);
    }
  };

  useEffect(() => {
    if (!id) {
      const seed = { ...form };
      setInitialForm(seed);
      return;
    }

    let cancelled = false;

    async function load() {
      setLoading(true);
      setError("");
      try {
        const result = await getBusinessPartner(id);
        const partner = result?.data;

        const assignedCourseIds = (partner?.courseAccesses || []).map((ca) => ca.courseId || ca.course?.id).filter(Boolean);

        const next = {
          ...form,
          code: partner?.code || "",
          name: partner?.name || "",
          displayName: partner?.displayName || "",
          status: partner?.status || "ACTIVE",
          logoUrl: partner?.logoUrl || "",

          primaryPhone: partner?.primaryPhone || "",
          alternatePhone: partner?.alternatePhone || "",
          contactEmail: partner?.contactEmail || "",
          supportEmail: partner?.supportEmail || "",
          whatsappEnabled: Boolean(partner?.whatsappEnabled),

          addressLine1: partner?.address?.addressLine1 || "",
          addressLine2: partner?.address?.addressLine2 || "",
          city: partner?.address?.city || "",
          district: partner?.address?.district || "",
          state: partner?.address?.state || "",
          country: partner?.address?.country || "India",
          pincode: partner?.address?.pincode || "",

          operationalStates: joinComma(partner?.operationalStates?.map((s) => s.state) || []),
          operationalDistricts: joinComma(partner?.operationalDistricts?.map((d) => d.district) || []),
          operationalCities: joinComma(partner?.operationalCities?.map((c) => c.city) || []),

          businessType: partner?.businessType || "INDIVIDUAL",
          gstNumber: partner?.gstNumber || "",
          panNumber: partner?.panNumber || "",
          onboardingDate: toDateInputValue(partner?.onboardingDate),

          primaryBrandColor: partner?.primaryBrandColor || "#6c7cff",
          secondaryBrandColor: partner?.secondaryBrandColor || "#23c1ff",
          websiteUrl: partner?.websiteUrl || "",
          facebookUrl: partner?.facebookUrl || "",
          instagramUrl: partner?.instagramUrl || "",
          youtubeUrl: partner?.youtubeUrl || "",

          accessMode: partner?.accessMode || "ALL",
          subscriptionStatus: partner?.subscriptionStatus || "ACTIVE",
          subscriptionType: partner?.subscriptionExpiresAt ? "TRIAL" : "PERMANENT",
          subscriptionExpiresAt: toDateInputValue(partner?.subscriptionExpiresAt),
          legacyLoginEnabled: Boolean(partner?.legacyLoginEnabled),
          legacyUsername: partner?.legacyUsername || "",
          legacyPassword: "",
          legacyPrograms: joinComma(partner?.legacyPrograms?.map((p) => p.name) || []),

          adminPassword: "",
          trialDays: "30",
          courseIds: assignedCourseIds
        };

        if (!cancelled) {
          setForm(next);
          setInitialForm(next);
        }
      } catch (err) {
        if (!cancelled) {
          setError(getFriendlyErrorMessage(err) || "Failed to load business partner.");
        }
      } finally {
        if (!cancelled) {
          setLoading(false);
        }
      }
    }

    void load();
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [id]);

  const onChange = (key) => (e) => {
    const value = e?.target?.type === "checkbox" ? e.target.checked : e.target.value;
    setForm((p) => ({ ...p, [key]: value }));
  };

  const handleLogoFile = async (e) => {
    const file = e.target.files && e.target.files[0];
    if (!file) {
      return;
    }

    if (!file.type.startsWith("image/")) {
      toast.error("Please select a PNG/JPG image file.");
      return;
    }

    if (readOnly) {
      return;
    }

    // If we're editing an existing partner, upload immediately and store the returned URL.
    if (mode !== "create" && id) {
      setLogoUploading(true);
      try {
        const result = await uploadBusinessPartnerLogo({ id, file });
        const partner = result?.data;
        if (partner?.logoUrl) {
          setForm((p) => ({ ...p, logoUrl: partner.logoUrl }));
        }
        setLogoFile(null);
        if (logoPreviewUrl) {
          URL.revokeObjectURL(logoPreviewUrl);
          setLogoPreviewUrl("");
        }
      } catch (err) {
        setError(getFriendlyErrorMessage(err) || "Failed to upload logo.");
      } finally {
        setLogoUploading(false);
      }

      return;
    }

    // Create mode: keep the File in memory and show a local preview; upload after create.
    setLogoFile(file);
    const nextPreview = URL.createObjectURL(file);
    setLogoPreviewUrl((prev) => {
      if (prev) {
        try {
          URL.revokeObjectURL(prev);
        } catch {
          // ignore
        }
      }
      return nextPreview;
    });
  };

  const buildUpdatePayload = ({ omitLogoUrl = false } = {}) => {
    const payload = {
      name: form.name,
      displayName: form.displayName,
      status: form.status,
      ...(omitLogoUrl ? {} : { logoUrl: form.logoUrl }),

      primaryPhone: form.primaryPhone,
      alternatePhone: form.alternatePhone,
      contactEmail: form.contactEmail,
      supportEmail: form.supportEmail,
      whatsappEnabled: form.whatsappEnabled,

      businessType: form.businessType,
      gstNumber: form.gstNumber,
      panNumber: form.panNumber,
      onboardingDate: form.onboardingDate ? new Date(form.onboardingDate).toISOString() : null,

      primaryBrandColor: form.primaryBrandColor,
      secondaryBrandColor: form.secondaryBrandColor,
      websiteUrl: form.websiteUrl,
      facebookUrl: form.facebookUrl,
      instagramUrl: form.instagramUrl,
      youtubeUrl: form.youtubeUrl,

      accessMode: form.accessMode,
      subscriptionStatus: form.subscriptionStatus,
      subscriptionExpiresAt: form.subscriptionType === "PERMANENT"
        ? null
        : (form.subscriptionExpiresAt || null),

      operationalStates: splitComma(form.operationalStates),
      operationalDistricts: splitComma(form.operationalDistricts),
      operationalCities: splitComma(form.operationalCities),
      courseIds: form.courseIds
    };

    const addressHasAny =
      form.addressLine1 ||
      form.addressLine2 ||
      form.city ||
      form.district ||
      form.state ||
      form.pincode;

    if (addressHasAny) {
      payload.address = {
        addressLine1: form.addressLine1,
        addressLine2: form.addressLine2,
        city: form.city,
        district: form.district,
        state: form.state,
        country: form.country || "India",
        pincode: form.pincode
      };
    }

    return payload;
  };

  const handleReset = () => {
    if (initialForm) {
      setForm(initialForm);
      setError("");

      setLogoFile(null);
      setLogoUploading(false);
      if (logoPreviewUrl) {
        try {
          URL.revokeObjectURL(logoPreviewUrl);
        } catch {
          // ignore
        }
        setLogoPreviewUrl("");
      }
    }
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    setSaving(true);
    setError("");

    try {
      if (mode === "create") {
        const created = await createBusinessPartner({
          name: form.name,
          contactEmail: form.contactEmail,
          adminPassword: form.adminPassword,
          trialDays: Number(form.trialDays) || 30
        });

        const partnerId = created?.data?.businessPartner?.id;
        if (!partnerId) {
          throw new Error("Partner created but missing id");
        }

        if (logoFile) {
          const uploaded = await uploadBusinessPartnerLogo({ id: partnerId, file: logoFile });
          const uploadedPartner = uploaded?.data;
          if (uploadedPartner?.logoUrl) {
            setForm((p) => ({ ...p, logoUrl: uploadedPartner.logoUrl }));
          }
        }

        const updatePayload = buildUpdatePayload({ omitLogoUrl: Boolean(logoFile) });
        await updateBusinessPartner({ id: partnerId, data: updatePayload });

        navigate(`/superadmin/business-partners/${partnerId}?mode=view`);
        return;
      }

      if (mode === "edit" && id) {
        if (form.subscriptionType === "TRIAL" && !form.subscriptionExpiresAt) {
          setError("Subscription expiry date is required for Trial mode.");
          return;
        }

        const updatePayload = buildUpdatePayload();
        await updateBusinessPartner({ id, data: updatePayload });
        navigate(`/superadmin/business-partners/${id}?mode=view`);
      }
    } catch (err) {
      setError(getFriendlyErrorMessage(err) || "Failed to save business partner.");
    } finally {
      setSaving(false);
    }
  };

  if (loading) {
    return <LoadingState label="Loading business partner..." />;
  }

  return (
    <section style={{ display: "grid", gap: 12, maxWidth: 980 }}>
      <div>
        <h2 style={{ margin: 0 }}>Business Partner Profile</h2>
        <p style={{ margin: "6px 0 0", color: "var(--color-text-muted)", fontSize: 13 }}>
          Create, edit, and view partner profiles.
        </p>
      </div>

      {error ? <div className="card"><p className="error">{error}</p></div> : null}

      <form onSubmit={handleSubmit} style={{ display: "grid", gap: 12 }}>
        <div className="card" style={{ display: "grid", gap: 12 }}>
          <h3 style={{ margin: 0 }}>1) Core Identity</h3>
          <div style={{ display: "grid", gap: 10, gridTemplateColumns: "1fr 1fr" }}>

        {resolvedLogoPreviewUrl ? (
          <div className="card" style={{ display: "flex", gap: 12, alignItems: "center" }}>
            <img
              src={resolvedLogoPreviewUrl}
              alt="Business partner logo"
              style={{ width: 48, height: 48, borderRadius: 10, objectFit: "contain", background: "#fff" }}
            />
            <div style={{ display: "grid", gap: 4 }}>
              <div style={{ fontWeight: 700 }}>{form.displayName || form.name || "Business Partner"}</div>
              <div style={{ fontSize: 12, color: "var(--color-text-muted)" }}>Logo preview</div>
            </div>
          </div>
        ) : null}
            <label>
              Business Partner Code (immutable)
              <input className="input" value={form.code} disabled placeholder={mode === "create" ? "Auto-generated" : ""} />
            </label>
            <label>
              Business Partner Name
              <input className="input" value={form.name} onChange={onChange("name")} disabled={readOnly} required />
            </label>
            <label>
              Display Name
              <input className="input" value={form.displayName} onChange={onChange("displayName")} disabled={readOnly} />
            </label>
            <label>
              Status
              <select className="select" value={form.status} onChange={onChange("status")} disabled={readOnly}>
                <option value="ACTIVE">ACTIVE</option>
                <option value="INACTIVE">INACTIVE</option>
                <option value="SUSPENDED">SUSPENDED</option>
              </select>
            </label>
            <label>
              Logo Upload (PNG/JPG)
              <input className="input" type="file" accept="image/png,image/jpeg" onChange={handleLogoFile} disabled={readOnly || logoUploading || saving} />
            </label>
            <label>
              Logo URL (optional)
              <input className="input" placeholder="https://" value={form.logoUrl} onChange={onChange("logoUrl")} disabled={readOnly} />
            </label>
          </div>
        </div>

        <div className="card" style={{ display: "grid", gap: 12 }}>
          <h3 style={{ margin: 0 }}>2) Contact & Communication</h3>
          <div style={{ display: "grid", gap: 10, gridTemplateColumns: "1fr 1fr" }}>
            <label>
              Phone Primary
              <input className="input" value={form.primaryPhone} onChange={onChange("primaryPhone")} disabled={readOnly} />
            </label>
            <label>
              Phone Alternate
              <input className="input" value={form.alternatePhone} onChange={onChange("alternatePhone")} disabled={readOnly} />
            </label>
            <label>
              Email Official
              <input className="input" type="email" value={form.contactEmail} onChange={onChange("contactEmail")} disabled={readOnly} />
            </label>
            <label>
              Email Support
              <input className="input" type="email" value={form.supportEmail} onChange={onChange("supportEmail")} disabled={readOnly} />
            </label>
            <label style={{ display: "flex", alignItems: "center", gap: 8 }}>
              <input type="checkbox" checked={form.whatsappEnabled} onChange={onChange("whatsappEnabled")} disabled={readOnly} />
              WhatsApp Enabled
            </label>
          </div>
        </div>

        <div className="card" style={{ display: "grid", gap: 12 }}>
          <h3 style={{ margin: 0 }}>3) Address & Area Coverage</h3>
          <div style={{ display: "grid", gap: 10, gridTemplateColumns: "1fr 1fr" }}>
            <label>
              Address Line 1
              <input className="input" value={form.addressLine1} onChange={onChange("addressLine1")} disabled={readOnly} />
            </label>
            <label>
              Address Line 2
              <input className="input" value={form.addressLine2} onChange={onChange("addressLine2")} disabled={readOnly} />
            </label>
            <label>
              City
              <input className="input" value={form.city} onChange={onChange("city")} disabled={readOnly} />
            </label>
            <label>
              District
              <input className="input" value={form.district} onChange={onChange("district")} disabled={readOnly} />
            </label>
            <label>
              State
              <input className="input" value={form.state} onChange={onChange("state")} disabled={readOnly} />
            </label>
            <label>
              Country
              <input className="input" value={form.country} onChange={onChange("country")} disabled={readOnly} />
            </label>
            <label>
              Pincode
              <input className="input" value={form.pincode} onChange={onChange("pincode")} disabled={readOnly} />
            </label>
          </div>

          <div style={{ display: "grid", gap: 10 }}>
            <label>
              Operational States (comma-separated)
              <input className="input" placeholder="State1, State2" value={form.operationalStates} onChange={onChange("operationalStates")} disabled={readOnly} />
            </label>
            <label>
              Operational Districts (comma-separated)
              <input className="input" placeholder="District1, District2" value={form.operationalDistricts} onChange={onChange("operationalDistricts")} disabled={readOnly} />
            </label>
            <label>
              Operational Cities (comma-separated)
              <input className="input" placeholder="City1, City2" value={form.operationalCities} onChange={onChange("operationalCities")} disabled={readOnly} />
            </label>
          </div>
        </div>

        <div className="card" style={{ display: "grid", gap: 12 }}>
          <h3 style={{ margin: 0 }}>4) Business Details</h3>
          <div style={{ display: "grid", gap: 10, gridTemplateColumns: "1fr 1fr" }}>
            <label>
              Business Type
              <select className="select" value={form.businessType} onChange={onChange("businessType")} disabled={readOnly}>
                <option value="INDIVIDUAL">INDIVIDUAL</option>
                <option value="COMPANY">COMPANY</option>
              </select>
            </label>
            <label>
              GST Number
              <input className="input" value={form.gstNumber} onChange={onChange("gstNumber")} disabled={readOnly} />
            </label>
            <label>
              PAN Number
              <input className="input" value={form.panNumber} onChange={onChange("panNumber")} disabled={readOnly} />
            </label>
            <label>
              Onboarding Date
              <input className="input" type="date" value={form.onboardingDate} onChange={onChange("onboardingDate")} disabled={readOnly} />
            </label>
          </div>
        </div>

        <div className="card" style={{ display: "grid", gap: 12 }}>
          <h3 style={{ margin: 0 }}>5) Branding & Public Identity</h3>
          <div style={{ display: "grid", gap: 10, gridTemplateColumns: "1fr 1fr" }}>
            <label>
              Primary Brand Color
              <input className="input" type="color" value={form.primaryBrandColor} onChange={onChange("primaryBrandColor")} disabled={readOnly} />
            </label>
            <label>
              Secondary Brand Color
              <input className="input" type="color" value={form.secondaryBrandColor} onChange={onChange("secondaryBrandColor")} disabled={readOnly} />
            </label>
            <label>
              Website URL
              <input className="input" placeholder="https://" value={form.websiteUrl} onChange={onChange("websiteUrl")} disabled={readOnly} />
            </label>
            <label>
              Facebook URL
              <input className="input" placeholder="https://facebook.com/..." value={form.facebookUrl} onChange={onChange("facebookUrl")} disabled={readOnly} />
            </label>
            <label>
              Instagram URL
              <input className="input" placeholder="https://instagram.com/..." value={form.instagramUrl} onChange={onChange("instagramUrl")} disabled={readOnly} />
            </label>
            <label>
              YouTube URL
              <input className="input" placeholder="https://youtube.com/..." value={form.youtubeUrl} onChange={onChange("youtubeUrl")} disabled={readOnly} />
            </label>
          </div>
        </div>

        <div className="card" style={{ display: "grid", gap: 12 }}>
          <h3 style={{ margin: 0 }}>6) Course Access Control</h3>
          <div style={{ display: "grid", gap: 10, gridTemplateColumns: "1fr 1fr" }}>
            <label>
              Access Mode
              <select className="select" value={form.accessMode} onChange={onChange("accessMode")} disabled={readOnly}>
                <option value="ALL">ALL</option>
                <option value="SELECTIVE">SELECTIVE</option>
              </select>
            </label>
            <div style={{ fontSize: 12, color: "var(--color-text-muted)", alignSelf: "center" }}>
              Legacy login is disabled for security and consistency.
            </div>
          </div>
        </div>

        {mode !== "create" ? (
          <div className="card" style={{ display: "grid", gap: 12 }}>
            <h3 style={{ margin: 0 }}>7) Subscription</h3>
            <div style={{ display: "grid", gap: 10, gridTemplateColumns: "1fr 1fr" }}>
              <label>
                Subscription Type
                <select className="select" value={form.subscriptionType} onChange={onChange("subscriptionType")} disabled={readOnly}>
                  <option value="TRIAL">TRIAL</option>
                  <option value="PERMANENT">PERMANENT</option>
                </select>
              </label>
              <label>
                Subscription Status
                <select className="select" value={form.subscriptionStatus} onChange={onChange("subscriptionStatus")} disabled={readOnly}>
                  <option value="ACTIVE">ACTIVE</option>
                  <option value="SUSPENDED">SUSPENDED</option>
                  <option value="EXPIRED">EXPIRED</option>
                </select>
              </label>
              <label>
                Subscription Expiry Date
                <input
                  className="input"
                  type="date"
                  value={form.subscriptionExpiresAt}
                  onChange={onChange("subscriptionExpiresAt")}
                  disabled={readOnly || form.subscriptionType === "PERMANENT"}
                />
              </label>
              <div style={{ fontSize: 12, color: "var(--color-text-muted)", alignSelf: "center" }}>
                Permanent clears expiry. Trial requires an expiry date.
              </div>
            </div>
          </div>
        ) : null}

        <div className="card" style={{ display: "grid", gap: 10 }}>
          <h3 style={{ margin: 0 }}>{mode === "create" ? "7) Assigned Courses" : "8) Assigned Courses"}</h3>
          {form.accessMode === "SELECTIVE" ? (
            <>
              <div style={{ fontSize: 12, color: "var(--color-text-muted)" }}>Select courses this business partner can access</div>
              {allCourses.length === 0 ? (
                <div style={{ fontSize: 13, color: "var(--color-text-muted)" }}>No courses available.</div>
              ) : (
                <div style={{ display: "grid", gap: 6, gridTemplateColumns: "1fr 1fr" }}>
                  {allCourses.map((c) => (
                    <label key={c.id} style={{ display: "flex", alignItems: "center", gap: 8, fontSize: 13 }}>
                      <input
                        type="checkbox"
                        checked={form.courseIds.includes(c.id)}
                        disabled={readOnly}
                        onChange={(e) => {
                          setForm((prev) => {
                            const next = e.target.checked
                              ? [...prev.courseIds, c.id]
                              : prev.courseIds.filter((cid) => cid !== c.id);
                            return { ...prev, courseIds: next };
                          });
                        }}
                      />
                      {c.name} {c.code ? `(${c.code})` : ""}
                    </label>
                  ))}
                </div>
              )}
            </>
          ) : (
            <div style={{ fontSize: 13, color: "var(--color-text-muted)" }}>
              Access mode is ALL, so this business partner can access all courses.
            </div>
          )}
        </div>

        {/* Practice Feature Entitlements - only show when editing/viewing existing partner */}
        {id && (
          <div className="card" style={{ display: "grid", gap: 14 }}>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
              <h3 style={{ margin: 0 }}>{mode === "create" ? "8) Practice Feature Entitlements" : "9) Practice Feature Entitlements"}</h3>
              {practiceLoading && <span style={{ fontSize: 12, color: "var(--color-text-muted)" }}>Loading...</span>}
            </div>

            <div style={{ display: "grid", gap: 16, gridTemplateColumns: "1fr 1fr" }}>
              {/* Practice Feature */}
              <div style={{ border: "1px solid var(--color-border)", borderRadius: 8, padding: 16 }}>
                <div style={{ display: "flex", gap: 12, alignItems: "center", marginBottom: 12 }}>
                  <label style={{ display: "flex", alignItems: "center", gap: 8, fontWeight: 500 }}>
                    <input
                      type="checkbox"
                      checked={practiceEntitlements.practice.isEnabled}
                      disabled={readOnly || practiceLoading}
                      onChange={(e) =>
                        setPracticeEntitlements((prev) => ({
                          ...prev,
                          practice: { ...prev.practice, isEnabled: e.target.checked }
                        }))
                      }
                    />
                    Practice
                  </label>
                </div>
                {practiceEntitlements.practice.isEnabled && (
                  <label style={{ display: "block", fontSize: 13 }}>
                    Total Seats Allocated to BP
                    <input
                      className="input"
                      type="number"
                      min="0"
                      value={practiceEntitlements.practice.totalSeats}
                      disabled={readOnly || practiceLoading}
                      onChange={(e) =>
                        setPracticeEntitlements((prev) => ({
                          ...prev,
                          practice: { ...prev.practice, totalSeats: parseInt(e.target.value, 10) || 0 }
                        }))
                      }
                      style={{ marginTop: 4, width: "100%" }}
                    />
                  </label>
                )}
                {practiceUsage?.PRACTICE && (
                  <div style={{ marginTop: 10, fontSize: 12, color: "var(--color-text-muted)" }}>
                    <div>Allocated to Centers: {practiceUsage.PRACTICE.allocatedSeats || 0}</div>
                    <div>Assigned to Students: {practiceUsage.PRACTICE.assignedStudents || 0}</div>
                  </div>
                )}
              </div>

              {/* Abacus Practice Feature */}
              <div style={{ border: "1px solid var(--color-border)", borderRadius: 8, padding: 16 }}>
                <div style={{ display: "flex", gap: 12, alignItems: "center", marginBottom: 12 }}>
                  <label style={{ display: "flex", alignItems: "center", gap: 8, fontWeight: 500 }}>
                    <input
                      type="checkbox"
                      checked={practiceEntitlements.abacusPractice.isEnabled}
                      disabled={readOnly || practiceLoading}
                      onChange={(e) =>
                        setPracticeEntitlements((prev) => ({
                          ...prev,
                          abacusPractice: { ...prev.abacusPractice, isEnabled: e.target.checked }
                        }))
                      }
                    />
                    Abacus Practice
                  </label>
                </div>
                {practiceEntitlements.abacusPractice.isEnabled && (
                  <label style={{ display: "block", fontSize: 13 }}>
                    Total Seats Allocated to BP
                    <input
                      className="input"
                      type="number"
                      min="0"
                      value={practiceEntitlements.abacusPractice.totalSeats}
                      disabled={readOnly || practiceLoading}
                      onChange={(e) =>
                        setPracticeEntitlements((prev) => ({
                          ...prev,
                          abacusPractice: { ...prev.abacusPractice, totalSeats: parseInt(e.target.value, 10) || 0 }
                        }))
                      }
                      style={{ marginTop: 4, width: "100%" }}
                    />
                  </label>
                )}
                {practiceUsage?.ABACUS_PRACTICE && (
                  <div style={{ marginTop: 10, fontSize: 12, color: "var(--color-text-muted)" }}>
                    <div>Allocated to Centers: {practiceUsage.ABACUS_PRACTICE.allocatedSeats || 0}</div>
                    <div>Assigned to Students: {practiceUsage.ABACUS_PRACTICE.assignedStudents || 0}</div>
                  </div>
                )}
              </div>
            </div>

            {!readOnly && (
              <button
                type="button"
                className="button secondary"
                onClick={handleSavePracticeEntitlements}
                disabled={practiceSaving || practiceLoading}
                style={{ justifySelf: "start" }}
              >
                {practiceSaving ? "Saving..." : "Save Practice Entitlements"}
              </button>
            )}
          </div>
        )}

        {mode === "create" ? (
          <div className="card" style={{ display: "grid", gap: 10 }}>
            <h3 style={{ margin: 0 }}>Create Partner</h3>
            <div style={{ display: "grid", gap: 10, gridTemplateColumns: "1fr 1fr" }}>
              <label>
                Admin Password
                <input className="input" type="password" autoComplete="new-password" value={form.adminPassword} onChange={onChange("adminPassword")} required />
              </label>
              <label>
                Trial Days
                <input className="input" inputMode="numeric" value={form.trialDays} onChange={onChange("trialDays")} />
              </label>
            </div>
          </div>
        ) : null}

        <div style={{ display: "flex", gap: 10, justifyContent: "flex-end" }}>
          <button className="button secondary" type="button" onClick={handleReset} style={{ width: "auto" }} disabled={saving}>
            Reset
          </button>
          {readOnly ? null : (
            <button className="button" type="submit" style={{ width: "auto" }} disabled={saving}>
              {saving ? "Saving..." : mode === "create" ? "Create Partner" : "Save"}
            </button>
          )}
        </div>
      </form>
    </section>
  );
}

export { SuperadminBusinessPartnerProfilePage };
