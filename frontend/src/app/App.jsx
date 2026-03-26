import { Toaster } from "react-hot-toast";
import { AppRouter } from "../routes/AppRouter";
import ErrorBoundary from "../components/ErrorBoundary";

function App() {
  return (
    <>
      <Toaster position="top-right" toastOptions={{ duration: 3500 }} />
      <ErrorBoundary>
        <AppRouter />
      </ErrorBoundary>
    </>
  );
}

export { App };
