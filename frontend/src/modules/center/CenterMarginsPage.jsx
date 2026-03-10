function CenterMarginsPage() {
  return (
    <section style={{ display: "grid", gap: 12 }}>
      <h2 style={{ margin: 0 }}>Margins</h2>
      <div className="card" style={{ color: "var(--color-text-muted)" }}>
        Margins are managed at the Business Partner level in this version.
      </div>
    </section>
  );
}

export { CenterMarginsPage };
