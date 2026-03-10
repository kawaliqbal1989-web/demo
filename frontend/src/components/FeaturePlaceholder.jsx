function FeaturePlaceholder({ title = "Feature", description = "Coming soon.", children = null }) {
  return (
    <section className="card" style={{ display: "grid", gap: 10 }}>
      <h2 style={{ margin: 0 }}>{title}</h2>
      <p style={{ margin: 0 }}>{description}</p>
      {children}
    </section>
  );
}

export { FeaturePlaceholder };
export default FeaturePlaceholder;
