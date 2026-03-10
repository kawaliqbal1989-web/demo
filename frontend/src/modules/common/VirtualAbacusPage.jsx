import { VirtualAbacus } from "../../components/VirtualAbacus";

function VirtualAbacusPage() {
  return (
    <div className="container">
      <div className="page-head">
        <div>
          <h1>Virtual Abacus</h1>
          <div className="muted">Practice using an on-screen abacus.</div>
        </div>
      </div>

      <div className="card">
        <VirtualAbacus columns={13} fractionalRods={6} />
      </div>
    </div>
  );
}

export { VirtualAbacusPage };
