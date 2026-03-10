import { useAuth } from "../../hooks/useAuth";

function SubscriptionBlockedPage() {
  const { logout, clearSubscriptionBlocked } = useAuth();

  return (
    <div className="auth-page">
      <div className="card" style={{ maxWidth: 520 }}>
        <h2>Subscription Expired</h2>
        <p>Your subscription is expired. Writes are blocked until renewal.</p>
        <div style={{ display: "flex", gap: 12, marginTop: 12, flexWrap: "wrap" }}>
          <button
            className="button secondary"
            style={{ width: "auto" }}
            onClick={() => clearSubscriptionBlocked()}
          >
            Continue read-only
          </button>
          <button className="button" style={{ width: "auto" }} onClick={logout}>
            Logout
          </button>
        </div>
      </div>
    </div>
  );
}

export { SubscriptionBlockedPage };
