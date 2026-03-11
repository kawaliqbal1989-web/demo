/**
 * Standardized page header with title, subtitle, and action buttons.
 * Breadcrumb is rendered globally by MainLayout — no duplication here.
 */
function PageHeader({ title, subtitle, actions, children }) {
  return (
    <div className="page-header">
      <div className="page-header__left">
        {title ? <h2 className="page-header__title">{title}</h2> : null}
        {subtitle ? <p className="page-header__subtitle">{subtitle}</p> : null}
        {children}
      </div>
      {actions ? <div className="page-header__actions">{actions}</div> : null}
    </div>
  );
}

export { PageHeader };
