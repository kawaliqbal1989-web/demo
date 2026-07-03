import { ExamPendingListsPage } from "../examCycles/ExamPendingListsPage";

function BusinessPartnerExamPendingListsPage() {
  return (
    <ExamPendingListsPage
      title="Business Partner Pending Exam Lists"
      subtitle="Combined lists forwarded by franchises."
      forwardMessage="Forward this combined list to Superadmin for approval?"
      rejectMessage="Reject this combined list back for correction?"
    />
  );
}

export { BusinessPartnerExamPendingListsPage };
