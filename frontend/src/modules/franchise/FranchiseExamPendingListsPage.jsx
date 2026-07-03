import { ExamPendingListsPage } from "../examCycles/ExamPendingListsPage";

function FranchiseExamPendingListsPage() {
  return (
    <ExamPendingListsPage
      title="Franchise Pending Exam Lists"
      subtitle="Combined lists forwarded by centers."
      forwardMessage="Forward this combined list to Business Partner review?"
      rejectMessage="Reject this combined list back to the center?"
    />
  );
}

export { FranchiseExamPendingListsPage };
